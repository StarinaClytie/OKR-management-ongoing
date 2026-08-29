#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PURGE="$REPO/scripts/production-data-cleanup/purge.sql"
PREVIEW="$REPO/scripts/production-data-cleanup/preview.sql"
VERIFY="$REPO/scripts/production-data-cleanup/verify.sql"
DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_northstar-okr}"

echo "LOCAL ONLY: destroys local Supabase data"

for required_file in "$PREVIEW" "$PURGE" "$VERIFY"; do
  if [[ ! -f "$required_file" ]]; then
    echo "FAIL: missing $required_file" >&2
    exit 1
  fi
done

cd "$REPO"
npx supabase status >/dev/null
npx supabase db reset --local --no-seed >/dev/null

psql_local() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

psql_local -f - < "$HERE/fixture.sql"
psql_local -f - < "$PREVIEW" >/dev/null
psql_local \
  -v expected_auth_users=2 \
  -v expected_organizations=1 \
  -v expected_profiles=2 \
  -v expected_user_roles=2 \
  -v expected_reporting_lines=1 \
  -f - < "$PURGE"
psql_local -f - < "$HERE/assert_cleanup.sql"
psql_local -f - < "$VERIFY" >/dev/null
