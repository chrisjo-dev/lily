-- 릴리랑 0002: 편 ID를 시리즈 주소 형식으로(ep01 → daily/brush). 설계 lilyrang/plans/series-access-spec.md 5절.
-- 적용은 사용자 승인 뒤 SQL Editor에서 한 번에 실행한다. 배포보다 먼저, 바로 이어서 배포한다(8절).
-- 전환 기간(배포 뒤 1주)에는 옛 형식(ep01)도 받는다. 캐시에 남은 옛 페이지의 기록이 실패하지 않게. 끝나면 0003으로 옛 형식을 뺀다.
-- 되돌리기: 0002_series_down.sql
begin;

-- 0001의 episode 검사 제약을 지운다. 이름을 추정하지 않고, episode 칸 하나에만 걸리고 옛 정규식 본문이 들어 있는 check만 찾는다
do $$
declare r record; n int := 0;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attname = 'episode'
    where c.conrelid in ('public.progress'::regclass, 'public.events'::regclass)
      and c.contype = 'c'
      and c.conkey = array[a.attnum]
      and position('^ep[0-9]{2}$' in pg_get_constraintdef(c.oid)) > 0
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    n := n + 1;
  end loop;
  if n <> 2 then
    raise exception '0002: episode 검사 제약을 2개 찾아야 하는데 %개를 찾음. 멈춤', n;
  end if;
end $$;

-- 옛 ID를 새 ID로(목록: src/entities/episode/catalog.json 의 legacy)
create temporary table lily_ep_map (old text primary key, new text not null) on commit drop;
insert into lily_ep_map values
  ('ep01', 'daily/brush'), ('ep02', 'daily/wake'), ('ep03', 'daily/wash'), ('ep04', 'daily/eat'),
  ('ep05', 'daily/dress'), ('ep06', 'daily/bath'), ('ep07', 'daily/sleep');
update public.progress p set episode = m.new from lily_ep_map m where p.episode = m.old;
update public.events   e set episode = m.new from lily_ep_map m where e.episode = m.old;

-- 새 형식(시리즈/편). 전환 기간에는 옛 형식도 받는다. 이름을 붙여 0003과 down이 이름으로 지운다
alter table public.progress add constraint progress_episode_check
  check (episode ~ '^[a-z][a-z0-9-]{0,23}/[a-z][a-z0-9-]{0,31}$' or episode ~ '^ep[0-9]{2}$');
alter table public.events add constraint events_episode_check
  check (episode is null or episode ~ '^[a-z][a-z0-9-]{0,23}/[a-z][a-z0-9-]{0,31}$' or episode ~ '^ep[0-9]{2}$');

commit;
