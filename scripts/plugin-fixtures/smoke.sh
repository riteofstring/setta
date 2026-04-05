#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

link_fixture() {
  local fixture_name="$1"
  local scope="$2"
  echo "[smoke] linking fixture '${fixture_name}' (scope=${scope})..."
  "${SCRIPT_DIR}/link.sh" "${fixture_name}" --scope "${scope}"
}

source "${ROOT_DIR}/activate.sh"

echo "[smoke] resetting previously linked fixture plugins..."
"${SCRIPT_DIR}/reset.sh"
echo "[smoke] reset complete."

# Core plugin coverage fixtures.
link_fixture "frontend" "workspace"
link_fixture "frontend-react" "workspace"
link_fixture "frontend-topnav" "workspace"
link_fixture "content" "workspace"
link_fixture "full" "workspace"
link_fixture "backend" "workspace"

# Scope/precedence fixtures.
link_fixture "scope-shadowing" "global"
link_fixture "scope-shadowing" "setta_files"
link_fixture "scope-shadowing" "workspace"

echo "[smoke] rescanning plugins..."
setta plugins rescan >/dev/null
echo "[smoke] rescan complete."

cat <<'CHECKLIST'
Fixture smoke setup complete.

Suggested manual checks:
1. Open Setta, then go to Overview > Plugins.
2. Confirm frontend surfaces are visible:
   - "Open Fixture Pane" button (setta-fixture-frontend)
   - section kind "React Fixture Card" available from setta-fixture-frontend-react
   - top-nav button "Fixture Nav" (setta-fixture-frontend-topnav)
3. Confirm backend lifecycle state:
   - backend fixtures show "pending_restart" until backend restart.
4. Run restart checks:
   - `setta plugins restart-required`
   - if needed restart Setta, then re-check plugin status.
5. Validate scope precedence:
   - `setta plugins list`
   - `setta-fixture-scope-shadowing` should resolve from workspace and shadow
     setta_files/global copies.
CHECKLIST
