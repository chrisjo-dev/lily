// 랜딩 동작: 등장, 장면 탭, 칫솔 누르기(릴리 목소리와 스티커), 맛보기 표
(() => {
  // 등장은 한 번만. 관찰이 안 되면 바로 보이게
  const targets = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) targets.forEach((el) => el.classList.add('is-in'));
  else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
    targets.forEach((el) => io.observe(el));
    addEventListener('load', () => setTimeout(() => targets.forEach((el) => {
      const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in');
    }), 2500));
  }

  // 장면 탭(찾기, 터뜨리기, 말하기)
  const tabs = [...document.querySelectorAll('.tab')];
  const show = (tab) => tabs.forEach((t) => {
    const on = t === tab; t.setAttribute('aria-selected', on);
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  });
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { const n = tabs[(i + d + tabs.length) % tabs.length]; show(n); n.focus(); }
    });
  });

  // 칫솔을 누르면 릴리가 이어서 말하고, 하루 판의 이 닦기 칸에 스티커가 붙는다
  const tap = document.querySelector('.plate-tap');
  const found = document.getElementById('v-found');
  const ask = document.getElementById('v-ask');
  const bar = document.getElementById('bar-brush');
  const play = (a) => { try { a.currentTime = 0; a.play().catch(() => {}); } catch (e) { /* 소리 없이도 진행 */ } };
  tap.addEventListener('click', () => {
    tap.classList.add('is-done');
    tap.setAttribute('aria-label', '칫솔을 찾았어요. 다시 누르면 다시 들려요');
    document.querySelector('#pane-find .plate-cap').textContent = '찾았다! 비스킷이 칫솔을 물고 있었어요.';
    ask.pause(); play(found);
    bar.classList.add('has-sticker');
  });
  document.querySelector('[data-say]').addEventListener('click', () => { found.pause(); play(ask); });

  // 첫 화면을 지나면 맛보기 표를 왼쪽 아래에
  const stub = document.querySelector('.stub');
  const hero = document.querySelector('.hero');
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => stub.classList.toggle('is-on', !e.isIntersecting), { threshold: 0.05 }).observe(hero);
})();
