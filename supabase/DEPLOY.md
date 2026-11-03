# 릴리랑 가입 배포 점검표

순서대로 한다. 키와 비밀번호는 이 저장소의 어떤 파일에도 쓰지 않는다(anon 키 하나만 예외).

1. 값 넣기: 같은 Project URL(`https://<ref>.supabase.co`)을 아래 네 곳에 함께 넣는다.
   - `src/shared/config/lily-config.js`의 `supabaseUrl`, 그리고 `supabaseAnonKey`(anon 또는 publishable 키만. service role, secret 키는 절대 넣지 않음)
   - `join/index.html`, `join/callback/index.html`, `me/index.html`, 편 페이지(`<시리즈>/<편>/index.html`) CSP의 `connect-src`에 있는 `https://supabase-project-ref.invalid`
   - CSP는 정확한 주소 하나로만 바꾼다. `https://*.supabase.co`나 `*`처럼 넓히지 않는다.
   - 확인: `grep -rn "supabase-project-ref.invalid" join me daily src --include=*.html`의 결과가 0줄이어야 한다.
2. 마이그레이션 적용: `supabase/migrations/0001_init.sql`을 SQL Editor에서 실행하거나 `supabase db push`로 적용한다.
   - `0002_series.sql`(편 ID `ep01` → `daily/brush`)은 시리즈 주소 배포 **직전에, 바로 이어 배포한다**(코드를 먼저 내면 옛 검사 규칙이 새 ID 기록을 거부한다). 적용 전에 `progress`, `events`를 CSV로 내려받아 둔다. 되돌리기는 `0002_series_down.sql`. 로컬 확인은 `bash supabase/tests/run-local.sh`(변환, 되돌리기, 다시 적용까지 시험). 설계 `lilyrang/plans/series-access-spec.md` 5절, 8절.
3. RLS 시험: `supabase/tests/rls.sql`을 SQL Editor에 통째로 붙여 실행한다. 한 트랜잭션 안에서 돌고 끝에 rollback 하므로 시험 사용자와 스키마는 남지 않는다. 마지막 결과가 `ALL RLS TESTS PASSED`여야 하고, 중간에 `FAIL`이 나오면 멈춘다.
4. RLS 미적용 테이블 0건: 대시보드 Table Editor의 RLS 경고가 없어야 한다. SQL로 확인하려면 아래를 실행해 0줄이어야 한다.
   `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;`
5. 로그인은 카카오 하나뿐이다(이메일 로그인 없음). Supabase의 카카오 OAuth는 이메일과 프로필 사진을 늘 함께 요청해서 쓰지 않고, 가입 화면이 카카오 OpenID Connect를 직접 시작한 뒤 콜백이 Worker(`/api/kakao/token`)로 id_token을 받아 `signInWithIdToken`으로 세션을 만든다.
   - Supabase, Authentication > URL Configuration: Site URL `https://lilyrang.co.kr`, Redirect URLs `https://lilyrang.co.kr/join/callback/`
   - Supabase, Providers: Kakao 켬(REST API 키를 Client ID로, id_token의 aud 확인에 쓰임), `external_kakao_email_optional` 켬, Email provider 끔.
   - 카카오 개발자 콘솔, 카카오 로그인: OpenID Connect 활성화, Redirect URI `https://lilyrang.co.kr/join/callback/`(와일드카드와 localhost는 넣지 않음).
   - Worker 비밀값: `npx wrangler secret put KAKAO_REST_API_KEY`, `npx wrangler secret put KAKAO_CLIENT_SECRET`. 저장소에는 넣지 않는다. `src/shared/config/lily-config.js`의 `kakaoClientId`는 같은 REST API 키(인가 주소에 실리는 공개값)다.
6. 카카오 동의항목: 닉네임(profile_nickname)만 필수 동의. 요청 scope는 `openid profile_nickname` 둘뿐이라 이메일과 프로필 사진은 받지 않는다. `privacy/index.html`의 "카카오 회원번호, 닉네임" 줄과 "프로필 사진과 카카오 계정 이메일은 요청하지 않고" 문장은 이 설정을 전제로 한다.
7. 개인정보처리방침 빈칸 채우기: `privacy/index.html`의 담당자 이름, 연락처 이메일, 시행일. Supabase 리전이 서울이 아니면 HTML 주석에 남긴 국외 이전 절도 채워 넣는다.
8. 실제 주소에서 카카오로 가입, 로그인, 로그아웃, 탈퇴를 해 보고, 탈퇴 뒤 그 사용자의 행이 모두 0인지 확인한다.
