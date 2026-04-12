#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ralph-stop.sh

Requests that the currently running Ralph loop stop after the active iteration
finishes and the loop reaches its normal safe boundary.
EOF
}

resolve_ralph_runtime_state_dir() {
  local configured_dir="${RALPH_RUNTIME_STATE_DIR:-}"
  local git_dir=""

  if [[ -n "${configured_dir}" ]]; then
    mkdir -p "${configured_dir}"
    (
      cd "${configured_dir}"
      pwd -P
    )
    return 0
  fi

  if git_dir="$(git -C "${ROOT_DIR}" rev-parse --absolute-git-dir 2>/dev/null)" \
    && [[ -n "${git_dir}" ]]; then
    mkdir -p "${git_dir}/ralph-runtime"
    printf '%s\n' "${git_dir}/ralph-runtime"
    return 0
  fi

  mkdir -p "${ROOT_DIR}/.ralph-runtime"
  printf '%s\n' "${ROOT_DIR}/.ralph-runtime"
}

status_value() {
  local file_path="$1"
  local key="$2"

  if [[ ! -f "${file_path}" ]]; then
    return 0
  fi

  awk -F= -v target="${key}" '$1 == target { print substr($0, index($0, "=") + 1); exit }' "${file_path}"
}

active_run_file_is_live() {
  local file_path="$1"
  local pid=""
  local root_dir=""

  [[ -f "${file_path}" ]] || return 1

  pid="$(status_value "${file_path}" "pid")"
  root_dir="$(status_value "${file_path}" "root_dir")"

  [[ -n "${pid}" ]] || return 1
  [[ "${root_dir}" == "${ROOT_DIR}" ]] || return 1
  kill -0 "${pid}" >/dev/null 2>&1
}

select_active_run_file() {
  local runtime_state_dir="$1"
  local supervisor_file="${runtime_state_dir}/supervisor-active-run.env"
  local loop_file="${runtime_state_dir}/loop-active-run.env"

  if active_run_file_is_live "${supervisor_file}"; then
    printf '%s\n' "${supervisor_file}"
    return 0
  fi

  if active_run_file_is_live "${loop_file}"; then
    printf '%s\n' "${loop_file}"
    return 0
  fi

  return 1
}

if [[ $# -gt 0 ]]; then
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
fi

runtime_state_dir="$(resolve_ralph_runtime_state_dir)"
active_run_file="$(select_active_run_file "${runtime_state_dir}" || true)"

if [[ -z "${active_run_file}" ]]; then
  echo "No active Ralph loop was found for ${ROOT_DIR}." >&2
  exit 1
fi

mode="$(status_value "${active_run_file}" "mode")"
stop_request_file="$(status_value "${active_run_file}" "stop_request_file")"
output_dir="$(status_value "${active_run_file}" "output_dir")"

if [[ -z "${stop_request_file}" ]]; then
  echo "Active Ralph run metadata is missing a stop request path." >&2
  exit 1
fi

mkdir -p "$(dirname "${stop_request_file}")"

if [[ -f "${stop_request_file}" ]]; then
  echo "Graceful Ralph stop already requested for ${mode:-unknown} run in ${output_dir:-unknown}."
  exit 0
fi

touch "${stop_request_file}"
echo "Requested graceful Ralph stop for ${mode:-unknown} run in ${output_dir:-unknown}."
