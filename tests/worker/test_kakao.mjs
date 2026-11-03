// Worker 단위 시험: node tests/worker/test_kakao.mjs (Node 18+, 네트워크 없음)
import { kakaoToken } from '../../worker/kakao.js';
import worker from '../../worker/index.js';

const SITE = 'https://lilyrang.co.kr';
const ENV = { KAKAO_REST_API_KEY: 'restkey', KAKAO_CLIENT_SECRET: 'sekret' };
let pass = 0, fail = 0;
function ok(name, cond, info = '') { if (cond) pass++; else fail++; console.log(cond ? 'PASS' : 'FAIL', name, info); }

function req(method, body, origin = SITE) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  return new Request(SITE + '/api/kakao/token', { method, headers, body: method === 'GET' ? undefined : body });
}
function fakeKakao(status, payload) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, body: String(init.body) }); return new Response(JSON.stringify(payload), { status }); };
  f.calls = calls;
  return f;
}

{
  const f = fakeKakao(200, { access_token: 'AT', refresh_token: 'RT', id_token: 'ID.TOKEN.X', token_type: 'bearer' });
  const r = await kakaoToken(req('POST', JSON.stringify({ code: 'abc_DEF-123' })), ENV, f);
  const j = await r.json();
  const sent = new URLSearchParams(f.calls[0]?.body || '');
  ok('exchange: 200 with id_token only', r.status === 200 && j.id_token === 'ID.TOKEN.X' && Object.keys(j).length === 1, JSON.stringify(j));
  ok('exchange: no access or refresh token in response', !JSON.stringify(j).includes('AT') && !('access_token' in j) && !('refresh_token' in j));
  ok('exchange: posts grant, client, secret, exact redirect, code',
    f.calls[0]?.url === 'https://kauth.kakao.com/oauth/token' && sent.get('grant_type') === 'authorization_code' &&
    sent.get('client_id') === 'restkey' && sent.get('client_secret') === 'sekret' &&
    sent.get('redirect_uri') === SITE + '/join/callback/' && sent.get('code') === 'abc_DEF-123');
  ok('exchange: no-store', r.headers.get('Cache-Control') === 'no-store');
}
{
  const f = fakeKakao(200, { id_token: 'x' });
  const r = await kakaoToken(req('POST', JSON.stringify({ code: 'abc' }), 'https://evil.example'), ENV, f);
  ok('wrong Origin: 403, Kakao not called', r.status === 403 && f.calls.length === 0);
  const r2 = await kakaoToken(req('POST', JSON.stringify({ code: 'abc' }), null), ENV, f);
  ok('missing Origin: 403', r2.status === 403);
}
{
  const r = await kakaoToken(req('GET'), ENV, fakeKakao(200, {}));
  ok('GET: 405', r.status === 405);
}
for (const body of [JSON.stringify({ code: 'a b' }), JSON.stringify({ code: '' }), JSON.stringify({ code: 'x'.repeat(513) }), JSON.stringify({ code: 5 }), 'not json', JSON.stringify({ code: 'a', pad: 'x'.repeat(3000) })]) {
  const f = fakeKakao(200, { id_token: 'x' });
  const r = await kakaoToken(req('POST', body), ENV, f);
  ok('bad code or body: 400, Kakao not called', r.status === 400 && f.calls.length === 0, body.slice(0, 30));
}
{
  const r = await kakaoToken(req('POST', JSON.stringify({ code: 'abc' })), ENV, fakeKakao(400, { error: 'invalid_grant', error_description: 'secret detail' }));
  const t = await r.text();
  ok('Kakao error: 400 exchange_failed, no Kakao body echoed', r.status === 400 && t.includes('exchange_failed') && !t.includes('secret detail'));
  const r2 = await kakaoToken(req('POST', JSON.stringify({ code: 'abc' })), ENV, fakeKakao(200, { access_token: 'AT' }));
  ok('no id_token from Kakao (OIDC off): 400', r2.status === 400 && !(await r2.text()).includes('AT'));
  const r3 = await kakaoToken(req('POST', JSON.stringify({ code: 'abc' })), {}, fakeKakao(200, { id_token: 'x' }));
  ok('missing secrets: 500 not_configured', r3.status === 500 && (await r3.text()).includes('not_configured'));
  const r4 = await kakaoToken(req('POST', JSON.stringify({ code: 'abc' }), 'http://localhost:9'), { ...ENV, SITE_ORIGIN: 'http://localhost:9' }, fakeKakao(200, { id_token: 'L' }));
  ok('SITE_ORIGIN override for local test', r4.status === 200);
}
{
  const bytes = new Uint8Array(100).map((_, i) => i);
  const env = { ASSETS: { fetch: async () => new Response(bytes, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }) } };
  const r = await worker.fetch(new Request(SITE + '/daily/brush/a.mp3', { headers: { Range: 'bytes=10-19' } }), env);
  const b = new Uint8Array(await r.arrayBuffer());
  ok('range regression: 206 with exact slice', r.status === 206 && r.headers.get('Content-Range') === 'bytes 10-19/100' && b.length === 10 && b[0] === 10);
  const r2 = await worker.fetch(new Request(SITE + '/api/other'), env);
  ok('unknown /api path: 404', r2.status === 404);
}
console.log(`RESULT ${pass}/${pass + fail} ${fail ? 'FAIL' : 'PASS'}`);
process.exit(fail ? 1 : 0);
