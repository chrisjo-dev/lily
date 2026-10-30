// say-sticker: "말했어요"를 누르면 스티커가 판으로 날아간다. 대사 차례가 오기 전에 누르면 고개를 젓는다.
// 판(free_play에 하나): { scene: "sc5", type: "say-sticker", target: "t-say", label: "say-word",
//   words: { 줄번호: "말풍선 글" }, into: "stickers", from: [x, y], slots: [[x, y], ...], images: ["스티커 그림", ...] }
// 기다림(스티커마다): { at, type: "say-sticker", sticker: 0 }  at은 따라 말할 줄이 끝나는 시각
LilyInteractions["say-sticker"] = (api, specs) => {
  const B = specs.find((s) => s.wait < 0);
  const waits = specs.filter((s) => s.wait >= 0).map((w) => {
    const ln = api.lines.find((l) => Math.abs(l[1] - w.at) < 0.01);
    return Object.assign(w, { from: ln ? ln[0] : w.at });
  });
  const earned = B.slots.map(() => false);
  const els = B.slots.map(([x, y], k) => {
    const o = api.el("g", { transform: `translate(${x} ${y})` }, api.$(B.into));
    const i = api.el("g", { class: "stk", style: `--dx:${B.from[0] - x - 31}px;--dy:${B.from[1] - y - 31}px` }, o);
    api.el("image", { "data-src": B.images[k], x: -2, y: -2, width: 66, height: 66 }, i);
    o.toggleAttribute("hidden", true);
    return o;
  });
  const keys = Object.keys(B.words || {}).map(Number).sort((a, b) => a - b);
  const render = () => els.forEach((g, k) => g.toggleAttribute("hidden", !earned[k]));
  function give(k) {
    const w = waits.find((x) => x.sticker === k);
    if (w) api.setDone(w.wait);
    if (earned[k]) return;
    earned[k] = true; render();
    api.replay(els[k].firstChild, "fly");
  }
  api.onTap(api.$(B.target), () => {
    const w = waits.find((x) => !api.isDone(x.wait));
    const ok = w && (api.waiting === w.wait || api.audio.currentTime >= w.from - 0.3);
    if (!ok) return api.replay(api.$(B.target).querySelector(".pulse"), "nope");
    // 말했어요(칼림바) 다음, 날아간 스티커가 판에 닿을 즈음(.fly 0.6초의 끝 무렵) 착
    api.sfx("said"); if (!earned[w.sticker]) api.sfx("sticker", 0.45);
    give(w.sticker);
    if (api.waiting === w.wait) api.finishWait(false);
  });
  return {
    act(i) { give(waits.find((w) => w.wait === i).sticker); },
    seek() { waits.forEach((w) => { earned[w.sticker] = api.isDone(w.wait); }); render(); },
    // 말풍선 글: 그 줄에 글이 있으면 바꾸고, 줄 사이로 옮겼으면 가장 가까운 앞 줄의 글
    line(k, j) {
      if (!keys.length) return;
      if (k >= 0) { if (B.words[k]) api.$(B.label).textContent = B.words[k]; return; }
      const c = Math.max(keys[0], Math.min(j, keys[keys.length - 1]));
      api.$(B.label).textContent = B.words[keys.filter((n) => n <= c).pop()];
    },
  };
};
