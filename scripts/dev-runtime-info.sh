#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_PATH=""
RUNTIME_LOG_PATH=""

usage() {
  cat <<'EOF'
Usage: dev-runtime-info.sh [--workspace PATH] [--runtime-log PATH]

Emit a single JSON payload describing the current dev runtime for a worktree.
The payload merges authoritative Setta session info with the current frontend
URL from the lifecycle log and the current Chrome DevTools port.
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

extract_runtime_value_from_log() {
  local log_path="$1"
  local pattern="$2"
  local replacement="$3"

  if [[ ! -f "${log_path}" ]]; then
    return 1
  fi

  sed -nE "s/${pattern}/${replacement}/p" "${log_path}" | tail -n1
}

extract_frontend_url_from_log() {
  local log_path="$1"
  extract_runtime_value_from_log "${log_path}" '.*Local:[[:space:]]*(http:\/\/[^[:space:]]+).*$' '\1'
}

extract_backend_url_from_log() {
  local log_path="$1"
  extract_runtime_value_from_log "${log_path}" '.*Ready:[[:space:]]*(http:\/\/[^[:space:]]+).*$' '\1'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --workspace" >&2
        usage >&2
        exit 1
      fi
      WORKSPACE_PATH="$2"
      shift 2
      ;;
    --workspace=*)
      WORKSPACE_PATH="${1#*=}"
      if [[ -z "${WORKSPACE_PATH}" ]]; then
        echo "Missing value for --workspace" >&2
        usage >&2
        exit 1
      fi
      shift
      ;;
    --runtime-log)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --runtime-log" >&2
        usage >&2
        exit 1
      fi
      RUNTIME_LOG_PATH="$2"
      shift 2
      ;;
    --runtime-log=*)
      RUNTIME_LOG_PATH="${1#*=}"
      if [[ -z "${RUNTIME_LOG_PATH}" ]]; then
        echo "Missing value for --runtime-log" >&2
        usage >&2
        exit 1
      fi
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

WORKTREE_ROOT="$(resolve_workspace_root "${WORKSPACE_PATH}")"
if [[ -z "${RUNTIME_LOG_PATH}" ]]; then
  RUNTIME_LOG_PATH=""
elif [[ "${RUNTIME_LOG_PATH}" != /* ]]; then
  RUNTIME_LOG_PATH="${WORKTREE_ROOT}/${RUNTIME_LOG_PATH}"
fi

if [[ -f "${WORKTREE_ROOT}/activate.sh" ]]; then
  # shellcheck disable=SC1090
  source "${WORKTREE_ROOT}/activate.sh"
fi

if [[ -z "${SETTA_FILES_ROOT:-}" ]] && [[ -z "${SETTA_FILES_LOCATION:-}" ]]; then
  export SETTA_FILES_ROOT="${WORKTREE_ROOT}/setta_files_dev"
fi

if ! command -v setta >/dev/null 2>&1; then
  echo "setta CLI is not available in the current environment." >&2
  exit 1
fi

STATUS_PAYLOAD="$(setta status --connect-info --latest --json --workspace "${WORKTREE_ROOT}" 2>/dev/null || true)"
if [[ "${STATUS_PAYLOAD}" != __SETTA_JSON_B64__* ]]; then
  echo "Failed to read connect-info JSON for ${WORKTREE_ROOT}." >&2
  exit 1
fi

CDP_PORT_JSON="$("${SCRIPT_DIR}/cdp-port.sh" --workspace "${WORKTREE_ROOT}" --json)"
FRONTEND_URL="$(extract_frontend_url_from_log "${RUNTIME_LOG_PATH}" 2>/dev/null || true)"
LOG_BACKEND_URL="$(extract_backend_url_from_log "${RUNTIME_LOG_PATH}" 2>/dev/null || true)"

SETTA_STATUS_PAYLOAD="${STATUS_PAYLOAD}" \
CDP_PORT_JSON="${CDP_PORT_JSON}" \
FRONTEND_URL="${FRONTEND_URL}" \
LOG_BACKEND_URL="${LOG_BACKEND_URL}" \
RUNTIME_LOG_PATH="${RUNTIME_LOG_PATH}" \
WORKTREE_ROOT="${WORKTREE_ROOT}" \
python - <<'PY'
import base64
import json
import os
import sys

status_payload = os.environ["SETTA_STATUS_PAYLOAD"]
cdp_payload = json.loads(os.environ["CDP_PORT_JSON"])
status = json.loads(base64.b64decode(status_payload[len("__SETTA_JSON_B64__") :]).decode())
session = status.get("session") or {}

backend_url = None
host = session.get("host")
port = session.get("port")
if host and port:
    backend_url = f"http://{host}:{port}"
if not backend_url:
    backend_url = os.environ.get("LOG_BACKEND_URL") or None

print(
    json.dumps(
        {
            "workspaceRoot": os.environ["WORKTREE_ROOT"],
            "frontendUrl": os.environ.get("FRONTEND_URL") or None,
            "frontendUrlSource": "runtime_log"
            if os.environ.get("FRONTEND_URL")
            else None,
            "backendUrl": backend_url,
            "backendUrlSource": "setta_status" if host and port else "runtime_log",
            "bootstrapUrl": status.get("bootstrapUrlFragment")
            or status.get("bootstrapUrlPlain"),
            "runtimeLogPath": os.environ.get("RUNTIME_LOG_PATH") or None,
            "session": session,
            "runtimeRoot": status.get("runtimeRoot"),
            "settaFilesRoot": status.get("settaFilesRoot"),
            "settaHome": status.get("settaHome"),
            "debugPort": cdp_payload.get("debugPort"),
            "debugPortSource": cdp_payload.get("source"),
            "debugPortPid": cdp_payload.get("pid"),
            "profileDir": cdp_payload.get("profileDir"),
            "mcpRunDir": cdp_payload.get("mcpRunDir"),
            "runtimeMetadataPath": cdp_payload.get("runtimeMetadataPath"),
        }
    )
)
PY
