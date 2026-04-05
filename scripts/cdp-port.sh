#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKTREE_ROOT=""
OUTPUT_JSON="0"

usage() {
  cat <<'EOF'
Usage: cdp-port.sh [--workspace PATH] [--json]

Print the current Chrome DevTools remote-debugging port for a worktree.

Options:
  --workspace PATH  Resolve ports for the provided worktree instead of the
                    current repo root.
  --json            Print a JSON object with debug port metadata.
EOF
}

resolve_workspace_root() {
  local raw_path="$1"
  if [[ -z "${raw_path}" ]]; then
    git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}"
    return 0
  fi

  if [[ -d "${raw_path}" ]]; then
    git -C "${raw_path}" rev-parse --show-toplevel 2>/dev/null \
      || (cd "${raw_path}" >/dev/null 2>&1 && pwd -P) \
      || echo "${raw_path}"
    return 0
  fi

  local parent_dir
  parent_dir="$(dirname "${raw_path}")"
  git -C "${parent_dir}" rev-parse --show-toplevel 2>/dev/null \
    || (cd "${parent_dir}" >/dev/null 2>&1 && pwd -P) \
    || echo "${parent_dir}"
}

WORKSPACE_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --workspace" >&2
        usage >&2
        exit 1
      fi
      WORKSPACE_ARG="$2"
      shift 2
      ;;
    --workspace=*)
      WORKSPACE_ARG="${1#*=}"
      if [[ -z "${WORKSPACE_ARG}" ]]; then
        echo "Missing value for --workspace" >&2
        usage >&2
        exit 1
      fi
      shift
      ;;
    --json)
      OUTPUT_JSON="1"
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

WORKTREE_ROOT="$(resolve_workspace_root "${WORKSPACE_ARG}")"

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

resolve_python_bin() {
  if [[ -n "${VIRTUAL_ENV:-}" ]] && [[ -x "${VIRTUAL_ENV}/bin/python" ]]; then
    echo "${VIRTUAL_ENV}/bin/python"
    return 0
  fi
  if [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
    echo "${ROOT_DIR}/.venv/bin/python"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    echo "python"
    return 0
  fi
  return 1
}

INSTANCE_NAME=$(basename "${WORKTREE_ROOT}")
INSTANCE_OFFSET="$(instance_offset "${INSTANCE_NAME}")"
DEFAULT_DEBUG_PORT=$((9222 + INSTANCE_OFFSET))
DEBUG_PORT="${DEBUG_PORT:-${DEFAULT_DEBUG_PORT}}"

PROFILE_SUFFIX="$(profile_suffix "$WORKTREE_ROOT")"
MCP_BASE_DIR="${MCP_BASE_DIR:-${TMPDIR:-/tmp}/setta-mcp}"
DEFAULT_MCP_RUN_DIR="${MCP_BASE_DIR}/${INSTANCE_NAME}-${PROFILE_SUFFIX}"
MCP_RUN_DIR="${MCP_RUN_DIR:-${DEFAULT_MCP_RUN_DIR}}"
PROFILE_DIR="${PROFILE_DIR:-${MCP_RUN_DIR}/devtools-profile}"
RUNTIME_METADATA_PATH="${MCP_RUN_DIR}/devtools-runtime.json"

print_output() {
  local port="$1"
  local source="$2"
  local pid="$3"
  local python_bin=""

  if [[ "${OUTPUT_JSON}" != "1" ]]; then
    echo "${port}"
    return 0
  fi

  python_bin="$(resolve_python_bin || true)"
  if [[ -z "${python_bin}" ]]; then
    echo "Could not find a Python interpreter for --json output." >&2
    exit 1
  fi

  "${python_bin}" - "$port" "$source" "$pid" "$WORKTREE_ROOT" "$PROFILE_DIR" "$MCP_RUN_DIR" "$RUNTIME_METADATA_PATH" <<'PY'
import json
import sys

port, source, pid, workspace_root, profile_dir, mcp_run_dir, runtime_metadata_path = sys.argv[1:8]
print(
    json.dumps(
        {
            "debugPort": int(port),
            "source": source,
            "pid": int(pid) if pid else None,
            "workspaceRoot": workspace_root,
            "profileDir": profile_dir,
            "mcpRunDir": mcp_run_dir,
            "runtimeMetadataPath": runtime_metadata_path,
        }
    )
)
PY
}

port_from_pid() {
  local pid="$1"
  local command_line=""
  local port=""

  if [[ -z "${pid}" ]] || ! kill -0 "${pid}" 2>/dev/null; then
    return 1
  fi

  command_line="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
  port="$(printf "%s" "${command_line}" | sed -n 's/.*--remote-debugging-port[= ]\([0-9][0-9]*\).*/\1/p')"
  if [[ -z "${port}" ]]; then
    return 1
  fi

  printf '%s\t%s\n' "${pid}" "${port}"
}

read_runtime_metadata_port() {
  local python_bin=""
  python_bin="$(resolve_python_bin || true)"
  [[ -n "${python_bin}" ]] || return 1
  [[ -f "${RUNTIME_METADATA_PATH}" ]] || return 1

  "${python_bin}" - "${RUNTIME_METADATA_PATH}" <<'PY'
import json
import os
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

pid = data.get("pid")
port = data.get("debugPort")
if not port:
    raise SystemExit(1)
if pid is not None:
    try:
        os.kill(int(pid), 0)
    except OSError:
        raise SystemExit(1)
print(f"{int(pid) if pid is not None else ''}\t{int(port)}")
PY
}

latest_process_scan_port() {
  local profile_needle="$1"

  ps -ax -o pid= -o command= 2>/dev/null \
    | awk -v needle="${profile_needle}" '
        index($0, needle) && match($0, /--remote-debugging-port(=| )[0-9]+/) {
          port = substr($0, RSTART, RLENGTH)
          sub(/^--remote-debugging-port(=| )/, "", port)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", port)
          pid = $1
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", pid)
          if (pid != "" && port != "") {
            print pid "\t" port
          }
        }
      ' \
    | sort -n \
    | tail -n 1
}

emit_default_port() {
  print_output "${DEBUG_PORT}" "default" ""
  exit 0
}

PID_FILE="${MCP_RUN_DIR}/devtools.pid"
if metadata_info="$(read_runtime_metadata_port 2>/dev/null || true)"; then
  if [[ -n "${metadata_info}" ]]; then
    metadata_pid="${metadata_info%%$'\t'*}"
    metadata_port="${metadata_info##*$'\t'}"
    print_output "${metadata_port}" "runtime_metadata" "${metadata_pid}"
    exit 0
  fi
fi

if [[ -f "${PID_FILE}" ]]; then
  pid_from_file="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if pid_info="$(port_from_pid "${pid_from_file}" 2>/dev/null || true)"; then
    if [[ -n "${pid_info}" ]]; then
      pid_value="${pid_info%%$'\t'*}"
      port_value="${pid_info##*$'\t'}"
      print_output "${port_value}" "pid_file" "${pid_value}"
      exit 0
    fi
  fi
fi

PROFILE_NEEDLE="setta-mcp/${INSTANCE_NAME}-${PROFILE_SUFFIX}/devtools-profile"
if process_info="$(latest_process_scan_port "${PROFILE_NEEDLE}" 2>/dev/null || true)"; then
  if [[ -n "${process_info}" ]]; then
    process_pid="${process_info%%$'\t'*}"
    process_port="${process_info##*$'\t'}"
    print_output "${process_port}" "process_scan" "${process_pid}"
    exit 0
  fi
fi

emit_default_port
