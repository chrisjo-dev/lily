// 릴리랑 Worker 입구. run_worker_first 로 들어온 요청만 여기 온다(mp3, /api/*). 나머지 정적 자산은 Worker를 거치지 않는다.
import { serveAsset } from './range.js';
import { kakaoToken } from './kakao.js';
import { legacyPath, blocked } from './access.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === '/api/kakao/token') return kakaoToken(request, env);
    if (pathname.startsWith('/api/')) return new Response('Not Found', { status: 404 });
    // 옛 편 주소의 mp3(/ep01/ep01.mp3)는 _redirects 대신 여기서 넘긴다(쿼리 유지)
    const moved = legacyPath(pathname);
    if (moved) return Response.redirect(new URL(moved + url.search, url).toString(), 301);
    if (blocked(request, env, pathname)) return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    return serveAsset(request, env);
  },
};
