#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${repo_root}/scripts/go.sh" test ./internal/settacli -run 'Test(ScriptedBackendWorkflowE2E|LiveCodexCLIWorkflow)$' -count=1
