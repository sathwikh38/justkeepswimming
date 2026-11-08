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
  if (happy) {
    e("path", { d: "M14 64 l6 0", stroke: "#e58a8a", "stroke-width": 3, "stroke-linecap": "round" });
    e("path", { d: "M78 60 l6 0", stroke: "#e58a8a", "stroke-width": 3, "stroke-linecap": "round" });
  }
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
    x.onclick = async () => {
      if (S.busy) return;
      S.busy = true;
      [...b.children].forEach((c) => (c.disabled = true));
      try {
        await fn();
      } finally {
        S.busy = false;
      }
    };
    b.appendChild(x);
  });
}
function setStats(N, M, k, q) {
  $("stats").innerHTML =
    N == null
      ? ""
      : `<span>N <b>${N}</b></span><span>matches <b>${M}</b></span><span>round <b>${k}</b></span>`;
}
let STG = null;
const STAGE_T = { 1: "STAGE 1 · WHERE AM I?", 2: "STAGE 2 · WAY HOME" };
function stageStart(n) {
  if (STG && !STG.saved) stageSave("");
  const d = document.createElement("div");
  d.className = "stg live";
  d.innerHTML = `<div class="sh"><span>${STAGE_T[n]}</span><span class="st">live</span></div><div class="sl"></div><div class="sumbox"></div>`;
  $("stages").appendChild(d);
  STG = { el: d, n, q: 0, c: 0, N: n === 1 ? 16 : 0, qb: 0, saved: false };
}
const log = (h) => {
  if (!STG) return;
  const x = document.createElement("div");
  x.innerHTML = "› " + h;
  STG.el.querySelector(".sl").appendChild(x);
};
function optHTML(c, q, N) {
  const w = (v) => Math.max(2, Math.round((100 * v) / c));
  return `<div class="opt"><span>classical checks</span><div class="bar" style="width:100%"></div><span class="n">${c}</span><span>quantum calls</span><div class="bar q" style="width:${w(q)}%"></div><span class="n">${q}</span></div><div class="optnote">${(c / Math.max(1, q)).toFixed(1)}× fewer calls · ${STG.qb} qubits · at 1M: 1,000,000 vs ≈785</div>`;
}
function stageSave(sum) {
  if (!STG || STG.saved) return;
  STG.saved = true;
  STG.el.className = "stg saved";
  STG.el.querySelector(".st").textContent = "saved ✓";
  const el0 = STG.el;
  el0.querySelector(".sumbox").innerHTML =
    (sum ? `<div class="sum">${sum}</div>` : "") +
    (STG.q ? optHTML(STG.c, STG.q, STG.N) : "") +
    `<button class="more">steps</button>`;
  el0.querySelector(".more").onclick = () => el0.classList.toggle("open");
}
const readingHTML = (rd) =>
  `<div class="reading">${DIRS.split("")
    .map((d, i) => `<span class="rb ${rd[i] ? "w" : ""}">${d} ${rd[i] ? "wall" : "open"}</span>`)
    .join("")}</div>`;

const useCls = () => $("classical").checked;
