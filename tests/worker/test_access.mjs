// 접근 판정 단위 시험: node tests/worker/test_access.mjs (Node 22+, 네트워크 없음)
// 브라우저와 Worker가 같이 쓰는 src/entities/episode/access.js 의 규칙, catalog.json 정책, Worker의 옛 주소 301과 차단 스위치를 본다.
import '../../src/entities/episode/access.js';
import catalog from '../../src/entities/episode/catalog.json' with { type: 'json' };
import worker from '../../worker/index.js';
import { episodeOf, legacyPath, shouldEnforce, blocked } from '../../worker/access.js';

const SITE = 'https://lilyrang.co.kr';
const E = globalThis.LilyEpisodes;
let pass = 0, fail = 0;
function ok(name, cond, info = '') { if (cond) pass++; else fail++; console.log(cond ? 'PASS' : 'FAIL', name, info); }

const free = catalog.episodes.find((e) => e.free === true);
const locked = catalog.episodes.find((e) => e.free !== true);

// 1. 정책 표(1단계 지금 값과 2단계 값). 무료 편은 언제나, 그 외는 locked 등급 이상
const now = { locked: 'member', preview: true };
const later = { locked: 'subscriber', preview: false };
const table = [
  [free, 'guest', now, true], [free, 'member', now, true], [free, 'subscriber', now, true],
  [locked, 'guest', now, false], [locked, 'member', now, true], [locked, 'subscriber', now, true],
  [locked, 'guest', later, false], [locked, 'member', later, false], [locked, 'subscriber', later, true],
  [free, 'guest', later, true],
];
for (const [ep, tier, pol, want] of table) ok(`canListen ${ep.id} ${tier} locked=${pol.locked}`, E.canListen(ep, tier, pol) === want);
ok('unknown tier counts as guest', E.canListen(locked, 'admin', now) === false);
ok('unknown episode is not listenable', E.canListen(null, 'subscriber', now) === false);
ok('bad policy falls back to member', E.canListen(locked, 'member', { locked: 'nope' }) === true && E.canListen(locked, 'guest', { locked: 'nope' }) === false);
ok('preview on now, off later', E.previewOn(now) === true && E.previewOn(later) === false && E.previewOn(undefined) === true);
ok('catalog policy is phase 1 (member, preview)', catalog.policy.locked === 'member' && catalog.policy.preview === true);

// 2. 편 ID 형식
ok('ID_RE accepts series/slug', catalog.episodes.every((e) => E.ID_RE.test(e.id) && e.id === e.series + '/' + e.slug));
ok('ID_RE rejects old and unsafe ids', ['ep01', 'daily', 'daily/', '/daily/brush', 'Daily/brush', 'daily/brush/x', 'daily\\brush', '<img src=x>'].every((s) => !E.ID_RE.test(s)));
ok('LEGACY_RE only old ids', E.LEGACY_RE.test('ep07') && !E.LEGACY_RE.test('daily/brush'));

// 3. Worker 경로
ok('episodeOf mp3 path', episodeOf('/daily/brush/ep01.mp3')?.id === 'daily/brush' && episodeOf('/daily/nope/a.mp3') === null && episodeOf('/src/x.mp3') === null);
ok('legacyPath maps every legacy id', catalog.episodes.filter((e) => e.legacy).every((e) => legacyPath('/' + e.legacy + '/x.mp3') === '/' + e.id + '/x.mp3'));
ok('legacyPath bare and slash', legacyPath('/ep01') === '/daily/brush/' && legacyPath('/ep01/') === '/daily/brush/' && legacyPath('/ep99/a.mp3') === null && legacyPath('/daily/brush/a.mp3') === null);

// 4. 차단 스위치: 1단계는 꺼짐. 스위치만 켜고 키가 없으면 여전히 꺼짐. 둘 다 있어도 1단계는 등급을 모르므로 막지 않음
const rq = new Request(SITE + '/daily/wake/ep02.mp3');
ok('switch off by default', shouldEnforce({}) === false && blocked(rq, {}, '/daily/wake/ep02.mp3') === false);
ok('switch on without key stays off', shouldEnforce({ ENFORCE_ACCESS: '1' }) === false);
ok('switch on with key: enforce, but phase 1 tier unknown so not blocked', shouldEnforce({ ENFORCE_ACCESS: '1', ENT_COOKIE_KEY: 'k' }) === true && blocked(rq, { ENFORCE_ACCESS: '1', ENT_COOKIE_KEY: 'k' }, '/daily/wake/ep02.mp3') === false);

// 5. Worker 응답
{
  const bytes = new Uint8Array(50).map((_, i) => i);
  const seen = [];
  const env = { ASSETS: { fetch: async (r) => { seen.push(new URL(r.url).pathname); return new Response(bytes, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }); } } };
  const r1 = await worker.fetch(new Request(SITE + '/ep02/ep02.mp3?v=1'), env);
  ok('old mp3: 301 to new path with query', r1.status === 301 && r1.headers.get('Location') === SITE + '/daily/wake/ep02.mp3?v=1', r1.headers.get('Location'));
  const r2 = await worker.fetch(new Request(SITE + '/daily/wake/ep02.mp3', { headers: { Range: 'bytes=0-9' } }), env);
  ok('locked mp3 with switch off: 206 as before', r2.status === 206 && seen.at(-1) === '/daily/wake/ep02.mp3');
  const r3 = await worker.fetch(new Request(SITE + '/daily/wake/ep02.mp3'), { ...env, ENFORCE_ACCESS: '1' });
  ok('switch on without key: still served', r3.status === 200);
}
console.log(`RESULT ${pass}/${pass + fail} ${fail ? 'FAIL' : 'PASS'}`);
process.exit(fail ? 1 : 0);
