#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")

instance_offset() {
  local instance_name="$1"
  local segment="${instance_name}"
  local suffix=""

  case "${segment}" in
    setta.*)
      segment="${segment#setta.}"
      ;;
  esac

  local offset="${segment##*[!0-9]}"
  if [[ -n "${offset}" ]]; then
    echo "$((10#${offset}))"
    return 0
  fi

  suffix="${segment}"
  suffix="${suffix##*-}"
  suffix="${suffix##*_}"
  suffix="${suffix##*.}"
  if [ "${#suffix}" -eq 1 ]; then
    case "${suffix}" in
      [a-z])
        echo $(( $(printf '%d' "'${suffix}") - 97 ))
        return 0
        ;;
      [A-Z])
        echo $(( $(printf '%d' "'${suffix}") - 65 ))
        return 0
        ;;
    esac
  fi

  if command -v cksum >/dev/null 2>&1; then
    CKSUM_OUTPUT=$(printf "%s" "${segment}" | cksum)
    CKSUM_VALUE=${CKSUM_OUTPUT%% *}
    if [ -n "${CKSUM_VALUE}" ]; then
      echo $(( CKSUM_VALUE % 100 ))
      return 0
    fi
  fi

  echo 0
}

profile_suffix() {
  local root="$1"

  if command -v shasum >/dev/null 2>&1; then
    # shasum is a perl script on macOS and can crash if the caller has an
    # unsupported locale (e.g. LC_ALL=C.UTF-8). Force a safe locale.
    printf "%s" "$root" | LC_ALL=C LANG=C shasum -a 256 | awk '{print substr($1,1,12)}'
    return
  fi

  if command -v md5 >/dev/null 2>&1; then
    printf "%s" "$root" | md5 -q 2>/dev/null | awk '{print substr($1,1,12)}'
    return
  fi

  basename "$root" | tr ' ' '_'
}

INSTANCE_NAME=$(basename "${WORKTREE_ROOT}")
INSTANCE_OFFSET="$(instance_offset "${INSTANCE_NAME}")"
DEFAULT_DEBUG_PORT=$((9222 + INSTANCE_OFFSET))
DEBUG_PORT="${DEBUG_PORT:-${DEFAULT_DEBUG_PORT}}"

PROFILE_SUFFIX="$(profile_suffix "$WORKTREE_ROOT")"
MCP_BASE_DIR="${MCP_BASE_DIR:-${TMPDIR:-/tmp}/setta-mcp}"
DEFAULT_MCP_RUN_DIR="${MCP_BASE_DIR}/${INSTANCE_NAME}-${PROFILE_SUFFIX}"
MCP_RUN_DIR="${MCP_RUN_DIR:-${DEFAULT_MCP_RUN_DIR}}"

resolve_python_bin() {
  if command -v python >/dev/null 2>&1; then
    echo "python"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
    return 0
  fi
  return 1
}

extract_port_from_command() {
  local command_text="$1"
  printf "%s" "${command_text}" | sed -n 's/.*--remote-debugging-port[= ]\([0-9][0-9]*\).*/\1/p'
}

probe_devtools_port() {
  local port="$1"
  local response=""
  local python_bin=""

  if [[ -z "${port}" ]]; then
    return 1
  fi

  if command -v curl >/dev/null 2>&1; then
    response="$(
      curl \
        --silent \
        --show-error \
        --fail \
        --max-time 1 \
        "http://127.0.0.1:${port}/json/version" 2>/dev/null || true
    )"
    if [[ "${response}" == *"webSocketDebuggerUrl"* ]]; then
      return 0
    fi
  fi

  python_bin="$(resolve_python_bin || true)"
  if [[ -z "${python_bin}" ]]; then
    return 1
  fi

  DEVTOOLS_PORT="${port}" "${python_bin}" - <<'PY'
import json
import os
import sys
import urllib.request

port = os.environ.get("DEVTOOLS_PORT", "")
if not port:
    sys.exit(1)

try:
    with urllib.request.urlopen(
        f"http://127.0.0.1:{port}/json/version", timeout=1
    ) as response:
        payload = json.loads(response.read().decode("utf-8"))
except Exception:
    sys.exit(1)

if payload.get("webSocketDebuggerUrl"):
    sys.exit(0)

sys.exit(1)
PY
}

# If the devtools Chrome for this worktree is running, report the actual
# remote-debugging port from its command line.
PID_FILE="${MCP_RUN_DIR}/devtools.pid"
if [[ -f "${PID_FILE}" ]]; then
  PID="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if [[ -n "${PID}" ]] && kill -0 "${PID}" 2>/dev/null; then
    CMD="$(ps -p "${PID}" -o command= 2>/dev/null || true)"
    PORT="$(extract_port_from_command "${CMD}")"
    if [[ -n "${PORT}" ]] && probe_devtools_port "${PORT}"; then
      echo "${PORT}"
      exit 0
    fi
  else
    rm -f "${PID_FILE}"
  fi
fi

# If TMPDIR differs between shells (common on macOS), the pid file may not be
# under the same MCP_RUN_DIR. Fall back to scanning running Chrome processes for
# this worktree's devtools profile path.
PROFILE_NEEDLE="setta-mcp/${INSTANCE_NAME}-${PROFILE_SUFFIX}/devtools-profile"
while IFS= read -r PID_FROM_PS; do
  if [[ -z "${PID_FROM_PS}" ]] || ! kill -0 "${PID_FROM_PS}" 2>/dev/null; then
    continue
  fi

  CMD="$(ps -p "${PID_FROM_PS}" -o command= 2>/dev/null || true)"
  PORT="$(extract_port_from_command "${CMD}")"
  if [[ -n "${PORT}" ]] && probe_devtools_port "${PORT}"; then
    echo "${PORT}"
    exit 0
  fi
done < <(
  ps -ax -o pid= -o command= 2>/dev/null \
    | awk -v needle="${PROFILE_NEEDLE}" '
        index($0, needle) && index($0, "--remote-debugging-port") && index($0, "--type=") == 0 { print $1 }
      ' \
    | sort -nr
)

if probe_devtools_port "${DEBUG_PORT}"; then
  echo "${DEBUG_PORT}"
  exit 0
fi

echo "No live devtools Chrome process found for ${WORKTREE_ROOT}." >&2
exit 1
