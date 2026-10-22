# 릴리랑 가입 배포 점검표

순서대로 한다. 키와 비밀번호는 이 저장소의 어떤 파일에도 쓰지 않는다(anon 키 하나만 예외).

1. 값 넣기: 같은 Project URL(`https://<ref>.supabase.co`)을 아래 네 곳에 함께 넣는다.
   - `engine/lily-config.js`의 `supabaseUrl`, 그리고 `supabaseAnonKey`(anon 또는 publishable 키만. service role, secret 키는 절대 넣지 않음)
   - `join/index.html`, `join/callback/index.html`, `me/index.html` CSP의 `connect-src`에 있는 `https://supabase-project-ref.invalid`
   - CSP는 정확한 주소 하나로만 바꾼다. `https://*.supabase.co`나 `*`처럼 넓히지 않는다.
   - 확인: `grep -rn "supabase-project-ref.invalid" join me engine`의 결과가 0줄이어야 한다.
2. 마이그레이션 적용: `supabase/migrations/0001_init.sql`을 SQL Editor에서 실행하거나 `supabase db push`로 적용한다.
3. RLS 시험: `supabase/tests/rls.sql`을 SQL Editor에 통째로 붙여 실행한다. 한 트랜잭션 안에서 돌고 끝에 rollback 하므로 시험 사용자와 스키마는 남지 않는다. 마지막 결과가 `ALL RLS TESTS PASSED`여야 하고, 중간에 `FAIL`이 나오면 멈춘다.
4. RLS 미적용 테이블 0건: 대시보드 Table Editor의 RLS 경고가 없어야 한다. SQL로 확인하려면 아래를 실행해 0줄이어야 한다.
   `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;`
5. 리디렉트 주소는 정확히 이것만 등록한다(와일드카드와 localhost는 운영 설정에 넣지 않음).
   - Supabase, Authentication > URL Configuration: Site URL `https://lily.wspace.ai.kr`, Redirect URLs `https://lily.wspace.ai.kr/join/callback/`
   - 카카오 개발자 콘솔, 카카오 로그인 > Redirect URI: `https://<ref>.supabase.co/auth/v1/callback`
6. 카카오 동의항목: 프로필 사진(profile_image)을 "사용 안 함"으로 둔다. `privacy/index.html`의 "프로필 사진은 요청하지 않고 저장하지도 않아요." 문장은 이 설정을 전제로 한다. 프로필 사진을 받기로 바꾸면 그 문장을 지우고 수집 항목 표의 카카오 줄에 "프로필 사진 주소"를 다시 넣는다.
7. 개인정보처리방침 빈칸 채우기: `privacy/index.html`의 담당자 이름, 연락처 이메일, 시행일. Supabase 리전이 서울이 아니면 HTML 주석에 남긴 국외 이전 절도 채워 넣는다.
8. 실제 주소에서 카카오와 이메일로 가입, 로그인, 로그아웃, 탈퇴를 해 보고, 탈퇴 뒤 그 사용자의 행이 모두 0인지 확인한다.
