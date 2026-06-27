#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skip_build=0
run_deterministic=1
run_live=1
visible=0
keep_artifacts=0

usage() {
  cat <<'EOF'
Usage: ./scripts/test_chat_workflows.sh [--skip-build] [--visible] [--deterministic-only] [--live-only] [--keep-artifacts]

Build and run the chat workflow gate:
  - hidden deterministic Electron chat workflow tests with temp app data
  - live Electron Codex workflow tests when Codex ChatGPT auth is available
  - backend-only live Codex workflow tests as supplemental lower-level coverage
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)
      skip_build=1
      shift
      ;;
    --visible)
      visible=1
      shift
      ;;
    --deterministic-only)
      run_deterministic=1
      run_live=0
      shift
      ;;
    --live-only)
      run_deterministic=0
      run_live=1
      shift
      ;;
    --keep-artifacts)
      keep_artifacts=1
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

codex_chatgpt_auth_present() {
  node "${repo_root}/desktop/tests/electron/chat-live-auth.mjs"
}

run_electron_node() {
  local script_path="$1"
  shift
  if [[ ${#electron_args[@]} -gt 0 ]]; then
    node "${script_path}" "$@" "${electron_args[@]}"
  else
    node "${script_path}" "$@"
  fi
}

status=0
declare -a passed_workflows=()
declare -a skipped_workflows=()
live_skip_reason=""
declare -a electron_args=()

if [[ "${skip_build}" -eq 0 ]]; then
  pnpm -C "${repo_root}/desktop" build || status=1
fi

if [[ "${visible}" -eq 1 ]]; then
  electron_args+=("--visible")
fi
if [[ "${keep_artifacts}" -eq 1 ]]; then
  electron_args+=("--keep-artifacts")
fi

if [[ "${run_deterministic}" -eq 1 ]]; then
  echo "Deterministic Electron chat workflows..."
  if run_electron_node "${repo_root}/desktop/tests/electron/run-workflows.mjs" \
    --workflow chat \
    --workflow corrupt-chat; then
    passed_workflows+=("deterministic-electron")
  else
    status=1
  fi
fi

if [[ "${run_live}" -eq 1 ]]; then
  if [[ -z "${SETTA_CODEX_BIN:-}" ]]; then
    echo "Live Codex workflows require SETTA_CODEX_BIN to point at the managed/reference-compatible Codex app-server runtime." >&2
    status=1
  elif live_skip_reason="$(codex_chatgpt_auth_present 2>&1)"; then
    echo "Live Codex Electron chat workflow..."
    if run_electron_node "${repo_root}/desktop/tests/electron/run-workflows.mjs" \
      --workflow live-codex-electron; then
      passed_workflows+=("live-codex-electron")
    else
      status=1
    fi

    echo "Live Codex backend chat workflow..."
    if "${repo_root}/scripts/go.sh" test ./internal/runtime -run TestBackendAppWorkflowWithLiveCodex -count=1; then
      passed_workflows+=("live-codex-backend")
    else
      status=1
    fi

    echo "Live Codex Phase 0 history validation..."
    if SETTA_CODEX_HISTORY_PHASE0_LIVE=1 "${repo_root}/scripts/go.sh" test ./internal/chat -run TestCodexHistoryPhase0LiveProviderValidation -count=1 -v; then
      passed_workflows+=("live-codex-phase0-history")
    else
      status=1
    fi
  else
    live_skip_reason="${live_skip_reason:-Codex ChatGPT auth is unavailable}"
    skipped_workflows+=("live-codex-electron (${live_skip_reason})")
    skipped_workflows+=("live-codex-backend (${live_skip_reason})")
    skipped_workflows+=("live-codex-phase0-history (${live_skip_reason})")
    echo "Live Codex chat workflows skipped: ${live_skip_reason}"
  fi
fi

echo "Chat workflow summary:"
if [[ ${#passed_workflows[@]} -eq 0 ]]; then
  echo "  passed: none"
else
  for workflow in "${passed_workflows[@]}"; do
    echo "  passed: ${workflow}"
  done
fi
if [[ ${#skipped_workflows[@]} -gt 0 ]]; then
  for workflow in "${skipped_workflows[@]}"; do
    echo "  skipped: ${workflow}"
  done
fi

exit "${status}"
