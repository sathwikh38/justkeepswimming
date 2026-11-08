/* ---------------- world model ---------------- */
const WALLS = [
  "1001",
  "1100",
  "1001",
  "1100",
  "0101",
  "0101",
  "0001",
  "0110",
  "0001",
  "0000",
  "0010",
  "1100",
  "0111",
  "0011",
  "1010",
  "0110",
].map((s) => s.split("").map(Number));
const GROUPS = [[0, 1], [4], [5], [2, 3, 6, 7], [8, 10, 11], [9], [12], [13], [14, 15]];
const LABELCELLS = [null, null, null, null, [11], null, null, null, null];
const THEMES = {
  indoor: {
    names: ["SERVER RM", "HALL A", "HALL B", "LAB", "CORRIDOR", "STAIR A", "STORAGE", "VESTIBULE", "MECH RM"],
    home: "Stair A",
    place: "basement level B1",
  },
  outdoor: {
    names: [
      "PINE STAND",
      "GULLY A",
      "GULLY B",
      "RIDGE",
      "TRAIL",
      "BASE CAMP",
      "BOULDERS",
      "CLEARING",
      "MARSH",
    ],
    home: "Base Camp",
    place: "the ridge park",
  },
};
let world = "indoor",
  view = "2d";
const DIRS = "NESW",
  STEP = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] },
  NAMES = { N: "north", E: "east", S: "south", W: "west" };
let HOME = 9,
  START = 5;
const STAIR = 9,
  T = 120,
  O = 40;
const rc = (x) => [Math.floor(x / 4), x % 4],
  idx = (r, c) => r * 4 + c;
const gridName = (x) => {
  const [r, c] = rc(x);
  return "ABCD"[c] + (r + 1);
};
const groupOf = (x) => GROUPS.findIndex((g) => g.includes(x));
const cellName = (x) => `${THEMES[world].names[groupOf(x)]} (${gridName(x)})`;
const reading = (x) => WALLS[x].slice();
const move = (x, d) => {
  if (WALLS[x][DIRS.indexOf(d)]) return x;
  const [r, c] = rc(x),
    [dr, dc] = STEP[d];
  return idx(r + dr, c + dc);
};
const senseAfter = (x, ms) => {
  const o = [reading(x)];
  for (const d of ms) {
    x = move(x, d);
    o.push(reading(x));
  }
  return o;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const candidates = (rds, ms) => [...Array(16).keys()].filter((x) => same(senseAfter(x, ms), rds));
const endOf = (x, p) => {
  for (const d of p) x = move(x, d);
  return x;
};
const plansOf = (L) => {
  let p = [""];
  for (let i = 0; i < L; i++) p = p.flatMap((x) => DIRS.split("").map((d) => x + d));
  return p;
};
/* ---------------- Qiskit results (precompute_ui.py -> js/qdata.js) ---------------- */
const Q = window.QDATA || null;
const PLAN_MOVES = 3; // Qiskit scope: 3 moves x 2 qubits = 64 plans
let noisy = false;
const q1 = (ms, rds) => Q && Q.stage1[ms + "|" + rds.map((r) => r.join("")).join("-")];
const q2 = (starts, goal) => Q && Q.stage2[[...starts].sort((a, b) => a - b).join(",") + "|" + goal];
const pct = (p) => Math.round(p * 100) + "%";
function dist(a, b) {
  let seen = new Set([a]),
    fr = [a];
  for (let d = 0; fr.length; d++) {
    if (fr.includes(b)) return d;
    const nx = [];
    fr.forEach((x) =>
      DIRS.split("").forEach((m) => {
        const y = move(x, m);
        if (!seen.has(y)) {
          seen.add(y);
          nx.push(y);
        }
      }),
    );
    fr = nx;
  }
  return Infinity;
}
const goalName = () => (HOME === STAIR ? THEMES[world].home : cellName(HOME));
const bestK = (N, M) => Math.max(0, Math.round(Math.PI / (4 * Math.asin(Math.sqrt(M / N))) - 0.5));
const theory = (N, M, k) => Math.sin((2 * k + 1) * Math.asin(Math.sqrt(M / N))) ** 2;
let seed = 7;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
function sample(a, n) {
  const p = a.map((v) => v * v),
    c = Array(a.length).fill(0);
  for (let s = 0; s < n; s++) {
    let u = rand(),
      i = 0;
    while (i < p.length - 1 && u > p[i]) {
      u -= p[i];
      i++;
    }
    c[i]++;
  }
  return c;
}

/* ---------------- shared state ---------------- */
const S = {
  pos: START,
  probs: null,
  amps: null,
  ampMarked: null,
  ghosts: [],
  trail: [],
  paths: [],
  cls: {},
  busy: false,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function tween(ms, fn) {
  return new Promise((res) => {
    const t0 = performance.now();
    const f = (t) => {
      let u = Math.min(1, (t - t0) / ms);
      u = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      fn(u);
      if (u < 1) requestAnimationFrame(f);
      else res();
    };
    requestAnimationFrame(f);
  });
}
