// 릴리랑 로그인 상태. 다른 코드는 window.lilyAuth 의 isMember, onChange, logEvent 만 쓴다.
// - engine/lily-config.js 가 먼저 와야 한다. 값이 비어 있으면 "준비 안 됨": 누구나 비회원, 기록 안 함.
// - supabase-js 는 고정 버전을 SRI 해시로 확인해 불러온다. 버전을 올리면 LIB_SRI 와 각 페이지 CSP 의 경로도 같이 바꾼다.
//   해시 계산: curl -sL <LIB_URL> | openssl dgst -sha384 -binary | openssl base64 -A
// - 로그인 흔적이 없는 방문자는 라이브러리를 아예 받지 않는다(첫 화면 성능).
(function () {
  "use strict";

  var LIB_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js";
  var LIB_SRI = "sha384-BWcjm9OdFth9TbhCxZPdm+gAOUMAzQy9nmTs12ioXdCcbVnJaPMn+fMUoQCLt60R";
  var STORAGE_KEY = "lilyrang-auth";
  // supabase/migrations/0001_init.sql 의 lily_event_name_ok 와 같은 목록
  var EVENTS = ["signup", "login", "logout", "delete_account",
    "episode_start", "episode_complete", "gate_shown", "gate_join_click"];
  var EPISODE_RE = /^ep[0-9]{2}$/;

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

  // 같은 주소의 경로만 허용(다른 사이트로 넘기는 next 막기)
  function safeNext(v) {
    if (typeof v !== "string" || v.length > 100) return "/";
    if (!/^\/[A-Za-z0-9._\/-]*$/.test(v)) return "/";
    if (v.indexOf("//") !== -1 || v.indexOf("..") !== -1) return "/";
    return v;
  }

  var listeners = [];
  var lastMember = null;
  function notify(m) {
    m = !!m;
    if (m === lastMember) return;
    lastMember = m;
    listeners.slice().forEach(function (cb) { try { cb(m); } catch (e) { console.error(e); } });
  }

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
    var c = window.supabase.createClient(url, key, {
      auth: {
        flowType: "pkce",
        storageKey: STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false // join/callback/ 에서 직접 교환한다
      }
    });
    c.auth.onAuthStateChange(function (_event, session) { notify(!!session); });
    return c;
  }

  function session() {
    if (!ready || !hasStoredSession()) return Promise.resolve(null);
    return client().then(function (c) { return c.auth.getSession(); })
      .then(function (r) { return (r && r.data && r.data.session) || null; });
  }

  function isMember() {
    return session().then(function (s) { notify(!!s); return !!s; }, function () { return false; });
  }

  function onChange(cb) {
    if (typeof cb === "function") listeners.push(cb);
    return function () { listeners = listeners.filter(function (x) { return x !== cb; }); };
  }

  // 다른 탭에서 로그인(이메일 링크는 새 탭으로 열리기 쉽다)하거나 로그아웃하면 이 탭에도 알린다
  window.addEventListener("storage", function (e) {
    if (!ready || e.key !== STORAGE_KEY) return;
    if (e.newValue === null) { notify(false); return; }
    isMember();
  });

  // 이벤트 기록. 실패해도 화면은 그대로 둔다. episode_complete 는 들은 편(progress)도 남긴다.
  function logEvent(name, episode) {
    if (!ready || EVENTS.indexOf(name) === -1) return Promise.resolve(false);
    var ep = typeof episode === "string" && EPISODE_RE.test(episode) ? episode : null;
    return session().then(function (s) {
      if (!s) return anonInsert(name, ep);
      return client().then(function (c) {
        var uid = s.user.id;
        var jobs = [c.from("events").insert({ user_id: uid, name: name, episode: ep })];
        if (name === "episode_complete" && ep) {
          jobs.push(c.from("progress").upsert(
            { user_id: uid, episode: ep, completed_at: new Date().toISOString() },
            { onConflict: "user_id,episode" }));
        }
        return Promise.all(jobs).then(function (rs) { return rs.every(function (r) { return !r.error; }); });
      });
    }).catch(function () { return false; });
  }

  // 비로그인 기록은 라이브러리 없이 REST로 바로(user_id 칸은 DB가 받지 않는다)
  function anonInsert(name, ep) {
    var headers = { "apikey": key, "Content-Type": "application/json", "Prefer": "return=minimal" };
    if (key.indexOf("sb_") !== 0) headers.Authorization = "Bearer " + key;
    return fetch(url + "/rest/v1/events", {
      method: "POST", headers: headers, keepalive: true, credentials: "omit",
      body: JSON.stringify({ name: name, episode: ep })
    }).then(function (r) { return r.ok; });
  }

  window.lilyAuth = {
    isMember: isMember,
    onChange: onChange,
    logEvent: logEvent,
    // 아래는 릴리랑 가입 페이지(join, me)만 쓴다
    ready: ready,
    client: client,
    safeNext: safeNext
  };
})();
