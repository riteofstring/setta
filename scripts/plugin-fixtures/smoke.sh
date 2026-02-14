#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

link_fixture() {
  local fixture_name="$1"
  local scope="$2"
  echo "[smoke] linking fixture '${fixture_name}' (scope=${scope})..."
  "${SCRIPT_DIR}/link.sh" "${fixture_name}" --scope "${scope}" --no-rescan
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
link_fixture "backend-static-router" "workspace"
link_fixture "backend-mcp-tools" "workspace"
link_fixture "backend-language-server" "workspace"
link_fixture "backend-external-agent" "workspace"
link_fixture "backend-codegen" "workspace"

# Scope/precedence fixtures.
link_fixture "scope-shadowing" "global"
link_fixture "scope-shadowing" "environment"
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
5. Validate backend static/router fixture after restart:
   - GET `/api/plugins/setta-fixture-backend-static-router/info`
   - GET `/plugins/setta-fixture-backend-static-router/fixture/hello.txt`
6. Validate MCP fixture after restart:
   - plugin card shows MCP capability; registered tools should include
     `setta_fixture_mcp_read` and `setta_fixture_mcp_write`.
7. Validate scope precedence:
   - `setta plugins list`
   - `setta-fixture-scope-shadowing` should resolve from workspace and shadow
     environment/global copies.
CHECKLIST
