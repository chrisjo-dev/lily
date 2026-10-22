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

  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css; // CSSOM이라 CSP style-src 에 'unsafe-inline' 이 없어도 된다
    if (text) n.textContent = text;
    return n;
  }

  function show() {
    if (card) return;
    // 휴대폰은 아래에서 올라오는 카드, 태블릿 이상은 가운데 카드(조금 더 크게)
    var big = window.matchMedia && window.matchMedia("(min-width: 768px)").matches;
    var BTN = "display:flex;align-items:center;justify-content:center;border-radius:14px;" +
      (big ? "min-height:58px;font-size:18px;" : "min-height:52px;font-size:17px;") + "text-decoration:none;cursor:pointer;font-family:inherit;";
    card = el("div", "position:fixed;inset:0;z-index:50;display:flex;justify-content:center;" +
      "align-items:" + (big ? "center" : "flex-end") + ";padding:16px;background:rgba(25,31,40,.45);");
    card.id = "lilyGateCard";
    var box = el("div", "width:100%;max-width:" + (big ? "480px;" : "448px;") + "margin-bottom:max(8px,env(safe-area-inset-bottom,0px));" +
      (big ? "padding:32px 28px 24px;" : "padding:22px 18px 18px;") + "border-radius:20px;background:var(--t-surface,#fff);color:var(--t-ink,#24323d);" +
      "font-family:var(--kr,sans-serif);box-shadow:0 8px 28px rgba(25,31,40,.18);");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "lilyGateTitle");
    var title = el("h2", "margin:0 0 6px;font-size:" + (big ? "24px" : "20px") + ";font-weight:400;line-height:1.4;", "가입하면 이어서 들을 수 있어요");
    title.id = "lilyGateTitle";
    var sub = el("p", "margin:0 0 20px;font-size:" + (big ? "16px" : "14px") + ";color:var(--t-sub,#5b6b78);line-height:1.6;",
      "여기까지는 누구나 들을 수 있는 맛보기예요. 가입은 무료이고, 가입하면 지금 멈춘 곳부터 이어서 들려줘요.");
    var join = el("a", BTN + "background:var(--t-accent,#2f7d6d);color:#fff;margin-bottom:8px;", "가입하고 이어 듣기");
    join.id = "lilyGateJoin";
    join.href = "/join/?next=" + encodeURIComponent(location.pathname);
    join.addEventListener("click", function () { saveResume(); log("gate_join_click"); });
    var free = el("a", BTN + "border:1.5px solid var(--t-soft,#d7ebe4);color:var(--t-accent,#2f7d6d);background:var(--t-surface,#fff);margin-bottom:4px;",
      "맛보기 편 끝까지 듣기");
    free.id = "lilyGateFree";
    free.href = FREE_URL;
    var later = el("button", BTN + "width:100%;border:0;background:none;color:var(--t-sub,#5b6b78);font-size:15px;min-height:48px;", "나중에 할게요");
    later.type = "button";
    later.id = "lilyGateLater";
    later.addEventListener("click", function () { pending = null; hide(); });
    box.appendChild(title); box.appendChild(sub); box.appendChild(join); box.appendChild(free); box.appendChild(later);
    card.appendChild(box);
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
