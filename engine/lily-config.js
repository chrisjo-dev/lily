// 릴리랑 Supabase 연결 값. 빈 값이면 가입 기능은 "준비 중"으로 동작한다(누구나 비회원).
// 여기에는 Project URL과 anon(public) 키만 넣는다. anon 키는 공개돼도 되는 키이고, 데이터는 RLS가 막는다.
// service role 키는 이 파일을 포함해 어떤 파일에도 넣지 않는다.
// 값을 넣을 때 join/, join/callback/, me/ 의 CSP meta에 있는 https://supabase-project-ref.invalid 도 같은 주소로 바꾼다.
window.LILY_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };
