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
  $("three").style.display = v === "2d" ? "none" : "block";
  $("minimap").hidden = v !== "pov";
  document.querySelector(".hint3d").textContent =
    v === "pov" ? "Robo's eyes · switch to 2D or 3D to move Robo or home" : "drag Robo · right-click sets home · drag empty space to orbit";
  if (v !== "2d") {
    if (!window.THREE) {
      $("three").innerHTML =
        '<div style="padding:40px;font:13px IBM Plex Mono,monospace;color:#636a72">3D needs three.js, which could not load here.</div>';
      return;
    }
    init3D();
    if (R3) R3.ctl.enabled = v === "3d";
    update3D();
  } else render2D();
});
seg("segNoise", (v) => {
  noisy = v === "noisy";
  setFoot();
});
seg("segRun", (v) => {
  RUN.mode = v;
  if (v === "auto") wake(); // let a paused mission carry on by itself
});
$("nextBtn").onclick = wake;
$("restartBtn").onclick = reset;
$("compareBtn").onclick = () => showSummary("Mission summary");
$("showStats").onchange = renderStats;
$("overlay").onclick = (e) => {
  if (e.target.id === "overlay") $("overlay").hidden = true;
};
function setFoot() {
  $("foot").textContent = !Q
    ? "Qiskit data missing: run python -m experiments.precompute_ui · showing in-browser ideal maths"
    : noisy
      ? `Noisy · Qiskit Aer with the ${Q.device} noise model · compiled oracle, k ≤ 2 · ${Q.shots} shots`
      : "Ideal · exact Qiskit statevector results";
}
setFoot();
$("reveal").onchange = render2D;
drawMap();
reset();
