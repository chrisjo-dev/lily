// 로그인 콜백: 카카오가 준 ?code= 를 Worker(/api/kakao/token)에서 id_token 으로 바꾸고, signInWithIdToken 으로 세션을 만든다.
// state 는 가입 화면이 sessionStorage 에 남긴 값과 같아야 하고, nonce 는 원래 값을 Supabase 에 넘긴다(Supabase 가 해시해 비교).
// 코드가 주소창과 기록에 남지 않게 바로 지운다. 이 페이지는 외부 글꼴도 부르지 않는다.
(function () {
  "use strict";
  var A = window.lilyAuth;
  var NEXT_KEY = "lilyrang-next";
  var OIDC_KEY = "lilyrang-kakao-oidc";
  var NEXT_TTL = 60 * 60 * 1000;
  var OIDC_TTL = 10 * 60 * 1000;
  var NEW_USER_WINDOW = 60 * 60 * 1000;

  var q = new URLSearchParams(location.search);
  var code = q.get("code");
  var state = q.get("state");
  var failed = q.get("error") || q.get("error_description");
  history.replaceState(null, "", location.pathname);

  var saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(NEXT_KEY) || "null");
    localStorage.removeItem(NEXT_KEY);
  } catch (e) { saved = null; }
  if (!saved || Date.now() - saved.at > NEXT_TTL) saved = { next: "/", marketing: false };
  var next = A.safeNext(saved.next);

  var oidc = null;
  try {
    oidc = JSON.parse(sessionStorage.getItem(OIDC_KEY) || "null");
    sessionStorage.removeItem(OIDC_KEY);
  } catch (e) { oidc = null; }

  function $(id) { return document.getElementById(id); }
  function fail(text) {
    $("title").textContent = "로그인을 마치지 못했어요";
    $("status").textContent = text;
    $("retryLink").href = "/join/?next=" + encodeURIComponent(next);
    $("retry").hidden = false;
  }

  if (!A.ready) { fail("가입은 아직 준비 중이에요."); return; }
  if (failed) { fail("로그인이 취소됐거나 문제가 있었어요. 다시 해 주세요."); return; }
  if (!code) {
    A.isMember().then(function (m) { if (m) location.replace(next); else fail("로그인 정보가 없어요. 다시 해 주세요."); });
    return;
  }
  if (!oidc || typeof oidc.state !== "string" || oidc.state !== state || typeof oidc.nonce !== "string" ||
      !(Date.now() - oidc.at < OIDC_TTL)) {
    fail("로그인 시간이 지났거나 다른 브라우저에서 열렸어요. 가입 화면에서 다시 해 주세요.");
    return;
  }

  fetch("/api/kakao/token", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code })
  }).then(function (r) {
    if (!r.ok) throw new Error("exchange " + r.status);
    return r.json();
  }).then(function (t) {
    if (!t || typeof t.id_token !== "string") throw new Error("no id_token");
    return A.client().then(function (c) {
      return c.auth.signInWithIdToken({ provider: "kakao", token: t.id_token, nonce: oidc.nonce }).then(function (r) {
        if (r.error || !r.data || !r.data.user) throw r.error || new Error("no session");
        var user = r.data.user;
        var isNew = Date.now() - Date.parse(user.created_at) < NEW_USER_WINDOW;
        var jobs = [A.logEvent(isNew ? "signup" : "login")];
        if (saved.marketing === true) {
          jobs.push(c.from("profiles").update({ marketing_opt_in: true }).eq("user_id", user.id));
        }
        return Promise.all(jobs);
      });
    });
  }).then(function () {
    $("status").textContent = "로그인했어요. 이어서 들으러 가요.";
    location.replace(next);
  }).catch(function () {
    fail("로그인을 마치지 못했어요. 가입 화면에서 다시 해 주세요.");
  });
})();
