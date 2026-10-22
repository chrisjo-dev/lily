// tap-sparkle: 누른 곳에 별이 반짝인다. 키보드로 누르면 keyArea 안 아무 곳에.
// 자유 놀이: { scene: "sc4", type: "tap-sparkle", target: "t-teeth", into: "sparks", keyArea: [x, y, 너비] }
// 기다림으로도 쓸 수 있다: { at, type: "tap-sparkle", ...위와 같음 } 한 번 누르면 이어짐
// 장면 마크업: <g class="tgt" id="t-teeth" ...> 안에 .halo, .pulse, .hit, 별이 들어갈 빈 <g id="sparks">
LilyInteractions["tap-sparkle"] = (api, specs) => {
  const list = specs.map((s) => {
    const svg = api.sceneEl(s.wait >= 0 ? api.sceneAt(s.at) : api.sceneIndex(s.scene));
    const keyAt = () => ({ x: s.keyArea[0] + Math.random() * s.keyArea[2], y: s.keyArea[1] });
    function sparkle(x, y) {
      const o = api.el("g", { transform: `translate(${x} ${y})` }, api.$(s.into));
      const p = api.el("path", { class: "spark fT sE", "stroke-width": 1.2, d: "M0 -16 L4 -4 L16 0 L4 4 L0 16 L-4 4 L-16 0 L-4 -4 Z" }, o);
      p.addEventListener("animationend", () => o.remove());
    }
    function burst(p) { sparkle(p.x, p.y); sparkle(p.x + 26, p.y - 22); sparkle(p.x - 24, p.y - 14); }
    api.onTap(api.$(s.target), (e) => {
      burst(e ? api.toSvg(e, svg) : keyAt());
      if (s.wait >= 0) { api.setDone(s.wait); if (api.waiting === s.wait) api.finishWait(false); }
    });
    return { wait: s.wait, act() { burst(keyAt()); api.setDone(s.wait); } };
  });
  return { act(i) { list.find((x) => x.wait === i).act(); } };
};
