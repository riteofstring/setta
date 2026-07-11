#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${repo_root}/.env"
workflow_path="${repo_root}/desktop/tests/electron/live-openai-speech-workflow.test.mjs"
skip_build=0
declare -a workflow_args=()

usage() {
  cat <<'EOF'
Usage: ./scripts/test_live_openai_speech.sh [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]

Builds and runs the opt-in live OpenAI speech workflow. An already-exported
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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)
      skip_build=1
      workflow_args+=("$1")
      shift
      ;;
    --visible|--keep-artifacts)
      workflow_args+=("$1")
      shift
      ;;
    --artifact-dir)
      if [[ $# -lt 2 || -z "$2" ]]; then
        echo "--artifact-dir requires a value" >&2
        exit 1
      fi
      workflow_args+=("$1" "$2")
      shift 2
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

if [[ ! -f "${workflow_path}" ]]; then
  echo "Live OpenAI speech workflow is not implemented yet: ${workflow_path}" >&2
  exit 2
fi

api_key="$(load_openai_api_key)"
if [[ -z "${api_key}" ]]; then
  echo "Live OpenAI speech workflow skipped: OPENAI_API_KEY is neither exported nor present in ${env_file}." >&2
  exit 2
fi

if [[ "${skip_build}" -eq 0 ]]; then
  (unset OPENAI_API_KEY; pnpm -C "${repo_root}/desktop" build)
fi

OPENAI_API_KEY="${api_key}" exec node "${workflow_path}" "${workflow_args[@]}"
