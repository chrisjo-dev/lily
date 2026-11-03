-- 0002_series.sql 되돌리기. 새 ID를 옛 ID로 돌리고 0001의 검사 규칙(ep01 형식만)으로 돌아간다.
-- 옛 목록에 없는 새 시리즈 편 기록이 있으면 옛 규칙을 어기므로 멈춘다(그 기록을 어떻게 할지 먼저 정한다).
begin;

alter table public.progress drop constraint if exists progress_episode_check;
alter table public.events   drop constraint if exists events_episode_check;

create temporary table lily_ep_map (old text primary key, new text not null unique) on commit drop;
insert into lily_ep_map values
  ('ep01', 'daily/brush'), ('ep02', 'daily/wake'), ('ep03', 'daily/wash'), ('ep04', 'daily/eat'),
  ('ep05', 'daily/dress'), ('ep06', 'daily/bath'), ('ep07', 'daily/sleep');

-- 같은 사용자에게 옛 ID와 새 ID가 둘 다 있으면(전환 기간에 옛 페이지가 기록) 새 ID 행을 지우고 옛 행을 남긴다
delete from public.progress p using lily_ep_map m
  where p.episode = m.new
    and exists (select 1 from public.progress q where q.user_id = p.user_id and q.episode = m.old);
update public.progress p set episode = m.old from lily_ep_map m where p.episode = m.new;
update public.events   e set episode = m.old from lily_ep_map m where e.episode = m.new;

alter table public.progress add constraint progress_episode_check check (episode ~ '^ep[0-9]{2}$');
alter table public.events add constraint events_episode_check check (episode is null or episode ~ '^ep[0-9]{2}$');

commit;
