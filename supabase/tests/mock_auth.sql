-- 로컬 시험용: 맨 postgres 이미지에 Supabase의 auth 부분만 흉내 낸다. 운영에는 쓰지 않는다.
-- anon, authenticated 역할, auth.users, auth.uid() (request.jwt.claim.sub 를 읽음).
create role anon nologin noinherit;
create role authenticated nologin noinherit;
grant anon, authenticated to postgres;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Supabase 기본 권한 흉내: public 새 테이블에 anon, authenticated 전체 권한(마이그레이션이 거둬야 함)
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
