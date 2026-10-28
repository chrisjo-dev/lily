// 제목 글꼴(개구)은 페이지가 다 뜬 뒤에 켠다. 느린 휴대폰에서 첫 화면 그림과 받기를 다투지 않게(그 전에는 Jua로 보인다).
// <link id="title-font" rel="stylesheet" media="print" href="..."> 와 짝. CSP 때문에 onload 속성 대신 이 파일을 쓴다.
(function () {
  function on() { var l = document.getElementById("title-font"); if (l) l.media = "all"; }
  if (document.readyState === "complete") on(); else addEventListener("load", on);
})();
