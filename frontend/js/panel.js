/* ---------------- face + panel ---------------- */
function face(mood) {
  const f = $("face");
  f.innerHTML = "";
  f.setAttribute("class", mood === "think" ? "thinking" : mood === "found" || mood === "home" ? "happy" : "");
  const e = (t, a, p = f) => {
    const x = document.createElementNS(NS, t);
    for (const k in a) x.setAttribute(k, a[k]);
    p.appendChild(x);
    return x;
  };
  const st = {
    fill: "none",
    stroke: "#16191c",
    "stroke-width": 2.2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  };
  e("path", { d: "M6 34 L84 26 L96 96 L10 100 Z", ...st });
  const eyes = e("g", { class: "eyes" });
  const happy = mood === "found" || mood === "home";
  if (happy) {
    e("path", { d: "M24 54 Q30 45 36 54", ...st }, eyes);
    e("path", { d: "M58 51 Q64 42 70 51", ...st }, eyes);
  } else if (mood === "think") {
    e("circle", { cx: 30, cy: 51, r: 3.2, fill: "#16191c" }, eyes);
    e("circle", { cx: 64, cy: 48, r: 3.2, fill: "#16191c" }, eyes);
  } else {
    e("path", { d: "M24 52 L36 52", ...st }, eyes);
    e("path", { d: "M58 49 L70 49", ...st }, eyes);
  }
  e("path", {
    d: happy ? "M30 68 Q48 92 68 68" : mood === "think" ? "M38 76 Q48 72 58 76" : "M34 77 L60 74",
    ...st,
  });
  [
    [92, 22, 2.6, "dot dot1"],
    [101, 14, 3.4, "dot dot2"],
    [112, 5, 4.2, "dot dot3"],
  ].forEach(([x, y, r, c]) => e("circle", { cx: x, cy: y, r, class: c, ...st, "stroke-width": 1.6 }));
}
const BUBBLE = {
  lost: "where am I?",
  think: "just keep swimming…",
  found: "found it!",
  home: "made it home!",
};
function say(mood, html, buttons = [], extra = "") {
  face(mood);
  $("bubble").textContent = BUBBLE[mood];
  $("thought").innerHTML = html;
  $("extra").innerHTML = extra;
  const b = $("btns");
  b.innerHTML = "";
  buttons.forEach(([t, fn, cls]) => {
    const x = document.createElement("button");
    x.className = "btn " + (cls || "");
    x.textContent = t;
    x.onclick = fn;
    b.appendChild(x);
  });
}
/* closed-caption line over the map: what Dory is doing right now */
function caption(html) {
  const c = $("cc");
  c.innerHTML = `<span>${html || "Dory is waiting. Drop it somewhere, then press <b>Start mission</b>."}</span>`;
  c.classList.toggle("idle", !html);
}
function setStats(N, M, k) {
  $("stats").innerHTML =
    N == null
      ? ""
      : `<span>N <b>${N}</b></span><span>matches <b>${M}</b></span><span>round <b>${k}</b></span>`;
}

/* ---------------- stage cards (what happened, step by step) ---------------- */
let STG = null;
const STAGE_T = { 1: "STAGE 1: WHERE AM I?", 2: "STAGE 2: WAY HOME" };
function stageStart(n, title) {
  if (STG && !STG.saved) stageSave("");
  const d = document.createElement("div");
  d.className = "stg live";
  d.innerHTML = `<div class="sh"><span>${title || STAGE_T[n]}</span><span class="st">live</span></div><div class="sl"></div><div class="sumbox"></div>`;
  $("stages").appendChild(d);
  STG = { el: d, n, saved: false };
}
const log = (h) => {
  if (!STG) return;
  const x = document.createElement("div");
  x.innerHTML = "› " + h;
  STG.el.querySelector(".sl").appendChild(x);
};
function stageSave(sum) {
  if (!STG || STG.saved) return;
  STG.saved = true;
  STG.el.className = "stg saved";
  STG.el.querySelector(".st").textContent = "done ✓";
  const el0 = STG.el;
  el0.querySelector(".sumbox").innerHTML = (sum ? `<div class="sum">${sum}</div>` : "") + `<button class="more">steps</button>`;
  el0.querySelector(".more").onclick = () => el0.classList.toggle("open");
}
const readingHTML = (rd) =>
  `<div class="reading">${DIRS.split("")
    .map((d, i) => `<span class="rb ${rd[i] ? "w" : ""}">${d} ${rd[i] ? "wall" : "open"}</span>`)
    .join("")}</div>`;

/* ---------------- stats (separate, only when toggled) ---------------- */
// One row per Grover search, compared fairly:
//   classical: expected checks to find one answer by trying hypotheses in random order, (P+1)/(M+1)
//   quantum:   k oracle calls per attempt, an attempt succeeds with probability p, so k/p expected calls
let TALLY = [];
const expChecks = (P, M) => (P + 1) / (M + 1);
const r1 = (v) => (Math.round(v * 10) / 10).toLocaleString();
function tally(row) {
  TALLY.push(row);
  renderStats();
}
function bars(c, q) {
  const w = (v) => Math.max(2, Math.round((100 * v) / Math.max(c, q, 1)));
  return `<div class="opt"><span>classical checks</span><div class="bar" style="width:${w(c)}%"></div><span class="n">${r1(c)}</span><span>quantum calls</span><div class="bar q" style="width:${w(q)}%"></div><span class="n">${r1(q)}</span></div>`;
}
function renderStats() {
  const box = $("statsbox");
  box.hidden = !$("showStats").checked;
  if (!TALLY.length) {
    box.innerHTML = `<h4>STATS</h4><div class="optnote">Stats appear here as Dory searches.</div>`;
    return;
  }
  box.innerHTML =
    `<h4>STATS: EXPECTED ORACLE QUERIES, CLASSICAL VS QUANTUM</h4>` +
    TALLY.map(
      (t) =>
        `<div class="row"><div class="lbl">${t.label}</div>${bars(t.c, t.q)}<div class="optnote">${t.k} calls per attempt, ${pct(t.p)} success, ${t.qubits} qubits (honest oracle), ${t.gates.toLocaleString()} two-qubit gates per call</div></div>`,
    ).join("") +
    `<div class="optnote">Counts oracle queries, not time. At 1,000,000 squares: about 500,000 classical checks on average (1,000,000 worst case) vs about 785 Grover calls, each a full circuit that encodes the map.</div>`;
}

/* ---------------- end-of-mission pop-up: quantum vs classical ---------------- */
function showSummary(outcome) {
  const c = TALLY.reduce((s, t) => s + t.c, 0),
    q = TALLY.reduce((s, t) => s + t.q, 0),
    gates = TALLY.reduce((s, t) => s + t.q * t.gates, 0);
  $("modal").innerHTML = `
    <h3>${outcome}</h3>
    <div class="sub">Expected number of times each robot asks the oracle “is this the answer?”</div>
    <div class="vs">
      <div><small>Classical robot</small><b>${r1(c)}</b><span>expected checks, trying the squares or routes still in play one at a time</span></div>
      <div class="q"><small>Quantum robot (Grover)</small><b>${r1(q)}</b><span>expected oracle calls, counting retries when a measurement misses</span></div>
    </div>
    <table class="mt"><tr><th>Search</th><th>Classical</th><th>Quantum</th><th>Success</th><th>Qubits</th><th>2q gates / call</th></tr>
      ${TALLY.map((t) => `<tr><td>${t.label}</td><td class="n">${r1(t.c)}</td><td class="n">${r1(t.q)}</td><td class="n">${pct(t.p)}</td><td class="n">${t.qubits}</td><td class="n">${t.gates.toLocaleString()}</td></tr>`).join("")}
    </table>
    <div class="honest">${q < c ? `<b>${(c / q).toFixed(1)}× fewer oracle queries.</b>` : `<b>No query advantage here</b>: noise makes the quantum search miss too often.`}
      This counts queries, not time. The gap grows with the map: 1,000,000 squares need about 785 Grover calls
      instead of about 500,000 checks on average. The catch: each quantum call is a whole circuit
      (${Math.round(gates).toLocaleString()} two-qubit gates in total here), and with discrete wall readings a classical robot
      could also precompute a reading-to-squares table and answer in one lookup.
      ${noisy ? "Noise also lowers the quantum success rate, which raises the expected calls." : "Switch to Noisy to see what today's hardware noise does to it."}</div>
    <div class="btns"><button class="btn" id="mAgain">Run again</button><button class="btn alt" id="mClose">Close</button></div>`;
  $("overlay").hidden = false;
  $("mClose").onclick = () => ($("overlay").hidden = true);
  $("mAgain").onclick = () => {
    $("overlay").hidden = true;
    runAgain();
  };
}
