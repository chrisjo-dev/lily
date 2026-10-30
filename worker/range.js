// 정적 자산은 Range 요청에도 200 전체를 돌려준다. 오디오 되감기와 iOS Safari 재생에는 206이 필요해서 mp3만 여기서 잘라 준다.
export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 200) return res;
    const headers = new Headers(res.headers);
    headers.set('Accept-Ranges', 'bytes');
    const m = /^bytes=(\d*)-(\d*)$/.exec((request.headers.get('Range') || '').trim());
    if (!m || (m[1] === '' && m[2] === '')) return new Response(res.body, { status: 200, headers });

    const buf = await res.arrayBuffer();
    const size = buf.byteLength;
    let start, end;
    if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
    else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(buf.slice(start, end + 1), { status: 206, headers });
  },
};
