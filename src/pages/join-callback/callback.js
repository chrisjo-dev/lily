// 로그인 콜백: ?code= 를 PKCE로 세션과 바꾸고, 가입 화면에서 남긴 next(같은 주소의 경로만)로 보낸다.
// 코드가 주소창과 기록에 남지 않게 바로 지운다. 이 페이지는 외부 글꼴도 부르지 않는다.
(function () {
  "use strict";
  var A = window.lilyAuth;
  var NEXT_KEY = "lilyrang-next";
  var NEXT_TTL = 60 * 60 * 1000;
  var NEW_USER_WINDOW = 60 * 60 * 1000;

  var q = new URLSearchParams(location.search);
  var code = q.get("code");
  var flowId = q.get("sb_flow_id"); // supabase-js 2.117 이 redirectTo 뒤에 붙이는 값. 주소를 지우기 전에 읽어 둔다
  var failed = q.get("error") || q.get("error_description");
  history.replaceState(null, "", location.pathname);

  var saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(NEXT_KEY) || "null");
    localStorage.removeItem(NEXT_KEY);
  } catch (e) { saved = null; }
  if (!saved || Date.now() - saved.at > NEXT_TTL) saved = { next: "/", marketing: false };
  var next = A.safeNext(saved.next);

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

  A.client().then(function (c) {
    return c.auth.exchangeCodeForSession(code, flowId ? { flowId: flowId } : undefined).then(function (r) {
      if (r.error || !r.data || !r.data.user) throw r.error || new Error("no session");
      var user = r.data.user;
      var isNew = Date.now() - Date.parse(user.created_at) < NEW_USER_WINDOW;
      var jobs = [A.logEvent(isNew ? "signup" : "login")];
      if (saved.marketing === true) {
        jobs.push(c.from("profiles").update({ marketing_opt_in: true }).eq("user_id", user.id));
      }
      return Promise.all(jobs);
    });
  }).then(function () {
    $("status").textContent = "로그인했어요. 이어서 들으러 가요.";
    location.replace(next);
  }).catch(function () {
    fail("링크가 만료됐거나 다른 브라우저에서 열렸어요. 로그인 링크는 요청한 브라우저에서 열어 주세요.");
  });
})();
