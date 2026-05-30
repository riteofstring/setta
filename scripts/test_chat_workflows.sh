#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skip_build=0

usage() {
  cat <<'EOF'
Usage: ./scripts/test_chat_workflows.sh [--skip-build]

Build and run the chat workflow gate:
  - deterministic Electron chat workflow tests with temp app data
  - live Codex workflow tests when .env contains OPENAI_API_KEY
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)
      skip_build=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

openai_key_present() {
  [[ -f "${repo_root}/.env" ]] || return 1
  grep -Eq '^[[:space:]]*(export[[:space:]]+)?OPENAI_API_KEY[[:space:]]*=[[:space:]]*[^[:space:]#]+' "${repo_root}/.env"
}

status=0
deterministic_run=0
live_run=0
live_skipped=0
live_skip_reason=""

if [[ "${skip_build}" -eq 0 ]]; then
  pnpm -C "${repo_root}/desktop" build || status=1
fi

echo "Deterministic Electron chat workflows..."
if pnpm -C "${repo_root}/desktop" run test:electron:built; then
  deterministic_run=6
else
  status=1
fi

if openai_key_present; then
  echo "Live Codex chat workflow..."
  if "${repo_root}/scripts/go.sh" test ./internal/runtime -run TestBackendAppWorkflowWithLiveCodex -count=1; then
    live_run=1
  else
    status=1
  fi
else
  live_skipped=1
  live_skip_reason="OPENAI_API_KEY is not present in .env"
  echo "Live Codex chat workflow skipped: ${live_skip_reason}"
fi

echo "Chat workflow summary:"
echo "  deterministic workflows run: ${deterministic_run}"
echo "  live workflows run: ${live_run}"
if [[ "${live_skipped}" -eq 1 ]]; then
  echo "  live workflows skipped: 1 (${live_skip_reason})"
else
  echo "  live workflows skipped: 0"
fi

exit "${status}"
