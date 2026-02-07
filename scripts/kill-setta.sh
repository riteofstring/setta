#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")

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
  pids="$(
    ps -ax -o pid= -o command= | awk -v root="${WORKTREE_ROOT}" '
      index($0, root "/frontend") && (index($0, "concurrently") || index($0, "vite") || index($0, "backendStart.sh") || index($0, "esbuild")) { print $1; next }
      index($0, root "/.venv/bin/setta") { print $1 }
    '
  )"

  if [[ -n "${pids}" ]]; then
    kill ${pids} 2>/dev/null || true
    echo "Stopped Setta dev processes for ${WORKTREE_ROOT}."
  else
    echo "No Setta dev processes found for ${WORKTREE_ROOT}."
  fi
}

stop_setta_sessions
"${ROOT_DIR}/scripts/stop-browser-mcp.sh" --devtools || true
stop_dev_processes
