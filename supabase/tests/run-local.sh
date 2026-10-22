#!/usr/bin/env bash
# 로컬 Postgres(docker)에 auth 흉내 + 마이그레이션을 올리고 RLS 시험을 돌린다. 끝나면 컨테이너를 지운다.
# 필요: docker. 포트를 열지 않고, 컨테이너 안 psql로만 접속한다.
# 실제 Supabase(GoTrue, PostgREST)는 흉내 내지 않는다. 운영 확인은 대시보드에서 따로 한다.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
name="lily-rls-test-$$"
image="${PG_IMAGE:-postgres:16-alpine}"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$name" -e POSTGRES_HOST_AUTH_METHOD=trust "$image" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U postgres -q 2>/dev/null && break
  sleep 0.5
done
sleep 1  # 이미지 초기화 뒤 서버가 한 번 다시 시작한다

psql() { docker exec -i "$name" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql < "$here/mock_auth.sql"
psql < "$root/supabase/migrations/0001_init.sql"
psql < "$here/rls.sql" 2>&1 | sed 's/^psql:<stdin>:[0-9]*: //' | grep -v '^$'
