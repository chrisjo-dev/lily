// 편 접근 판정(Worker 쪽). 규칙은 브라우저와 같은 src/entities/episode/access.js, 목록과 정책은 catalog.json 하나를 쓴다.
// 1단계(지금): 옛 mp3 주소 301만 한다. 차단은 꺼져 있다(shouldEnforce).
// 2단계(구독 도입 때): 등급 쿠키로 tierOf 를 채우고 페이지 전체를 판정한다(plans/series-access-spec.md 4절).
import '../src/entities/episode/access.js';
import catalog from '../src/entities/episode/catalog.json' with { type: 'json' };

const E = globalThis.LilyEpisodes;
const byId = new Map(catalog.episodes.map((e) => [e.id, e]));
const byLegacy = new Map(catalog.episodes.filter((e) => e.legacy).map((e) => [e.legacy, e]));

export const policy = catalog.policy;

// "/daily/brush/ep01.mp3" → daily/brush 편. 목록에 없으면 null
export function episodeOf(pathname) {
  const m = /^\/([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\//.exec(pathname);
  return m ? byId.get(m[1] + '/' + m[2]) || null : null;
}

// 옛 주소 "/ep01/<나머지>" → "/daily/brush/<나머지>". 해당 없으면 null(_redirects 와 같은 목록)
export function legacyPath(pathname) {
  const m = /^\/(ep[0-9]{2})(\/.*)?$/.exec(pathname);
  const ep = m && byLegacy.get(m[1]);
  return ep ? '/' + ep.id + (m[2] && m[2] !== '/' ? m[2] : '/') : null;
}

// 차단은 스위치와 쿠키 서명 키가 둘 다 있을 때만 켠다. 스위치만 실수로 켜도 키가 없으면 지금처럼 다 준다
export function shouldEnforce(env) {
  return !!env && env.ENFORCE_ACCESS === '1' && !!env.ENT_COOKIE_KEY;
}

// 요청의 등급. 1단계에는 쿠키가 없으므로 null(모름)이고, 모르면 막지 않는다
export function tierOf(/* request, env */) {
  return null;
}

// 편 전체를 줄 수 있나(브라우저와 같은 규칙)
export function canListen(ep, tier) {
  return E.canListen(ep, tier, policy);
}

// 이 요청을 막아야 하나. 막을 때만 true
export function blocked(request, env, pathname) {
  if (!shouldEnforce(env)) return false;
  const ep = episodeOf(pathname);
  if (!ep) return false;
  const tier = tierOf(request, env);
  if (tier === null) return false;
  return !canListen(ep, tier);
}
