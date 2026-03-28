#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")
if [[ -n "${HOME:-}" ]]; then
  DEFAULT_SETTA_HOME="${HOME}/.setta-development"
else
  DEFAULT_SETTA_HOME=".setta-development"
fi
DEFAULT_DEV_SETTA_FILES_ROOT="${WORKTREE_ROOT}/setta_files_dev"

resolve_default_recording_root() {
  if [[ -n "${SETTA_E2E_RECORD_ROOT_DIR:-}" ]]; then
    printf '%s\n' "${SETTA_E2E_RECORD_ROOT_DIR}"
    return
  fi

  local repo_name repo_suffix
  repo_name="$(basename "${ROOT_DIR}" | tr -cs 'A-Za-z0-9._-' '-')"
  repo_name="${repo_name#-}"
  repo_name="${repo_name%-}"
  if [[ -z "${repo_name}" ]]; then
    repo_name="setta"
  fi

  repo_suffix=""
  if command -v cksum >/dev/null 2>&1; then
    repo_suffix="-$(printf '%s' "${ROOT_DIR}" | cksum | awk '{print $1}')"
  fi

  printf '%s/%s%s\n' "${TMPDIR:-/tmp}/setta-playwright-recordings" "${repo_name}" "${repo_suffix}"
}

usage() {
  cat <<'EOF'
Usage: ./scripts/record-playwright-e2e.sh [--artifact-dir <dir>] [playwright-codegen-args...]

Starts Setta with the normal dev-state defaults, bootstraps auth, and launches
`playwright codegen` against the local app. Close the recorder browser when you
are done; the generated script and related artifacts will be saved in the
recording bundle directory.

By default, the recorder uses the normal dev state:
  SETTA_HOME=~/.setta-development
  SETTA_FILES_ROOT=<worktree>/setta_files_dev
  SETTA_PROJECT_PATH=/home

Options:
  --artifact-dir <dir>  Override the recording bundle directory.
  -h, --help            Show this help.

Environment:
  SETTA_E2E_RECORD_TARGET              Playwright codegen target language.
  SETTA_E2E_RECORD_BROWSER             Browser passed to `playwright codegen -b`.
  SETTA_E2E_RECORD_CHANNEL             Browser channel passed to `--channel`.
  SETTA_E2E_RECORD_TIMEOUT_MS          Action timeout passed to `--timeout`.
  SETTA_E2E_RECORD_URL                 Override the initial app URL.
  SETTA_E2E_RECORD_ROOT_DIR            Override the default temp recording root.
  SETTA_E2E_BUILD_PLUGIN_FIXTURES      Defaults to 0 for recorder sessions.
  SETTA_E2E_SEED_PLUGIN_FIXTURES       Defaults to 0 for recorder sessions.
  SETTA_E2E_SEED_PLUGIN_ARTIFACTS      Defaults to 0 for recorder sessions.
EOF
}

artifact_dir=""
declare -a passthrough_args=()

while (( $# > 0 )); do
  case "$1" in
    --artifact-dir)
      shift
      if (( $# == 0 )); then
        echo "Missing value for --artifact-dir" >&2
        exit 1
      fi
      artifact_dir="$1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      passthrough_args+=("$@")
      break
      ;;
    *)
      passthrough_args+=("$1")
      shift
      ;;
  esac
done

if [[ -z "${artifact_dir}" ]]; then
  artifact_dir="$(resolve_default_recording_root)/recording-$(date +%Y%m%d-%H%M%S)"
fi

log_dir="${artifact_dir}/logs"
mkdir -p "${artifact_dir}"
mkdir -p "${log_dir}"

: "${SETTA_E2E_BUILD_PLUGIN_FIXTURES:=0}"
: "${SETTA_E2E_SEED_PLUGIN_FIXTURES:=0}"
: "${SETTA_E2E_SEED_PLUGIN_ARTIFACTS:=0}"
: "${SETTA_E2E_SEED_WORKSPACE:=0}"

if [[ -z "${SETTA_HOME:-}" ]]; then
  SETTA_HOME="${DEFAULT_SETTA_HOME}"
fi
if [[ -z "${SETTA_FILES_ROOT:-}" && -z "${SETTA_FILES_LOCATION:-}" ]]; then
  SETTA_FILES_ROOT="${DEFAULT_DEV_SETTA_FILES_ROOT}"
fi
if [[ -z "${SETTA_WORKSPACE_ROOT:-}" ]]; then
  SETTA_WORKSPACE_ROOT="${WORKTREE_ROOT}"
fi
if [[ -z "${SETTA_PROJECT_URL:-}" && -z "${SETTA_PROJECT_PATH:-}" ]]; then
  SETTA_PROJECT_PATH="/home"
fi

export SETTA_HOME
export SETTA_WORKSPACE_ROOT
export SETTA_E2E_SEED_WORKSPACE
if [[ -n "${SETTA_FILES_ROOT:-}" ]]; then
  export SETTA_FILES_ROOT
else
  unset SETTA_FILES_ROOT
fi
if [[ -n "${SETTA_FILES_LOCATION:-}" ]]; then
  export SETTA_FILES_LOCATION
else
  unset SETTA_FILES_LOCATION
fi
if [[ -n "${SETTA_PROJECT_URL:-}" ]]; then
  export SETTA_PROJECT_URL
fi
if [[ -n "${SETTA_PROJECT_PATH:-}" ]]; then
  export SETTA_PROJECT_PATH
fi

declare -a command_args=("${ROOT_DIR}/scripts/run-playwright-e2e.sh")
if (( ${#passthrough_args[@]} )); then
  command_args+=("${passthrough_args[@]}")
fi

SETTA_E2E_PLAYWRIGHT_SUBCOMMAND="codegen" \
SETTA_E2E_RECORD_ARTIFACT_DIR="${artifact_dir}" \
SETTA_E2E_RECORD_OUTPUT_FILE="${artifact_dir}/recording.spec.ts" \
SETTA_E2E_RECORD_AUTH_STORAGE_STATE="${artifact_dir}/bootstrap-storage-state.json" \
SETTA_E2E_RECORD_FINAL_STORAGE_STATE="${artifact_dir}/final-storage-state.json" \
SETTA_E2E_RECORD_HAR_FILE="${artifact_dir}/network.har" \
SETTA_E2E_RECORD_METADATA_FILE="${artifact_dir}/session.json" \
SETTA_E2E_LOG_DIR="${log_dir}" \
SETTA_E2E_BUILD_PLUGIN_FIXTURES="${SETTA_E2E_BUILD_PLUGIN_FIXTURES}" \
SETTA_E2E_SEED_PLUGIN_FIXTURES="${SETTA_E2E_SEED_PLUGIN_FIXTURES}" \
SETTA_E2E_SEED_PLUGIN_ARTIFACTS="${SETTA_E2E_SEED_PLUGIN_ARTIFACTS}" \
"${command_args[@]}"
