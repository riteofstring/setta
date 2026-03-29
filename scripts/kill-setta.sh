#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")

env_flag_enabled() {
  local raw_value="${1:-}"
  case "$(printf '%s' "${raw_value}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

terminate_process_tree() {
  local target_pid="$1"
  local signal_name="${2:-TERM}"
  local child_pid=""

  if [[ -z "${target_pid}" ]] || ! kill -0 "${target_pid}" 2>/dev/null; then
    return 0
  fi

  while IFS= read -r child_pid; do
    if [[ -n "${child_pid}" ]]; then
      terminate_process_tree "${child_pid}" "${signal_name}"
    fi
  done < <(pgrep -P "${target_pid}" 2>/dev/null || true)

  kill "-${signal_name}" "${target_pid}" 2>/dev/null || true
}

wait_for_process_exit() {
  local target_pid="$1"
  local timeout_seconds="$2"
  local start_ts=""

  if [[ -z "${target_pid}" ]]; then
    return 0
  fi

  start_ts="$(date +%s)"
  while kill -0 "${target_pid}" 2>/dev/null; do
    if [[ "$(( $(date +%s) - start_ts ))" -ge "${timeout_seconds}" ]]; then
      return 1
    fi
    sleep 1
  done

  return 0
}

stop_pid_with_escalation() {
  local target_pid="$1"

  if [[ -z "${target_pid}" ]] || ! kill -0 "${target_pid}" 2>/dev/null; then
    return 0
  fi

  terminate_process_tree "${target_pid}" "TERM"
  if ! wait_for_process_exit "${target_pid}" "5"; then
    terminate_process_tree "${target_pid}" "KILL"
    wait_for_process_exit "${target_pid}" "5" || true
  fi
}

stop_setta_sessions() {
  if [[ -f "${ROOT_DIR}/activate.sh" ]]; then
    # shellcheck disable=SC1090
    source "${ROOT_DIR}/activate.sh"
  fi

  if command -v setta >/dev/null 2>&1; then
    local stop_output=""
    if ! stop_output="$(setta stop --all -w "${WORKTREE_ROOT}" 2>&1)"; then
      if [[ "${stop_output}" == *"No matching Setta sessions found."* ]]; then
        echo "No matching Setta sessions found."
      else
        echo "${stop_output}" >&2
      fi
    elif [[ -n "${stop_output}" ]]; then
      echo "${stop_output}"
    fi
  else
    echo "setta not on PATH; skipping session stop." >&2
  fi
}

stop_dev_processes() {
  local pids=""
  local pid=""
  pids="$(
    ps -ax -o pid= -o command= | awk -v root="${WORKTREE_ROOT}" '
      index($0, root "/frontend") && (index($0, "concurrently") || index($0, "vite") || index($0, "backendStart.sh") || index($0, "esbuild")) { print $1; next }
      index($0, root "/.venv/bin/setta") { print $1 }
    ' | sort -u
  )"

  if [[ -n "${pids}" ]]; then
    while IFS= read -r pid; do
      stop_pid_with_escalation "${pid}"
    done <<< "${pids}"
    echo "Stopped Setta dev processes for ${WORKTREE_ROOT}."
  else
    echo "No Setta dev processes found for ${WORKTREE_ROOT}."
  fi
}

collect_chrome_pids() {
  ps -ax -o pid= -o command= | awk '
    /Google Chrome\.app\/Contents\/MacOS\/Google Chrome/ ||
    /Google Chrome Canary\.app\/Contents\/MacOS\/Google Chrome Canary/ ||
    /Google Chrome for Testing\.app\/Contents\/MacOS\/Google Chrome for Testing/ ||
    /Chromium\.app\/Contents\/MacOS\/Chromium/ ||
    /Google Chrome Helper/ ||
    /Chromium Helper/ ||
    /(^|[[:space:]\/])google-chrome(-stable)?([[:space:]]|$)/ ||
    /(^|[[:space:]\/])chrome([[:space:]]|$)/ ||
    /(^|[[:space:]\/])chromium(-browser)?([[:space:]]|$)/ {
      print $1
    }
  ' | sort -u
}

stop_all_chrome_processes() {
  local pids=""
  local pid=""

  if ! env_flag_enabled "${SETTA_KILL_ALL_CHROME:-0}"; then
    return 0
  fi

  if [[ "${OSTYPE:-}" == darwin* ]] && command -v osascript >/dev/null 2>&1; then
    for app_name in "Google Chrome" "Google Chrome Canary" "Google Chrome for Testing" "Chromium"; do
      osascript -e "tell application \"${app_name}\" to quit" >/dev/null 2>&1 || true
    done
    sleep 1
  fi

  pids="$(collect_chrome_pids)"
  if [[ -z "${pids}" ]]; then
    echo "No Chrome/Chromium processes found."
    return 0
  fi

  while IFS= read -r pid; do
    if [[ -n "${pid}" ]]; then
      stop_pid_with_escalation "${pid}"
    fi
  done <<< "${pids}"

  echo "Stopped all Chrome/Chromium processes."
}

stop_setta_sessions
"${ROOT_DIR}/scripts/stop-browser-mcp.sh" --devtools || true
stop_dev_processes
stop_all_chrome_processes
