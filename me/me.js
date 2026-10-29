// 내 정보: 닉네임, 아이 나이대, 마케팅 동의, 끝까지 들은 편, 로그아웃, 탈퇴(delete_my_account).
(function () {
  "use strict";
  var A = window.lilyAuth;
  function $(id) { return document.getElementById(id); }
  function say(id, text, err) { var n = $(id); n.textContent = text; n.classList.toggle("err", !!err); n.hidden = !text; }

  var c = null, uid = null;

  function signedOut() {
    $("loading").hidden = true; $("signedIn").hidden = true; $("signedOut").hidden = false;
  }

  if (!A.ready) { $("loading").hidden = true; $("notReady").hidden = false; return; }

  A.client().then(function (client) {
    c = client;
    return c.auth.getSession();
  }).then(function (r) {
    var s = r && r.data && r.data.session;
    if (!s) { signedOut(); return; }
    uid = s.user.id;
    $("who").textContent = s.user.email ? s.user.email + " 로 로그인했어요." : "카카오로 로그인했어요.";
    return Promise.all([
      c.from("profiles").select("nickname, child_age_band, marketing_opt_in").eq("user_id", uid).maybeSingle(),
      c.from("progress").select("episode, completed_at").not("completed_at", "is", null).order("completed_at", { ascending: false })
    ]).then(function (rs) {
      var p = rs[0].data || {};
      $("nickname").value = p.nickname || "";
      var band = p.child_age_band || "";
      Array.prototype.forEach.call(document.querySelectorAll('input[name="age"]'), function (n) { n.checked = n.value === band; });
      $("marketing").checked = !!p.marketing_opt_in;
      showEpisodes(rs[1].data || []);
      $("loading").hidden = true; $("signedIn").hidden = false;
    });
  }).catch(function () {
    $("loading").textContent = "정보를 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.";
  });

  A.onChange(function (m) { if (!m && uid) { uid = null; signedOut(); } });

  // 끝까지 들은 이야기: 동그라미 그림, 우리말 이름, 영어 제목, 날짜(시안 P65). 모르는 편은 그림 없이 편 번호만
  var EPS = {
    ep01: ["이 닦기", "Brush, Brush!", "brush"], ep02: ["일어나기", "Wake Up!", "wake"], ep03: ["세수하기", "Splash, Splash!", "wash"],
    ep04: ["아침 먹기", "Yummy, Yummy!", "eat"], ep05: ["옷 입기", "Put On, Ready!", "dress"], ep06: ["목욕하기", "Bath Time!", "bath"],
    ep07: ["잠자리 책", "Good night!", "sleep"]
  };
  function showEpisodes(rows) {
    var ul = $("eps");
    ul.textContent = "";
    rows.forEach(function (row) {
      if (!/^ep[0-9]{2}$/.test(row.episode)) return;
      var info = EPS[row.episode];
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "/" + row.episode + "/";
      if (info) {
        var im = document.createElement("img");
        im.src = "/hello/img/ep-" + info[2] + ".webp"; im.alt = ""; im.width = 56; im.height = 56; im.decoding = "async";
        a.appendChild(im);
      } else {
        a.appendChild(document.createElement("i"));
      }
      var name = document.createElement("span");
      var b = document.createElement("b");
      b.textContent = info ? info[0] : row.episode.toUpperCase();
      name.appendChild(b);
      if (info) { var sm = document.createElement("small"); sm.textContent = info[1]; name.appendChild(sm); }
      a.appendChild(name);
      var t = document.createElement("time");
      t.dateTime = row.completed_at;
      var d = new Date(row.completed_at);
      t.textContent = (d.getMonth() + 1) + "월 " + d.getDate() + "일";
      li.appendChild(a); li.appendChild(t); ul.appendChild(li);
    });
    $("epsEmpty").hidden = ul.children.length > 0;
  }

  $("profile").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!uid) return;
    var nick = $("nickname").value.trim().slice(0, 20);
    var picked = document.querySelector('input[name="age"]:checked');
    var band = picked && (picked.value === "4-5" || picked.value === "6-7") ? picked.value : null;
    $("save").disabled = true;
    c.from("profiles").update({ nickname: nick || null, child_age_band: band, marketing_opt_in: $("marketing").checked })
      .eq("user_id", uid).then(function (r) {
        if (r.error) throw r.error;
        say("saveMsg", "저장했어요.");
      }).catch(function () { say("saveMsg", "저장하지 못했어요. 잠시 뒤에 다시 해 주세요.", true); })
      .then(function () { $("save").disabled = false; });
  });

  $("logout").addEventListener("click", function () {
    $("logout").disabled = true;
    A.logEvent("logout").then(function () { return c.auth.signOut(); }).then(function () {
      location.replace("/");
    }).catch(function () {
      $("logout").disabled = false;
      say("acctMsg", "로그아웃하지 못했어요. 다시 해 주세요.", true);
    });
  });

  $("leave").addEventListener("click", function () { $("confirm").hidden = false; $("leave").hidden = true; $("leaveYes").focus(); });
  $("leaveNo").addEventListener("click", function () { $("confirm").hidden = true; $("leave").hidden = false; });
  $("leaveYes").addEventListener("click", function () {
    $("leaveYes").disabled = true;
    c.rpc("delete_my_account").then(function (r) {
      if (r.error) throw r.error;
      uid = null;
      return c.auth.signOut({ scope: "local" });
    }).then(function () {
      $("signedIn").hidden = true;
      $("loading").hidden = false;
      $("loading").textContent = "탈퇴했어요. 계정과 기록을 모두 지웠어요. 그동안 함께해 줘서 고마워요.";
    }).catch(function () {
      $("leaveYes").disabled = false;
      say("acctMsg", "탈퇴하지 못했어요. 잠시 뒤에 다시 해 주세요.", true);
    });
  });
})();
