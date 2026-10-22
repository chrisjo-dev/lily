// 시험용 가짜 lilyAuth. ?member=1 이면 회원. window.__setMember(true) 로 다른 탭 로그인을 흉내 낸다.
// 기록은 sessionStorage 에 남겨 페이지를 옮겨도 시험에서 읽을 수 있게 한다.
(function () {
  var q = new URLSearchParams(location.search);
  var member = q.get("member") === "1";
  var cbs = [];
  function log(name, ep) {
    var a = JSON.parse(sessionStorage.getItem("fakeEvents") || "[]");
    a.push([name, ep]);
    sessionStorage.setItem("fakeEvents", JSON.stringify(a));
    return Promise.resolve(true);
  }
  window.lilyAuth = {
    isMember: function () { return Promise.resolve(member); },
    onChange: function (cb) { cbs.push(cb); },
    logEvent: log
  };
  window.__setMember = function (m) { member = m; cbs.forEach(function (cb) { cb(m); }); };
})();
