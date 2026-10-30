// 첫 화면 그림 교대: 첫 장은 바로 보이고(LCP), 나머지 두 장은 load 뒤에 받아 3초마다 1초 동안 겹쳐 바뀐다.
// 움직임 줄이기 설정이면 첫 장만 둔다. 탭이 숨거나 첫 화면이 안 보이면 멈춘다.
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var stage = document.querySelector('.hero .stage'); if (!stage) return;
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
    if (go && !timer) timer = setInterval(tick, 3000);
    if (!go && timer) { clearInterval(timer); timer = null; }
  }
  addEventListener('load', function () {
    var left = imgs.length - 1;
    imgs.slice(1).forEach(function (im) {
      im.addEventListener('load', function () { if (--left === 0) { ready = true; run(); } }, { once: true });
      im.src = im.getAttribute('data-src');
    });
  });
  document.addEventListener('visibilitychange', run);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; run(); }).observe(stage);
})();

// 랜딩 움직임: 아래 섹션은 화면에 들어올 때 차례로 떠오른다. 스크립트가 없거나 움직임 줄이기 설정이면 처음부터 다 보인다.
(function () {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var groups = ['.stories .sec-title, .stories .sec-lead', '.circle', '.demo .sec-title, .demo .sec-lead', '.frame', '.demo .after',
    '.ways .sec-title', '.way', '.qa .sec-title', '.qa dl > div', '.last > *'];
  var items = [];
  groups.forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (el, i) { el.classList.add('rv'); el.style.setProperty('--i', i); items.push(el); });
  });
  document.documentElement.classList.add('motion');
  // 가로로 넘기는 줄(휴대폰의 실제 화면 세 컷) 안의 항목은 줄 전체가 보일 때 함께 나타나게 한다. 옆으로 숨은 칸이 투명하게 남지 않도록
  var groupOf = new Map();
  items.forEach(function (el) {
    var t = el.closest('.frames') || el;
    if (!groupOf.has(t)) groupOf.set(t, []);
    groupOf.get(t).push(el);
  });
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      groupOf.get(e.target).forEach(function (el) { el.classList.add('in'); });
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  groupOf.forEach(function (_, t) { io.observe(t); });
})();
