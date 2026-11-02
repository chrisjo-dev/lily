// 카카오 로그인 코드를 id_token 으로 바꿔 준다. Client Secret 이 필요한 단계라 브라우저 대신 여기서 한다.
// 돌려주는 것은 id_token 하나뿐이다(access/refresh 토큰은 버린다). 세션은 브라우저가 Supabase signInWithIdToken 으로 만든다.
// 비밀값: wrangler secret put KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET. 저장소에는 넣지 않는다.
const TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const SITE = 'https://lilyrang.co.kr';
const MAX_BODY = 2048;
const CODE_RE = /^[A-Za-z0-9_-]{1,512}$/;

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function kakaoToken(request, env, fetchImpl = fetch) {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const origin = env.SITE_ORIGIN || SITE;
  if (request.headers.get('Origin') !== origin) return json(403, { error: 'forbidden' });
  if (!env.KAKAO_REST_API_KEY || !env.KAKAO_CLIENT_SECRET) return json(500, { error: 'not_configured' });

  const text = await request.text();
  if (text.length > MAX_BODY) return json(400, { error: 'bad_request' });
  let code;
  try { code = JSON.parse(text).code; } catch { return json(400, { error: 'bad_request' }); }
  if (typeof code !== 'string' || !CODE_RE.test(code)) return json(400, { error: 'bad_request' });

  let res;
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: env.KAKAO_REST_API_KEY,
        client_secret: env.KAKAO_CLIENT_SECRET,
        redirect_uri: origin + '/join/callback/',
        code,
      }),
    });
  } catch { return json(400, { error: 'exchange_failed' }); }
  if (!res.ok) return json(400, { error: 'exchange_failed' });
  let data;
  try { data = await res.json(); } catch { return json(400, { error: 'exchange_failed' }); }
  if (!data || typeof data.id_token !== 'string' || !data.id_token) return json(400, { error: 'exchange_failed' });
  return json(200, { id_token: data.id_token });
}
