// 릴리랑 Supabase 연결 값. 빈 값이면 가입 기능은 "준비 중"으로 동작한다(누구나 비회원).
// 여기에는 Project URL과 anon(public) 키만 넣는다. anon 키는 공개돼도 되는 키이고, 데이터는 RLS가 막는다.
// service role 키는 이 파일을 포함해 어떤 파일에도 넣지 않는다.
// 값을 넣을 때 join/, join/callback/, me/, 편(<시리즈>/<편>/) 의 CSP meta에 있는 https://supabase-project-ref.invalid 도 같은 주소로 바꾼다.
// kakaoClientId 는 카카오 REST API 키다. 로그인 인가 주소에 그대로 실리는 공개값이라 여기 둔다. Client Secret 은 Worker 비밀값에만 둔다.
window.LILY_CONFIG = { supabaseUrl: "https://dtkgflrpeipvxxzszcky.supabase.co", supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0a2dmbHJwZWlwdnh4enN6Y2t5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NTEyNDUsImV4cCI6MjEwOTEyNzI0NX0.Dy86Doqvr12P5mCnaiTebU1uZpOA1yZYG0y88MF1bBI", kakaoClientId: "8e9550bc22643348af5cfcc1a407690d" };
