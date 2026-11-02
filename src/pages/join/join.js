// 가입 화면: 필수 동의 뒤 카카오 로그인(닉네임만, OpenID Connect). 돌아올 곳(next)과 마케팅 동의는 콜백까지 localStorage로 넘긴다.
// Supabase 의 카카오 OAuth 는 이메일과 프로필 사진을 늘 함께 요청해서 쓰지 않는다. 카카오 인가는 여기서 직접 시작하고,
// 콜백이 Worker(/api/kakao/token)로 id_token 을 받아 signInWithIdToken 으로 세션을 만든다.
// 리디렉트 주소는 언제나 정확히 <이 주소>/join/callback/ 하나(쿼리 없음). 카카오 콘솔의 Redirect URI 와 같아야 한다.
(function () {
  "use strict";
  var A = window.lilyAuth;
  var NEXT_KEY = "lilyrang-next";
  var OIDC_KEY = "lilyrang-kakao-oidc";
  var AUTHORIZE = "https://kauth.kakao.com/oauth/authorize";
  var CALLBACK = location.origin + "/join/callback/";
  var cfg = window.LILY_CONFIG || {};
  var clientId = typeof cfg.kakaoClientId === "string" ? cfg.kakaoClientId : "";

  function $(id) { return document.getElementById(id); }
  var agree = $("agree"), marketing = $("marketing"), kakao = $("kakao"), msg = $("msg");
  var next = A.safeNext(new URLSearchParams(location.search).get("next") || "/");
  var busy = false;

  function say(text, err) {
    msg.textContent = text;
    msg.classList.toggle("err", !!err);
    msg.hidden = !text;
  }

  function update() { kakao.disabled = !(A.ready && clientId && agree.checked && !busy); }

  function remember() {
    try {
      localStorage.setItem(NEXT_KEY, JSON.stringify({ next: next, marketing: marketing.checked, at: Date.now() }));
    } catch (e) { /* 저장이 막혀도 로그인은 되고, 돌아올 곳만 홈이 된다 */ }
  }

  function random() {
    var b = new Uint8Array(32);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
  }
  // 카카오에는 sha256(nonce) 를 보내고, Supabase 에는 원래 nonce 를 준다(Supabase 가 해시해서 id_token 의 nonce 와 비교)
  function sha256hex(s) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    });
  }

  if (!A.ready || !clientId) {
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
    var state = random(), nonce = random();
    sha256hex(nonce).then(function (hashed) {
      sessionStorage.setItem(OIDC_KEY, JSON.stringify({ state: state, nonce: nonce, at: Date.now() }));
      location.assign(AUTHORIZE + "?" + new URLSearchParams({
        client_id: clientId,
        redirect_uri: CALLBACK,
        response_type: "code",
        scope: "openid profile_nickname",
        state: state,
        nonce: hashed
      }).toString());
    }).catch(function () {
      busy = false; update(); say("카카오 로그인을 시작하지 못했어요. 잠시 뒤에 다시 해 주세요.", true);
    });
  });
})();
