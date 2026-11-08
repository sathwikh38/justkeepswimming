/* ---------------- showcase views: Race, Oracle, Routes ----------------
   Each view renders into #showcase and reuses the shared world (WALLS, move, candidates, ...)
   and the Qiskit results (q1, q2). */
const SHOW = (() => {
  const SVGNS = "http://www.w3.org/2000/svg";
  const box = () => $("showcase");
  let token = 0; // bumps when the view changes, so running animations stop
  const alive = (t) => t === token;
  const wait = (ms, t) => new Promise((r) => setTimeout(r, ms)).then(() => alive(t));

  /* ---- a small 4x4 map: walls, cell labels, per-cell fill and text ---- */
  function mini(svg, { fill = () => "#fff", text = () => "", stroke = () => null, size = 64, onClick } = {}) {
    const P = 6,
      W = 4 * size + 2 * P;
    svg.setAttribute("viewBox", `0 0 ${W} ${W}`);
    svg.innerHTML = "";
    const e = (t, a) => {
      const x = document.createElementNS(SVGNS, t);
      for (const k in a) x.setAttribute(k, a[k]);
      svg.appendChild(x);
      return x;
    };
    for (let x = 0; x < 16; x++) {
      const [r, c] = rc(x),
        X = P + c * size,
        Y = P + r * size;
      const cell = e("rect", { x: X, y: Y, width: size, height: size, fill: fill(x), stroke: "#e2e4e6" });
      if (onClick) {
        cell.style.cursor = "pointer";
        cell.addEventListener("click", () => onClick(x));
      }
      const s = stroke(x);
      if (s) e("rect", { x: X + 3, y: Y + 3, width: size - 6, height: size - 6, fill: "none", stroke: s, "stroke-width": 3 });
      e("text", { x: X + 5, y: Y + 13, "font-size": 10, "font-family": "IBM Plex Mono, monospace", fill: "#7a838b" }).textContent = gridName(x);
      const t = text(x);
      if (t) {
        const tt = e("text", { x: X + size / 2, y: Y + size / 2 + 6, "text-anchor": "middle", "font-size": 15, "font-weight": 600, "font-family": "IBM Plex Mono, monospace", fill: "#16191c" });
        tt.textContent = t;
        tt.style.pointerEvents = "none";
      }
      const w = WALLS[x],
        L = (x1, y1, x2, y2) => e("line", { x1, y1, x2, y2, stroke: "#1b1f23", "stroke-width": 4, "stroke-linecap": "square" });
      if (w[0]) L(X, Y, X + size, Y);
      if (w[1]) L(X + size, Y, X + size, Y + size);
      if (w[2]) L(X, Y + size, X + size, Y + size);
      if (w[3]) L(X, Y, X, Y + size);
    }
    return { P, size, e };
  }
  const heat = (p) => `rgba(194,65,12,${Math.min(0.85, p * 1.6).toFixed(3)})`;
  const permute = (n) => {
    const a = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = (p) => {
    let u = Math.random() * p.reduce((s, v) => s + v, 0);
    for (let i = 0; i < p.length; i++) if ((u -= p[i]) <= 0) return i;
    return p.length - 1;
  };

  /* =================== 1. Query race =================== */
  function race() {
    const t = ++token;
    let start = S.pos;
    box().innerHTML = `
      <div class="sc-head"><h3>Query race</h3><p>Both robots feel the same walls and want a square that matches. Each <b>question to the oracle</b> costs one count. Classical asks about one square at a time; quantum asks about all of them at once, k times, then looks. This counts questions, not seconds.</p></div>
      <div class="sc-row">
        <div class="sc-card"><div class="sc-title">Classical Dory <span class="ctr" id="rcC">0</span></div><svg id="rmC" class="sc-map"></svg><div class="sc-note" id="rnC"></div></div>
        <div class="sc-card"><div class="sc-title">Quantum Dory <span class="ctr q" id="rcQ">0</span></div><svg id="rmQ" class="sc-map"></svg><div class="sc-note" id="rnQ"></div></div>
      </div>
      <div class="sc-bar"><button class="btn" id="rGo">Race</button><button class="btn alt" id="rMany">Run 1,000 races</button><span class="sc-hint">Click a square on either map to move Dory there.</span></div>
      <div class="sc-out" id="rOut"></div>`;
    const setup = () => {
      const rd = reading(start),
        C = candidates([rd], []),
        M = C.length,
        q = q1("", [rd]),
        k = noisy && q ? q.k_noisy : bestK(16, M),
        p = q ? (noisy ? q.noisy : q.ideal) : Array(16).fill(0).map((_, x) => (C.includes(x) ? theory(16, M, k) / M : (1 - theory(16, M, k)) / (16 - M)));
      const ps = C.reduce((s, x) => s + p[x], 0);
      return { rd, C, M, k, p, ps };
    };
    const draw = (which, opts) => mini($(which), { ...opts, onClick: (x) => { start = S.pos = x; reset0(); } });
    const reset0 = () => {
      ++token;
      const { rd, C, M, k, ps } = setup();
      $("rcC").textContent = $("rcQ").textContent = "0";
      draw("rmC", { stroke: (x) => (x === start ? "#1d4ed8" : null) });
      draw("rmQ", { fill: () => heat(1 / 16), stroke: (x) => (x === start ? "#1d4ed8" : null) });
      $("rnC").innerHTML = `Dory feels <b>${DIRS.split("").filter((d, i) => rd[i]).map((d) => NAMES[d]).join(" + ") || "no walls"}</b>. ${M} square${M > 1 ? "s" : ""} match.`;
      $("rnQ").innerHTML = `Grover: <b>${k} question${k === 1 ? "" : "s"}</b> per try, then one look (${pct(ps)} chance the look lands on a match${noisy ? ", noisy" : ""}).`;
      $("rOut").innerHTML = `Expected questions: classical <b>${((16 + 1) / (M + 1)).toFixed(1)}</b>, quantum <b>${(k / Math.max(ps, 1e-9)).toFixed(1)}</b>.`;
    };
    async function classical(tk, C) {
      const done = {};
      let n = 0;
      for (const x of permute(16)) {
        n++;
        done[x] = C.includes(x) ? "ok" : "no";
        $("rcC").textContent = n;
        mini($("rmC"), {
          fill: (y) => (done[y] === "ok" ? "#dcfce7" : done[y] === "no" ? "#f1f1ef" : "#fff"),
          text: (y) => (done[y] === "ok" ? "✓" : done[y] === "no" ? "✗" : ""),
          stroke: (y) => (y === x ? "#16191c" : null),
          onClick: (y) => { start = S.pos = y; reset0(); },
        });
        if (!(await wait(420, tk))) return null;
        if (C.includes(x)) return n;
      }
      return n;
    }
    async function quantum(tk, { C, M, k, p }) {
      let n = 0;
      for (let tries = 1; tries < 30; tries++) {
        let a = Array(16).fill(1 / 4);
        for (let r = 1; r <= k; r++) {
          n++;
          $("rcQ").textContent = n;
          a = a.map((v, i) => (C.includes(i) ? -v : v));
          const m = a.reduce((s, v) => s + v, 0) / 16;
          a = a.map((v) => 2 * m - v);
          mini($("rmQ"), { fill: (y) => heat(a[y] * a[y]), text: (y) => (a[y] * a[y] > 0.05 ? pct(a[y] * a[y]) : "") });
          if (!(await wait(900, tk))) return null;
        }
        const got = pick(p),
          ok = C.includes(got);
        mini($("rmQ"), { fill: (y) => (y === got ? (ok ? "#dcfce7" : "#fee2e2") : "#fff"), text: (y) => (y === got ? (ok ? "✓" : "✗") : "") });
        $("rnQ").innerHTML = ok ? `Looked and landed on <b>${gridName(got)}</b>, a match.` : `Looked and landed on <b>${gridName(got)}</b>, not a match (noise or bad luck). Trying again.`;
        if (!(await wait(900, tk))) return null;
        if (ok) return n;
      }
      return n;
    }
    $("rGo").onclick = async () => {
      reset0();
      const tk = token,
        s = setup();
      const [c, q] = await Promise.all([classical(tk, s.C), quantum(tk, s)]);
      if (c == null || q == null) return;
      $("rOut").innerHTML = `This race: classical asked <b>${c}</b>, quantum asked <b>${q}</b>. Expected over many races: classical <b>${((16 + 1) / (s.M + 1)).toFixed(1)}</b>, quantum <b>${(s.k / Math.max(s.ps, 1e-9)).toFixed(1)}</b>.`;
    };
    $("rMany").onclick = () => {
      const s = setup();
      let c = 0,
        q = 0,
        qw = 0,
        cw = 0;
      for (let i = 0; i < 1000; i++) {
        const order = permute(16);
        const ci = order.findIndex((x) => s.C.includes(x)) + 1;
        let qi = 0;
        do qi += s.k;
        while (!s.C.includes(pick(s.p)) && qi < 30 * s.k);
        c += ci;
        q += qi;
        if (qi < ci) qw++;
        else if (ci < qi) cw++;
      }
      $("rOut").innerHTML = `1,000 races from <b>${gridName(start)}</b>${noisy ? " (noisy)" : ""}: classical averaged <b>${(c / 1000).toFixed(1)}</b> questions, quantum <b>${(q / 1000).toFixed(1)}</b>. Quantum asked fewer in <b>${pct(qw / 1000)}</b> of races, classical in <b>${pct(cw / 1000)}</b>.`;
    };
    reset0();
  }

  /* =================== 2. Map in, oracle out =================== */
  // Same cheapest fixed-polarity Reed-Muller form as quantum/stage1.py (Mobius transform over 16 polarities).
  const VARS = ["c₀", "c₁", "r₀", "r₁"]; // square x = 4r + c, bits (c0, c1, r0, r1)
  const COST = (k) => ({ 0: 0, 1: 1, 2: 6, 3: 14 })[k] ?? 30 * (k - 3);
  const bits = (m) => [0, 1, 2, 3].filter((i) => (m >> i) & 1);
  function bestForm(tt) {
    let best = null;
    for (let pol = 0; pol < 16; pol++) {
      const g = tt.map((_, x) => tt[x ^ pol]);
      for (let i = 0; i < 4; i++) for (let x = 0; x < 16; x++) if ((x >> i) & 1) g[x] ^= g[x ^ (1 << i)];
      const terms = g.map((v, m) => (v ? m : -1)).filter((m) => m >= 0),
        cost = terms.reduce((s, m) => s + COST(bits(m).length), 0);
      if (!best || cost < best.cost) best = { pol, terms, cost };
    }
    return best;
  }
  const formula = ({ pol, terms }) =>
    terms.length
      ? terms.map((m) => (m ? bits(m).map((i) => ((pol >> i) & 1 ? "¬" : "") + VARS[i]).join("·") : "1")).join("  ⊕  ")
      : "0";
  function oracle() {
    ++token;
    let wall = 0;
    box().innerHTML = `
      <div class="sc-head"><h3>Map in, oracle out</h3><p>The oracle never gets the answer. It gets the <b>map</b>, turns each wall into a small formula of the position qubits, and checks it against what Dory felt. A cheaper formula means a shorter circuit, and a shorter circuit survives noise.</p></div>
      <div class="sc-row">
        <div class="sc-card"><div class="sc-title">Wall <span class="seg mini" id="oWall">${DIRS.split("").map((d, i) => `<button data-i="${i}"${i ? "" : ' class="on"'}>${d}</button>`).join("")}</span></div><svg id="oMap" class="sc-map"></svg><div class="sc-note">Shaded squares have a <b id="oName"></b> wall (bit = 1). Square x = 4·row + column, written in 4 bits c₀ c₁ r₀ r₁.</div></div>
        <div class="sc-card"><div class="sc-title">As a formula</div><div class="formula" id="oF"></div><div class="sc-note" id="oFn"></div>
          <div class="sc-title" style="margin-top:14px">Cost of one oracle call (estimated CX gates)</div>
          <div class="costs">
            <div><span>Lookup: one gate per (square, wall)</span><b id="oL">0</b></div>
            <div class="win"><span>Formula: the map compressed</span><b id="oR">0</b></div>
            <div class="cheat"><span>Cheating oracle: built from the answer</span><b>1 gate</b></div>
          </div>
          <div class="sc-note" id="oReal"></div></div>
      </div>`;
    const tts = [0, 1, 2, 3].map((j) => [...Array(16).keys()].map((x) => WALLS[x][j])),
      forms = tts.map(bestForm),
      lookup = 2 * tts.reduce((s, tt) => s + tt.filter(Boolean).length * COST(4), 0),
      formulaCost = 2 * forms.reduce((s, f) => s + f.cost, 0);
    const show = () => {
      mini($("oMap"), { fill: (x) => (tts[wall][x] ? "#fde3d3" : "#fff"), text: (x) => String(tts[wall][x]) });
      $("oName").textContent = NAMES[DIRS[wall]];
      $("oF").textContent = `${DIRS[wall]}(x) = ${formula(forms[wall])}`;
      $("oFn").innerHTML = `${forms[wall].terms.length} term${forms[wall].terms.length === 1 ? "" : "s"} (· is AND, ⊕ is XOR, ¬ is NOT). Each term becomes one controlled-NOT gate onto the wall qubit.`;
    };
    $("oWall").querySelectorAll("button").forEach((b) => (b.onclick = () => {
      wall = +b.dataset.i;
      $("oWall").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      show();
    }));
    show();
    tween(1400, (u) => {
      $("oL").textContent = Math.round(lookup * u).toLocaleString();
      $("oR").textContent = Math.round(lookup - (lookup - formulaCost) * u).toLocaleString();
    });
    const q = q1("", [reading(S.pos)]);
    $("oReal").innerHTML = `Compute + uncompute, before routing. ${(lookup / Math.max(1, formulaCost)).toFixed(1)}× cheaper here.` +
      (q ? ` Transpiled with Qiskit for Dory's current reading, the honest formula oracle is <b>${q.honest_2q.toLocaleString()}</b> two-qubit gates.` : "");
  }

  /* =================== 3. Route space (stage 2) =================== */
  function routes() {
    const t = ++token;
    const rd = reading(S.pos),
      starts = candidates([rd], []),
      leg = findLeg(starts);
    box().innerHTML = `
      <div class="sc-head"><h3>Route space</h3><p>Stage 2 isn't a map search. Every cell below is one <b>3-move route</b>: the panel is move 1, the row is move 2, the column is move 3. The oracle walks each route from every square Dory might be on and marks the routes that bring <b>all</b> of them to the goal. Grover pours the probability into those.</p></div>
      <div class="sc-row">
        <div class="sc-card wide"><div class="sc-title">All 64 routes <span class="cround" id="uR"></span></div><div class="cube" id="uCube"></div><div class="sc-note" id="uN"></div></div>
        <div class="sc-card"><div class="sc-title">The winning route, walked from each start</div><svg id="uMap" class="sc-map"></svg><div class="sc-note" id="uW"></div></div>
      </div>
      <div class="sc-bar"><button class="btn" id="uGo">Run the search</button><span class="sc-hint">Uses Dory's current square from the Mission view (${gridName(S.pos)}).</span></div>`;
    const P = plansOf(PLAN_MOVES);
    if (!leg) {
      $("uN").textContent = "No 3-move route brings every possible start together from here.";
      return;
    }
    const good = new Set(leg.good),
      N = 64,
      M = good.size,
      q = q2(starts, leg.goal),
      k = noisy && q ? q.k_noisy : bestK(N, M);
    const cube = (a, marks, showNeg = false) => {
      $("uCube").innerHTML = DIRS.split("").map((d1, i1) =>
        `<div class="face"><div class="flab">1st: ${NAMES[d1]}</div><div class="fgrid">${DIRS.split("").map((d2, i2) =>
          DIRS.split("").map((d3, i3) => {
            const i = i1 * 16 + i2 * 4 + i3,
              p = a[i] * a[i],
              neg = showNeg && a[i] < 0;
            return `<div class="rc${marks && good.has(i) ? " good" : ""}${neg ? " neg" : ""}" title="${P[i]}" style="background:${heat(p * 1.2)}">${p > 0.08 ? P[i] : ""}</div>`;
          }).join("")).join("")}</div><div class="fax"><span>rows: 2nd move N E S W</span><span>cols: 3rd</span></div></div>`).join("");
    };
    cube(Array(N).fill(1 / 8), false);
    mini($("uMap"), { stroke: (x) => (starts.includes(x) ? "#1d4ed8" : x === leg.goal ? "#c2410c" : null), text: (x) => (x === leg.goal ? "⌂" : "") });
    $("uN").innerHTML = `${starts.length} possible start${starts.length > 1 ? "s" : ""} (${starts.map(gridName).join(", ")}), goal <b>${leg.goal === HOME ? goalName() : gridName(leg.goal)}</b>: <b>${M}</b> of 64 routes work, Grover needs <b>${k}</b> rounds.`;
    $("uGo").onclick = async () => {
      const tk = ++token;
      let a = Array(N).fill(1 / 8);
      for (let r = 1; r <= k; r++) {
        a = a.map((v, i) => (good.has(i) ? -v : v));
        cube(a, true, true); // blue outline = sign just flipped
        $("uR").textContent = `round ${r} of ${k}: oracle flips the good routes`;
        if (!(await wait(900, tk))) return;
        const m = a.reduce((s, v) => s + v, 0) / N;
        a = a.map((v) => 2 * m - v);
        cube(a, true);
        $("uR").textContent = `round ${r} of ${k}: diffuser grows them`;
        if (!(await wait(900, tk))) return;
      }
      const best = q ? (noisy ? q.noisy_top : q.ideal_top)[0][0] : P[a.map((v) => v * v).indexOf(Math.max(...a.map((v) => v * v)))];
      const ok = starts.every((s) => endOf(s, best) === leg.goal);
      $("uR").textContent = `measured: ${best}`;
      const m = mini($("uMap"), { stroke: (x) => (starts.includes(x) ? "#1d4ed8" : x === leg.goal ? "#c2410c" : null), text: (x) => (x === leg.goal ? "⌂" : "") });
      starts.forEach((s, i) => {
        const cells = [s];
        for (const d of best) cells.push(move(cells[cells.length - 1], d));
        const off = (i - (starts.length - 1) / 2) * 8,
          pt = (x) => [m.P + rc(x)[1] * m.size + m.size / 2 + off, m.P + rc(x)[0] * m.size + m.size / 2 + off];
        m.e("polyline", { points: cells.map((x) => pt(x).join(",")).join(" "), fill: "none", stroke: PATH_COLORS[i % 3], "stroke-width": 4, "stroke-linejoin": "round", opacity: 0.9 });
      });
      $("uW").innerHTML = `Route <b>${best.split("").map((d) => NAMES[d]).join(" → ")}</b> ${ok ? "brings every start to the goal ✓" : "misses for some start ✗ (noise picked a bad route)"}.`;
    };
  }

  return { race, oracle, routes, stop: () => ++token };
})();
