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
const capHTML = (s) => esc(plain(s)).replace(/[A-Za-z][A-Za-z'\-]*(?:[ ,.!?]*[A-Za-z][A-Za-z'\-]*)*[.!?,]*/g, (m) => `<span class="en">${m}</span>`);
function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  // style 속성은 CSP가 막으므로 CSSOM으로 넣는다
  for (const k in attrs) k === "style" ? (n.style.cssText = attrs[k]) : n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
const PLAY_PATH = "M6.5 4.3v11.4a.8.8 0 0 0 1.2.7l9.2-5.7a.8.8 0 0 0 0-1.4L7.7 3.6a.8.8 0 0 0-1.2.7z";
// 4~7세가 찾고 누를 시간. 고리 애니메이션(.ring, 4s + 4s)과 같이 바꾼다
const AUTO_MS = 8000;

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

// ---- 셸: 머리줄, 무대 위 조각, 자막, 조작 줄, 부모님 화면 ----
function buildShell() {
  const st = $("stage"), end = EP.end || {}, ws = EP.worksheet;
  document.body.insertAdjacentHTML("afterbegin", `<svg class="sprite" width="0" height="0" aria-hidden="true">
  <g id="hand-shape">
    <ellipse class="fK sI" stroke-width="1.5" cx="0" cy="12" rx="10" ry="14"/>
    <rect class="fK sI" stroke-width="1" x="-6" y="0" width="7" height="12" rx="3"/>
    <rect class="fK sI" stroke-width="1" x="1" y="-2" width="7" height="14" rx="3"/>
  </g></svg>`);
  const kid = document.createElement("div");
  kid.className = "kid"; kid.id = "kid";
  // 아이가 누르고 문지를 때 선택, 길게 누르기 메뉴, 그림 끌기가 생기지 않게(CSS만으로는 안드로이드와 SVG 그림이 남는다)
  for (const ev of ["selectstart", "contextmenu", "dragstart"]) kid.addEventListener(ev, (e) => e.preventDefault());
  st.before(kid);
  kid.innerHTML = `<header class="top">
    <div class="brand">
      <a class="logo" href="/"><img src="/brand/emblem.png" width="52" height="40" alt="">릴리랑</a>
      <h1>${esc(EP.title)}</h1>
    </div>
    <div class="dots" id="dots" role="img" aria-label="장면 시작 전">${"<i></i>".repeat(SCENES.length - 1)}</div>
    <button class="sw" id="justListen" type="button" role="switch" aria-checked="false"><span>그냥 듣기</span><span class="trk"><span class="thm"></span></span></button>
  </header>`;
  kid.appendChild(st);
  st.insertAdjacentHTML("beforeend", `<span class="chip" id="chip" hidden></span>
    <div class="ring" id="ring" hidden aria-hidden="true"><span class="h r"><i></i></span><span class="h l"><i></i></span></div>
    <button class="big-play" id="bigPlay" type="button" aria-label="이야기 듣기 시작">
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="${PLAY_PATH}"/></svg>
    </button>
    <div class="endcard" id="endcard" hidden>
      <p class="gn">${esc(end.title || "Good night!")}</p>
      ${end.stickers ? `<p class="sm">${esc(end.sub || "오늘 모은 스티커")}</p>
      <div class="estk">${end.stickers.map((s) => `<span><img data-src="${esc(s.img)}" alt="" width="52" height="52">${esc(s.label)}</span>`).join("")}</div>` : ""}
      <div class="ebtn">
        <button class="eb y" id="again" type="button">한 번 더 듣기</button>
        <button class="eb o" id="toParent" type="button">부모님 화면</button>
      </div>
    </div>`);
  kid.insertAdjacentHTML("beforeend", `<div class="cap" id="cap">
    <span class="wtag" id="wtag" hidden><i></i>릴리가 기다려요</span>
    <p id="capText" aria-live="polite">노란 동그라미를 누르면 릴리 이야기가 시작돼요.</p>
  </div>
  <div class="ctl">
    <div class="row">
      <button class="pp" id="play" type="button" aria-label="재생">
        <svg id="ic-play" viewBox="0 0 20 20" fill="currentColor"><path d="${PLAY_PATH}"/></svg>
        <svg id="ic-pause" viewBox="0 0 20 20" fill="currentColor" hidden><rect x="5" y="4" width="3.6" height="12" rx="1.2"/><rect x="11.4" y="4" width="3.6" height="12" rx="1.2"/></svg>
      </button>
      <span class="time" id="cur">0:00</span>
      <input id="seek" type="range" min="0" max="${EP.duration}" step="0.1" value="0" aria-label="재생 위치">
      <span class="time" id="dur">${fmt(EP.duration)}</span>
    </div>
    <div class="row2">
      <button class="tool" id="times3" type="button" aria-pressed="false">3번 이어 듣기</button>
      <button class="tool" id="slow" type="button" aria-pressed="false">조금 천천히</button>
    </div>
  </div>
  <div class="hintrow">
    <a href="#parent">아래로 내리면 부모님 화면 <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4 l4 4 l4 -4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></a>
  </div>
  <audio id="audio" src="${esc(EP.audio)}" preload="metadata"></audio>`);

  // 학습지는 설정에 worksheet가 있을 때만. 없으면 학습지 칸, 학습지 칩, 학습지 팁을 모두 뺀다
  const icon = (i) => i.startsWith("#") ? `<svg aria-hidden="true"><use href="${esc(i)}"/></svg>` : `<img src="${esc(i)}" alt="" width="64" height="54">`;
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
    ${(EP.tips || []).map(tip).join("")}
  </section>
  <details class="card">
    <summary><span><span class="t">대본 보기</span><span class="s">부모님용, 줄을 누르면 그 부분부터 들려요</span></span>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7.5l5 5 5-5"/></svg></summary>
    <div class="script" id="script"></div>
  </details>
  <p class="maker"><a href="https://read.wspace.ai.kr/">릴리랑은 매일 외국어 읽기가 만들어요</a></p>
  <footer class="site-footer"><a href="https://www.wspace.ai.kr/">wspace 홈</a><a href="https://www.wspace.ai.kr/about/">소개</a><a href="https://www.wspace.ai.kr/privacy/">개인정보처리방침</a><a href="https://www.wspace.ai.kr/contact/">연락처</a></footer>
</main>`);
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
    if (j >= 0) $("capText").innerHTML = capHTML(LINES[j][2]);
    each("line", -1, j);
    return;
  }
  rows[k].classList.add("now");
  $("capText").innerHTML = capHTML(LINES[k][2]);
  each("line", k, k);
}
function setTime(t) {
  $("seek").value = t;
  const sec = Math.floor(t);
  if (sec !== lastSec) { lastSec = sec; $("cur").textContent = fmt(t); }
}
function showEnd(on) {
  endShown = on; $("endcard").hidden = !on;
  updateBigPlay();
}
function updateBigPlay() { $("bigPlay").hidden = started || endShown; }

// ---- 재생 ----
function play() {
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
  waiting = i;
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
  requestAnimationFrame(() => { if (waiting >= 0) ring.hidden = false; });
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
    $, el, chip, showEnd, finishWait, armTimer, sceneAt, lines: LINES,
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
  audio = $("audio"); stage = $("stage");

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
  $("bigPlay").addEventListener("click", () => { stopAt = null; play(); });
  $("play").addEventListener("click", () => {
    if (waiting >= 0) { doAction(waiting); finishWait(false); return; }
    if (!audio.paused) return audio.pause();
    if (endShown || audio.ended) return restart();
    stopAt = null; play();
  });
  $("again").addEventListener("click", restart);
  $("toParent").addEventListener("click", () => $("parent").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
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
