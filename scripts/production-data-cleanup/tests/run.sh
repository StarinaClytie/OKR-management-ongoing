#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PURGE="$REPO/scripts/production-data-cleanup/purge.sql"
DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_northstar-okr}"

echo "LOCAL ONLY: destroys local Supabase data"

if [[ ! -f "$PURGE" ]]; then
  echo "FAIL: missing $PURGE" >&2
  exit 1
fi

cd "$REPO"
npx supabase status >/dev/null
npx supabase db reset --local --no-seed >/dev/null

psql_local() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

psql_local -f - < "$HERE/fixture.sql"
psql_local \
  -v expected_auth_users=2 \
  -v expected_organizations=1 \
  -v expected_profiles=2 \
  -v expected_user_roles=2 \
  -v expected_reporting_lines=1 \
  -f - < "$PURGE"
psql_local -f - < "$HERE/assert_cleanup.sql"
