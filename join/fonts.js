// 글꼴 CSS를 화면 그리기를 막지 않게 불러온다(print 로 받아 두었다가 all 로 바꿈). CSP 때문에 onload 속성 대신 이 파일을 쓴다.
(function () { var l = document.getElementById("fonts"); if (l) l.media = "all"; })();
