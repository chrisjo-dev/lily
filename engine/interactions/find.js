// find: 숨은 것을 찾아 누르기. 누르면 통통 튀고 흐려진다.
// 기다림: { at, type: "find", target: "t-brush", bounce: "brush1" }  (bounce는 튈 그룹 id, 없으면 target)
// 장면 마크업: <g class="tgt" id="t-brush" role="button" tabindex="0"> 안에 .halo, .pulse, 흐려질 그림은 class="art", 누르는 곳 .hit
LilyInteractions.find = (api, specs) => {
  const items = specs.map((s) => ({ s, found: false }));
  const render = (it) => api.$(it.s.target).classList.toggle("done", it.found);
  function find(it) {
    api.setDone(it.s.wait);
    api.replay(api.$(it.s.bounce || it.s.target), "bounce");
    if (it.found) return;
    it.found = true; render(it);
  }
  items.forEach((it) => api.onTap(api.$(it.s.target), () => { api.sfx("find"); find(it); if (it.s.wait >= 0 && api.waiting === it.s.wait) api.finishWait(false); }));
  return {
    act(i) { find(items.find((it) => it.s.wait === i)); },
    seek() { items.forEach((it) => { if (it.s.wait >= 0) { it.found = api.isDone(it.s.wait); render(it); } }); },
  };
};
