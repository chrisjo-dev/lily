// 릴리랑 로그인 상태(entities/session). 다른 코드는 window.lilyAuth 의 isMember, onChange, logEvent 만 쓴다.
// - shared/config/lily-config.js, shared/api/supabase.js 가 먼저 와야 한다. 준비 안 됨이면 누구나 비회원, 기록 안 함.
// - Supabase 클라이언트는 shared/api 가 만들고, 여기서는 받아서 로그인 상태 변화를 듣기만 한다.
(function () {
  "use strict";

  var sb = (window.LilyShared && window.LilyShared.supabase) || { ready: false };
  var ready = sb.ready === true;
  // supabase/migrations/0001_init.sql 의 lily_event_name_ok 와 같은 목록
  var EVENTS = ["signup", "login", "logout", "delete_account",
    "episode_start", "episode_complete", "gate_shown", "gate_join_click"];
  var EPISODE_RE = /^ep[0-9]{2}$/;

  function hasStoredSession() { return sb.hasStoredSession(); }

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

  // 클라이언트를 처음 받을 때 한 번 로그인 상태 변화를 듣는다
  var hooked = false;
  function client() {
    if (!ready) return Promise.resolve(null);
    return sb.client().then(function (c) {
      if (c && !hooked) {
        hooked = true;
        c.auth.onAuthStateChange(function (_event, session) { notify(!!session); });
      }
      return c;
    });
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
    if (!ready || e.key !== sb.storageKey) return;
    if (e.newValue === null) { notify(false); return; }
    isMember();
  });

  // 이벤트 기록. 실패해도 화면은 그대로 둔다. episode_complete 는 들은 편(progress)도 남긴다.
  function logEvent(name, episode) {
    if (!ready || EVENTS.indexOf(name) === -1) return Promise.resolve(false);
    var ep = typeof episode === "string" && EPISODE_RE.test(episode) ? episode : null;
    return session().then(function (s) {
      // 비로그인 기록(user_id 칸은 DB가 받지 않는다)
      if (!s) return sb.insertAnon("events", { name: name, episode: ep });
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
