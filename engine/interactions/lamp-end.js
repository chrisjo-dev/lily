// lamp-end: 불을 끄면 장면이 어두워지고 끝 카드가 나온다. 소리가 끝나도 저절로 꺼진다.
// 기다림: { at, type: "lamp-end", target: "t-lamp" }
// 장면 마크업: target 안에 켠 그림 .lamp-on-img, 끈 그림 .lamp-off-img, 장면 맨 위에 어둡게 할 <rect class="dim fI">
LilyInteractions["lamp-end"] = (api, specs) => {
  const s = specs[0], scEl = api.sceneEl(api.sceneAt(s.at));
  let off = false;
  const render = () => { api.$(s.target).classList.toggle("done", off); scEl.classList.toggle("lamp-off", off); api.setEndReady(off); };
  function turnOff() { off = true; api.setDone(s.wait); render(); }
  api.onTap(api.$(s.target), () => {
    turnOff();
    if (api.waiting === s.wait) api.finishWait(false);
    else if (api.audio.paused && api.audio.currentTime >= api.endAt) api.showEnd(true);
  });
  return {
    act: turnOff,
    ended: turnOff,
    seek() { off = api.isDone(s.wait); render(); },
  };
};
