/* ---------------- run control: Robo drives itself; Step mode pauses at every beat ---------------- */
const RUN = { mode: "auto", wake: null, token: 0 };
class Abort extends Error {}
async function beat(text, ms = 1200) {
  const tok = RUN.token;
  if (text) caption(text);
  if (RUN.mode === "step") {
    $("nextBtn").disabled = false;
    await new Promise((r) => (RUN.wake = r));
    $("nextBtn").disabled = true;
  } else await sleep(ms);
  if (tok !== RUN.token) throw new Abort();
}
function wake() {
  if (RUN.wake) {
    const w = RUN.wake;
    RUN.wake = null;
    w();
  }
}

/* ---------------- story state ---------------- */
let hist = [],
  rds = [],
  stage = "setup";
const curOf = (C) => [...new Set(C.map((x) => endOf(x, hist)))];
const shiftP = (a) => {
  const p = Array(16).fill(0);
  a.forEach((v, x) => (p[endOf(x, hist)] += v * v));
  return p;
};
const wallText = (rd) =>
  DIRS.split("")
    .filter((d, i) => rd[i])
    .map((d) => NAMES[d])
    .join(" + ") || "no walls";
const routeText = (p) =>
  p
    .split("")
    .map((d) => NAMES[d])
    .join(" → ");
const planHTML = (p) => `<div class="plan">${p
  .split("")
  .map((d) => `<span class="mv">${d}</span>`)
  .join("")}</div>`;
const PATH_COLORS = ["#1d4ed8", "#c2410c", "#15803d"];

function setupView() {
  stage = "setup";
  caption("");
  render2D();
  say(
    "lost",
    `Goal: <b>${goalName()}</b>`,
    [
      ["Start mission", start],
      ["Random drop", randomDrop, "alt"],
    ],
  );
}
function reset() {
  RUN.token++;
  wake();
  seed = 7;
  Object.assign(S, { heading: 0, bump: null, spin: null, glow: false, probs: null, amps: null, ampMarked: null, ghosts: [], trail: [], paths: [], cls: {}, busy: false });
  hist = [];
  rds = [];
  S.sup = null;
  STG = null;
  TALLY = [];
  renderStats();
  $("compareBtn").hidden = true;
  $("overlay").hidden = true;
  $("nextBtn").disabled = true;
  clearRays();
  drawMap();
  build3D();
  $("stages").innerHTML = "";
  drawChart(Array(16).fill(1 / 4), new Set());
  explain(16);
  setStep(null);
  phase("One bar per possibility. Height = amplitude; probability = height².");
  setStats(null);
  setupView();
}
// Replay the same mission from where Robo started, or drop it somewhere new and go.
function runAgain() {
  const s = START;
  reset();
  S.pos = s;
  render2D();
  start();
}
function randomRun() {
  reset();
  randomDrop();
  start();
}
const face4 = (d) => (DIRS.indexOf(d) * Math.PI) / 2; // POV heading for a move direction
function randomDrop() {
  let x;
  do x = Math.floor(Math.random() * 16);
  while (x === HOME);
  S.pos = x;
  render2D();
  setupView();
}

/* ---------------- setup: drag Robo, right-click home (2D) ---------------- */
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
function dropAt(x) {
  if (x < 0) return;
  if (x === HOME) HOME = S.pos;
  S.pos = x;
  build3D();
}
function homeAt(x) {
  if (x < 0) return;
  if (x === S.pos) S.pos = HOME;
  HOME = x;
  build3D();
}
svg.addEventListener("pointerdown", (ev) => {
  if (stage !== "setup" || S.busy || ev.button !== 0 || !ev.target.closest("#robo")) return;
  ev.preventDefault();
  S.dragging = true;
  svg.classList.add("dragging");
  L.robot.style.transition = "none";
  svg.setPointerCapture(ev.pointerId);
});
svg.addEventListener("pointermove", (ev) => {
  if (!S.dragging) return;
  const p = svgPt(ev);
  L.robot.setAttribute("transform", `translate(${Math.max(O, Math.min(O + 4 * T, p.x))},${Math.max(O, Math.min(O + 4 * T, p.y))})`);
});
svg.addEventListener("pointerup", (ev) => {
  if (!S.dragging) return;
  S.dragging = false;
  svg.classList.remove("dragging");
  L.robot.style.transition = "transform .6s cubic-bezier(.4,.1,.2,1)";
  dropAt(cellAt(svgPt(ev)));
  setupView();
});
svg.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  if (stage !== "setup" || S.busy) return;
  homeAt(cellAt(svgPt(ev)));
  setupView();
});

/* ---------------- decisions ---------------- */
function bestMove(cur) {
  let best = null;
  for (const d of DIRS) {
    const g = {};
    cur.forEach((x) => {
      const key = reading(move(x, d)).join("");
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

/* ---------------- the mission ---------------- */
async function start() {
  if (S.busy) return;
  S.busy = true;
  $("btns").innerHTML = "";
  try {
    await mission();
  } catch (e) {
    if (!(e instanceof Abort)) {
      console.error(e);
      caption("Something went wrong. Press Restart.");
    }
  } finally {
    S.busy = false;
  }
}

async function mission() {
  stage = "run";
  START = S.pos;
  hist = [];
  rds = [];
  render2D();
  // ---- stage 1: where am I? ----
  stageStart(1);
  say("think", "Stage 1: <b>Where am I?</b>");
  await scan();
  let cur;
  for (;;) {
    cur = await locate();
    if (cur.length === 1) break;
    const leg = findLeg(cur),
      d = bestMove(cur);
    if (leg && leg.goal === HOME) {
      log(`one route works from all ${cur.length}, skip rescanning`);
      await beat(`${cur.length} places match, but one 3-move route can work from all of them. No need to rescan.`, 2000);
      break;
    }
    if (d) {
      await beat(`${cur.length} places feel the same. Moving <b>${NAMES[d]}</b> to tell them apart.`, 1700);
      await relocate(d);
      continue;
    }
    await beat(`${cur.length} places feel the same and no single move tells them apart.`, 1800);
    break;
  }
  stageSave(cur.length === 1 ? `I'm in <b>${cellName(cur[0])}</b>` : `${cur.length} lookalikes: <b>${cur.map(gridName).join(", ")}</b>`);
  if (cur.length === 1 && cur[0] === HOME) return finish(true, "Robo was already home");
  // ---- stage 2: how do I get home? (one or more 3-move legs) ----
  for (;;) {
    const leg = await planLeg(cur);
    if (!leg) {
      caption("No 3-move route brings every copy together.");
      return finish(false, "No route found");
    }
    if (!(await walkLeg(leg))) return finish(false, "Noise picked a bad route");
    if (leg.goal === HOME) return finish(true, `Robo reached ${goalName()}`);
    cur = [S.pos];
  }
}

async function scan() {
  const rd = reading(S.pos);
  rds.push(rd);
  caption("Scanning walls…");
  if (view !== "2d") await rays3D(S.pos);
  say("think", "Stage 1: <b>Where am I?</b>", [], readingHTML(rd));
  log(`scan ${rds.length}, walls <b>${DIRS.split("").filter((d, i) => rd[i]).join(" ") || "none"}</b>`);
  await beat(`I feel <b>${wallText(rd)}</b>. Which squares feel like this${rds.length > 1 ? " after that move" : ""}?`, 1600);
}

async function locate() {
  clearRays();
  const C = candidates(rds, hist),
    marked = new Set(C),
    M = C.length,
    q = q1(hist.join(""), rds),
    k = noisy && q ? q.k_noisy : bestK(16, M);
  await beat(
    `Checking all 16 squares at once${rds.length > 1 ? `, against all ${rds.length} scans` : ""}. Grover needs <b>${k} round${k === 1 ? "" : "s"}</b>.`,
    1600,
  );
  log(`quantum, ${M} match, ${k} round${k === 1 ? "" : "s"}`);
  const a = await grover(16, marked, k, { f: shiftP, shift: hist.length > 0 });
  const pc = Array(16).fill(0);
  if (q) (noisy ? q.noisy : q.ideal).forEach((v, x) => (pc[endOf(x, hist)] += v));
  else sample(a, 1000).forEach((v, x) => (pc[endOf(x, hist)] += v / 1000));
  S.probs = pc;
  S.amps = null;
  const cur = curOf(C);
  const pf = q ? C.reduce((t, x) => t + (noisy ? q.noisy : q.ideal)[x], 0) : null;
  tally({
    label: `Stage 1, scan ${rds.length}`,
    c: 16,
    q: k,
    qubits: q ? q.honest_qubits : 4 + 4 * rds.length,
    gates: q ? q.honest_2q : 0,
    noisy: noisy ? pf : null,
  });
  if (q && noisy) {
    log(`noisy, ${pct(pf)} on matches (ideal ${pct(q.theory)}), k capped at ${k}`);
    log(`honest oracle: ${q.honest_qubits} qubits, ${q.honest_2q.toLocaleString()} 2q/call`);
  }
  S.ghosts = cur.length > 1 ? cur.slice() : [];
  render2D();
  log(`→ ${cur.map((x) => `<b>${gridName(x)}</b> ${pct(pc[x])}`).join(", ")}`);
  await beat(
    cur.length === 1
      ? `Measured: I'm in <b>${cellName(cur[0])}</b> (${pct(pc[cur[0]])} of measurements)`
      : `Measured: ${cur.length} places match, ${cur.map((x) => `<b>${gridName(x)}</b> ${pct(pc[x])}`).join(", ")}`,
    2000,
  );
  return cur;
}

async function relocate(d) {
  S.probs = null;
  S.ghosts = [];
  const b = S.pos,
    n = move(S.pos, d);
  S.heading = face4(d);
  if (n !== b) {
    S.trail.push([b, n]);
    S.pos = n;
  } else S.bump = { d, t0: performance.now() };
  render2D();
  hist.push(d);
  log(`moved ${NAMES[d]}, rescan`);
  await beat(n === b ? `Bumped a wall going ${NAMES[d]}.` : `Moved ${NAMES[d]}.`, 900);
  await scan();
}

async function planLeg(starts) {
  S.probs = null;
  S.amps = null;
  S.paths = [];
  const fp = findLeg(starts);
  if (!fp) return null;
  const { P, good, goal } = fp,
    N = P.length,
    marked = new Set(good),
    M = good.length,
    q = q2(starts, goal),
    k = noisy && q ? q.k_noisy : bestK(N, M);
  stageStart(2, goal === HOME ? "STAGE 2: WAY HOME" : `STAGE 2: MEET AT ${gridName(goal)}`);
  say("think", `Stage 2: <b>${goal === HOME ? "How do I get home?" : "Bring every copy to one place"}</b>`);
  S.ghosts = starts.length > 1 ? starts.slice() : [];
  render2D();
  log(`${N} plans, ${PLAN_MOVES} moves, ${M} reach ${goalLabel(goal)}${starts.length > 1 ? ` from all ${starts.length}` : ""}`);
  if (goal !== HOME) {
    log(`home is out of 3-move reach, meet at ${gridName(goal)} first`);
    await beat(`No 3-move route reaches home${starts.length > 1 ? " from every copy" : ""}. First target: <b>${gridName(goal)}</b>, the closest square ${starts.length > 1 ? "every copy" : "I"} can reach.`, 2200);
  }
  const why = starts.length > 1 ? `that works from all ${starts.length} places I might be` : `from ${gridName(starts[0])}`;
  await beat(`Searching all 64 three-move routes for one ${why}. Grover needs <b>${k} round${k === 1 ? "" : "s"}</b>.`, 1800);
  const a = await grover(N, marked, k, { names: P });
  let best, pb;
  if (q) [best, pb] = (noisy ? q.noisy_top : q.ideal_top)[0];
  else {
    const cnt = sample(a, 1000);
    let bi = 0;
    cnt.forEach((v, i) => v > cnt[bi] && (bi = i));
    [best, pb] = [P[bi], cnt[bi] / 1000];
  }
  tally({
    label: goal === HOME ? "Stage 2, route home" : `Stage 2, meet at ${gridName(goal)}`,
    c: N,
    q: k,
    qubits: q ? q.honest_qubits : 2 * PLAN_MOVES + 4 + starts.length,
    gates: q ? q.honest_2q : 0,
    noisy: noisy && q ? q.noisy_success : null,
  });
  log(`→ <b>${best.split("").join("→")}</b> ${pct(pb)}`);
  if (q && noisy) {
    log(`noisy, ${pct(q.noisy_success)} on good routes (ideal ${pct(q.theory)}), random ${pct(M / N)}`);
    log(`honest Bennett oracle: ${q.honest_qubits} qubits, ${q.honest_2q.toLocaleString()} 2q/call`);
  }
  say("think", `Stage 2: <b>${goal === HOME ? "How do I get home?" : `Meet at ${gridName(goal)}`}</b>`, [], planHTML(best));
  await beat(`Most-measured route: <b>${routeText(best)}</b> (${pct(pb)} of measurements)`, 1800);
  await drawRoutes(starts, best, goal);
  return { starts, goal, best };
}

// Draw the chosen route from every possible start, one segment at a time.
async function drawRoutes(starts, plan, goal) {
  for (const [i, s] of starts.entries()) {
    const cells = [s];
    for (const d of plan) cells.push(move(cells[cells.length - 1], d));
    const p = { cells, dirs: plan, color: PATH_COLORS[i % 3], n: 0, idx: i, of: starts.length };
    S.paths.push(p);
    for (let j = 0; j < plan.length; j++) {
      p.n = j + 1;
      render2D();
      const stay = cells[j + 1] === cells[j];
      await beat(
        `${starts.length > 1 ? `If I'm in <b>${gridName(s)}</b>: ` : ""}step ${j + 1}, ${NAMES[plan[j]]}${stay ? " (a wall blocks it, so I stay put)" : ` to ${gridName(cells[j + 1])}`}`,
        900,
      );
    }
    const ok = cells[cells.length - 1] === goal;
    await beat(`${starts.length > 1 ? `From ${gridName(s)}` : "This route"} ${ok ? "ends at" : "misses"} <b>${goalLabel(goal)}</b> ${ok ? "✓" : "✗"}`, 1100);
  }
}

async function walkLeg({ best, goal }) {
  for (const [j, d] of [...best].entries()) {
    S.ghosts = S.ghosts.map((x) => move(x, d));
    const n = move(S.pos, d),
      stuck = n === S.pos;
    S.heading = face4(d);
    if (!stuck) {
      S.trail.push([S.pos, n]);
      S.pos = n;
    } else S.bump = { d, t0: performance.now() };
    render2D();
    log(`walk ${d}${stuck ? " (wall)" : ""}`);
    await beat(`Walking: step ${j + 1} of ${best.length}, ${NAMES[d]}`, 950);
  }
  const route = routeText(best);
  if (S.pos !== goal || S.ghosts.some((x) => x !== goal)) {
    stageSave(`Route <b>${route}</b> missed ${goalLabel(goal)}`);
    say("lost", `Noise picked a bad route: <b>${route}</b> doesn't bring every copy to ${goalLabel(goal)}.`);
    await beat(`Noise picked a bad route. Not every copy reached ${goalLabel(goal)}.`, 1800);
    return false;
  }
  if (goal !== HOME) {
    S.ghosts = [];
    S.paths = [];
    render2D();
    stageSave(`Met at <b>${cellName(goal)}</b>, location known`);
    await beat(`Every copy met at <b>${cellName(goal)}</b>. Now I know exactly where I am.`, 1800);
    return true;
  }
  S.glow = true;
  S.paths = [];
  S.probs = Array(16)
    .fill(0)
    .map((_, x) => (x === HOME ? 0.4 : 0));
  render2D();
  stageSave(`Route <b>${route}</b> reached home`);
  return true;
}

function finish(ok, title) {
  caption(ok ? `${title}.` : `${title}.`);
  say(ok ? "home" : "lost", `<b>${title}.</b>`, [
    ["Run again", runAgain],
    ["New random spot", randomRun, "alt"],
    ["Quantum vs classical", () => showSummary(title), "alt"],
  ]);
  $("compareBtn").hidden = false;
  if (TALLY.length) setTimeout(() => stage === "run" && showSummary(title), 1200);
}
