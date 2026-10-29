// 맛보기 잠금. 엔진은 재생 위치가 바뀔 때마다 lilyGate.canPlayPast(t, episode) 를 묻고,
// false 면 멈춘 뒤 lilyGate.onBlocked(t, episode, resume) 를 부른다. resume() 은 그 자리에서 이어 재생.
// - free 편은 언제나 허용. 아니면 previewUntil(초) 전까지 허용, 그 뒤는 회원만.
// - 비회원이면 가입 카드. 다른 탭에서 로그인하면 카드를 닫고 바로 이어 재생.
// - 같은 탭에서 가입하고 돌아오면 lilyGate.resumeAt(id) 가 멈췄던 초를 한 번 돌려준다(엔진이 시작할 때 물어보면 됨).
// 화면 잠금일 뿐 파일은 공개돼 있다(계획 D6). 불러오는 순서: lily-config.js, auth.js, gate.js, gate-default.js, engine.js
(function () {
  "use strict";

  var FREE_URL = "/ep01/"; // 맛보기 편(계획 D5, D10)
  var RESUME_KEY = "lilyrang-resume";
  var RESUME_TTL = 2 * 60 * 60 * 1000;

  var member = null; // null: 아직 모름
  var pending = null; // { t, ep, resume }
  var card = null;
  var hooked = false;

  function auth() { return window.lilyAuth || null; }

  function hook() {
    var a = auth();
    if (hooked || !a || typeof a.onChange !== "function") return;
    hooked = true;
    a.onChange(function (m) {
      member = !!m;
      if (member && pending) continueNow();
    });
  }

  function refresh() {
    hook();
    var a = auth();
    if (!a || typeof a.isMember !== "function") { member = false; return Promise.resolve(false); }
    return Promise.resolve(a.isMember()).then(function (m) { member = !!m; return member; },
      function () { member = false; return false; });
  }

  function limitOf(ep) {
    return ep && typeof ep.previewUntil === "number" && isFinite(ep.previewUntil) ? ep.previewUntil : 0;
  }

  function canPlayPast(t, ep) {
    if (!ep || ep.free === true) return true;
    if (typeof t === "number" && t < limitOf(ep)) return true;
    return member === true;
  }

  function onBlocked(t, ep, resume) {
    if (pending) { pending.resume = resume; return; }
    pending = { t: t, ep: ep, resume: resume };
    refresh().then(function (m) {
      if (!pending) return;
      if (m) continueNow(); else show();
    });
  }

  function continueNow() {
    var p = pending;
    pending = null;
    hide();
    if (p && typeof p.resume === "function") p.resume();
  }

  function log(name) {
    var a = auth();
    if (a && typeof a.logEvent === "function" && pending && pending.ep) a.logEvent(name, pending.ep.id);
  }

  function saveResume() {
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({ ep: pending.ep.id, t: pending.t, at: Date.now() }));
    } catch (e) { /* 저장 못 해도 가입은 계속 */ }
  }

  function resumeAt(id) {
    try {
      var r = JSON.parse(localStorage.getItem(RESUME_KEY) || "null");
      if (!r || r.ep !== id) return null;
      localStorage.removeItem(RESUME_KEY);
      if (Date.now() - r.at > RESUME_TTL || typeof r.t !== "number") return null;
      return r.t;
    } catch (e) { return null; }
  }

  // 카드 모양은 ui/gate.css(시안 T6, promo P68). 인라인 style 없이 클래스만 붙인다
  // 가입하면 이어지는 이야기 동그라미 그림(홈 목록과 같은 순서, 그림은 /hello/img의 것을 함께 씀)
  var MORE = ["wake", "wash", "eat", "dress", "bath", "sleep"];
  (function css() {
    if (document.querySelector('link[href="/engine/ui/gate.css"]')) return;
    var l = document.createElement("link");
    l.rel = "stylesheet"; l.href = "/engine/ui/gate.css";
    document.head.appendChild(l);
  })();

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function show() {
    if (card) return;
    card = el("div");
    card.id = "lilyGateCard";
    var shade = el("div", "gate-shade");
    var badge = el("p", "gate-badge", "맛보기 편이 여기서 끝나요");
    var sheet = el("div", "gate-sheet");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "lilyGateTitle");
    var top = el("div", "gate-top");
    var brand = el("p", "gate-brand");
    var lock = el("img");
    lock.src = "/engine/ui/lock.webp"; lock.alt = ""; lock.width = 20; lock.height = 20;
    brand.appendChild(lock); brand.appendChild(document.createTextNode("릴리랑"));
    var title = el("h2", "", "이야기가 계속돼요.");
    title.id = "lilyGateTitle";
    title.appendChild(el("br")); title.appendChild(document.createTextNode("가입하면 바로 이어 들을 수 있어요."));
    top.appendChild(brand); top.appendChild(title);
    var body = el("div", "gate-body");
    var more = el("p", "gate-more", "새 이야기가 계속 더해져요");
    var eps = el("div", "gate-eps");
    eps.setAttribute("aria-hidden", "true");
    MORE.forEach(function (name) {
      var im = el("img");
      im.src = "/hello/img/ep-" + name + ".webp"; im.alt = ""; im.width = 48; im.height = 48; im.decoding = "async";
      eps.appendChild(im);
    });
    var safe = el("p", "gate-safe", "아이 정보는 받지 않아요");
    var act = el("div", "gate-act");
    var join = el("a", "", "가입하고 이어 듣기");
    join.id = "lilyGateJoin";
    join.href = "/join/?next=" + encodeURIComponent(location.pathname);
    join.addEventListener("click", function () { saveResume(); log("gate_join_click"); });
    var free = el("a", "", "맛보기 다시 듣기");
    free.id = "lilyGateFree";
    free.href = FREE_URL;
    var later = el("button", "", "나중에");
    later.type = "button";
    later.id = "lilyGateLater";
    later.addEventListener("click", function () { pending = null; hide(); });
    act.appendChild(join); act.appendChild(free); act.appendChild(later);
    [more, eps, safe, act].forEach(function (n) { body.appendChild(n); });
    sheet.appendChild(top); sheet.appendChild(body);
    card.appendChild(shade); card.appendChild(badge); card.appendChild(sheet);
    document.body.appendChild(card);
    join.focus();
    log("gate_shown");
  }

  function hide() {
    if (card && card.parentNode) card.parentNode.removeChild(card);
    card = null;
  }

  window.lilyGate = { canPlayPast: canPlayPast, onBlocked: onBlocked, resumeAt: resumeAt };
  refresh();
})();
