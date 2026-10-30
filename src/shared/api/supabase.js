// 릴리랑 Supabase 연결(shared/api). Supabase 클라이언트는 이 파일 한 곳에서만 만든다.
// 공개 이름: window.LilyShared.supabase 의 ready, client, hasStoredSession, insertAnon. 회원 상태는 entities/session 이 맡는다.
// - shared/config/lily-config.js 가 먼저 와야 한다. 값이 비어 있으면 "준비 안 됨"(ready=false).
// - supabase-js 는 고정 버전을 SRI 해시로 확인해 불러온다. 버전을 올리면 LIB_SRI 와 각 페이지 CSP 의 경로도 같이 바꾼다.
//   해시 계산: curl -sL <LIB_URL> | openssl dgst -sha384 -binary | openssl base64 -A
// - 로그인 흔적이 없는 방문자는 라이브러리를 아예 받지 않는다(첫 화면 성능).
(function () {
  "use strict";

  var LIB_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js";
  var LIB_SRI = "sha384-BWcjm9OdFth9TbhCxZPdm+gAOUMAzQy9nmTs12ioXdCcbVnJaPMn+fMUoQCLt60R";
  var STORAGE_KEY = "lilyrang-auth";

  var cfg = window.LILY_CONFIG || {};
  var url = typeof cfg.supabaseUrl === "string" ? cfg.supabaseUrl.replace(/\/+$/, "") : "";
  var key = typeof cfg.supabaseAnonKey === "string" ? cfg.supabaseAnonKey : "";
  var ready = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && key !== "" && isPublicKey(key);

  // 실수로 service role(secret) 키를 넣으면 쓰지 않는다
  function isPublicKey(k) {
    if (k.indexOf("sb_publishable_") === 0) return true;
    if (k.indexOf("sb_secret_") === 0) return fail();
    var part = k.split(".")[1];
    if (!part) return fail();
    try {
      var claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
      return claims.role === "anon" ? true : fail();
    } catch (e) { return fail(); }
    function fail() { console.error("lilyAuth: supabaseAnonKey 는 anon 키만 넣어요."); return false; }
  }

  function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function hasStoredSession() { return storageGet(STORAGE_KEY) !== null; }

  var clientP = null;
  function client() {
    if (!ready) return Promise.resolve(null);
    if (clientP) return clientP;
    clientP = new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) { resolve(make()); return; }
      var s = document.createElement("script");
      s.src = LIB_URL;
      s.integrity = LIB_SRI;
      s.crossOrigin = "anonymous";
      s.referrerPolicy = "no-referrer";
      s.async = true;
      s.onload = function () { resolve(make()); };
      s.onerror = function () { clientP = null; reject(new Error("supabase-js load failed")); };
      document.head.appendChild(s);
    });
    return clientP;
  }
  function make() {
    return window.supabase.createClient(url, key, {
      auth: {
        flowType: "pkce",
        storageKey: STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false // join/callback/ 에서 직접 교환한다
      }
    });
  }

  // 비로그인 기록은 라이브러리 없이 REST로 바로
  function insertAnon(table, row) {
    var headers = { "apikey": key, "Content-Type": "application/json", "Prefer": "return=minimal" };
    if (key.indexOf("sb_") !== 0) headers.Authorization = "Bearer " + key;
    return fetch(url + "/rest/v1/" + table, {
      method: "POST", headers: headers, keepalive: true, credentials: "omit",
      body: JSON.stringify(row)
    }).then(function (r) { return r.ok; });
  }

  window.LilyShared = window.LilyShared || {};
  window.LilyShared.supabase = {
    ready: ready,
    storageKey: STORAGE_KEY,
    client: client,
    hasStoredSession: hasStoredSession,
    insertAnon: insertAnon
  };
})();
