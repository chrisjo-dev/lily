// 홈 이야기 줄(승인 시안 T7 A): 넘김은 CSS 가로 스크롤이 맡고, 여기서는 진행 막대(폰)와 PC 화살표만 붙인다.
// 이 파일이 없거나 실패해도 줄은 손가락, 트랙패드, Tab 키로 넘길 수 있다.
(function () {
  var strip = document.getElementById('sm-strip');
  if (!strip) return;
  var root = document.documentElement;
  var track = document.querySelector('.sm-track');
  var prev = document.querySelector('.sm-arrow.prev');
  var next = document.querySelector('.sm-arrow.next');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)');

  function update() {
    var max = strip.scrollWidth - strip.clientWidth;
    var view = strip.scrollWidth ? Math.min(1, strip.clientWidth / strip.scrollWidth) : 1;
    var pos = max > 0 ? Math.min(1, Math.max(0, strip.scrollLeft / max)) : 0;
    if (track) {
      track.style.setProperty('--sm-view', view.toFixed(4));
      track.style.setProperty('--sm-pos', pos.toFixed(4));
    }
    // 반 픽셀 반올림 때문에 끝에 닿아도 1px 남는 경우가 있어 2px 여유를 둔다
    if (prev) prev.disabled = strip.scrollLeft <= 2;
    if (next) next.disabled = strip.scrollLeft >= max - 2;
  }

  function go(dir) {
    // 보이는 폭에서 한 칸을 빼고 넘겨, 오른쪽 끝에 걸쳐 있던 이야기가 다음 화면 첫 칸에 오게 한다
    var first = strip.querySelector('.circle');
    var step = Math.max(first ? first.offsetWidth : 0, strip.clientWidth - (first ? first.offsetWidth : 0));
    strip.scrollBy({ left: dir * step, behavior: still.matches ? 'auto' : 'smooth' });
  }

  if (prev) prev.addEventListener('click', function () { go(-1); });
  if (next) next.addEventListener('click', function () { go(1); });

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; update(); });
  }
  strip.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  root.classList.add('sm-js');
  update();
})();
