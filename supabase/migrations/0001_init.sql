-- 릴리랑 가입과 맛보기: 첫 스키마
-- 원칙
--   1. 모든 테이블 RLS. 정책은 authenticated 역할과 auth.uid() = user_id 로만.
--   2. 클라이언트에는 anon 키만 둔다. service role 키는 어디에도 쓰지 않는다.
--   3. 아이 정보는 나이대('4-5', '6-7')만. IP와 기기 정보는 저장하지 않는다.
--   4. 권한(GRANT)은 필요한 것만 주고, 정책은 그 위에 한 겹 더 막는다.

-- 이벤트 이름 목록(이 밖은 거부). 바꿀 때는 engine/auth.js 의 EVENTS 도 같이 바꾼다.
create or replace function public.lily_event_name_ok(n text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select n in ('signup', 'login', 'logout', 'delete_account',
               'episode_start', 'episode_complete', 'gate_shown', 'gate_join_click');
$$;

-- 테이블 ---------------------------------------------------------------

create table public.profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  nickname         text check (nickname is null or char_length(nickname) between 1 and 20),
  child_age_band   text check (child_age_band is null or child_age_band in ('4-5', '6-7')),
  marketing_opt_in boolean not null default false,
  created_at       timestamptz not null default now()
);

create table public.progress (
  user_id      uuid not null references auth.users (id) on delete cascade,
  episode      text not null check (episode ~ '^ep[0-9]{2}$'),
  completed_at timestamptz,
  taps         integer not null default 0 check (taps >= 0),
  primary key (user_id, episode)
);

create table public.events (
  id      bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  name    text not null check (public.lily_event_name_ok(name)),
  episode text check (episode is null or episode ~ '^ep[0-9]{2}$'),
  at      timestamptz not null default now()
);
create index events_user_id_idx on public.events (user_id);

-- 권한 -----------------------------------------------------------------
-- Supabase는 public 테이블에 anon, authenticated 기본 권한을 준다. 먼저 모두 거두고 필요한 것만 준다.
revoke all on public.profiles, public.progress, public.events from anon, authenticated;

-- profiles: 행은 트리거가 만들고 탈퇴 함수가 지운다. 클라이언트는 읽기와 세 칸 고치기만.
grant select on public.profiles to authenticated;
grant update (nickname, child_age_band, marketing_opt_in) on public.profiles to authenticated;

grant select, insert, update, delete on public.progress to authenticated;

-- 이벤트는 본인도 지우지 못한다(기록 보존). 탈퇴 때는 delete_my_account 가 definer 권한으로 지운다.
grant select, insert on public.events to authenticated;
-- 비로그인은 이벤트 기록만. user_id 칸은 아예 쓸 수 없다(칸 단위 권한).
grant insert (name, episode) on public.events to anon;

revoke all on function public.lily_event_name_ok(text) from public;
grant execute on function public.lily_event_name_ok(text) to anon, authenticated;

-- RLS ------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.events   enable row level security;

-- 네 가지 정책을 세 테이블에 똑같이(events 는 DELETE 정책 없음). (select auth.uid()) 는 행마다 다시 계산하지 않게 한다.
create policy profiles_select on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy profiles_insert on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy profiles_update on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy profiles_delete on public.profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy progress_select on public.progress for select to authenticated
  using ((select auth.uid()) = user_id);
create policy progress_insert on public.progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy progress_update on public.progress for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy progress_delete on public.progress for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy events_select on public.events for select to authenticated
  using ((select auth.uid()) = user_id);
create policy events_insert on public.events for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy events_update on public.events for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 비로그인 이벤트: INSERT만, user_id 없이, 이름 목록 안에서만.
create policy events_insert_anon on public.events for insert to anon
  with check (user_id is null and public.lily_event_name_ok(name));

-- user_id 바꾸기 막기 ----------------------------------------------------
create or replace function public.lily_keep_user_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.lily_keep_user_id() from public, anon, authenticated;

create trigger profiles_keep_user_id before update on public.profiles
  for each row execute function public.lily_keep_user_id();
create trigger progress_keep_user_id before update on public.progress
  for each row execute function public.lily_keep_user_id();
create trigger events_keep_user_id before update on public.events
  for each row execute function public.lily_keep_user_id();

-- 가입하면 profiles 행 만들기 ---------------------------------------------
-- 클라이언트는 profiles를 만들 수 없다. 닉네임은 카카오 등에서 온 이름이 있으면 20자까지 채운다.
create or replace function public.lily_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nick text := nullif(left(btrim(coalesce(
    new.raw_user_meta_data ->> 'nickname',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'full_name', '')), 20), '');
begin
  insert into public.profiles (user_id, nickname) values (new.id, nick)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.lily_handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.lily_handle_new_user();

-- 탈퇴 -----------------------------------------------------------------
-- 호출한 본인의 행과 auth 사용자를 지운다. 다른 사람을 지정할 인자가 없다.
-- 탈퇴 기록은 누구인지 남기지 않는 이벤트 한 줄(user_id null)로만 남긴다.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.events   where user_id = uid;
  delete from public.progress where user_id = uid;
  delete from public.profiles where user_id = uid;
  delete from auth.users      where id = uid;
  insert into public.events (name) values ('delete_account');
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
