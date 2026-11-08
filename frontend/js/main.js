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
  $("map").style.display = v === "2d" ? "block" : "none";
  $("three").style.display = v === "2d" ? "none" : "block";
  $("minimap").hidden = v !== "pov";
  setHowto();
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
  $("foot").textContent = Q ? "" : "Qiskit data missing, showing browser simulation";
}
function setHowto() {
  $("howto").textContent =
    view === "pov"
      ? "You're seeing through Dory's eyes. Switch to 2D or 3D to move Dory or set home."
      : view === "3d"
        ? "Drag Dory anywhere, right-click a square to set home, drag empty space to rotate."
        : "Drag Dory anywhere, right-click a square to set home.";
}
setFoot();
setHowto();
$("reveal").onchange = render2D;
drawMap();
reset();
