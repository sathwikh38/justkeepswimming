/* ---------------- 2D map ---------------- */
const svg = document.getElementById("map"),
  NS = "http://www.w3.org/2000/svg",
  MONO = "IBM Plex Mono, monospace";
const el = (t, a = {}, p) => {
  const e = document.createElementNS(NS, t);
  for (const k in a) e.setAttribute(k, a[k]);
  (p || svg).appendChild(e);
  return e;
};
const txt = (p, x, y, s, a = {}) => {
  const t = el("text", { x, y, ...a }, p);
  t.textContent = s;
  return t;
};
const cx = (x) => O + rc(x)[1] * T + T / 2,
  cy = (x) => O + rc(x)[0] * T + T / 2,
  at = (x) => `translate(${cx(x)},${cy(x)})`;
let L = {};
function drawMap() {
  svg.innerHTML = "";
  const out = world === "outdoor";
  const defs = el("defs");
  const mk = (id, c) => {
    const m = el(
      "marker",
      { id, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto" },
      defs,
    );
    el("path", { d: "M1 1L9 5L1 9", fill: "none", stroke: c, "stroke-width": 1.6 }, m);
  };
  mk("ahB", "#1d4ed8");
  mk("ahG", "#6b747c");
  ["#1d4ed8", "#c2410c", "#15803d"].forEach((c, i) => mk("ahP" + i, c));
  if (!out) {
    const p = el(
      "pattern",
      { id: "water", width: 9, height: 9, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
      defs,
    );
    el("line", { x1: 0, y1: 0, x2: 0, y2: 9, stroke: "#5b8db8", "stroke-width": 1, opacity: 0.2 }, p);
  } else {
    const p = el("pattern", { id: "trees", width: 16, height: 16, patternUnits: "userSpaceOnUse" }, defs);
    el("circle", { cx: 4, cy: 4, r: 2.2, fill: "none", stroke: "#3f6b46", "stroke-width": 0.8 }, p);
    el("circle", { cx: 12, cy: 11, r: 2.2, fill: "none", stroke: "#3f6b46", "stroke-width": 0.8 }, p);
    const m = el("pattern", { id: "marsh", width: 14, height: 10, patternUnits: "userSpaceOnUse" }, defs);
    el("line", { x1: 2, y1: 5, x2: 10, y2: 5, stroke: "#5b8db8", "stroke-width": 0.9 }, m);
    el("line", { x1: 5, y1: 2, x2: 5, y2: 5, stroke: "#3f6b46", "stroke-width": 0.7 }, m);
    const b = el("pattern", { id: "boulder", width: 18, height: 18, patternUnits: "userSpaceOnUse" }, defs);
    el("circle", { cx: 6, cy: 7, r: 3, fill: "#b9ad9c" }, b);
    el("circle", { cx: 14, cy: 14, r: 2, fill: "#b9ad9c" }, b);
  }
  el("rect", { x: 0, y: 0, width: 560, height: 560, fill: "#fff" });
  for (let c = 0; c < 4; c++) {
    const X = O + c * T + T / 2;
    el("line", {
      x1: X,
      y1: 14,
      x2: X,
      y2: O + 4 * T,
      stroke: "var(--grid)",
      "stroke-width": 0.6,
      "stroke-dasharray": "8 3 2 3",
    });
    el("circle", { cx: X, cy: 14, r: 10, fill: "#fff", stroke: "#8b959e", "stroke-width": 0.8 });
    txt(svg, X, 18, "ABCD"[c], {
      "text-anchor": "middle",
      "font-size": 10,
      "font-family": MONO,
      fill: "#4b535b",
    });
  }
  for (let r = 0; r < 4; r++) {
    const Y = O + r * T + T / 2;
    el("line", {
      x1: 14,
      y1: Y,
      x2: O + 4 * T,
      y2: Y,
      stroke: "var(--grid)",
      "stroke-width": 0.6,
      "stroke-dasharray": "8 3 2 3",
    });
    el("circle", { cx: 14, cy: Y, r: 10, fill: "#fff", stroke: "#8b959e", "stroke-width": 0.8 });
    txt(svg, 14, Y + 4, String(r + 1), {
      "text-anchor": "middle",
      "font-size": 10,
      "font-family": MONO,
      fill: "#4b535b",
    });
  }
  if (!out) {
    el("rect", { x: O, y: O, width: 4 * T, height: 4 * T, fill: "url(#water)" });
  } else {
    el("rect", { x: O, y: O, width: 4 * T, height: 4 * T, fill: "#eef2e6" });
    const fillG = (g, f) =>
      GROUPS[g].forEach((x) => {
        const [r, c] = rc(x);
        el("rect", { x: O + c * T, y: O + r * T, width: T, height: T, fill: f });
      });
    fillG(0, "url(#trees)");
    fillG(1, "url(#trees)");
    fillG(2, "url(#trees)");
    fillG(8, "url(#marsh)");
    fillG(6, "url(#boulder)");
    // contour lines
    for (let i = 0; i < 7; i++) {
      let d = "";
      for (let k = 0; k <= 60; k++) {
        const t = (k / 60) * Math.PI * 2;
        const R = 40 + i * 34 + 8 * Math.sin(3 * t + i) + 6 * Math.cos(5 * t - i);
        const X = O + 300 + R * Math.cos(t) * 1.15,
          Y = O + 150 + R * Math.sin(t) * 0.85;
        d += (k ? "L" : "M") + X.toFixed(1) + " " + Y.toFixed(1);
      }
      el("path", {
        d: d + "Z",
        fill: "none",
        stroke: "#a4805a",
        "stroke-width": i % 4 === 3 ? 1.1 : 0.6,
        opacity: 0.55,
        "clip-path": "url(#clipMap)",
      });
    }
    const cp = el("clipPath", { id: "clipMap" }, defs);
    el("rect", { x: O, y: O, width: 4 * T, height: 4 * T }, cp);
    // trail
    el("path", {
      d: `M${O} ${cy(8)} L${cx(11) + 60} ${cy(11)}`,
      stroke: "#8a5a2b",
      "stroke-width": 1.6,
      "stroke-dasharray": "7 5",
      fill: "none",
    });
  }
  L.heat = el("g");
  L.cls = el("g");
  // home marker
  {
    const [r, c] = rc(STAIR),
      X = O + c * T,
      Y = O + r * T;
    if (!out) {
      const g = el("g");
      for (let i = 0; i < 8; i++)
        el(
          "line",
          {
            x1: X + 22,
            y1: Y + 20 + i * 9,
            x2: X + T - 22,
            y2: Y + 20 + i * 9,
            stroke: "#6b747c",
            "stroke-width": 0.8,
          },
          g,
        );
      el(
        "line",
        {
          x1: X + T / 2,
          y1: Y + 84,
          x2: X + T / 2,
          y2: Y + 24,
          stroke: "#6b747c",
          "stroke-width": 0.9,
          "marker-end": "url(#ahG)",
        },
        g,
      );
      txt(g, X + T / 2 + 6, Y + 34, "UP", { "font-size": 9, "font-family": MONO, fill: "#6b747c" });
    } else {
      el("path", {
        d: `M${X + T / 2} ${Y + 30} L${X + T / 2 + 18} ${Y + 62} L${X + T / 2 - 18} ${Y + 62}Z`,
        fill: "none",
        stroke: "#8a5a2b",
        "stroke-width": 1.6,
      });
      el("line", {
        x1: X + T / 2,
        y1: Y + 30,
        x2: X + T / 2,
        y2: Y + 62,
        stroke: "#8a5a2b",
        "stroke-width": 1,
      });
    }
  }
  // fixtures (indoor)
  if (!out) {
    const fx = (x, f) => {
        const [r, c] = rc(x);
        f(O + c * T, O + r * T);
      },
      st = { fill: "none", stroke: "#8b959e", "stroke-width": 0.8 };
    [0, 1].forEach((x) =>
      fx(x, (X, Y) => {
        for (let i = 0; i < 3; i++)
          el("rect", { x: X + 20 + i * 28, y: Y + 16, width: 22, height: 40, ...st });
      }),
    );
    fx(2, (X, Y) => el("rect", { x: X + 20, y: Y + 40, width: 180, height: 22, ...st }));
    fx(6, (X, Y) => el("rect", { x: X + 20, y: Y + 40, width: 180, height: 22, ...st }));
    fx(14, (X, Y) => {
      el("circle", { cx: X + 60, cy: Y + 50, r: 24, ...st });
      el("rect", { x: X + 150, y: Y + 28, width: 50, height: 44, ...st });
    });
    fx(12, (X, Y) => {
      for (let i = 0; i < 3; i++) el("rect", { x: X + 14, y: Y + 18 + i * 22, width: 34, height: 16, ...st });
    });
  }
  // walls
  const wall = (x1, y1, x2, y2, outer) => {
    if (!out) {
      el("line", { x1, y1, x2, y2, stroke: "var(--wall)", "stroke-width": 7, "stroke-linecap": "square" });
      return;
    }
    el("line", {
      x1,
      y1,
      x2,
      y2,
      stroke: "#5a4632",
      "stroke-width": outer ? 2 : 3,
      "stroke-linecap": "round",
    });
    if (outer) return;
    const len = Math.hypot(x2 - x1, y2 - y1),
      ux = (x2 - x1) / len,
      uy = (y2 - y1) / len;
    for (let s = 6; s < len - 3; s += 8)
      el("line", {
        x1: x1 + ux * s,
        y1: y1 + uy * s,
        x2: x1 + ux * s - uy * 6,
        y2: y1 + uy * s + ux * 6,
        stroke: "#5a4632",
        "stroke-width": 1,
      });
  };
  const door = (x1, y1, x2, y2, v) => {
    if (out) return;
    const st = T * 0.22,
      gl = T - 2 * st,
      g = { stroke: "#8b959e", fill: "none" };
    if (v) {
      wall(x1, y1, x2, y1 + st);
      wall(x1, y2 - st, x2, y2);
      const y = y1 + st;
      el("path", {
        d: `M${x1} ${y} A${gl} ${gl} 0 0 1 ${x1 + gl * 0.62} ${y + gl * 0.78}`,
        ...g,
        "stroke-width": 0.7,
      });
      el("line", { x1, y1: y, x2: x1 + gl * 0.62, y2: y + gl * 0.78, ...g, "stroke-width": 0.9 });
    } else {
      wall(x1, y1, x1 + st, y2);
      wall(x2 - st, y1, x2, y2);
      const x = x1 + st;
      el("path", {
        d: `M${x} ${y1} A${gl} ${gl} 0 0 0 ${x + gl * 0.78} ${y1 + gl * 0.62}`,
        ...g,
        "stroke-width": 0.7,
      });
      el("line", { x1: x, y1, x2: x + gl * 0.78, y2: y1 + gl * 0.62, ...g, "stroke-width": 0.9 });
    }
  };
  for (let x = 0; x < 16; x++) {
    const [r, c] = rc(x),
      X = O + c * T,
      Y = O + r * T,
      w = WALLS[x];
    if (w[0] && r === 0) wall(X, Y, X + T, Y, 1);
    if (w[3] && c === 0) wall(X, Y, X, Y + T, 1);
    if (c < 3) {
      if (w[1]) wall(X + T, Y, X + T, Y + T);
      else if (groupOf(x + 1) !== groupOf(x)) door(X + T, Y, X + T, Y + T, true);
    } else if (w[1]) wall(X + T, Y, X + T, Y + T, 1);
    if (r < 3) {
      if (w[2]) wall(X, Y + T, X + T, Y + T);
      else if (groupOf(x + 4) !== groupOf(x)) door(X, Y + T, X + T, Y + T, false);
    } else if (w[2]) wall(X, Y + T, X + T, Y + T, 1);
  }
  // labels
  GROUPS.forEach((g, i) => {
    const cells = LABELCELLS[i] || g,
      xs = cells.map(cx),
      ys = cells.map(cy);
    const X = (Math.min(...xs) + Math.max(...xs)) / 2,
      Y = Math.max(...ys) + T / 2 - 24;
    txt(svg, X, Y, THEMES[world].names[i], {
      "text-anchor": "middle",
      "font-size": 11,
      "font-weight": 600,
      "font-family": MONO,
      fill: "#2b3137",
      "letter-spacing": ".06em",
    });
  });
  // north + scale
  const na = el("g", { transform: "translate(540,70)" });
  el("circle", { cx: 0, cy: 0, r: 11, fill: "#fff", stroke: "#4b535b", "stroke-width": 0.8 }, na);
  el("path", { d: "M0 -9 L5 6 L0 2 L-5 6Z", fill: "#1b1f23" }, na);
  txt(na, 0, -15, "N", { "text-anchor": "middle", "font-size": 10, "font-family": MONO });
  L.home = el("g");
  L.trail = el("g");
  L.paths = el("g");
  L.sup = el("g");
  L.ghosts = el("g");
  L.robot = el("g", { id: "robo", style: "transition:transform .6s cubic-bezier(.4,.1,.2,1)" });
  el("circle", { r: 26, fill: "rgba(29,78,216,.10)" }, L.robot);
  el("circle", { r: 15, fill: "var(--blue)", stroke: "#fff", "stroke-width": 2.5 }, L.robot);
  el("path", { d: "M0 -9 L6 4 L0 1 L-6 4Z", fill: "#fff" }, L.robot);
  render2D();
}
function render2D() {
  L.heat.innerHTML = "";
  if (S.probs)
    S.probs.forEach((p, x) => {
      if (p < 0.005) return;
      const [r, c] = rc(x);
      el(
        "rect",
        {
          x: O + c * T,
          y: O + r * T,
          width: T,
          height: T,
          fill: "var(--accent)",
          opacity: Math.min(0.55, 0.06 + p * 0.5),
        },
        L.heat,
      );
      if (p >= 0.03 && !S.glow)
        txt(L.heat, O + c * T + T - 10, O + r * T + 20, Math.round(p * 100) + "%", {
          "text-anchor": "end",
          "font-size": 13,
          "font-weight": 600,
          "font-family": MONO,
          fill: "#7c2d12",
        });
    });
  L.cls.innerHTML = "";
  for (const x in S.cls) {
    const ok = S.cls[x] === "ok",
      scan = S.cls[x] === "scan";
    const [r, c] = rc(+x);
    el(
      "rect",
      {
        x: O + c * T + 4,
        y: O + r * T + 4,
        width: T - 8,
        height: T - 8,
        fill: scan ? "rgba(22,25,28,.08)" : ok ? "rgba(21,128,61,.10)" : "rgba(0,0,0,.03)",
        stroke: scan ? "var(--ink)" : ok ? "var(--green)" : "#9aa3ab",
        "stroke-width": scan ? 3 : 1.4,
        "stroke-dasharray": scan ? "" : "4 3",
      },
      L.cls,
    );
    if (!scan)
      txt(L.cls, O + c * T + 14, O + r * T + 24, ok ? "✓ match" : "✗", {
        "font-size": 12,
        "font-family": MONO,
        fill: ok ? "var(--green)" : "#8b959e",
        "font-weight": 600,
      });
  }
  L.home.innerHTML = "";
  {
    const [r, c] = rc(HOME);
    el(
      "rect",
      {
        x: O + c * T + 5,
        y: O + r * T + 5,
        width: T - 10,
        height: T - 10,
        fill: "none",
        stroke: "var(--accent)",
        "stroke-width": 2.5,
      },
      L.home,
    );
    const tg = el(
      "rect",
      { x: O + c * T + 5, y: O + r * T + 5, width: 44, height: 17, fill: "var(--accent)" },
      L.home,
    );
    txt(L.home, O + c * T + 27, O + r * T + 17, "HOME", {
      "text-anchor": "middle",
      "font-size": 10,
      "font-weight": 600,
      "font-family": MONO,
      fill: "#fff",
    });
  }
  L.trail.innerHTML = "";
  S.trail.forEach(([a, b]) =>
    el(
      "line",
      {
        x1: cx(a),
        y1: cy(a),
        x2: cx(b),
        y2: cy(b),
        stroke: "var(--blue)",
        "stroke-width": 1.6,
        "marker-end": "url(#ahB)",
        opacity: 0.8,
      },
      L.trail,
    ),
  );
  L.paths.innerHTML = "";
  (S.paths || []).forEach((p) => {
    const off = (p.idx - (p.of - 1) / 2) * 12; // side-by-side when several routes share a corridor
    const P = (x) => [cx(x) + off, cy(x) + off];
    for (let j = 0; j < p.n; j++) {
      const [x1, y1] = P(p.cells[j]),
        [x2, y2] = P(p.cells[j + 1]);
      if (p.cells[j] === p.cells[j + 1]) {
        const [dr, dc] = STEP[p.dirs[j]],
          ex = x1 + dc * T * 0.36,
          ey = y1 + dr * T * 0.36;
        el("line", { x1, y1, x2: ex, y2: ey, stroke: p.color, "stroke-width": 4, "stroke-dasharray": "3 3", opacity: 0.9 }, L.paths);
        el("line", { x1: ex + (dr ? -9 : 0), y1: ey + (dc ? -9 : 0), x2: ex + (dr ? 9 : 0), y2: ey + (dc ? 9 : 0), stroke: p.color, "stroke-width": 4, "stroke-linecap": "round" }, L.paths);
        txt(L.paths, ex + (dc ? -dc * 4 : 12), ey + (dr ? -dr * 6 : -10), "bump", { "font-size": 10, "font-family": MONO, fill: p.color, "text-anchor": dc > 0 ? "end" : "start", "font-weight": 600 });
      } else
        el("line", { x1, y1, x2: x2 - (x2 - x1) * 0.12, y2: y2 - (y2 - y1) * 0.12, stroke: p.color, "stroke-width": 5, "stroke-linecap": "round", "marker-end": `url(#ahP${p.idx % 3})`, opacity: 0.92 }, L.paths);
      const [nx, ny] = P(p.cells[j + 1]);
      el("circle", { cx: nx, cy: ny, r: 9, fill: "#fff", stroke: p.color, "stroke-width": 2 }, L.paths);
      txt(L.paths, nx, ny + 3.5, String(j + 1), { "text-anchor": "middle", "font-size": 10, "font-weight": 600, "font-family": MONO, fill: p.color });
    }
    const [sx, sy] = P(p.cells[0]);
    el("circle", { cx: sx, cy: sy, r: 6, fill: p.color }, L.paths);
  });
  L.ghosts.innerHTML = "";
  S.ghosts.forEach((x) => {
    const g = el(
      "g",
      { transform: at(x), style: "transition:transform .6s cubic-bezier(.4,.1,.2,1)" },
      L.ghosts,
    );
    el(
      "circle",
      {
        r: 17,
        fill: "rgba(29,78,216,.06)",
        stroke: "var(--blue)",
        "stroke-width": 1.5,
        "stroke-dasharray": "4 3",
      },
      g,
    );
    el("circle", { r: 2.5, fill: "var(--blue)" }, g);
  });
  L.sup.innerHTML = "";
  if (S.sup)
    S.sup.forEach((p, x) => {
      if (p < 0.01) return;
      const g = el("g", { transform: at(x), opacity: Math.min(1, 0.15 + p * 1.6) }, L.sup);
      el(
        "circle",
        {
          r: 15,
          fill: "rgba(29,78,216,.08)",
          stroke: "var(--blue)",
          "stroke-width": 1.4,
          "stroke-dasharray": "4 3",
        },
        g,
      );
      el("path", { d: "M0 -8 L5 4 L0 1 L-5 4Z", fill: "var(--blue)", opacity: 0.6 }, g);
    });
  if (!S.dragging) L.robot.setAttribute("transform", at(S.pos));
  L.robot.style.opacity = stage === "setup" || document.getElementById("reveal").checked ? 1 : 0;
  svg.classList.toggle("setup", stage === "setup");
  if (view !== "2d") update3D();
}
