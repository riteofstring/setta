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
Usage: ./scripts/test_topic_conversation_workflows.sh [--skip-build] [--visible] [--deterministic-only] [--live-only] [--keep-artifacts]

Build and run the conversation and Director workflow gate:
  - deterministic Director/conversation contract suites
  - hidden deterministic Electron workflows with temp app data
  - complete live Codex agent, side/fork, topic-conversation, and Director matrix
    when Codex ChatGPT auth is available
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
  node "${repo_root}/desktop/tests/electron/codex-chatgpt-auth.mjs"
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

run_live_go_test() {
  local workflow_name="$1"
  local package="$2"
  local test_pattern="$3"

  echo "Live Codex ${workflow_name}..."
  if (cd "${repo_root}" && env -u OPENAI_API_KEY SETTA_LIVE_CODEX=1 \
    "${repo_root}/scripts/go.sh" test "${package}" -run "${test_pattern}" -count=1); then
    passed_workflows+=("live-codex-${workflow_name}")
  else
    status=1
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
  echo "Deterministic Director and conversation Go contract suite..."
  if (
    cd "${repo_root}" &&
      "${repo_root}/scripts/go.sh" test \
        ./internal/director \
        ./internal/conversation \
        ./internal/httpapi \
        ./internal/runtime \
        -count=1
  ); then
    passed_workflows+=("deterministic-go-contracts")
  else
    status=1
  fi

  echo "Deterministic desktop contract suite..."
  if pnpm -C "${repo_root}/desktop" test; then
    passed_workflows+=("deterministic-desktop-contracts")
  else
    status=1
  fi

  echo "Deterministic Electron topic-conversation workflow..."
  if run_electron_node "${repo_root}/desktop/tests/electron/run-workflows.mjs" \
    --workflow topic-conversation-pane-projection \
    --workflow topic-conversation-creation \
    --workflow topic-conversation-archive \
    --workflow topic-conversation-role-configuration \
    --workflow topic-conversation-presentation-configuration \
    --workflow topic-conversation-palette-identity \
    --workflow topic-conversation-crash-recovery \
    --workflow topic-conversation-speech-arbitration \
    --workflow director-command-center; then
    passed_workflows+=("deterministic-electron")
  else
    status=1
  fi
fi

if [[ "${run_live}" -eq 1 ]]; then
  if live_skip_reason="$(codex_chatgpt_auth_present 2>&1)"; then
    run_live_go_test \
      "agent-protocol" \
      "./internal/agent" \
      '^TestLiveCodexRuntimeThreadLifecycleAndActiveForkSnapshot$'
    run_live_go_test \
      "side-isolation" \
      "./internal/conversation" \
      '^TestLiveConversationServiceActiveSideLifecycle$'
    run_live_go_test \
      "topic-conversation" \
      "./internal/runtime" \
      '^TestBackendTopicConversation(Workflow|ControlsAndRestart|Artifact)WithLiveCodex$'
    run_live_go_test \
      "director-command-center" \
      "./internal/runtime" \
      '^TestBackendDirectorCommandCenterWithLiveCodex$'
  else
    live_skip_reason="${live_skip_reason:-Codex ChatGPT auth is unavailable}"
    skipped_workflows+=("live-codex-matrix (${live_skip_reason})")
    echo "Live Codex topic-conversation matrix skipped: ${live_skip_reason}"
  fi
fi

echo "Topic-conversation workflow summary:"
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
