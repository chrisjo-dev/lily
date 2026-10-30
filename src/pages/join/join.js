// 가입 화면: 필수 동의 뒤 카카오 또는 이메일 로그인 링크. 돌아올 곳(next)과 마케팅 동의는 콜백까지 localStorage로 넘긴다.
// 리디렉트 주소는 언제나 정확히 <이 주소>/join/callback/ 하나(쿼리 없음). Supabase 허용 목록과 같아야 한다.
(function () {
  "use strict";
  var A = window.lilyAuth;
  var NEXT_KEY = "lilyrang-next";
  var OTP_KEY = "lilyrang-otp-at";
  var COOLDOWN = 60 * 1000;
  var CALLBACK = location.origin + "/join/callback/";

  function $(id) { return document.getElementById(id); }
  var agree = $("agree"), marketing = $("marketing"), kakao = $("kakao"), form = $("emailForm"),
    email = $("email"), emailBtn = $("emailBtn"), msg = $("msg");
  var next = A.safeNext(new URLSearchParams(location.search).get("next") || "/");
  var busy = false, timer = null;

  function say(text, err) {
    msg.textContent = text;
    msg.classList.toggle("err", !!err);
    msg.hidden = !text;
  }

  function lastSent() {
    try { return Number(localStorage.getItem(OTP_KEY)) || 0; } catch (e) { return 0; }
  }
  function waitLeft() { return Math.max(0, lastSent() + COOLDOWN - Date.now()); }

  function update() {
    var ok = A.ready && agree.checked && !busy;
    kakao.disabled = !ok;
    var left = waitLeft();
    emailBtn.disabled = !ok || left > 0;
    emailBtn.textContent = left > 0 ? Math.ceil(left / 1000) + "초 뒤에 다시 보낼 수 있어요" : "이메일로 로그인 링크 받기";
    if (left > 0 && !timer) timer = setInterval(function () {
      if (waitLeft() === 0) { clearInterval(timer); timer = null; }
      update();
    }, 1000);
  }

  function remember() {
    try {
      localStorage.setItem(NEXT_KEY, JSON.stringify({ next: next, marketing: marketing.checked, at: Date.now() }));
    } catch (e) { /* 저장이 막혀도 로그인은 되고, 돌아올 곳만 홈이 된다 */ }
  }

  if (!A.ready) {
    $("notReady").hidden = false;
    $("joinBox").hidden = true;
    return;
  }

  A.isMember().then(function (m) {
    if (!m) return;
    $("already").hidden = false;
    $("alreadyNext").href = next;
  });

  agree.addEventListener("change", update);
  update();

  kakao.addEventListener("click", function () {
    if (kakao.disabled) return;
    busy = true; update(); say("카카오로 이동하고 있어요.");
    remember();
    A.client().then(function (c) {
      return c.auth.signInWithOAuth({ provider: "kakao", options: { redirectTo: CALLBACK } });
    }).then(function (r) {
      if (r && r.error) throw r.error;
    }).catch(function () {
      busy = false; update(); say("카카오 로그인을 시작하지 못했어요. 잠시 뒤에 다시 해 주세요.", true);
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (emailBtn.disabled) return;
    var v = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 254) {
      say("이메일 주소를 다시 확인해 주세요.", true);
      email.focus();
      return;
    }
    busy = true; update(); say("보내고 있어요.");
    remember();
    A.client().then(function (c) {
      return c.auth.signInWithOtp({ email: v, options: { emailRedirectTo: CALLBACK, shouldCreateUser: true } });
    }).then(function (r) {
      if (r && r.error) throw r.error;
      try { localStorage.setItem(OTP_KEY, String(Date.now())); } catch (e2) { /* 대기는 이 화면에서만 */ }
      say("메일을 보냈어요. 메일의 링크를 이 휴대폰(이 브라우저)에서 눌러 주세요.");
    }).catch(function (err) {
      var limited = err && (err.status === 429 || /rate/i.test(String(err.message || "")));
      say(limited ? "잠시 뒤에 다시 보내 주세요." : "메일을 보내지 못했어요. 잠시 뒤에 다시 해 주세요.", true);
    }).then(function () { busy = false; update(); });
  });
})();
