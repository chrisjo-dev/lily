// 릴리랑 Worker 입구. run_worker_first 로 들어온 요청만 여기 온다(mp3, /api/*). 나머지 정적 자산은 Worker를 거치지 않는다.
import { serveAsset } from './range.js';
import { kakaoToken } from './kakao.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/kakao/token') return kakaoToken(request, env);
    if (pathname.startsWith('/api/')) return new Response('Not Found', { status: 404 });
    return serveAsset(request, env);
  },
};
