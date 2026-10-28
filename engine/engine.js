// 릴리랑 엔진: 어느 편이든 같은 것만 둔다(재생, 진행 막대, 기다림, 그냥 듣기, 3번 이어 듣기, 조금 천천히,
// 바깥 되감기, 장면 전환, 자막, 단어 버튼, 대본, 부모 화면, 미리 불러오기, 잠금 훅).
// 편 HTML은 장면 마크업(#stage)과 설정 JSON(<script type="application/json" id="lily-episode">)만 둔다. 형식은 engine/README.md.
// 실행되는 인라인 코드가 없어야 CSP에서 'unsafe-inline' 없이 돈다. 문서를 다 읽으면(DOMContentLoaded) 스스로 시작한다.
// 상호작용은 engine/interactions/*.js가 window.LilyInteractions[종류]로 등록한다.
// 시험(tests/lily)이 쓰는 상태(audio, waiting, done, scene, endShown, playsLeft, seekTo, showEnd, enterWait)는 전역으로 둔다.
window.LilyInteractions = window.LilyInteractions || {};

const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const plain = (s) => s.replace(/\[\[|\]\]/g, "");
function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  // style 속성은 CSP가 막으므로 CSSOM으로 넣는다
  for (const k in attrs) k === "style" ? (n.style.cssText = attrs[k]) : n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
const PLAY_PATH = "M6.5 4.3v11.4a.8.8 0 0 0 1.2.7l9.2-5.7a.8.8 0 0 0 0-1.4L7.7 3.6a.8.8 0 0 0-1.2.7z";
// 4~7세가 찾고 누를 시간. 고리 애니메이션(.ring .cnt, 8s)과 같이 바꾼다
const AUTO_MS = 8000;
// 화면 그림(손 안내, 반짝 별, 거품 터짐)은 engine/ui/에 있다. 편 주소와 상관없이 engine.js가 있는 곳을 기준으로 찾는다
const UI = ((document.currentScript && document.currentScript.src) || "/engine/engine.js").replace(/[^/]*$/, "") + "ui/";

// ---- 편 설정에서 채우는 값 ----
let EP, LINES, WAITS, SCENES, SCENE_AT, END_AT, END_WAIT = -1, audio, stage, rows;
let mods = [], waitMod = [];
const sceneAt = (t) => { let s = 0; SCENE_AT.forEach((a, i) => { if (t >= a) s = i; }); return s; };

// ---- 상태 ----
let done = [];                            // 기다림이 채워졌는지(눌렀거나 지나감)
let waiting = -1, waitTimer = 0, resumeTimer = 0, resumeTok = 0;
let scene = -1, line = -1, lastSec = -1, stopAt = null, suppressUntil = -1;
let playsLeft = 0, justListen = false, started = false, raf = 0, endShown = false, endReady = false;
let innerSeekTo = -1, wordBtn = null;
const each = (hook, ...a) => { for (const m of mods) if (m[hook]) m[hook](...a); };

// ---- 셸: 무대 위 조각(엠블럼, 제목 띠, 진행 점), 본문 줄, 아이 차례 단추, 부모 서랍, 끝 카드, 부모님 화면 ----
// 휴대폰: 위 무대(그림) + 본문 줄 + 접힌 서랍 손잡이. 서랍을 열면 재생, 3번 이어 듣기, 조금 천천히, 그냥 듣기, 대본.
// 태블릿 가로: 펼친 책(왼쪽 그림, 오른쪽 본문과 부모 조작 줄). 같은 요소를 CSS 격자로 옮겨 놓는다(engine.css)
const EN_RE = /[A-Za-z][A-Za-z'\-]*(?:[ ,.!?]*[A-Za-z][A-Za-z'\-]*)*[.!?,]*/g;
// 본문 줄: 한국어와 영어를 두 줄로 나눈다. 같은 영어가 되풀이되면 한 번만(예: "Brush my teeth. ... Brush my teeth!")
function capHTML(s) {
  const en = [], keys = [];
  const kr = plain(s).replace(EN_RE, (m) => {
    const k = m.toLowerCase().replace(/[^a-z' ]/g, "").trim();
    if (!keys.some((x) => x.includes(k))) { keys.push(k); en.push(m); }
    return " ";
  }).replace(/\s+/g, " ").replace(/\s([.,!?])/g, "$1").trim();
  return (kr ? `<span class="kr">${esc(kr)}</span>` : "") + (en.length ? `<span class="en">${esc(en.join(" "))}</span>` : "");
}
// 부모님 글(팁) 안의 영어만 영어 글꼴로
function tipHTML(s) {
  const t = plain(s);
  let out = "", i = 0;
  t.replace(EN_RE, (m, at) => { out += `${esc(t.slice(i, at))}<span class="en">${esc(m)}</span>`; i = at + m.length; return m; });
  return out + esc(t.slice(i));
}
const SAY = () => (EP.free_play || []).find((f) => f.type === "say-sticker");

function buildShell() {
  const st = $("stage"), end = EP.end || {}, ws = EP.worksheet, num = esc(String(EP.id || "").toUpperCase());
  // 화면 그림은 sprite에 한 번만 두고 장면에서는 <use>로 가리킨다(장면마다 같은 그림을 다시 받지 않음).
  // 손 #hand-shape(누르기)와 #hand-rub(문지르기)는 손끝이 (0, -2)에 오는 크기, 별과 터짐은 symbol이라 <use>의 x, y, width, height로 놓는다.
  // href는 첫 재생이나 첫 기다림에서 넣는다(loadUi). 첫 화면에서 받는 양은 그대로
  document.body.insertAdjacentHTML("afterbegin", `<svg class="sprite" width="0" height="0" aria-hidden="true">
  <g id="hand-shape"><image class="ui" data-ui="hand-tap.webp" x="-11" y="-35" width="44" height="46" transform="scale(1 -1)"/></g>
  <g id="hand-rub"><image class="ui" data-ui="hand-rub.webp" x="-4" y="-16" width="44" height="29"/></g>
  <symbol id="ui-sparkle" viewBox="0 0 229 256"><image class="ui" data-ui="sparkle.webp" width="229" height="256"/></symbol>
  <symbol id="ui-pop" viewBox="0 0 256 234"><image class="ui" data-ui="pop.webp" width="256" height="234"/></symbol>
  </svg>`);
  const kid = document.createElement("div");
  kid.className = "kid fresh"; kid.id = "kid";
  // 아이가 누르고 문지를 때 선택, 길게 누르기 메뉴, 그림 끌기가 생기지 않게(CSS만으로는 안드로이드와 SVG 그림이 남는다)
  for (const ev of ["selectstart", "contextmenu", "dragstart"]) kid.addEventListener(ev, (e) => e.preventDefault());
  st.before(kid);
  kid.innerHTML = `<a class="logo" href="/" aria-label="릴리랑 처음으로"><img src="/brand/emblem.png" width="32" height="32" alt=""></a>
    <div class="eplabel" id="eplabel"><span class="epn">${num}</span><h1>${esc(EP.title)}</h1></div>
    <div class="dots" id="dots" role="img" aria-label="장면 시작 전">${"<i></i>".repeat(SCENES.length - 1)}</div>`;
  kid.appendChild(st);
  st.insertAdjacentHTML("beforeend", `<span class="chip" id="chip" hidden></span>
    <button class="big-play" id="bigPlay" type="button" aria-label="이야기 듣기 시작">
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="${PLAY_PATH}"/></svg>
    </button>`);
  // 서랍 줄: 그림 아이콘 + 이름(휴대폰은 긴 이름과 설명, 태블릿 가로 줄은 짧은 이름) + 스위치
  const opt = (id, icon, name, short, sub, state) => `<button class="opt" id="${id}" type="button" ${state}>
      <img src="${UI}${icon}.webp" width="32" height="32" alt="" loading="lazy" decoding="async">
      <span class="lab"><b class="long">${name}</b><b class="short">${short}</b><small>${sub}</small></span><span class="tog" aria-hidden="true"></span>
    </button>`;
  const tips = EP.tips || [], t1 = end.tip || (Array.isArray(tips[1]) ? tips[1].join(" ") : tips[1] || "");
  const art0 = $(SCENES[0].id).querySelector("image"), frame = art0 ? art0.getAttribute("href") || art0.dataset.src : "";
  kid.insertAdjacentHTML("beforeend", `<div class="ring" id="ring" hidden aria-hidden="true"><svg viewBox="0 0 136 136"><circle class="trk" cx="68" cy="68" r="60"/><circle class="cnt" cx="68" cy="68" r="60"/></svg></div>
  <div class="cap" id="cap">
    <span class="wtag" id="wtag" hidden>릴리가 기다려요</span>
    <p id="capText" aria-live="polite"><span class="kr">노란 동그라미를 누르면<br>릴리 이야기가 시작돼요.</span></p>
    <div class="expr"><p class="xlab">오늘의 표현</p><p class="xword" id="xword">${esc(((EP.words || [])[0] || {}).en || "")}</p></div>
  </div>
  ${SAY() ? `<div class="said" id="said"></div>` : ""}
  <button class="hintrow" id="drawerOpen" type="button" aria-controls="drawer" aria-expanded="false"><i class="bar"></i><span>부모 화면 열기</span><i class="chev"></i></button>
  <div class="scrim" id="scrim" hidden></div>
  <section class="drawer" id="drawer" aria-label="부모님 조작">
    <button class="grab" id="drawerClose" type="button" aria-label="부모 화면 닫기"><i></i></button>
    <div class="prow">
      <button class="pp" id="play" type="button" aria-label="재생">
        <svg id="ic-play" viewBox="0 0 20 20" fill="currentColor"><path d="${PLAY_PATH}"/></svg>
        <svg id="ic-pause" viewBox="0 0 20 20" fill="currentColor" hidden><rect x="5" y="4" width="3.6" height="12" rx="1.2"/><rect x="11.4" y="4" width="3.6" height="12" rx="1.2"/></svg>
      </button>
      <div class="prog">
        <div class="times"><span class="time" id="cur">0:00</span><span class="time" id="dur">${fmt(EP.duration)}</span></div>
        <input id="seek" type="range" min="0" max="${EP.duration}" step="0.1" value="0" aria-label="재생 위치">
      </div>
    </div>
    <div class="opts">
      ${opt("times3", "ic-repeat", "3번 이어 듣기", "반복", "끝나면 처음부터 다시 들어요", 'aria-pressed="false"')}
      ${opt("slow", "ic-slow", "조금 천천히", "천천히", "재생 속도 0.85x", 'aria-pressed="false"')}
      ${opt("justListen", "ic-listen", "그냥 듣기", "그냥 듣기", "아이 차례에도 멈추지 않아요", 'role="switch" aria-checked="false"')}
    </div>
    <a class="opt link" id="toScript" href="#parent"><img src="${UI}ic-script.webp" width="32" height="32" alt="" loading="lazy" decoding="async"><span class="lab"><b>대본 보기</b></span><i class="chev"></i></a>
  </section>
  <div class="endcard" id="endcard" hidden>
    <div class="ebody">
      <div class="eleft"><div class="eframe"><img data-src="${esc(frame)}" alt="" width="170" height="170"></div>
      <div class="ehead"><p class="epn">${num}</p><p class="etitle">${esc(EP.title)}</p><p class="emsg">${esc(end.done || "오늘 이야기를 다 들었어요.")}</p></div></div>
      <div class="eright">${end.stickers ? `<p class="ribbon">${esc(end.sub || "오늘의 스티커")}</p>
      <div class="estk">${end.stickers.map((s) => `<span><i class="spot"><img data-src="${esc(s.img)}" alt="" width="66" height="66"></i>${esc(s.label)}</span>`).join("")}</div>` : ""}
      <button class="again" id="again" type="button">한 번 더</button>
      <button class="toparent" id="toParent" type="button">부모님께</button></div>
    </div>
    ${t1 ? `<p class="etip">${tipHTML(t1)}</p>` : ""}
  </div>
  <audio id="audio" src="${esc(EP.audio)}" preload="metadata"></audio>`);

  // 학습지는 설정에 worksheet가 있을 때만. 없으면 학습지 칸, 학습지 칩, 학습지 팁을 모두 뺀다
  const icon = (i) => i.startsWith("#") ? `<svg aria-hidden="true"><use href="${esc(i)}"/></svg>` : `<img data-src="${esc(i)}" alt="" width="64" height="54" loading="lazy" decoding="async">`;
  const tip = (p) => {
    if (p && p.worksheet !== undefined) { if (!ws) return ""; p = p.text; }
    return Array.isArray(p) ? `<p><b>${esc(p[0])}</b> ${esc(p[1])}</p>` : `<p>${esc(p)}</p>`;
  };
  kid.insertAdjacentHTML("afterend", `<main class="parent" id="parent">
  <section class="card" aria-labelledby="h-words">
    <h2 id="h-words">오늘의 단어</h2>
    <div class="words">${(EP.words || []).map((w) => `
      <button class="word" type="button" data-line="${w.line}" aria-label="${esc(w.en)} 듣기">
        ${icon(w.icon)}
        <span><b>${esc(w.en)}</b><span>${esc(w.ko)}</span></span>
        <i class="say" aria-hidden="true"><svg viewBox="0 0 20 20" fill="currentColor"><path d="${PLAY_PATH}"/></svg></i>
      </button>`).join("")}
    </div>
    <p class="hint">단어를 누르면 그 단어가 나오는 부분만 들려요.</p>
  </section>
  ${ws ? `<section class="card" aria-labelledby="h-sheet">
    <h2 id="h-sheet">같이 하는 학습지</h2>
    <div class="sheet">
      <img src="${esc(ws.preview)}" width="112" height="158" alt="${esc(ws.alt || "학습지 미리보기")}">
      <div>
        <ul>${(ws.items || []).map((t, k) => `<li><b>${k + 1}</b> ${esc(t)}</li>`).join("")}</ul>
        <a class="btn" href="${esc(ws.pdf)}" download>학습지 받기 (A4)</a>
      </div>
    </div>
    ${ws.hint ? `<p class="hint">${esc(ws.hint)}</p>` : ""}
  </section>` : ""}
  <section class="card tips" aria-labelledby="h-tips">
    <h2 id="h-tips">부모님께</h2>
    ${tips.map(tip).join("")}
  </section>
  <details class="card" id="scriptCard">
    <summary><span><span class="t">대본 보기</span><span class="s">부모님용, 줄을 누르면 그 부분부터 들려요</span></span>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7.5l5 5 5-5"/></svg></summary>
    <div class="script" id="script"></div>
  </details>
  <p class="maker"><a href="https://read.wspace.ai.kr/">릴리랑은 매일 외국어 읽기가 만들어요</a></p>
  <footer class="site-footer"><a href="https://www.wspace.ai.kr/">wspace 홈</a><a href="https://www.wspace.ai.kr/about/">소개</a><a href="https://www.wspace.ai.kr/privacy/">개인정보처리방침</a><a href="https://www.wspace.ai.kr/contact/">연락처</a></footer>
</main>`);
}

// 아이 차례(say-sticker) 장면: 편 그림 안의 "말했어요" 단추를 본문 줄 아래 큰 단추(같은 id)로 옮기고,
// 점선 스티커 자리는 종이 자리 그림으로, "오늘의 스티커" 글은 리본으로 바꿔 판을 가운데에 둔다. 동작(say-sticker.js)은 그대로
let sayScene = -1;
function decorateSay() {
  const B = SAY(), old = B && $(B.target);
  if (!old) return;
  const sc = old.closest(".scene");
  sayScene = SCENES.findIndex((s) => s.id === sc.id);
  old.remove();
  sc.querySelectorAll(".hand").forEach((h) => h.remove());
  $("said").innerHTML = `<button class="tgt saybtn" id="${esc(B.target)}" type="button" aria-label="말했어요"><span class="halo"></span><span class="pulse"><i class="ic"></i><b>말했어요</b></span></button>`;
  const into = $(B.into), P = into.parentNode;
  const dash = [...P.children].find((n) => n.hasAttribute("stroke-dasharray"));
  const label = [...P.children].find((n) => n.tagName === "text" && n.classList.contains("kr"));
  const names = into.nextElementSibling && into.nextElementSibling.tagName === "g" ? into.nextElementSibling : null;
  // 판 좌표를 장면 좌표로(판이 translate, scale 묶음 안에 있는 편이 있다)
  let m = sc.createSVGMatrix();
  for (let n = P; n !== sc; n = n.parentNode) { const c = n.transform.baseVal.consolidate(); if (c) m = c.matrix.multiply(m); }
  const moved = [];
  let lo = Infinity, hi = -Infinity;
  if (dash) {
    for (const r of dash.querySelectorAll("rect")) {
      const [x, y, w, h] = ["x", "y", "width", "height"].map((a) => Number(r.getAttribute(a)));
      const spot = el("image", { class: "ui", "data-ui": "sticker-spot.webp", x: x - w * 0.06, y: y - h * 0.06, width: w * 1.12, height: h * 1.12 });
      P.insertBefore(spot, into); moved.push(spot);
      lo = Math.min(lo, m.a * x + m.e); hi = Math.max(hi, m.a * (x + w) + m.e);
    }
    dash.remove();
  }
  if (label) {
    const x = Number(label.getAttribute("x")), y = Number(label.getAttribute("y")) - 8;
    label.setAttribute("y", y); label.classList.add("rib");
    const rib = el("image", { class: "ui", "data-ui": "ribbon.webp", x: x - 95, y: y - 22, width: 190, height: 34, preserveAspectRatio: "none" });
    P.insertBefore(rib, label); moved.unshift(rib, label);
  }
  if (lo < hi) {
    const vb = sc.viewBox.baseVal, g = el("g", { transform: `translate(${(vb.x + vb.width / 2 - (lo + hi) / 2).toFixed(1)} 0)` });
    if (P === sc) { P.insertBefore(g, moved[0] || into); for (const n of [...moved, into, names]) if (n) g.appendChild(n); }
    else { P.before(g); g.appendChild(P); }
  }
}

// ---- 장면 상태 그리기 ----
function chip(text) { $("chip").textContent = text || ""; $("chip").hidden = !text; }

// 그림 미리 받기: 처음 두 장면만 바로 받고, 나머지는 앞 장면이 시작될 때 받아 decode까지 해 둔다
function warm(k) {
  if (k >= SCENES.length) return;
  const nodes = [...$(SCENES[k].id).querySelectorAll("[data-src]")];
  if (k === SCENES.length - 1) {
    nodes.push(...document.querySelectorAll("#endcard [data-src]"));
    if (EP.end && EP.end.bg) $("endcard").style.backgroundImage = `url(${EP.end.bg})`;
  }
  for (const n of nodes) {
    const u = n.dataset.src;
    n.removeAttribute("data-src");
    const set = () => (n.tagName === "IMG" ? (n.src = u) : n.setAttribute("href", u));
    const im = new Image(); im.src = u;
    im.decode().then(set, set);
  }
}
function setScene(s) {
  if (s === scene) return;
  scene = s;
  warm(s); warm(s + 1);
  SCENES.forEach((sc, i) => $(sc.id).toggleAttribute("hidden", i !== s));
  // 밤 편(설정 night: true)이나 밤 장면(장면 night: true)은 화면 장치도 어둡게, 아이 차례 장면은 큰 "말했어요" 단추
  const night = EP.night === true || SCENES[s].night === true;
  $("kid").classList.toggle("night", night);
  document.body.classList.toggle("nightpage", night);   // 태블릿 세로에서 아이 영역 양옆 바탕도 밤으로
  $("kid").classList.toggle("turn", s === sayScene);
  document.querySelectorAll("#dots i").forEach((d, i) => { d.className = i + 1 < s ? "past" : i + 1 === s ? "now" : ""; });
  $("dots").setAttribute("aria-label", s ? `장면 ${s}/${SCENES.length - 1} ${SCENES[s].name || ""}` : "장면 시작 전");
  chip(SCENES[s].chip || (EP.worksheet && SCENES[s].worksheetChip) || "");
  each("scene", s);
}
function setLine(t) {
  let k = -1;
  for (let j = 0; j < LINES.length; j++) if (t >= LINES[j][0] - 0.05 && t <= LINES[j][1] + 0.3) k = j;
  if (k === line) return;
  if (line >= 0) rows[line].classList.remove("now");
  const jumped = line === -2;
  line = k;
  if (k < 0) {
    // 옮긴 곳이 줄 사이면 바로 앞 줄을 보여 준다
    if (!jumped) return;
    let j = -1;
    for (let i = 0; i < LINES.length; i++) if (LINES[i][0] <= t) j = i;
    if (j >= 0) { $("capText").innerHTML = capHTML(LINES[j][2]); setWord(j); }
    each("line", -1, j);
    return;
  }
  rows[k].classList.add("now");
  $("capText").innerHTML = capHTML(LINES[k][2]);
  setWord(k);
  each("line", k, k);
}
// 오늘의 표현(태블릿 가로 책): 지금 줄까지 나온 단어 중 마지막
function setWord(k) {
  const w = (EP.words || []).filter((x) => x.line <= k).pop() || (EP.words || [])[0];
  if (w) $("xword").textContent = w.en;
}
function setTime(t) {
  const sk = $("seek");
  sk.value = t;
  sk.style.setProperty("--p", `${(t / (Number(sk.max) || 1)) * 100}%`);
  const sec = Math.floor(t);
  if (sec !== lastSec) { lastSec = sec; $("cur").textContent = fmt(t); }
}
function showEnd(on) {
  endShown = on; $("endcard").hidden = !on;
  $("kid").classList.toggle("ended", on);
  if (on) drawer(false);
  updateBigPlay();
}
// fresh: 아직 시작 전(제목 종이 띠와 큰 재생 단추가 보이는 첫 화면)
function updateBigPlay() { $("bigPlay").hidden = started || endShown; $("kid").classList.toggle("fresh", !started && !endShown); }

// 부모 서랍: 휴대폰과 태블릿 세로에서는 접힌 손잡이를 누르면 아래에서 올라온다. 태블릿 가로(펼친 책)에서는 늘 펼쳐 있다
const BOOK = matchMedia("(min-width: 900px) and (min-height: 600px) and (orientation: landscape)");
function drawer(on) {
  if (BOOK.matches) on = false;
  const focusIn = $("drawer").contains(document.activeElement);
  $("kid").classList.toggle("drawer-open", on);
  $("scrim").hidden = !on;
  $("drawerOpen").setAttribute("aria-expanded", String(on));
  $("drawer").inert = !on && !BOOK.matches;
  // 키보드 사용자: 열면 서랍 안 재생으로, 닫히면(inert로 포커스가 사라지므로) 손잡이로 돌려준다
  if (on && document.activeElement === $("drawerOpen")) $("play").focus({ preventScroll: true });
  if (!on && focusIn && !BOOK.matches) $("drawerOpen").focus({ preventScroll: true });
}

// 첫 화면 뒤에 받는 그림: 화면 그림(손, 별, 터짐)과 오늘의 단어 스티커. 첫 재생, 첫 기다림, 첫 누름이나 스크롤 중 먼저 오는 때 한 번
let lateLoaded = false;
function loadLater() {
  if (lateLoaded) return;
  lateLoaded = true;
  document.querySelectorAll("image.ui").forEach((n) => n.setAttribute("href", UI + n.dataset.ui));
  document.querySelectorAll(".word img[data-src]").forEach((n) => { n.src = n.dataset.src; n.removeAttribute("data-src"); });
}

// ---- 효과음(engine/sfx/) ----
// 누르는 장치마다 짧은 소리. Web Audio로 낸다(HTMLAudio는 iOS에서 늦게 울림). 내레이션 <audio>와는 따로라 그 볼륨과 재생에 손대지 않는다.
// 첫 화면 무게를 늘리지 않게 첫 누름(pointerdown, keydown, click) 때 AudioContext를 만들고 그때 받는다.
// 못 받거나 Web Audio가 없으면 조용히 넘어간다(소리만 없고 동작은 같다). 소리 원본과 다시 만드는 법: engine/README.md
const SFX_DIR = UI.replace(/ui\/$/, "sfx/");
const SFX_NAMES = ["find", "sparkle", "pop", "scrub", "said", "sticker", "lamp", "play", "again", "parent"];
const SFX_GAP = { scrub: 0.2 };          // 문지르기는 0.2초 넘게 띄우고, 앞 소리가 울리는 동안은 새로 내지 않는다
let actx = null, sfxBuf = {}, sfxWait = {}, sfxLast = {}, sfxLive = {};
function sfxUnlock() {
  try {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
      for (const n of SFX_NAMES) {
        sfxWait[n] = fetch(SFX_DIR + n + ".mp3")
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
          .then((b) => new Promise((ok, no) => actx.decodeAudioData(b, ok, no)))
          .then((buf) => (sfxBuf[n] = buf), () => null);
      }
    }
    if (actx.state !== "running") actx.resume().catch(() => {});
  } catch (_) { actx = null; }
}
// iOS는 손을 뗄 때(touchend, click) 열리기도 해서 여러 이벤트에서 깨운다. 한 번 돌기 시작하면 할 일이 없다
for (const ev of ["pointerdown", "touchend", "click", "keydown"]) window.addEventListener(ev, sfxUnlock, { capture: true, passive: true });
// 간격과 겹침은 오디오 시계가 아니라 performance.now()로 잰다(시계가 멈춘 컨텍스트에서도 소리가 막히지 않게)
function sfx(name, delay) {
  if (!actx) return;
  const now = () => performance.now() / 1000, asked = now(), gap = SFX_GAP[name] || 0.05;
  if (asked - (sfxLast[name] ?? -9) < gap || (SFX_GAP[name] && (sfxLive[name] || 0) > asked)) return;
  sfxLast[name] = asked;
  const go = (buf) => {
    // 첫 누름처럼 아직 못 받았으면 받는 대로 내되, 늦으면(0.35초 넘게) 버린다
    if (!buf || now() - asked > 0.35) return;
    try {
      const src = actx.createBufferSource();
      src.buffer = buf; src.connect(actx.destination);
      src.start(actx.currentTime + (delay || 0));
      sfxLive[name] = now() + (delay || 0) + buf.duration;
    } catch (_) {}
  };
  if (sfxBuf[name]) go(sfxBuf[name]); else if (sfxWait[name]) sfxWait[name].then(go);
}

// ---- 재생 ----
function play() {
  loadLater();
  started = true; updateBigPlay();
  if (audio.error) audio.load();
  audio.play().catch(() => { $("capText").textContent = "재생할 수 없어요. 다시 눌러 보세요."; });
}
function seekTo(t) {
  clearWait();
  stopAt = null; suppressUntil = -1;
  t = Math.max(0, Math.min(t, audio.duration || EP.duration));
  innerSeekTo = t; audio.currentTime = t;
  done = WAITS.map((w) => w.at < t - 0.05);
  setScene(sceneAt(t));
  endReady = false;
  each("seek", t);
  if (END_WAIT >= 0 && done[END_WAIT]) endReady = true;
  line = -2; setLine(t); setTime(t);
  showEnd(endReady && t >= END_AT);
}
function restart() { showEnd(false); seekTo(0); play(); }

// requestAnimationFrame로 시각을 매 프레임 확인한다(timeupdate는 0.25초 간격이라 기다림 지점을 지나친다)
function tick() {
  raf = 0;
  const t = audio.currentTime;
  if (stopAt !== null && t >= stopAt) { stopAt = null; audio.pause(); }
  // 잠금 훅: 이 위치를 지나 들어도 되는지 매번 묻는다(gate.js가 없으면 gate-default.js가 항상 허용)
  if (!audio.paused && !window.lilyGate.canPlayPast(t, EP)) {
    audio.pause();
    window.lilyGate.onBlocked(t, EP, play);
  }
  setTime(t); setLine(t); setScene(sceneAt(t));
  if (!audio.paused) {
    for (let i = 0; i < WAITS.length; i++) {
      if (done[i]) continue;
      if (t < WAITS[i].at) break;
      if (justListen || WAITS[i].at <= suppressUntil) { done[i] = true; continue; }
      enterWait(i); break;
    }
  }
  if (endReady && !endShown && t >= END_AT) showEnd(true);
  if (!audio.paused) raf = requestAnimationFrame(tick);
}

// ---- 기다리기 ----
function enterWait(i) {
  loadLater();
  waiting = i;
  drawer(false);                            // 아이 차례: 서랍이 열려 있으면 닫아 무대를 보이게
  audio.pause();
  stage.classList.add("waiting");
  $("wtag").hidden = false;
  armTimer();
}
function armTimer() {
  clearTimeout(waitTimer);
  waitTimer = setTimeout(autoResolve, AUTO_MS);
  const ring = $("ring");
  ring.hidden = true;                       // 다시 보이게 하면 CSS 애니메이션이 처음부터 돈다
  requestAnimationFrame(() => { if (waiting >= 0) { placeRing(); ring.hidden = false; } });
}
// 8초 고리: 기다리는 대상(누를 것)을 둘러싼다. 대상이 여럿인 기다림(거품)은 무대 오른쪽 위 작은 고리
function placeRing() {
  const w = WAITS[waiting], B = SAY(), ring = $("ring");
  const t = $(w.target || (w.type === "say-sticker" && B ? B.target : "")) || null;
  let x = 0, y = 0, d = 0;
  if (t) {
    const h = t.querySelector(".halo");
    if (h && h.getBBox) {
      // 숨쉬는 빛(.halo)의 애니메이션 크기가 아니라 원래 크기로
      const b = h.getBBox(), m = h.parentNode.getScreenCTM();
      x = m.a * (b.x + b.width / 2) + m.c * (b.y + b.height / 2) + m.e;
      y = m.b * (b.x + b.width / 2) + m.d * (b.y + b.height / 2) + m.f;
      d = Math.max(b.width * m.a, b.height * m.d) * 1.3;
    } else {
      const r = t.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top + r.height / 2; d = Math.max(r.width, r.height) + 32;
    }
  }
  ring.classList.toggle("corner", !d);
  if (!d) { ring.style.left = ring.style.top = ring.style.width = ring.style.height = ""; return; }
  d = Math.min(Math.max(d, 96), 240);
  const k = $("kid").getBoundingClientRect();
  ring.style.width = ring.style.height = `${d}px`;
  ring.style.left = `${x - k.left - d / 2}px`; ring.style.top = `${y - k.top - d / 2}px`;
}
function clearWait() {
  waiting = -1;
  clearTimeout(waitTimer); clearTimeout(resumeTimer); resumeTok++;
  stage.classList.remove("waiting");
  $("wtag").hidden = true; $("ring").hidden = true;
}
function finishWait(auto) {
  clearWait();
  if (!auto) return play();
  const tok = resumeTok;
  resumeTimer = setTimeout(() => { if (tok === resumeTok) play(); }, 450);
}
function doAction(i) { waitMod[i].act(i); }
function autoResolve() { const i = waiting; if (i < 0) return; doAction(i); finishWait(true); }

// ---- 상호작용 모듈이 쓰는 것 ----
let api;
function makeApi() {
  return {
    $, el, chip, showEnd, finishWait, armTimer, sceneAt, sfx, lines: LINES,
    get audio() { return audio; },
    get waiting() { return waiting; },
    get scene() { return scene; },
    get endAt() { return END_AT; },
    isDone: (i) => i >= 0 && done[i],
    // "end": true인 기다림이 채워지면(누름이든 8초 자동이든) lamp-end처럼 끝 카드를 준비한다
    setDone: (i) => { if (i >= 0) { done[i] = true; if (i === END_WAIT) endReady = true; } },
    setEndReady: (on) => { endReady = on; },
    sceneIndex: (id) => SCENES.findIndex((s) => s.id === id),
    sceneEl: (k) => $(SCENES[k].id),
    // 같은 애니메이션을 다시 돌린다(클래스를 뺐다가 다음 프레임에 넣음)
    replay(node, cls) { node.classList.remove(cls); requestAnimationFrame(() => node.classList.add(cls)); },
    // 누를 것: 손가락, 마우스는 pointerdown으로 바로, 키보드는 Enter와 Space
    onTap(node, fn) {
      node.addEventListener("pointerdown", (e) => { e.preventDefault(); fn(e); });
      node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(null); } });
    },
    // 화면 좌표를 그림 좌표로. ref는 장면 svg 또는 미리 구해 둔 역행렬
    toSvg(e, ref) {
      const m = ref.getScreenCTM ? ref.getScreenCTM().inverse() : ref;
      return { x: m.a * e.clientX + m.c * e.clientY + m.e, y: m.b * e.clientX + m.d * e.clientY + m.f };
    },
  };
}

// ---- 시작 ----
function lilyMount() {
  // 설정은 JSON 데이터 블록에서 읽고, 다른 레인(gate.js, 시험)이 보도록 window.LILY_EPISODE에도 둔다
  const data = $("lily-episode");
  EP = window.LILY_EPISODE = window.LILY_EPISODE || JSON.parse(data.textContent);
  LINES = EP.lines; WAITS = EP.waits || []; SCENES = EP.scenes;
  SCENE_AT = SCENES.map((s) => s.from);
  END_WAIT = WAITS.findIndex((w) => w.end === true);
  END_AT = EP.end && EP.end.at != null ? EP.end.at
    : END_WAIT >= 0 ? WAITS[END_WAIT].at - 0.1 : LINES[LINES.length - 1][1] - 0.1;
  done = WAITS.map(() => false);
  buildShell();
  decorateSay();
  audio = $("audio"); stage = $("stage");
  for (const ev of ["pointerdown", "keydown", "scroll"]) window.addEventListener(ev, loadLater, { once: true, capture: true, passive: true });
  // 손 안내: 문지르는 장면(.hit.scrub가 있는 장면)의 손은 문지르기 손으로
  document.querySelectorAll(".scene .hand use").forEach((u) => { if (u.closest(".scene").querySelector(".hit.scrub")) u.setAttribute("href", "#hand-rub"); });

  // 대본
  rows = LINES.map(([s, e, text], k) => {
    const b = document.createElement("button");
    b.className = "line"; b.type = "button";
    b.innerHTML = `<span class="n">${k + 1}</span><span>${esc(text).replace(/\[\[(.+?)\]\]/g, "<mark>$1</mark>")}</span>`;
    b.addEventListener("click", () => { seekTo(s); suppressUntil = e + 0.3; play(); });
    $("script").appendChild(b);
    return b;
  });

  // 상호작용: 종류마다 모듈 하나가 그 종류의 기다림과 자유 놀이를 모두 맡는다
  api = makeApi();
  const byType = {};
  WAITS.forEach((w, i) => (byType[w.type] = byType[w.type] || []).push(Object.assign({}, w, { wait: i })));
  (EP.free_play || []).forEach((f) => (byType[f.type] = byType[f.type] || []).push(Object.assign({}, f, { wait: -1 })));
  for (const type in byType) {
    const make = window.LilyInteractions[type];
    if (!make) throw new Error(`릴리랑: '${type}' 상호작용 모듈을 불러오지 않았어요`);
    const m = make(api, byType[type], EP);
    mods.push(m);
    byType[type].forEach((s) => { if (s.wait >= 0) waitMod[s.wait] = m; });
  }

  // ---- 부모님 조작 ----
  $("bigPlay").addEventListener("click", () => { sfx("play"); stopAt = null; play(); });
  $("play").addEventListener("click", () => {
    if (waiting >= 0 || audio.paused) sfx("play");
    if (waiting >= 0) { doAction(waiting); finishWait(false); return drawer(false); }
    if (!audio.paused) return audio.pause();
    drawer(false);                          // 재생을 누르면 서랍을 닫고 이야기로
    if (endShown || audio.ended) return restart();
    stopAt = null; play();
  });
  $("again").addEventListener("click", () => { sfx("again"); restart(); });
  const toParent = (node) => node.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  $("toParent").addEventListener("click", () => toParent($("parent")));
  // 부모용 단추는 아이 소리보다 작은 종이 틱 하나로 묶는다
  for (const id of ["toParent", "drawerOpen", "drawerClose", "toScript", "justListen", "times3", "slow"]) $(id).addEventListener("click", () => sfx("parent"));
  $("drawerOpen").addEventListener("click", () => drawer(true));
  $("drawerClose").addEventListener("click", () => drawer(false));
  $("scrim").addEventListener("click", () => drawer(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("kid").classList.contains("drawer-open")) drawer(false); });
  $("toScript").addEventListener("click", (e) => { e.preventDefault(); drawer(false); $("scriptCard").open = true; toParent($("scriptCard")); });
  BOOK.addEventListener("change", () => drawer(false));
  drawer(false);
  $("seek").addEventListener("input", (e) => { const p = !audio.paused; seekTo(Number(e.target.value)); if (p) play(); });
  // 그냥 듣기는 기기에 기억해 둔다(양치 시간마다 틀어 두는 부모용). 저장소를 못 쓰면 꺼진 채로 시작
  try { if (localStorage.getItem("lily.justListen") === "1") { justListen = true; $("justListen").setAttribute("aria-checked", "true"); } } catch (_) {}
  $("justListen").addEventListener("click", (e) => {
    justListen = e.currentTarget.getAttribute("aria-checked") !== "true";
    e.currentTarget.setAttribute("aria-checked", String(justListen));
    try { localStorage.setItem("lily.justListen", justListen ? "1" : "0"); } catch (_) {}
    if (justListen && waiting >= 0) finishWait(false);
  });
  $("times3").addEventListener("click", (e) => {
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    e.currentTarget.setAttribute("aria-pressed", String(on)); playsLeft = on ? 2 : 0;
  });
  $("slow").addEventListener("click", (e) => {
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    e.currentTarget.setAttribute("aria-pressed", String(on)); audio.playbackRate = on ? 0.85 : 1;
  });
  document.querySelectorAll(".word").forEach((b) => b.addEventListener("click", () => {
    sfx("parent");
    if (wordBtn) wordBtn.classList.remove("on");
    wordBtn = b; b.classList.add("on");
    const [s, e] = LINES[Number(b.dataset.line)];
    seekTo(s);
    stopAt = e + 0.15; suppressUntil = e + 0.3;   // 그 줄만 듣고 멈춤, 기다림 없음
    play();
  }));

  const setPlaying = (on) => {
    // SVG에는 .hidden 속성이 없어서 속성을 직접 넣고 뺀다
    $("ic-play").toggleAttribute("hidden", on); $("ic-pause").toggleAttribute("hidden", !on);
    $("play").setAttribute("aria-label", on ? "일시정지" : "재생");
  };
  audio.addEventListener("play", () => { setPlaying(true); if (!raf) raf = requestAnimationFrame(tick); });
  audio.addEventListener("pause", () => { setPlaying(false); if (wordBtn) { wordBtn.classList.remove("on"); wordBtn = null; } });
  // 잠금화면, 이어폰 같은 바깥 조작으로 위치가 바뀌면 기다림과 장면을 그 시각에 맞춘다
  audio.addEventListener("seeking", () => { if (Math.abs(audio.currentTime - innerSeekTo) < 0.05) return; seekTo(audio.currentTime); });
  audio.addEventListener("loadedmetadata", () => { $("seek").max = audio.duration; $("dur").textContent = fmt(audio.duration); });
  // 노출이 목적이라 같은 회를 이어서 세 번까지 들려준다
  audio.addEventListener("ended", () => {
    if (playsLeft > 0) { playsLeft--; restart(); return; }
    if ($("times3").getAttribute("aria-pressed") === "true") playsLeft = 2;
    each("ended"); showEnd(true);
  });

  // 확인용: ?t=초 로 그 장면에서 멈춘 채 열기, &w=1 이면 다음 기다림 화면까지
  setScene(0);
  const q = new URLSearchParams(location.search);
  // 잠금 훅(선택): 같은 탭에서 가입하고 돌아오면 막혔던 자리부터. 숫자를 돌려주면 그 시각에서 멈춘 채 연다
  const g = window.lilyGate, back = g && typeof g.resumeAt === "function" ? g.resumeAt(EP.id) : null;
  if (!q.has("t") && typeof back === "number" && back > 0) q.set("t", back);
  if (q.has("t")) {
    const t = Number(q.get("t")) || 0;
    started = true; updateBigPlay();
    const go = () => {
      loadLater();
      seekTo(t);
      if (q.get("w") === "1") { const i = done.findIndex((d) => !d); if (i >= 0) enterWait(i); }
    };
    if (audio.readyState >= 1) go(); else { go(); audio.addEventListener("loadedmetadata", go, { once: true }); }
  }
}

// 글꼴 stylesheet는 preload로 받아 다 받으면 붙인다(그리기를 막지 않게). onload 속성은 CSP가 막아 여기서 단다
(function () {
  const f = document.getElementById("lily-fonts");
  if (!f) return;
  const on = () => { f.rel = "stylesheet"; };
  f.addEventListener("load", on, { once: true });
  window.addEventListener("load", on, { once: true });   // 이 스크립트보다 먼저 받아 버렸을 때
})();
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lilyMount, { once: true });
else lilyMount();
