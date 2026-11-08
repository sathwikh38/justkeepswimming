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
/* closed-caption line over the map: what Robo is doing right now */
function caption(html) {
  const c = $("cc");
  c.innerHTML = `<span>${html || "Robo is waiting. Drop it somewhere, then press <b>Start mission</b>."}</span>`;
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
const STAGE_T = { 1: "STAGE 1 · WHERE AM I?", 2: "STAGE 2 · WAY HOME" };
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
// One row per Grover search: what a classical robot would check vs the quantum oracle calls.
let TALLY = [];
function tally(row) {
  TALLY.push(row);
  renderStats();
}
function bars(c, q) {
  const w = (v) => Math.max(2, Math.round((100 * v) / Math.max(c, q, 1)));
  return `<div class="opt"><span>classical checks</span><div class="bar" style="width:${w(c)}%"></div><span class="n">${c}</span><span>quantum calls</span><div class="bar q" style="width:${w(q)}%"></div><span class="n">${q}</span></div>`;
}
function renderStats() {
  const box = $("statsbox");
  box.hidden = !$("showStats").checked;
  if (!TALLY.length) {
    box.innerHTML = `<h4>STATS</h4><div class="optnote">Stats appear here as Robo searches.</div>`;
    return;
  }
  box.innerHTML =
    `<h4>STATS · CLASSICAL VS QUANTUM</h4>` +
    TALLY.map(
      (t) =>
        `<div class="row"><div class="lbl">${t.label}</div>${bars(t.c, t.q)}<div class="optnote">${(t.c / Math.max(1, t.q)).toFixed(1)}× fewer calls · ${t.qubits} qubits (honest oracle) · ${t.gates.toLocaleString()} two-qubit gates per call${t.noisy != null ? ` · noisy success ${pct(t.noisy)}` : ""}</div></div>`,
    ).join("") +
    `<div class="optnote">At 1,000,000 squares: 1,000,000 classical checks vs ≈785 Grover calls.</div>`;
}

/* ---------------- end-of-mission pop-up: quantum vs classical ---------------- */
function showSummary(outcome) {
  const c = TALLY.reduce((s, t) => s + t.c, 0),
    q = TALLY.reduce((s, t) => s + t.q, 0),
    gates = TALLY.reduce((s, t) => s + t.q * t.gates, 0);
  $("modal").innerHTML = `
    <h3>${outcome}</h3>
    <div class="sub">How many times each approach has to ask “is this the answer?”</div>
    <div class="vs">
      <div><small>Classical robot</small><b>${c}</b><span>checks: every square, then every route, one at a time</span></div>
      <div class="q"><small>Quantum robot (Grover)</small><b>${q}</b><span>oracle calls: all possibilities checked in superposition</span></div>
    </div>
    <table class="mt"><tr><th>Search</th><th>Classical</th><th>Quantum</th><th>Qubits</th><th>2q gates / call</th></tr>
      ${TALLY.map((t) => `<tr><td>${t.label}</td><td class="n">${t.c}</td><td class="n">${t.q}</td><td class="n">${t.qubits}</td><td class="n">${t.gates.toLocaleString()}</td></tr>`).join("")}
    </table>
    <div class="honest"><b>${(c / Math.max(1, q)).toFixed(1)}× fewer calls</b>, and the gap grows with the map: 1,000,000 squares need
      ≈785 Grover calls instead of 1,000,000 checks. The catch: each quantum call is a whole circuit
      (${gates.toLocaleString()} two-qubit gates in total here), and ${noisy ? "on today's noisy hardware that much circuit washes most of the answer out." : "on today's noisy hardware that is too deep to survive. Switch to Noisy to see it."}</div>
    <div class="btns"><button class="btn" id="mAgain">Run again</button><button class="btn alt" id="mClose">Close</button></div>`;
  $("overlay").hidden = false;
  $("mClose").onclick = () => ($("overlay").hidden = true);
  $("mAgain").onclick = () => {
    $("overlay").hidden = true;
    runAgain();
  };
}
