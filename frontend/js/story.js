/* ---------------- story ---------------- */
let hist = [],
  rds = [],
  knownNow = null,
  stage = "setup",
  clickMode = "robot";
const curOf = (C) => [...new Set(C.map((x) => endOf(x, hist)))];
const shiftP = (a) => {
  const p = Array(16).fill(0);
  a.forEach((v, x) => (p[endOf(x, hist)] += v * v));
  return p;
};
function setupView() {
  stage = "setup";
  render2D();
  say("lost", `Goal: <b>${goalName()}</b>`, [
    ["Sense", sense],
    ["Random drop", randomDrop, "alt"],
  ]);
}
function reset() {
  seed = 7;
  Object.assign(S, { glow: false, probs: null, amps: null, ampMarked: null, ghosts: [], trail: [], cls: {} });
  hist = [];
  rds = [];
  knownNow = null;
  S.sup = null;
  STG = null;
  stage = "setup";
  clearRays();
  drawMap();
  build3D();
  $("stages").innerHTML = "";
  drawChart(Array(16).fill(1 / 4), new Set());
  phase("One bar per possibility. Height = amplitude.");
  setStats(null);
  setupView();
}
function randomDrop() {
  let x;
  do {
    x = Math.floor(Math.random() * 16);
  } while (x === HOME);
  S.pos = x;
  render2D();
  if (view === "3d") update3D();
  setupView();
}
const svgPt = (ev) => {
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX;
  pt.y = ev.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
};
const cellAt = (p) => {
  const c = Math.floor((p.x - O) / T),
    r = Math.floor((p.y - O) / T);
  return r < 0 || r > 3 || c < 0 || c > 3 ? -1 : idx(r, c);
};
svg.addEventListener("pointerdown", (ev) => {
  if (stage !== "setup" || S.busy || ev.button !== 0) return;
  if (!ev.target.closest("#robo")) return;
  ev.preventDefault();
  S.dragging = true;
  svg.classList.add("dragging");
  L.robot.style.transition = "none";
  svg.setPointerCapture(ev.pointerId);
});
svg.addEventListener("pointermove", (ev) => {
  if (!S.dragging) return;
  const p = svgPt(ev);
  L.robot.setAttribute(
    "transform",
    `translate(${Math.max(O, Math.min(O + 4 * T, p.x))},${Math.max(O, Math.min(O + 4 * T, p.y))})`,
  );
});
svg.addEventListener("pointerup", (ev) => {
  if (!S.dragging) return;
  S.dragging = false;
  svg.classList.remove("dragging");
  L.robot.style.transition = "transform .6s cubic-bezier(.4,.1,.2,1)";
  const x = cellAt(svgPt(ev));
  if (x >= 0) {
    if (x === HOME) HOME = S.pos;
    S.pos = x;
    build3D();
  }
  setupView();
  if (view === "3d") update3D();
});
svg.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  if (stage !== "setup" || S.busy) return;
  const x = cellAt(svgPt(ev));
  if (x < 0) return;
  if (x === S.pos) S.pos = HOME;
  HOME = x;
  build3D();
  setupView();
  if (view === "3d") update3D();
});
async function sense() {
  stage = "run";
  START = S.pos;
  render2D();
  const rd = reading(S.pos);
  rds = [rd];
  hist = [];
  stageStart(1);
  STG.qb = 8;
  say("think", "Scanning…");
  if (view === "3d") await rays3D(S.pos);
  log(
    `scan · walls <b>${
      DIRS.split("")
        .filter((d, i) => rd[i])
        .join(" ") || "none"
    }</b>`,
  );
  say(
    "think",
    `Walls <b>${
      DIRS.split("")
        .filter((d, i) => rd[i])
        .map((d) => NAMES[d])
        .join(" + ") || "none"
    }</b>. Where is that?`,
    [["Find me", locate]],
    readingHTML(rd),
  );
}
function bestMove(cur) {
  let best = null;
  for (const d of DIRS) {
    const g = {};
    cur.forEach((x) => {
      const n = move(x, d);
      const key = reading(n).join("");
      g[key] = (g[key] || 0) + 1;
    });
    const worst = Math.max(...Object.values(g));
    if (worst < cur.length && (!best || worst < best.w)) best = { d, w: worst };
  }
  return best && best.d;
}
// One leg = Grover over all 64 three-move plans (the Qiskit scope). If no plan reaches home
// from every possible position, aim for the waypoint nearest home that every copy CAN reach
// together: once they meet there, the robot knows exactly where it is.
function findLeg(starts) {
  const P = plansOf(PLAN_MOVES);
  const goodTo = (g) => P.map((p, i) => (starts.every((s) => endOf(s, p) === g) ? i : -1)).filter((i) => i >= 0);
  const home = goodTo(HOME);
  if (home.length) return { P, good: home, goal: HOME };
  let best = null;
  for (let g = 0; g < 16; g++) {
    const good = goodTo(g);
    if (good.length && (!best || dist(g, HOME) < best.d)) best = { P, good, goal: g, d: dist(g, HOME) };
  }
  return best;
}
const goalLabel = (g) => (g === HOME ? goalName() : `waypoint ${gridName(g)}`);
async function locate() {
  clearRays();
  const C = candidates(rds, hist),
    marked = new Set(C),
    M = C.length,
    k = bestK(16, M);
  if (useCls()) {
    say("think", "Classical first: one square at a time…");
    const c = await classicalScan(16, marked, true);
    log(`classical · ${c} checks`);
  }
  const kr = noisy && q1(hist.join(""), rds) ? q1(hist.join(""), rds).k_noisy : k;
  STG.c += 16;
  STG.q += kr;
  say(
    "think",
    `${rds.length > 1 ? `Must match all ${rds.length} scans · ` : "Checking all 16 squares at once · "}<b>${kr} rounds</b>`,
  );
  log(`quantum · ${M} match · ${kr} round${kr === 1 ? "" : "s"}`);
  const q = q1(hist.join(""), rds),
    kq = noisy && q ? q.k_noisy : k;
  const a = await grover(16, marked, kq, { f: shiftP, shift: hist.length > 0 });
  const pc = Array(16).fill(0);
  if (q) (noisy ? q.noisy : q.ideal).forEach((v, x) => (pc[endOf(x, hist)] += v));
  else sample(a, 1000).forEach((v, x) => (pc[endOf(x, hist)] += v / 1000));
  if (q && noisy) {
    const pf = C.reduce((t, x) => t + q.noisy[x], 0);
    log(`noisy · ${pct(pf)} on matches (ideal ${pct(q.theory)}) · k capped at ${kq}`);
    log(
      `honest oracle: ${q.honest_qubits} qubits · ${q.honest_2q.toLocaleString()} 2q/call` +
        (q.honest_noisy != null ? ` · noisy ${pct(q.honest_noisy)}` : " · too deep to simulate"),
    );
  }
  S.probs = pc;
  S.amps = null;
  const cur = curOf(C);
  S.sup = null;
  S.ghosts = cur.length > 1 ? cur.slice() : [];
  render2D();
  log(`→ ${cur.map((x) => `<b>${gridName(x)}</b> ${Math.round(pc[x] * 100)}%`).join(" · ")}`);
  if (cur.length === 1) {
    knownNow = cur[0];
    stageSave(`I'm in <b>${cellName(knownNow)}</b>`);
    if (knownNow === HOME) {
      say("home", `I'm already home!`, [["Again", reset, "alt"]]);
      return;
    }
    say("found", `I'm in <b>${cellName(knownNow)}</b> · ${Math.round(pc[knownNow] * 100)}%`, [
      ["Route home", () => plan([knownNow])],
    ]);
    return;
  }
  const d = bestMove(cur),
    fp = findLeg(cur),
    btn = [];
  if (d) btn.push([`Move ${NAMES[d]} & rescan`, () => relocate(d)]);
  if (fp)
    btn.push([
      fp.goal === HOME ? `Route from all ${cur.length}` : `Meet at ${gridName(fp.goal)}`,
      () => {
        stageSave(`${cur.length} lookalikes: <b>${cur.map(gridName).join(", ")}</b>`);
        return plan(cur);
      },
      d ? "alt" : "",
    ]);

  say(
    "think",
    `${cur.length} lookalikes: ${cur.map((x) => `<b>${gridName(x)}</b>`).join(", ")}${!btn.length ? " · can't tell them apart" : ""}`,
    btn.length ? btn : [["Again", reset, "alt"]],
  );
}
async function relocate(d) {
  S.probs = null;
  S.ghosts = [];
  const b = S.pos,
    n = move(S.pos, d);
  if (n !== b) {
    S.trail.push([b, n]);
    S.pos = n;
  }
  render2D();
  await sleep(600);
  if (view === "3d") await rays3D(S.pos);
  hist.push(d);
  rds.push(reading(S.pos));
  STG.qb = 4 + 4 * rds.length;
  log(`moved ${NAMES[d]} · rescan`);
  say("think", `New scan`, [], readingHTML(reading(S.pos)));
  await sleep(700);
  await locate();
}
async function plan(starts) {
  S.probs = null;
  S.amps = null;
  S.sup = null;
  stageStart(2);
  S.ghosts = starts.length > 1 ? starts.slice() : [];
  render2D();
  const fp = findLeg(starts);
  if (!fp) {
    say("think", "No 3-move route brings every copy together.", [["Again", reset, "alt"]]);
    return;
  }
  const { P, good, goal } = fp,
    L = PLAN_MOVES,
    N = P.length,
    marked = new Set(good),
    M = good.length,
    q = q2(starts, goal),
    k = noisy && q ? q.k_noisy : bestK(N, M);
  STG.N = N;
  STG.qb = q ? q.honest_qubits : 2 * L + 4 + starts.length;
  log(`${N} plans · ${L} moves · ${M} reach ${goalLabel(goal)}${starts.length > 1 ? ` from all ${starts.length}` : ""}`);
  if (goal !== HOME) log(`home is out of 3-move reach · meet at ${gridName(goal)} first`);
  say(
    "think",
    `${N} plans of ${L} moves (${2 * L} qubits)${starts.length > 1 ? ` · must work from all ${starts.length}` : ""}${goal !== HOME ? ` · aiming for ${gridName(goal)}, nearest to home` : ""} · <b>${k} rounds</b>`,
  );
  if (useCls()) {
    const c = await classicalScan(N, marked, false, P);
    log(`classical · ${c} checks`);
  }
  STG.c += N;
  STG.q += k;
  log(`quantum · ${k} round${k === 1 ? "" : "s"}`);
  const a = await grover(N, marked, k, { names: P });
  let best, pb;
  if (q) [best, pb] = (noisy ? q.noisy_top : q.ideal_top)[0];
  else {
    const cnt = sample(a, 1000);
    let bi = 0;
    cnt.forEach((v, i) => {
      if (v > cnt[bi]) bi = i;
    });
    [best, pb] = [P[bi], cnt[bi] / 1000];
  }
  log(`→ <b>${best.split("").join("→")}</b> ${pct(pb)}`);
  if (q && noisy) {
    log(`noisy · ${pct(q.noisy_success)} on good routes (ideal ${pct(q.theory)}) · random ${pct(M / N)}`);
    log(`honest Bennett oracle: ${q.honest_qubits} qubits · ${q.honest_2q.toLocaleString()} 2q/call`);
  }
  say(
    "found",
    `Route${goal !== HOME ? ` to ${gridName(goal)}` : ""}: <b>${best
      .split("")
      .map((d) => NAMES[d])
      .join(" → ")}</b>${starts.length > 1 ? ` · should work from all ${starts.length}` : ""}`,
    [["Go", () => walk(best, goal)]],
    `<div class="plan">${best
      .split("")
      .map((d) => `<span class="mv">${d}</span>`)
      .join("")}</div>`,
  );
}
async function walk(steps, goal = HOME) {
  for (const d of steps) {
    const ng = S.ghosts.map((x) => move(x, d));
    const blocked = S.ghosts.some((x, i) => ng[i] === x);
    S.ghosts = ng;
    const n = move(S.pos, d),
      stuck = n === S.pos;
    if (!stuck) {
      S.trail.push([S.pos, n]);
      S.pos = n;
    }
    render2D();
    log(`walk ${d}${S.ghosts.length > 1 && blocked ? " · one copy blocked" : stuck ? " · wall" : ""}`);
    await sleep(850);
  }
  const route = steps
    .split("")
    .map((d) => NAMES[d])
    .join(" → ");
  if (S.pos !== goal || S.ghosts.some((x) => x !== goal)) {
    stageSave(`Route <b>${route}</b> · missed ${goalLabel(goal)}`);
    say(
      "lost",
      `Noise picked a bad route: <b>${route}</b> doesn't bring every copy to ${goalLabel(goal)}.`,
      [["Again", reset, "alt"]],
    );
    return;
  }
  if (goal !== HOME) {
    S.ghosts = [];
    knownNow = S.pos;
    render2D();
    stageSave(`Met at <b>${cellName(goal)}</b> · location known`);
    say("found", `Every copy met at <b>${cellName(goal)}</b>. Now I know where I am.`, [
      ["Route home", () => plan([S.pos])],
    ]);
    return;
  }
  S.glow = true;
  S.probs = Array(16)
    .fill(0)
    .map((_, x) => (x === HOME ? 0.4 : 0));
  render2D();
  stageSave(
    `Route <b>${steps
      .split("")
      .map((d) => NAMES[d])
      .join(" → ")}</b> · home`,
  );
  say("home", `Reached <b>${goalName()}</b>.`, [["Again", reset, "alt"]]);
}
