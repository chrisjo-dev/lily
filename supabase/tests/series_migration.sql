-- 0002_series 변환 시험. run-local.sh 가 0001 → 이 파일(phase=seed) → 0002 → (phase=new) → 0002_down → (phase=old) → 0002 → (phase=cleanup) 순서로 부른다.
-- psql -v phase=... 로 단계를 받는다. 어긋나면 "FAIL ..." 예외로 멈춘다.
select set_config('t.phase', :'phase', false);

do $$
declare ph text := current_setting('t.phase');
        c uuid := 'cccccccc-0000-0000-0000-000000000003';
        eps text[];
begin
  if ph = 'seed' then
    insert into auth.users (id, email, raw_user_meta_data) values (c, 'c@example.test', '{}');
    insert into public.progress (user_id, episode, taps) values (c, 'ep01', 1), (c, 'ep02', 2);
    insert into public.events (user_id, name, episode) values (c, 'episode_start', 'ep03'), (c, 'login', null);
    raise notice 'PASS seed: old-format rows for C';

  elsif ph = 'new' then
    select array_agg(episode order by episode) into eps from public.progress where user_id = c;
    if eps is distinct from array['daily/brush', 'daily/wake'] then raise exception 'FAIL new: progress %', eps; end if;
    if (select count(*) from public.events where user_id = c and episode = 'daily/wash') <> 1
       or (select count(*) from public.events where user_id = c and episode is null) <> 1 then
      raise exception 'FAIL new: events not converted';
    end if;
    if (select taps from public.progress where user_id = c and episode = 'daily/wake') <> 2 then raise exception 'FAIL new: taps lost'; end if;
    if exists (select 1 from public.progress where episode ~ '^ep[0-9]{2}$') or exists (select 1 from public.events where episode ~ '^ep[0-9]{2}$') then
      raise exception 'FAIL new: old ids left';
    end if;
    -- 전환 기간: 옛 형식과 새 형식 둘 다 받고, 나머지는 거부
    insert into public.progress (user_id, episode) values (c, 'ep05'), (c, 'bedtime/moon');
    delete from public.progress where user_id = c and episode in ('ep05', 'bedtime/moon');
    begin
      insert into public.progress (user_id, episode) values (c, 'Daily/brush');
      raise exception 'FAIL new: bad id accepted';
    exception when check_violation then null;
    end;
    begin
      insert into public.events (name, episode) values ('login', 'daily/../x');
      raise exception 'FAIL new: bad event id accepted';
    exception when check_violation then null;
    end;
    if (select count(*) from pg_constraint where conname in ('progress_episode_check', 'events_episode_check')) <> 2 then
      raise exception 'FAIL new: named constraints missing';
    end if;
    raise notice 'PASS new: rows converted, transition check accepts old and new, rejects bad ids';

  elsif ph = 'old' then
    select array_agg(episode order by episode) into eps from public.progress where user_id = c;
    if eps is distinct from array['ep01', 'ep02'] then raise exception 'FAIL old: progress %', eps; end if;
    if (select count(*) from public.events where user_id = c and episode = 'ep03') <> 1 then raise exception 'FAIL old: events not reverted'; end if;
    begin
      insert into public.progress (user_id, episode) values (c, 'daily/brush');
      raise exception 'FAIL old: new id accepted after down';
    exception when check_violation then null;
    end;
    raise notice 'PASS old: down reverted rows and check';

  elsif ph = 'cleanup' then
    delete from auth.users where id = c;
    raise notice 'PASS cleanup';
  end if;
end $$;
