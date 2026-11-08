/* ---------------- toggles ---------------- */
function seg(id, cb) {
  $(id)
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          $(id)
            .querySelectorAll("button")
            .forEach((x) => x.classList.toggle("on", x === b));
          cb(b.dataset.v);
        }),
    );
}
seg("segWorld", (v) => {
  world = v;
  drawMap();
  build3D();
  if (stage === "setup") setupView();
});
seg("segView", (v) => {
  view = v;
  $("maphint").style.display = "none";
  $("map").style.display = v === "2d" ? "block" : "none";
  $("three").style.display = v === "3d" ? "block" : "none";
  if (v === "3d") {
    if (!window.THREE) {
      $("three").innerHTML =
        '<div style="padding:40px;font:13px IBM Plex Mono,monospace;color:#636a72">3D needs three.js, which could not load here.</div>';
      return;
    }
    init3D();
    update3D();
  }
});
seg("segNoise", (v) => {
  noisy = v === "noisy";
  setFoot();
});
function setFoot() {
  $("foot").textContent = !Q
    ? "Qiskit data missing: run precompute_ui.py · showing in-browser ideal maths"
    : noisy
      ? `Noisy · Qiskit Aer with ${Q.device} noise · compiled oracle, k ≤ 2 · ${Q.shots} shots`
      : "Ideal · exact Qiskit statevector results";
}
setFoot();
$("reveal").onchange = render2D;
drawMap();
reset();
