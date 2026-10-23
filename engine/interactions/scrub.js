// scrub: 문지르면 세균이 사라지고 글자가 떠오른다. 그 장면에 들어올 때마다 세균이 다시 생긴다.
// 자유 놀이: { scene: "sc2", type: "scrub", target: "t-scrub", brush: "brush2", home: [x, y], into: "germs", floats: "floats",
//   img: "art/L-germ.png", word: "Brush!", reach: 40, germs: [[x, y, r], ...], rest: [x, y] }
// hint(선택): [x, y, 배율] 문지르기 안내 손(engine/ui/hand-rub.webp)의 손끝 자리. 없으면 home 위, 배율은 장면 폭에 맞춤.
//   그 장면에 들어와 아직 안 문질렀을 때만 보인다
// rest(선택): 손을 떼면 brush가 가 있을 자리(얼굴을 가리지 않게 턱 아래 같은 곳). 없으면 마지막 자리에 둔다
// 기다림으로도 쓸 수 있다: { at, type: "scrub", ...위와 같음 } 세균을 다 지우면 이어짐
// 장면 마크업: 빈 <g id="germs">, <g id="floats">, target 안에 따라 움직일 <g id="brush2">와 넓은 .hit.scrub
LilyInteractions.scrub = (api, specs) => {
  const list = specs.map((s) => {
    const sc = s.wait >= 0 ? api.sceneAt(s.at) : api.sceneIndex(s.scene), svg = api.sceneEl(sc);
    const reach = s.reach == null ? 40 : s.reach;
    const germs = s.germs.map(([x, y, r]) => {
      const g = api.el("g", { class: "germ", transform: `translate(${x} ${y})` }, api.$(s.into));
      const i = api.el("g", {}, g);
      api.el("image", { "data-src": s.img, x: -r, y: -r, width: 2 * r, height: 2 * r }, i);
      return { g, x, y, r, gone: false };
    });
    const brush = api.$(s.brush), home = `translate(${s.home[0]} ${s.home[1]})`;
    // 기본 자리: brush 머리 바로 위(손등이 오른쪽으로 뻗어도 화면 밖으로 안 나가게 손끝을 조금 왼쪽에)
    const k = svg.viewBox.baseVal.width / 482 * 1.4, h = s.hint || [s.home[0] - 12 * k, s.home[1] - 40 * k, k];
    const hand = api.el("g", { class: "hand rub", transform: `translate(${h[0]} ${h[1]}) scale(${h[2]})` }, svg);
    api.el("use", { href: "#hand-rub" }, api.el("g", {}, hand));
    function reset() {
      germs.forEach((g) => { g.gone = false; g.g.classList.remove("gone"); });
      brush.setAttribute("transform", home); hand.classList.remove("off");
    }
    function floatWord(x, y) {
      const o = api.el("g", { transform: `translate(${x} ${y - 30})` }, api.$(s.floats));
      const t = api.el("text", { class: "floaty fA", "font-size": 34, "text-anchor": "middle" }, o);
      t.textContent = s.word;
      t.addEventListener("animationend", () => o.remove());
    }
    function clear(g) { g.gone = true; g.g.classList.add("gone"); floatWord(g.x, g.y); }
    function scrubAt(p) {
      hand.classList.add("off");
      brush.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      for (const g of germs) {
        if (g.gone) continue;
        const dx = g.x - p.x, dy = g.y - p.y, R = g.r + reach;
        if (dx * dx + dy * dy < R * R) clear(g);
      }
      if (s.wait >= 0 && !api.isDone(s.wait) && germs.every((g) => g.gone)) {
        api.setDone(s.wait);
        if (api.waiting === s.wait) api.finishWait(false);
      }
    }
    // 화면 좌표를 그림 좌표로: 누르는 순간 한 번만 계산해 두고 움직일 때는 곱셈만 한다
    let inv = null, scrubbing = false, movePt = null, moveRaf = 0;
    const node = api.$(s.target);
    node.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      scrubbing = true; inv = svg.getScreenCTM().inverse();
      node.setPointerCapture(e.pointerId);
      scrubAt(api.toSvg(e, inv));
    });
    node.addEventListener("pointermove", (e) => {
      if (!scrubbing) return;
      movePt = api.toSvg(e, inv);
      if (!moveRaf) moveRaf = requestAnimationFrame(() => { moveRaf = 0; if (movePt) scrubAt(movePt); });
    });
    const rest = () => { if (s.rest) brush.setAttribute("transform", `translate(${s.rest[0]} ${s.rest[1]})`); };
    const end = () => { if (scrubbing) rest(); scrubbing = false; inv = null; };
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
    node.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      const g = germs.find((x) => !x.gone);
      if (g) { scrubAt({ x: g.x, y: g.y }); rest(); }
    });
    return {
      wait: s.wait,
      act() { germs.forEach((g) => { if (!g.gone) clear(g); }); api.setDone(s.wait); },
      scene(k) { if (k === sc) reset(); },
      seek() { if (api.scene === sc) reset(); },
    };
  });
  return {
    act(i) { list.find((x) => x.wait === i).act(); },
    scene(k) { list.forEach((x) => x.scene(k)); },
    seek() { list.forEach((x) => x.seek()); },
  };
};
