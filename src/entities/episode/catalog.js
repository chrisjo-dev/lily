// 릴리랑 편 목록(entities/episode). 원천은 옆의 catalog.json 하나다(Worker도 같은 파일을 읽는다). 편과 시리즈를 더하면 거기에 적는다.
// 공개 이름: window.LilyEpisodes 의 ready(Promise), list, series, policy, byId(id), byLegacy(옛 ID), firstFree(시리즈), img(편).
// 판정 함수(canListen, previewOn, ID_RE)는 access.js 가 같은 객체에 붙인다.
// 내 정보(들은 이야기)와 잠금 카드(이어지는 이야기, 맛보기 편, 무료 여부)가 읽는다.
// 홈(index.html)과 랜딩(hello/index.html)의 목록은 첫 화면 성능 때문에 정적 HTML이다. tests/lily/catalog_check.py가 catalog.json과 같은지 본다.
// - img: 편 동그라미 그림 이름(img/ep-<img>.webp). free: 가입 없이 끝까지 듣는 맛보기 편
// - 목록을 못 받으면(네트워크 오류) 빈 목록과 기본 정책으로 둔다. 페이지는 계속 동작한다.
(function () {
  "use strict";

  // 이 파일 옆의 catalog.json, img/. 주소의 경로 부분만 쓴다(페이지마다 같은 src 문자열)
  var src = document.currentScript && document.currentScript.src;
  var BASE = (src ? new URL(src).pathname : "/src/entities/episode/catalog.js").replace(/[^/]*$/, "");
  var IMG = BASE + "img/";

  var E = window.LilyEpisodes = window.LilyEpisodes || {};
  E.list = [];
  E.series = [];
  E.policy = { locked: "member", preview: true };

  E.byId = function (id) {
    for (var i = 0; i < E.list.length; i++) if (E.list[i].id === id) return E.list[i];
    return null;
  };

  E.byLegacy = function (old) {
    for (var i = 0; i < E.list.length; i++) if (E.list[i].legacy && E.list[i].legacy === old) return E.list[i];
    return null;
  };

  // 같은 시리즈의 첫 무료 편, 없으면 전체의 첫 무료 편
  E.firstFree = function (series) {
    var any = null;
    for (var i = 0; i < E.list.length; i++) {
      var e = E.list[i];
      if (e.free !== true) continue;
      if (e.series === series) return e;
      if (!any) any = e;
    }
    return any;
  };

  E.img = function (ep) { return IMG + "ep-" + ep.img + ".webp"; };

  E.ready = fetch(BASE + "catalog.json", { credentials: "same-origin" })
    .then(function (r) { if (!r.ok) throw new Error("catalog " + r.status); return r.json(); })
    .then(function (d) {
      E.list = Array.isArray(d.episodes) ? d.episodes : [];
      E.series = Array.isArray(d.series) ? d.series : [];
      if (d.policy) E.policy = d.policy;
      return E;
    }, function (err) {
      console.error(err);
      return E;
    });
})();
