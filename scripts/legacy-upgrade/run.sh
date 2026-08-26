#!/usr/bin/env bash
#
# Legacy-production -> forward-migration upgrade regression.
#
# `npx supabase db reset` only ever proves that migrations work on an EMPTY
# database. It cannot catch a historical migration that was edited after it had
# already been applied to production: the clean database gets the corrected file,
# production keeps whatever the original file produced, and the two silently
# diverge. That is exactly what happened to
# `202608260001_hr_okr_and_work_hours.sql` (see
# `202608270007_production_schema_convergence.sql` for the full story).
#
# This harness closes that hole. It rebuilds a database that looks like the
# drifted production one, applies ONLY the convergence migration, and asserts the
# result is byte-identical to a clean reset for every affected object.
#
# Variants:
#   L1  the original 202608260001 aborted at its 42702 ambiguity — three old
#       policies present, kr_assignments_read / kr_progress_updates_read absent,
#       no is_objective_kr_assignee, 202608270002/270004 grants missing
#   L2  L1 + an operator hand-fixed the ambiguity -> the 42P17 recursion appears
#   L3  L2 + the manual emergency SQL actually run against production
#       (is_objective_kr_assignee with different parameter names, plus the
#       unversioned private.can_read_kr_assignment helper)
#   L4  L3 + sections 8-11 of 202608260001 never ran either (no
#       get_hr_work_hours, pre-HR list_organization_users, legacy 9-argument
#       objective overloads still present, section-11 grants missing)
#
# Usage:  scripts/legacy-upgrade/run.sh [L1|L2|L3|L4|all]
# Requires a running local stack (`npx supabase start`). Destroys local data.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DB="${SUPABASE_DB_CONTAINER:-supabase_db_northstar-okr}"
MIGRATION="$REPO/supabase/migrations/202608270007_production_schema_convergence.sql"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

psql_run() { docker exec -i "$DB" psql -U postgres -d postgres -q "$@"; }

canonical_snapshot() {
  cd "$REPO" && npx supabase db reset >/dev/null 2>&1 || { echo "db reset FAILED"; exit 1; }
  psql_run -f - < "$HERE/snapshot.sql" > "$WORK/canonical.txt" 2>&1
}

run_variant() {
  local variant="$1" failed=0
  echo "=================== VARIANT $variant ==================="
  cd "$REPO" && npx supabase db reset >/dev/null 2>&1 || { echo "db reset FAILED"; return 1; }

  psql_run -v ON_ERROR_STOP=1 < "$HERE/01_legacy_base.sql" >/dev/null 2>&1 || { echo "L1 base FAILED"; return 1; }
  case "$variant" in
    L2|L3|L4) psql_run -v ON_ERROR_STOP=1 < "$HERE/02_handfixed_recursion.sql" >/dev/null 2>&1 || { echo "L2 FAILED"; return 1; } ;;
  esac
  case "$variant" in
    L3|L4) psql_run -v ON_ERROR_STOP=1 < "$HERE/03_emergency_patch.sql" >/dev/null 2>&1 || { echo "L3 FAILED"; return 1; } ;;
  esac
  case "$variant" in
    L4) psql_run -v ON_ERROR_STOP=1 < "$HERE/04_tail_missing.sql" >/dev/null 2>&1 || { echo "L4 FAILED"; return 1; } ;;
  esac

  echo "--- pre-007 probe (the symptom this variant reproduces) ---"
  psql_run < "$HERE/probe_roles.sql" 2>&1 | grep -E "NOTICE" | sed 's/^NOTICE:  //'

  echo "--- applying ONLY 202608270007 ---"
  psql_run -v ON_ERROR_STOP=1 --single-transaction -f - < "$MIGRATION" 2>&1 | grep -i notice
  if [ "${PIPESTATUS[0]}" -ne 0 ]; then echo "007 FAILED to apply"; return 1; fi

  echo "--- post-007 probe ---"
  psql_run < "$HERE/probe_roles.sql" 2>&1 | grep -E "NOTICE" | sed 's/^NOTICE:  //'

  psql_run -f - < "$HERE/snapshot.sql" > "$WORK/after_$variant.txt" 2>&1
  if diff -u "$WORK/canonical.txt" "$WORK/after_$variant.txt" > "$WORK/diff_$variant.txt"; then
    echo "RESULT: $variant converged — identical to clean-reset schema"
  else
    echo "RESULT: $variant DIVERGED"
    cat "$WORK/diff_$variant.txt"
    failed=1
  fi
  echo
  return $failed
}

echo "capturing canonical clean-reset snapshot..."
canonical_snapshot

status=0
case "${1:-all}" in
  all) for v in L1 L2 L3 L4; do run_variant "$v" || status=1; done ;;
  *)   run_variant "$1" || status=1 ;;
esac

if [ "$status" -eq 0 ]; then echo "ALL VARIANTS CONVERGED"; else echo "REGRESSION FAILED"; fi
exit $status
