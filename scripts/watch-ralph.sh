#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  local program_name
  program_name="${RALPH_PROGRAM_NAME:-$(basename "$0")}"
  cat <<'EOF' | sed "s#__PROGRAM_NAME__#${program_name}#g"
Usage: __PROGRAM_NAME__ [options]

Follows the active detached Ralph log stream by reading Ralph runtime state.

By default this prefers the detached supervisor state when Ralph is running
under `./ralph.sh`, and falls back to raw-loop state when `./ralph.sh --raw-loop`
is active. When the supervisor rolls from one `loop-XXX` directory to the next,
the watcher switches automatically.

Options:
  --lines N          Number of existing lines to show when attaching to a log.
                     Default: 40
  --poll-seconds N   Poll interval used to detect loop/log changes.
                     Default: 2
  --once             Print the current active log path plus its latest output,
                     then exit instead of following.
  --help             Show this help text

Examples:
  ./__PROGRAM_NAME__
  ./__PROGRAM_NAME__ --lines 120
  ./__PROGRAM_NAME__ --once
EOF
}

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "${value}" ]]; then
    echo "Missing value for ${flag}" >&2
    exit 1
  fi
}

status_value() {
  local file_path="$1"
  local key="$2"

  if [[ ! -f "${file_path}" ]]; then
    return 0
  fi

  awk -F= -v target="${key}" '$1 == target { print substr($0, index($0, "=") + 1); exit }' "${file_path}"
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

pid_is_live() {
  local target_pid="${1:-}"
  [[ -n "${target_pid}" ]] || return 1
  kill -0 "${target_pid}" >/dev/null 2>&1
}

active_run_file_path() {
  local runtime_state_dir="$1"
  local supervisor_file="${runtime_state_dir}/supervisor-active-run.env"
  local loop_file="${runtime_state_dir}/loop-active-run.env"
  local candidate_pid=""

  if [[ -f "${supervisor_file}" ]]; then
    candidate_pid="$(status_value "${supervisor_file}" "pid")"
    if pid_is_live "${candidate_pid}"; then
      printf '%s\n' "${supervisor_file}"
      return 0
    fi
  fi

  if [[ -f "${loop_file}" ]]; then
    candidate_pid="$(status_value "${loop_file}" "pid")"
    if pid_is_live "${candidate_pid}"; then
      printf '%s\n' "${loop_file}"
      return 0
    fi
  fi

  return 1
}

supervisor_log_path() {
  local active_file="$1"
  local current_loop_dir=""
  local output_dir=""

  current_loop_dir="$(status_value "${active_file}" "current_loop_dir")"
  if [[ -n "${current_loop_dir}" ]]; then
    printf '%s\n' "${current_loop_dir}/supervisor-loop.log"
    return 0
  fi

  output_dir="$(status_value "${active_file}" "output_dir")"
  if [[ -n "${output_dir}" ]]; then
    printf '%s\n' "${output_dir}/latest-loop/supervisor-loop.log"
    return 0
  fi

  return 1
}

raw_loop_log_path() {
  local active_file="$1"
  local output_dir=""
  local candidates=()

  output_dir="$(status_value "${active_file}" "output_dir")"
  [[ -n "${output_dir}" ]] || return 1

  shopt -s nullglob
  candidates=(
    "${output_dir}"/progress-review-*/progress-review-transcript.log
    "${output_dir}"/run-*/transcript.log
  )
  shopt -u nullglob

  if [[ ${#candidates[@]} -eq 0 ]]; then
    return 1
  fi

  printf '%s\n' "${candidates[@]}" | sort | tail -n1
}

current_target_log() {
  local active_file="$1"
  local mode=""

  mode="$(status_value "${active_file}" "mode")"
  case "${mode}" in
    supervisor)
      supervisor_log_path "${active_file}"
      ;;
    raw_loop)
      raw_loop_log_path "${active_file}"
      ;;
    *)
      return 1
      ;;
  esac
}

start_tail() {
  local log_path="$1"
  tail -n "${lines}" -F "${log_path}" &
  tail_pid="$!"
}

stop_tail() {
  if [[ -n "${tail_pid:-}" ]]; then
    kill "${tail_pid}" >/dev/null 2>&1 || true
    wait "${tail_pid}" >/dev/null 2>&1 || true
    tail_pid=""
  fi
}

cleanup() {
  stop_tail
}

handle_termination() {
  cleanup
  exit 143
}

lines="40"
poll_seconds="2"
once="0"
tail_pid=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lines)
      require_value "$1" "${2:-}"
      lines="$2"
      shift 2
      ;;
    --poll-seconds)
      require_value "$1" "${2:-}"
      poll_seconds="$2"
      shift 2
      ;;
    --once)
      once="1"
      shift
      ;;
    --help)
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

runtime_state_dir="$(resolve_ralph_runtime_state_dir)"
trap cleanup EXIT
trap handle_termination INT TERM

if [[ "${once}" == "1" ]]; then
  if ! active_file="$(active_run_file_path "${runtime_state_dir}" 2>/dev/null)"; then
    echo "No active Ralph loop found in ${runtime_state_dir}." >&2
    exit 1
  fi
  if ! target_log="$(current_target_log "${active_file}" 2>/dev/null)"; then
    echo "Ralph is active, but no watchable log is available yet." >&2
    exit 1
  fi
  echo "Watching Ralph log: ${target_log}"
  if [[ -f "${target_log}" ]]; then
    tail -n "${lines}" "${target_log}"
    exit 0
  fi
  echo "Waiting for Ralph log: ${target_log}" >&2
  exit 1
fi

current_log=""
waiting_log=""
announced_no_active="0"

while true; do
  active_file=""
  target_log=""

  if active_file="$(active_run_file_path "${runtime_state_dir}" 2>/dev/null)"; then
    announced_no_active="0"
    if target_log="$(current_target_log "${active_file}" 2>/dev/null)"; then
      if [[ -f "${target_log}" ]]; then
        waiting_log=""
        if [[ "${target_log}" != "${current_log}" ]]; then
          stop_tail
          current_log="${target_log}"
          echo "Watching Ralph log: ${current_log}"
          start_tail "${current_log}"
        fi
      elif [[ "${waiting_log}" != "${target_log}" ]]; then
        waiting_log="${target_log}"
        echo "Waiting for Ralph log: ${waiting_log}"
      fi
    fi
  elif [[ "${announced_no_active}" != "1" ]]; then
    echo "No active Ralph loop found in ${runtime_state_dir}; waiting for one to start."
    announced_no_active="1"
  fi

  sleep "${poll_seconds}"
done
