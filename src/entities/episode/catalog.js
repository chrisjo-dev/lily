// 릴리랑 편 목록(entities/episode). 편을 더하면 여기 한 곳에 적는다.
// 공개 이름: window.LilyEpisodes 의 list, byId(id), img(편). 내 정보(들은 이야기)와 잠금 카드(이어지는 이야기)가 읽는다.
// 홈(index.html)과 랜딩(hello/index.html)의 목록은 첫 화면 성능 때문에 정적 HTML이다. tests/lily/catalog_check.py가 이 목록과 같은지 본다.
// - img: 편 동그라미 그림 이름(img/ep-<img>.webp). free: 가입 없이 끝까지 듣는 맛보기 편
(function () {
  "use strict";

  // 그림은 이 파일 옆 img/에 있다. 주소의 경로 부분만 쓴다(페이지마다 같은 src 문자열)
  var src = document.currentScript && document.currentScript.src;
  var IMG = (src ? new URL(src).pathname : "/src/entities/episode/catalog.js").replace(/[^/]*$/, "") + "img/";

  var list = [
    { id: "ep01", title: "이 닦기", en: "Brush, Brush!", img: "brush", free: true },
    { id: "ep02", title: "일어나기", en: "Wake Up!", img: "wake", free: false },
    { id: "ep03", title: "세수하기", en: "Splash, Splash!", img: "wash", free: false },
    { id: "ep04", title: "아침 먹기", en: "Yummy, Yummy!", img: "eat", free: false },
    { id: "ep05", title: "옷 입기", en: "Put On, Ready!", img: "dress", free: false },
    { id: "ep06", title: "목욕하기", en: "Bath Time!", img: "bath", free: false },
    { id: "ep07", title: "잠자리 책", en: "Good night!", img: "sleep", free: false }
  ];

  function byId(id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function img(ep) { return IMG + "ep-" + ep.img + ".webp"; }

  window.LilyEpisodes = { list: list, byId: byId, img: img };
})();
