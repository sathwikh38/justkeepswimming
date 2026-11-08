/* ---------------- chart with self-explaining diffuser ---------------- */
const chart = document.getElementById("chart");
const ce = (t, a) => {
  const e = document.createElementNS(NS, t);
  for (const k in a) e.setAttribute(k, a[k]);
  chart.appendChild(e);
  return e;
};
function drawChart(a, marked, o = {}) {
  chart.innerHTML = "";
  const N = a.length,
    x0 = 34,
    W = 510,
    mid = 118,
    sc = N > 16 ? 78 : 90,
    bw = W / N;
  ce("line", { x1: x0, y1: mid, x2: x0 + W, y2: mid, stroke: "#c9d0d6" });
  ce("text", {
    x: x0 - 6,
    y: mid + 4,
    "text-anchor": "end",
    "font-size": 10,
    fill: "#8b959e",
    "font-family": MONO,
  }).textContent = "0";
  const mean = a.reduce((s, v) => s + v, 0) / N;
  if (o.old)
    o.old.forEach((v, i) => {
      const h = Math.abs(v) * sc;
      ce("rect", {
        x: x0 + i * bw + (N > 16 ? 0.5 : 4),
        y: v >= 0 ? mid - h : mid,
        width: Math.max(0.6, bw - (N > 16 ? 1 : 8)),
        height: Math.max(h, 1),
        fill: "none",
        stroke: "#9aa3ab",
        "stroke-width": 1,
        "stroke-dasharray": "3 2",
      });
    });
  a.forEach((v, i) => {
    const h = Math.abs(v) * sc;
    ce("rect", {
      x: x0 + i * bw + (N > 16 ? 0.5 : 4),
      y: v >= 0 ? mid - h : mid,
      width: Math.max(0.6, bw - (N > 16 ? 1 : 8)),
      height: Math.max(h, 1),
      fill: marked.has(i) ? "var(--accent)" : "#9aa3ab",
      opacity: o.scan != null && o.scan !== i ? 0.55 : 1,
    });
  });
  if (o.arrows && o.old)
    o.old.forEach((v, i) => {
      if (N > 16 && !marked.has(i) && i % Math.max(8, N / 8)) return;
      const y1 = mid - v * sc,
        y2 = mid - o.target[i] * sc;
      if (Math.abs(y2 - y1) < 14) return;
      const X = x0 + i * bw + bw / 2;
      ce("line", {
        x1: X,
        y1: y1,
        x2: X,
        y2: y2 + (y2 > y1 ? -3 : 3),
        stroke: marked.has(i) ? "var(--accent)" : "#4b535b",
        "stroke-width": 1.3,
        "marker-end": "url(#cah)",
      });
    });
  if (o.avg) {
    const y = mid - mean * sc;
    ce("line", {
      x1: x0,
      y1: y,
      x2: x0 + W,
      y2: y,
      stroke: "var(--blue)",
      "stroke-dasharray": "5 4",
      "stroke-width": 1.5,
    });
    ce("text", {
      x: x0 + W,
      y: y - 6,
      "text-anchor": "end",
      "font-size": 11,
      fill: "var(--blue)",
      "font-family": MONO,
    }).textContent = "average";
  }
  if (o.scan != null) {
    const X = x0 + o.scan * bw + bw / 2;
    ce("path", { d: `M${X - 5} 12 L${X + 5} 12 L${X} 20Z`, fill: "var(--ink)" });
  }
  const defs = ce("defs", {});
  const m = document.createElementNS(NS, "marker");
  [
    ["id", "cah"],
    ["viewBox", "0 0 10 10"],
    ["refX", 8],
    ["refY", 5],
    ["markerWidth", 5],
    ["markerHeight", 5],
    ["orient", "auto"],
  ].forEach(([k, v]) => m.setAttribute(k, v));
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", "M1 1L9 5L1 9");
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", "context-stroke");
  p.setAttribute("stroke-width", "1.6");
  m.appendChild(p);
  defs.appendChild(m);
  if (N === 16)
    for (let i = 0; i < 16; i++)
      ce("text", {
        x: x0 + i * bw + bw / 2,
        y: 204,
        "text-anchor": "middle",
        "font-size": 10,
        fill: "#7a838b",
        "font-family": MONO,
      }).textContent = gridName(i);
  else {
    [
      [0, o.names ? o.names[0] : ""],
      [N - 1, o.names ? o.names[N - 1] : ""],
    ].forEach(
      ([i, t]) =>
        (ce("text", {
          x: x0 + i * bw + bw / 2,
          y: 204,
          "text-anchor": "middle",
          "font-size": 10,
          fill: "#7a838b",
          "font-family": MONO,
        }).textContent = t),
    );
  }
}
const $ = (id) => document.getElementById(id);
const phase = (h) => ($("phase").innerHTML = h);
const lerp = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);

async function grover(N, marked, k, toMap) {
  let a = Array(N).fill(1 / Math.sqrt(N));
  const nm = toMap.names;
  const show = (arr) => {
    if (toMap.f) {
      S.probs = toMap.f(arr);
      S.sup = S.probs;
    }
    if (N === 16 && !toMap.shift) {
      S.amps = arr;
      S.ampMarked = marked;
    } else S.amps = null;
    render2D();
  };
  const dc = (arr, o = {}) => drawChart(arr, marked, { ...o, names: nm });
  dc(a);
  show(a);
  setStats(N, marked.size, 0);
  phase(`<b>Superposition:</b> every ${N === 16 ? "square" : "plan"} equally likely.`);
  await sleep(1300);
  for (let r = 1; r <= k; r++) {
    setStats(N, marked.size, r);
    const fast = r > 2;
    const flipped = a.map((v, i) => (marked.has(i) ? -v : v)),
      a0 = a.slice();
    if (!fast) {
      phase(`<b>Round ${r} · Oracle:</b> flip the sign of every match.`);
      await tween(700, (u) => {
        const cur = lerp(a0, flipped, u);
        dc(cur, { old: a0 });
        show(cur);
      });
      await sleep(650);
    }
    a = flipped;
    const mean = a.reduce((s, v) => s + v, 0) / N,
      target = a.map((v) => 2 * mean - v);
    if (!fast) {
      phase(
        `<b>Round ${r} · Diffuser:</b> mirror every bar across the <span style="color:var(--blue)">average</span>. Flipped bars jump up.`,
      );
      dc(a, { avg: true });
      await sleep(1000);
      dc(a, { avg: true, old: a, arrows: true, target });
      await sleep(1200);
      const a1 = a.slice();
      await tween(800, (u) => {
        const cur = lerp(a1, target, u);
        dc(cur, { avg: true, old: a1 });
        show(cur);
      });
    } else {
      phase(`<b>Rounds 3–${k}:</b> same two steps, sped up.`);
      const a1 = a0.slice();
      await tween(k > 8 ? 160 : 350, (u) => {
        const cur = lerp(a1, target, u);
        dc(cur);
        show(cur);
      });
    }
    a = target;
    const pm = [...marked].reduce((t, i) => t + a[i] * a[i], 0);
    if (!fast || r === k) {
      phase(
        `<b>After round ${r}:</b> ${(pm * 100).toFixed(1)}% on matches (theory ${(theory(N, marked.size, r) * 100).toFixed(1)}%)${r === k ? " · stop here" : ""}`,
      );
      await sleep(r === k ? 900 : 1100);
    }
  }
  dc(a);
  return a;
}

async function classicalScan(N, marked, onMap, names) {
  let checks = 0,
    found = [];
  const step = Math.max(1, Math.ceil(N / 64));
  phase(`<b>Classical:</b> check one ${N === 16 ? "square" : "plan"} at a time.`);
  const flat = Array(N).fill(1 / Math.sqrt(N));
  for (let i = 0; i < N; i++) {
    checks++;
    if (marked.has(i)) found.push(i);
    if (onMap) {
      S.cls[i] = "scan";
      render2D();
      phase(`<b>Classical check ${i + 1}/${N}:</b> ${gridName(i)} ${marked.has(i) ? "✓ match" : "✗"}`);
      await sleep(190);
      S.cls[i] = marked.has(i) ? "ok" : "no";
      render2D();
    } else if (i % step === 0 || i === N - 1)
      phase(`<b>Classical check ${i + 1}/${N}:</b> plan ${names ? names[i] : i}${marked.has(i) ? " ✓" : ""}`);
    if (onMap || i % step === 0 || i === N - 1) {
      drawChart(flat, marked, { scan: i, names });
      $("stats").innerHTML =
        `<span>classical checks <b>${checks}/${N}</b></span><span>found <b>${found.length}</b></span>`;
      await sleep(onMap ? 40 : 45);
    }
  }
  await sleep(600);
  if (onMap) {
    S.cls = {};
    render2D();
  }
  return checks;
}
