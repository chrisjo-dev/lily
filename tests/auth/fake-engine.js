// 시험용 가짜 엔진: 레인 A 약속대로 재생 위치가 바뀔 때마다 canPlayPast 를 묻고, false 면 멈추고 onBlocked.
// ?free=1 이면 맛보기 편, ?until=초 로 previewUntil.
(function () {
  var q = new URLSearchParams(location.search);
  var ep = { id: "ep02", free: q.get("free") === "1", previewUntil: Number(q.get("until") || 2) };
  window.__ep = ep;
  var audio = document.getElementById("audio");
  var out = document.getElementById("t");
  var blocked = false;
  window.__blockedAt = null;
  function resume() { blocked = false; audio.play(); }
  audio.addEventListener("play", function () { blocked = false; }); // 다시 누르면 다시 묻는다
  function tick() {
    var t = audio.currentTime;
    out.textContent = t.toFixed(2);
    if (!audio.paused && !blocked && !window.lilyGate.canPlayPast(t, ep)) {
      blocked = true;
      audio.pause();
      window.__blockedAt = t;
      window.lilyGate.onBlocked(t, ep, resume);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  document.getElementById("play").addEventListener("click", function () { audio.play(); });
  window.__play = function () { return audio.play(); };
  window.__audio = audio;
})();
