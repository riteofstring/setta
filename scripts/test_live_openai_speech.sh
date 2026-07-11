#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${repo_root}/.env"
workflow_path="${repo_root}/desktop/tests/electron/live-openai-speech-workflow.test.mjs"

usage() {
  cat <<'EOF'
Usage: ./scripts/test_live_openai_speech.sh [workflow options]

Runs the opt-in live OpenAI speech workflow. An already-exported
OPENAI_API_KEY takes precedence. Otherwise, the launcher reads the key from
the repository's ignored .env file inside a private subshell. No other .env
values are exported to the workflow or the calling Codex process.
EOF
}

load_openai_api_key() {
  if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    printf '%s' "${OPENAI_API_KEY}"
    return
  fi
  if [[ ! -f "${env_file}" ]]; then
    return
  fi

  (
    set +u
    # shellcheck disable=SC1090
    source "${env_file}"
    printf '%s' "${OPENAI_API_KEY:-}"
  )
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ ! -f "${workflow_path}" ]]; then
  echo "Live OpenAI speech workflow is not implemented yet: ${workflow_path}" >&2
  exit 2
fi

api_key="$(load_openai_api_key)"
if [[ -z "${api_key}" ]]; then
  echo "Live OpenAI speech workflow skipped: OPENAI_API_KEY is neither exported nor present in ${env_file}." >&2
  exit 2
fi

OPENAI_API_KEY="${api_key}" exec node "${workflow_path}" "$@"
