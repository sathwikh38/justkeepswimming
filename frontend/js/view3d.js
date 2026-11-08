/* ---------------- 3D view ---------------- */
let R3 = null;
function init3D() {
  if (R3 || !window.THREE) return;
  const box = document.getElementById("three");
  const ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  ren.setPixelRatio(Math.min(2, devicePixelRatio));
  box.prepend(ren.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7f7f5);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  cam.position.set(3.6, 5.2, 5.6);
  const ctl = new THREE.OrbitControls(cam, ren.domElement);
  ctl.target.set(0, 0, 0);
  ctl.enableDamping = true;
  ctl.maxPolarAngle = Math.PI * 0.49;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ab, 0.85));
  const dl = new THREE.DirectionalLight(0xffffff, 0.6);
  dl.position.set(4, 8, 3);
  scene.add(dl);
  R3 = { ren, scene, cam, ctl, world: new THREE.Group(), dyn: new THREE.Group(), rays: new THREE.Group() };
  scene.add(R3.world, R3.dyn, R3.rays);
  const loop = () => {
    const w = box.clientWidth;
    if (w && ren.domElement.width !== Math.round(w * ren.getPixelRatio())) {
      ren.setSize(w, w, false);
      cam.aspect = 1;
      cam.updateProjectionMatrix();
    }
    ctl.update();
    ren.render(scene, cam);
    requestAnimationFrame(loop);
  };
  loop();
  build3D();
}
const P3 = (x) => {
  const [r, c] = rc(x);
  return [c - 1.5, r - 1.5];
};
function build3D() {
  if (!R3) return;
  const W = R3.world;
  while (W.children.length) W.remove(W.children[0]);
  const out = world === "outdoor";
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.04, 4),
    new THREE.MeshLambertMaterial({ color: out ? 0xe6ecdb : 0xffffff, transparent: true, opacity: 0.8 }),
  );
  floor.position.y = -0.02;
  W.add(floor);
  const gh = new THREE.GridHelper(4, 4, 0xb9c3cc, 0xb9c3cc);
  gh.position.y = 0.002;
  W.add(gh);
  const home = new THREE.Mesh(
    new THREE.BoxGeometry(0.96, 0.01, 0.96),
    new THREE.MeshLambertMaterial({ color: 0xc2410c, transparent: true, opacity: 0.35 }),
  );
  const [hx, hz] = P3(HOME);
  home.position.set(hx, 0.01, hz);
  W.add(home);
  const wm = new THREE.MeshLambertMaterial({ color: out ? 0x6b5640 : 0x2a2f35 });
  const H = out ? 0.28 : 0.55;
  const seg = (x, z, horiz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 1.04 : 0.07, H, horiz ? 0.07 : 1.04), wm);
    m.position.set(x, H / 2, z);
    W.add(m);
  };
  for (let x = 0; x < 16; x++) {
    const [r, c] = rc(x),
      [X, Z] = P3(x),
      w = WALLS[x];
    if (w[0]) seg(X, Z - 0.5, true);
    if (w[3]) seg(X - 0.5, Z, false);
    if (w[1] && c === 3) seg(X + 0.5, Z, false);
    if (w[2] && r === 3) seg(X, Z + 0.5, true);
    if (w[1] && c < 3) seg(X + 0.5, Z, false);
    if (w[2] && r < 3) seg(X, Z + 0.5, true);
  }
  if (out) {
    const tm = new THREE.MeshLambertMaterial({ color: 0x3f6b46 });
    [0, 1, 4, 5].forEach((x) => {
      const [X, Z] = P3(x);
      [
        [-0.3, -0.3],
        [0.28, -0.22],
        [-0.22, 0.3],
      ].forEach(([dx, dz]) => {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 8), tm);
        t.position.set(X + dx, 0.16, Z + dz);
        W.add(t);
      });
    });
  }
  update3D();
}
function robotMesh(ghost, op = 1) {
  const g = new THREE.Group();
  const m = new THREE.MeshLambertMaterial({
    color: ghost ? 0x6f95ee : 0x1d4ed8,
    transparent: true,
    opacity: op,
    depthWrite: !ghost,
  });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.16, 24), m);
  b.position.y = 0.1;
  g.add(b);
  if (!ghost) {
    const d = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 10),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    d.position.y = 0.22;
    g.add(d);
    const n = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.12, 10),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    n.rotation.x = -Math.PI / 2;
    n.position.set(0, 0.12, -0.18);
    g.add(n);
  }
  return g;
}
function update3D() {
  if (!R3) return;
  const D = R3.dyn;
  while (D.children.length) D.remove(D.children[0]);
  if (document.getElementById("reveal").checked) {
    const r = robotMesh(false);
    const [X, Z] = P3(S.pos);
    r.position.set(X, 0, Z);
    D.add(r);
  }
  S.ghosts.forEach((x) => {
    const g = robotMesh(true, 0.35);
    const [X, Z] = P3(x);
    g.position.set(X, 0, Z);
    D.add(g);
  });
  if (S.amps && S.amps.length === 16) {
    S.amps.forEach((a, x) => {
      const [X, Z] = P3(x);
      const p = a * a;
      if (p > 0.004) {
        const g = robotMesh(true, Math.min(0.8, 0.08 + p * 1.6));
        g.position.set(X, 0, Z);
        D.add(g);
      }
      const h = Math.max(0.004, Math.abs(a) * 2.2);
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, h, 0.13),
        new THREE.MeshLambertMaterial({ color: S.ampMarked && S.ampMarked.has(x) ? 0xc2410c : 0x8b959e }),
      );
      col.position.set(X + 0.32, a >= 0 ? h / 2 : -h / 2, Z - 0.32);
      D.add(col);
    });
  }
}
async function rays3D(x) {
  if (!R3) return;
  const G = R3.rays;
  while (G.children.length) G.remove(G.children[0]);
  const [X, Z] = P3(x);
  const rd = reading(x);
  const parts = DIRS.split("").map((d, i) => {
    const [dr, dc] = STEP[d];
    const len = rd[i] ? 0.5 : 1.0;
    const mat = new THREE.LineBasicMaterial({ color: rd[i] ? 0xc2410c : 0x15803d });
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(X, 0.14, Z),
      new THREE.Vector3(X, 0.14, Z),
    ]);
    const ln = new THREE.Line(geo, mat);
    G.add(ln);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 10, 8),
      new THREE.MeshBasicMaterial({ color: rd[i] ? 0xc2410c : 0x15803d }),
    );
    dot.visible = false;
    G.add(dot);
    return { dr, dc, len, ln, dot };
  });
  await tween(900, (u) =>
    parts.forEach((p) => {
      const ex = X + p.dc * p.len * u,
        ez = Z + p.dr * p.len * u;
      p.ln.geometry.setFromPoints([new THREE.Vector3(X, 0.14, Z), new THREE.Vector3(ex, 0.14, ez)]);
      if (u > 0.98) {
        p.dot.visible = true;
        p.dot.position.set(ex, 0.14, ez);
      }
    }),
  );
}
function clearRays() {
  if (R3) while (R3.rays.children.length) R3.rays.remove(R3.rays.children[0]);
}
