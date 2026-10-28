// pop: 거품 터뜨리기. 다 터뜨리면 이어지고, 하나씩 누를 때마다 자동 진행 시간이 다시 찬다.
// 기다림: { at, type: "pop", into: "bubs", img: "art/L-bubble.png", bubbles: [[x, y, r], ...], word: "Pop!" }
// word(선택)가 있으면 터질 때 그 글자를 띄운다. 없으면 물방울 그림만
// 장면 마크업: 거품이 들어갈 빈 <g id="bubs"></g>. 그 장면에 있는 동안 칩에 "터뜨린 수/전체"를 보인다
LilyInteractions.pop = (api, specs) => {
  const groups = specs.map((s) => {
    const G = { s, sc: api.sceneAt(s.at), popped: s.bubbles.map(() => false) };
    G.els = s.bubbles.map(([x, y, r], k) => {
      const g = api.el("g", { class: "tgt bub", transform: `translate(${x} ${y})`, role: "button", tabindex: 0, "aria-label": s.label || "거품 터뜨리기" }, api.$(s.into));
      const bob = api.el("g", { class: "bob", style: `animation-delay:${-k * 0.7}s` }, g);
      api.el("circle", { class: "halo", r: r + 10 }, bob);
      api.el("image", { "data-src": s.img, x: -r * 1.095, y: -r * 1.095, width: r * 2.19, height: r * 2.19 }, bob);
      const burst = api.el("g", { class: "burst" }, g);
      const R = r + 14;   // 물방울 터짐 그림(engine/ui/pop.webp, sprite의 #ui-pop)을 예전 터짐 선 끝까지
      api.el("use", { href: "#ui-pop", x: -R, y: -R, width: 2 * R, height: 2 * R }, burst);
      if (s.word) api.el("text", { class: "fA", y: 7, "font-size": 20, "text-anchor": "middle" }, burst).textContent = s.word;
      api.el("circle", { r: Math.max(8, r), class: "hit" }, g);
      api.onTap(g, () => popOne(G, k));
      return g;
    });
    return G;
  });
  function render(G) {
    G.els.forEach((g, k) => g.classList.toggle("popped", G.popped[k]));
    if (api.scene === G.sc) api.chip(`${G.popped.filter(Boolean).length}/${G.popped.length}`);
  }
  function popOne(G, k) {
    if (G.popped[k]) return;
    G.popped[k] = true; render(G); api.sfx("pop");
    const all = G.popped.every(Boolean);
    if (all) api.setDone(G.s.wait);
    if (api.waiting === G.s.wait) all ? api.finishWait(false) : api.armTimer();
  }
  function popAll(G) {
    G.popped.forEach((p, k) => { if (!p) setTimeout(() => { G.popped[k] = true; render(G); }, k * 80); });
    api.setDone(G.s.wait);
  }
  return {
    act(i) { popAll(groups.find((G) => G.s.wait === i)); },
    scene(s) { for (const G of groups) if (s === G.sc && !api.isDone(G.s.wait)) { G.popped.fill(false); render(G); } },
    seek() { for (const G of groups) { G.popped.fill(api.isDone(G.s.wait)); render(G); } },
  };
};
