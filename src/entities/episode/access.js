// 편을 누가 끝까지 들을 수 있나(entities/episode). 브라우저(잠금 카드)와 Worker(worker/access.js)가 이 파일 하나를 같이 쓴다.
// - 브라우저: <script defer>로 불러 window.LilyEpisodes 에 판정 함수를 붙인다(catalog.js 가 같은 객체에 목록을 붙인다).
// - Worker: import '../src/entities/episode/access.js' 로 globalThis.LilyEpisodes 를 채운다. DOM을 쓰지 않는다.
// 정책 값은 catalog.json 의 policy 한 곳에서 바꾼다. locked: 무료가 아닌 편을 끝까지 듣는 데 필요한 등급, preview: 무료가 아닌 편의 앞부분(previewUntil) 미리듣기를 둘지.
(function (g) {
  "use strict";

  var E = g.LilyEpisodes = g.LilyEpisodes || {};
  var RANK = { guest: 0, member: 1, subscriber: 2 };
  var DEFAULT_POLICY = { locked: "member", preview: true };

  // 편 ID = 주소 경로 "<시리즈>/<편>". supabase/migrations/0002_series.sql 의 검사 규칙, entities/session 의 EPISODE_RE 와 같은 식
  E.ID_RE = /^[a-z][a-z0-9-]{0,23}\/[a-z][a-z0-9-]{0,31}$/;
  // 옛 편 ID(ep01 ~). 주소 이동과 DB 전환 기간에만 쓴다
  E.LEGACY_RE = /^ep[0-9]{2}$/;
  E.DEFAULT_POLICY = DEFAULT_POLICY;

  function rank(tier) { return Object.prototype.hasOwnProperty.call(RANK, tier) ? RANK[tier] : 0; }

  function policyOf(p) {
    p = p || {};
    return {
      locked: Object.prototype.hasOwnProperty.call(RANK, p.locked) ? p.locked : DEFAULT_POLICY.locked,
      preview: p.preview !== false
    };
  }

  // 편 전체를 들을 수 있나. 모르는 편은 막는다. tier: "guest" | "member" | "subscriber"
  E.canListen = function (ep, tier, policy) {
    if (!ep) return false;
    if (ep.free === true) return true;
    return rank(tier) >= rank(policyOf(policy).locked);
  };

  // 끝까지 못 들을 때 앞부분 미리듣기를 주나
  E.previewOn = function (policy) { return policyOf(policy).preview; };

  E.policyOf = policyOf;
})(typeof globalThis !== "undefined" ? globalThis : this);
