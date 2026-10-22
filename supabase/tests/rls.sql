-- RLS 시험. 마이그레이션을 올린 DB에서 슈퍼유저로 실행한다(역할은 시험 안에서 바꾼다).
-- 실행: supabase/tests/run-local.sh (docker postgres + mock_auth.sql)
--   또는 Supabase SQL Editor에 통째로 붙여 실행. 전체가 한 트랜잭션이고 끝에 rollback 하므로 시험 사용자와 스키마는 남지 않는다.
--   성공하면 마지막 결과가 'ALL RLS TESTS PASSED', 실패하면 'FAIL ...' 오류로 멈춘다.
-- 결과: 시험마다 "PASS ..." NOTICE. 하나라도 어긋나면 "FAIL ..." 예외로 멈춘다(ON_ERROR_STOP).
begin;
set local client_min_messages = notice;

create schema t;
grant usage on schema t to anon, authenticated;

-- sql 이 기대한 SQLSTATE 중 하나로 실패해야 PASS
create function t.must_fail(label text, sql text, codes text[]) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlstate = any(codes) then
      raise notice 'PASS %  (% %)', label, sqlstate, sqlerrm;
      return;
    end if;
    raise exception 'FAIL %  unexpected % %', label, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL %  (no error)', label;
end $$;

-- sql 이 바꾼 행 수가 n 이어야 PASS
create function t.rows_are(label text, sql text, n int) returns void language plpgsql as $$
declare c int;
begin
  execute sql;
  get diagnostics c = row_count;
  if c = n then raise notice 'PASS %  (rows=%)', label, c;
  else raise exception 'FAIL %  rows=% expected %', label, c, n; end if;
end $$;

create function t.ok(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS %', label;
  else raise exception 'FAIL %', label; end if;
end $$;
grant execute on all functions in schema t to anon, authenticated;

-- 준비: 사용자 A, B 가입(트리거가 profiles 행을 만든다)
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.test', '{"name":"Kakao Name That Is Much Longer Than Twenty"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.test', '{}');

select t.ok('trigger: profiles rows created for A and B',
  (select count(*) from public.profiles where user_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002')) = 2);
select t.ok('trigger: nickname cut to 20 chars',
  (select char_length(nickname) from public.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 20);
select t.ok('all public tables have RLS on (dashboard check equivalent)',
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity));

insert into public.progress (user_id, episode, taps) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'ep02', 5);
insert into public.events (user_id, name, episode) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'episode_start', 'ep02');

-- 1. anon(비로그인) ------------------------------------------------------
set role anon;
select t.must_fail('anon: select profiles denied', 'select * from public.profiles', array['42501']);
select t.must_fail('anon: select progress denied', 'select * from public.progress', array['42501']);
select t.must_fail('anon: select events denied',   'select * from public.events',   array['42501']);
select t.must_fail('anon: insert progress denied',
  $q$insert into public.progress (user_id, episode) values ('bbbbbbbb-0000-0000-0000-000000000002','ep03')$q$, array['42501']);
select t.must_fail('anon: update profiles denied',
  $q$update public.profiles set nickname = 'x'$q$, array['42501']);
select t.rows_are('anon: insert event with allowed name',
  $q$insert into public.events (name, episode) values ('gate_shown','ep02')$q$, 1);
select t.must_fail('anon: insert event with unknown name rejected',
  $q$insert into public.events (name) values ('page_view')$q$, array['42501','23514']);
select t.must_fail('anon: insert event with user_id rejected',
  $q$insert into public.events (user_id, name) values ('bbbbbbbb-0000-0000-0000-000000000002','login')$q$, array['42501']);
select t.must_fail('anon: delete_my_account not callable',
  'select public.delete_my_account()', array['42501']);
reset role;

-- 2. 로그인 사용자 A ------------------------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
select t.ok('A: sees only own profile',
  (select count(*) from public.profiles) = 1
  and (select user_id from public.profiles) = 'aaaaaaaa-0000-0000-0000-000000000001');
select t.ok('A: cannot see B progress', (select count(*) from public.progress) = 0);
select t.ok('A: cannot see B events',   (select count(*) from public.events) = 0);
select t.must_fail('A: insert profile denied (trigger makes it)',
  $q$insert into public.profiles (user_id) values ('aaaaaaaa-0000-0000-0000-000000000001')$q$, array['42501']);
select t.must_fail('A: insert progress as B rejected',
  $q$insert into public.progress (user_id, episode) values ('bbbbbbbb-0000-0000-0000-000000000002','ep03')$q$, array['42501']);
select t.must_fail('A: insert event as B rejected',
  $q$insert into public.events (user_id, name) values ('bbbbbbbb-0000-0000-0000-000000000002','login')$q$, array['42501']);
select t.rows_are('A: update B progress changes nothing',
  $q$update public.progress set taps = 99 where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$, 0);
select t.rows_are('A: update B profile changes nothing',
  $q$update public.profiles set nickname = 'hacked' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$, 0);
select t.rows_are('A: delete B progress removes nothing',
  $q$delete from public.progress where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$, 0);
select t.must_fail('A: update profile user_id denied (column privilege)',
  $q$update public.profiles set user_id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$, array['42501']);
select t.rows_are('A: insert own progress',
  $q$insert into public.progress (user_id, episode, taps) values ('aaaaaaaa-0000-0000-0000-000000000001','ep01',3)$q$, 1);
select t.must_fail('A: change own progress user_id to B rejected',
  $q$update public.progress set user_id = 'bbbbbbbb-0000-0000-0000-000000000002' where episode = 'ep01'$q$, array['42501']);
select t.rows_are('A: insert own event',
  $q$insert into public.events (user_id, name, episode) values ('aaaaaaaa-0000-0000-0000-000000000001','episode_complete','ep01')$q$, 1);
select t.must_fail('A: delete own events denied (only delete_my_account removes them)',
  $q$delete from public.events where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, array['42501']);
select t.must_fail('A: own event with unknown name rejected',
  $q$insert into public.events (user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001','buy')$q$, array['42501','23514']);
select t.rows_are('A: update own profile fields',
  $q$update public.profiles set nickname = '하늘맘', child_age_band = '4-5', marketing_opt_in = true$q$, 1);
select t.must_fail('A: child_age_band outside list rejected',
  $q$update public.profiles set child_age_band = '8-9'$q$, array['23514']);
reset role;

-- 트리거 단독 확인(권한 우회한 슈퍼유저도 user_id는 못 바꾼다)
select t.must_fail('trigger: user_id change blocked even for owner role',
  $q$update public.progress set user_id = 'bbbbbbbb-0000-0000-0000-000000000002' where episode = 'ep01'$q$, array['42501']);
select t.ok('B rows unchanged after A attempts',
  (select taps from public.progress where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 5
  and (select nickname from public.profiles where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') is null);

-- 3. 탈퇴 ---------------------------------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
select public.delete_my_account();
reset role;
set request.jwt.claim.sub = '';
select t.ok('delete: A has 0 rows in profiles, progress, events, auth.users',
  (select count(*) from public.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0
  and (select count(*) from public.progress where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0
  and (select count(*) from public.events where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0
  and (select count(*) from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0);
select t.ok('delete: B untouched',
  (select count(*) from public.profiles where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 1
  and (select count(*) from public.progress where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 1
  and (select count(*) from auth.users where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 1);
select t.ok('delete: anonymous delete_account event recorded',
  (select count(*) from public.events where name = 'delete_account' and user_id is null and at = now()) = 1);

set role authenticated;  -- sub 비어 있음 = 로그인 안 된 토큰
select t.must_fail('delete: without uid rejected', 'select public.delete_my_account()', array['42501']);
reset role;

select 'ALL RLS TESTS PASSED' as result;
rollback;
