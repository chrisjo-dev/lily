// 잠금 훅 기본 구현: 항상 허용. 실제 잠금(engine/gate.js)이 먼저 불렸으면 그대로 둔다.
// 엔진은 재생 중 매 프레임 canPlayPast(t, episode)를 묻고, false면 멈춘 뒤 onBlocked(t, episode, resume)를 부른다.
window.lilyGate = window.lilyGate || {
  canPlayPast: function () { return true; },
  onBlocked: function (t, episode, resume) { resume(); },
};
