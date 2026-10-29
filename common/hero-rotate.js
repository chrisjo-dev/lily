// 홈 첫 화면 그림 교대: 첫 장은 바로 보이고(LCP), 나머지 두 장은 load 뒤에 받아 6초마다 1초 동안 겹쳐 바뀐다.
// 움직임 줄이기 설정이면 첫 장만 둔다. 탭이 숨거나 첫 화면이 안 보이면 멈춘다.
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var stage = document.querySelector('.lamp .stage'); if (!stage) return;
  var imgs = [].slice.call(stage.querySelectorAll('.art'));
  if (imgs.length < 2) return;
  var cur = 0, timer = null, ready = false, inView = true;
  function show(n) {
    imgs.forEach(function (im, i) { im.classList.toggle('on', i === n); im.classList.toggle('off', i !== n); });
    cur = n;
  }
  function tick() { show((cur + 1) % imgs.length); }
  function run() {
    var go = ready && inView && !document.hidden;
    if (go && !timer) timer = setInterval(tick, 6000);
    if (!go && timer) { clearInterval(timer); timer = null; }
  }
  function start() {
    var left = imgs.length - 1;
    imgs.slice(1).forEach(function (im) {
      im.addEventListener('load', function () { if (--left === 0) { ready = true; run(); } }, { once: true });
      im.src = im.getAttribute('data-src');
    });
  }
  if (document.readyState === 'complete') start(); else addEventListener('load', start);
  document.addEventListener('visibilitychange', run);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; run(); }).observe(stage);
})();
