#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_PATH=""
RUNTIME_LOG_PATH=""
ALLOW_MISSING_CONNECT_INFO="0"

usage() {
  cat <<'EOF'
Usage: dev-runtime-info.sh [--workspace PATH] [--runtime-log PATH] [--allow-missing-connect-info]

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
  local backend_url=""

  backend_url="$(extract_runtime_value_from_log "${log_path}" '.*Ready:[[:space:]]*(http:\/\/[^[:space:]]+).*$' '\1' | tail -n1)"
  if [[ -n "${backend_url}" ]]; then
    printf '%s\n' "${backend_url}"
    return 0
  fi

  extract_runtime_value_from_log "${log_path}" '.*Bind:[[:space:]]*([^[:space:]:]+):([0-9]+).*$' 'http:\/\/\1:\2'
}

extract_debug_port_from_log() {
  local log_path="$1"
  extract_runtime_value_from_log "${log_path}" '.*Starting Chrome with remote debugging on port ([0-9]+).*$' '\1'
}

extract_bootstrap_url_from_log() {
  local log_path="$1"
  if [[ ! -f "${log_path}" ]]; then
    return 1
  fi

  sed -nE 's/.*(http:\/\/[^[:space:]]+\/__setta__\/bootstrap(#[^[:space:]]+)?).*$/\1/p' "${log_path}" \
    | grep -Fv '${LOCAL_PORT}' \
    | tail -n1
}

runtime_state_path_for_log() {
  local log_path="$1"

  if [[ -z "${log_path}" ]]; then
    return 1
  fi

  printf '%s.runtime.json\n' "${log_path}"
}

extract_runtime_value_from_state() {
  local log_path="$1"
  local jq_filter="$2"
  local state_path=""

  if [[ -z "${log_path}" ]]; then
    return 1
  fi

  state_path="$(runtime_state_path_for_log "${log_path}")"
  if [[ ! -f "${state_path}" ]]; then
    return 1
  fi

  jq -r "${jq_filter}" "${state_path}" 2>/dev/null || true
}

extract_backend_url_from_runtime_sources() {
  local log_path="$1"
  local backend_url=""

  backend_url="$(extract_runtime_value_from_state "${log_path}" '.backendUrl // empty' | tail -n1)"
  if [[ -n "${backend_url}" ]]; then
    printf '%s\n' "${backend_url}"
    return 0
  fi

  extract_backend_url_from_log "${log_path}"
}

extract_bootstrap_url_from_runtime_sources() {
  local log_path="$1"
  local bootstrap_url=""

  bootstrap_url="$(extract_runtime_value_from_state "${log_path}" '.bootstrapUrl // empty' | tail -n1)"
  if [[ -n "${bootstrap_url}" ]]; then
    printf '%s\n' "${bootstrap_url}"
    return 0
  fi

  extract_bootstrap_url_from_log "${log_path}"
}

extract_debug_port_from_runtime_sources() {
  local log_path="$1"
  local debug_port=""

  debug_port="$(extract_runtime_value_from_state "${log_path}" 'if (.debugPort // 0) > 0 then (.debugPort | tostring) else "" end' | tail -n1)"
  if [[ -n "${debug_port}" ]]; then
    printf '%s\n' "${debug_port}"
    return 0
  fi

  extract_debug_port_from_log "${log_path}"
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
    --allow-missing-connect-info)
      ALLOW_MISSING_CONNECT_INFO="1"
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

RUNTIME_STATE_PATH=""
if [[ -n "${RUNTIME_LOG_PATH}" ]]; then
  RUNTIME_STATE_PATH="$(runtime_state_path_for_log "${RUNTIME_LOG_PATH}" 2>/dev/null || true)"
fi

if [[ -f "${WORKTREE_ROOT}/.venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "${WORKTREE_ROOT}/.venv/bin/activate"
elif [[ -f "${WORKTREE_ROOT}/activate.sh" ]]; then
  # shellcheck disable=SC1090
  ORIGINAL_PWD="$(pwd -P)"
  cd "${WORKTREE_ROOT}"
  source "${WORKTREE_ROOT}/activate.sh"
  cd "${ORIGINAL_PWD}"
fi

if [[ -z "${SETTA_FILES_ROOT:-}" ]] && [[ -z "${SETTA_FILES_LOCATION:-}" ]]; then
  export SETTA_FILES_ROOT="${WORKTREE_ROOT}/setta_files_dev"
fi

if ! command -v setta >/dev/null 2>&1; then
  echo "setta CLI is not available in the current environment." >&2
  exit 1
fi

STATUS_PAYLOAD="$(setta status --connect-info --latest --json --workspace "${WORKTREE_ROOT}" 2>/dev/null || true)"
if [[ "${STATUS_PAYLOAD}" != __SETTA_JSON_B64__* ]] && [[ "${ALLOW_MISSING_CONNECT_INFO}" != "1" ]]; then
  echo "Failed to read connect-info JSON for ${WORKTREE_ROOT}." >&2
  exit 1
fi

CDP_PORT_JSON="$("${SCRIPT_DIR}/cdp-port.sh" --workspace "${WORKTREE_ROOT}" --json)"
LOG_BACKEND_URL="$(extract_backend_url_from_runtime_sources "${RUNTIME_LOG_PATH}" 2>/dev/null || true)"
LOG_BOOTSTRAP_URL="$(extract_bootstrap_url_from_runtime_sources "${RUNTIME_LOG_PATH}" 2>/dev/null || true)"
LOG_DEBUG_PORT="$(extract_debug_port_from_runtime_sources "${RUNTIME_LOG_PATH}" 2>/dev/null || true)"

SETTA_STATUS_PAYLOAD="${STATUS_PAYLOAD}" \
CDP_PORT_JSON="${CDP_PORT_JSON}" \
LOG_BACKEND_URL="${LOG_BACKEND_URL}" \
LOG_BOOTSTRAP_URL="${LOG_BOOTSTRAP_URL}" \
LOG_DEBUG_PORT="${LOG_DEBUG_PORT}" \
RUNTIME_LOG_PATH="${RUNTIME_LOG_PATH}" \
RUNTIME_STATE_PATH="${RUNTIME_STATE_PATH}" \
WORKTREE_ROOT="${WORKTREE_ROOT}" \
ALLOW_MISSING_CONNECT_INFO="${ALLOW_MISSING_CONNECT_INFO}" \
python - <<'PY'
import base64
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


LOCAL_URL_RE = re.compile(r"Local:\s*(http://\S+)")
READY_URL_RE = re.compile(r"Ready:\s*(http://\S+)")
BIND_RE = re.compile(r"Bind:\s*([^\s:]+):(\d+)")
SESSION_ID_RE = re.compile(r"Setta running \(session ([^)]+)\)")
RUNTIME_BLOCK_START_RE = re.compile(r"Starting Chrome with remote debugging on port \d+")
BOOTSTRAP_URL_RE = re.compile(r"http://\S+/__setta__/bootstrap(?:#\S+)?")


def non_empty_string(value: object) -> str | None:
    if isinstance(value, str) and value:
        return value
    return None


def positive_int(value: object) -> int | None:
    if isinstance(value, int) and value > 0:
        return value
    if isinstance(value, str) and value.isdigit():
        parsed = int(value)
        if parsed > 0:
            return parsed
    return None


def load_runtime_state(runtime_state_path: str | None) -> dict[str, object]:
    if not runtime_state_path:
        return {}

    try:
        raw_state = json.loads(
            Path(runtime_state_path).read_text(encoding="utf-8", errors="replace")
        )
    except (OSError, json.JSONDecodeError):
        return {}

    if not isinstance(raw_state, dict):
        return {}

    return raw_state


def bootstrap_token_from_url(url: str | None) -> str | None:
    if not url:
        return None

    try:
        parts = urlsplit(url)
    except ValueError:
        return None

    fragment_token = parse_qs(parts.fragment, keep_blank_values=True).get("token")
    if fragment_token:
        token = fragment_token[-1].strip()
        return token or None

    query_token = parse_qs(parts.query, keep_blank_values=True).get("token")
    if query_token:
        token = query_token[-1].strip()
        return token or None

    return None


def bootstrap_token_session_id(url: str | None) -> str | None:
    token = bootstrap_token_from_url(url)
    if not token:
        return None

    payload_b64, _, _signature = token.partition(".")
    if not payload_b64:
        return None

    padding = "=" * (-len(payload_b64) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding).decode())
    except (ValueError, json.JSONDecodeError):
        return None

    session_id = payload.get("sessionId")
    if isinstance(session_id, str) and session_id:
        return session_id
    return None


def url_origin(url: str | None) -> str | None:
    if not url:
        return None

    try:
        parts = urlsplit(url)
    except ValueError:
        return None

    if not parts.scheme or not parts.netloc:
        return None
    return f"{parts.scheme}://{parts.netloc}"


def bootstrap_url_matches_current_runtime(
    bootstrap_url: str | None,
    *,
    session_id: str | None,
    backend_url: str | None,
) -> bool:
    if not bootstrap_url:
        return False

    token_session_id = bootstrap_token_session_id(bootstrap_url)
    if session_id and token_session_id:
        return token_session_id == session_id

    if session_id and token_session_id is None and bootstrap_token_from_url(bootstrap_url):
        return False

    if backend_url:
        return url_origin(bootstrap_url) == backend_url

    return True


def parse_runtime_blocks(log_path: str | None) -> list[dict[str, object]]:
    if not log_path:
        return []

    try:
        log_lines = Path(log_path).read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []

    blocks: list[dict[str, object]] = []
    current_block: dict[str, object] = {
        "frontend_url": None,
        "backend_urls": [],
        "session_ids": [],
        "bootstrap_url": None,
    }

    for line in log_lines:
        if RUNTIME_BLOCK_START_RE.search(line):
            if (
                current_block["frontend_url"]
                or current_block["backend_urls"]
                or current_block["session_ids"]
                or current_block["bootstrap_url"]
            ):
                blocks.append(current_block)
                current_block = {
                    "frontend_url": None,
                    "backend_urls": [],
                    "session_ids": [],
                    "bootstrap_url": None,
                }

        local_match = LOCAL_URL_RE.search(line)
        if local_match:
            current_block["frontend_url"] = local_match.group(1)

        session_match = SESSION_ID_RE.search(line)
        if session_match:
            session_ids = current_block["session_ids"]
            assert isinstance(session_ids, list)
            session_ids.append(session_match.group(1))

        ready_match = READY_URL_RE.search(line)
        if ready_match:
            backend_urls = current_block["backend_urls"]
            assert isinstance(backend_urls, list)
            ready_url = ready_match.group(1)
            if ready_url not in backend_urls:
                backend_urls.append(ready_url)

        bind_match = BIND_RE.search(line)
        if bind_match:
            backend_urls = current_block["backend_urls"]
            assert isinstance(backend_urls, list)
            bind_url = f"http://{bind_match.group(1)}:{bind_match.group(2)}"
            if bind_url not in backend_urls:
                backend_urls.append(bind_url)

        bootstrap_match = BOOTSTRAP_URL_RE.search(line)
        if bootstrap_match:
            bootstrap_url = bootstrap_match.group(0)
            if "${LOCAL_PORT}" not in bootstrap_url:
                current_block["bootstrap_url"] = bootstrap_url

    if (
        current_block["frontend_url"]
        or current_block["backend_urls"]
        or current_block["session_ids"]
        or current_block["bootstrap_url"]
    ):
        blocks.append(current_block)

    return blocks


def frontend_url_for_current_runtime(
    runtime_blocks: list[dict[str, object]],
    runtime_state: dict[str, object],
    session_id: str | None,
    backend_url: str | None,
) -> tuple[str | None, str | None]:
    runtime_state_frontend = non_empty_string(runtime_state.get("frontendUrl"))
    runtime_state_backend = non_empty_string(runtime_state.get("backendUrl"))
    raw_runtime_state_session_ids = runtime_state.get("sessionIds")
    runtime_state_session_ids: list[str] = []
    if isinstance(raw_runtime_state_session_ids, list):
        runtime_state_session_ids = [
            session_id_value
            for session_id_value in raw_runtime_state_session_ids
            if isinstance(session_id_value, str) and session_id_value
        ]

    if runtime_state_frontend:
        if session_id and session_id in runtime_state_session_ids:
            return runtime_state_frontend, "runtime_state_current_session"
        if backend_url and runtime_state_backend == backend_url:
            return runtime_state_frontend, "runtime_state_current_backend"

    if session_id:
        for block in reversed(runtime_blocks):
            session_ids = block["session_ids"]
            assert isinstance(session_ids, list)
            if session_id in session_ids:
                frontend_url = block["frontend_url"]
                assert frontend_url is None or isinstance(frontend_url, str)
                return frontend_url, "runtime_log_current_session"

    if backend_url:
        for block in reversed(runtime_blocks):
            backend_urls = block["backend_urls"]
            assert isinstance(backend_urls, list)
            if backend_url in backend_urls:
                frontend_url = block["frontend_url"]
                assert frontend_url is None or isinstance(frontend_url, str)
                return frontend_url, "runtime_log_current_backend"

    return None, None


def bootstrap_url_for_current_runtime(
    *,
    status_bootstrap_fragment: str | None,
    status_bootstrap_plain: str | None,
    runtime_blocks: list[dict[str, object]],
    runtime_state: dict[str, object],
    session_id: str | None,
    backend_url: str | None,
) -> str | None:
    if bootstrap_url_matches_current_runtime(
        status_bootstrap_fragment,
        session_id=session_id,
        backend_url=backend_url,
    ):
        return status_bootstrap_fragment

    runtime_state_bootstrap = non_empty_string(runtime_state.get("bootstrapUrl"))
    runtime_state_backend = non_empty_string(runtime_state.get("backendUrl"))
    raw_runtime_state_session_ids = runtime_state.get("sessionIds")
    runtime_state_session_ids: list[str] = []
    if isinstance(raw_runtime_state_session_ids, list):
        runtime_state_session_ids = [
            value for value in raw_runtime_state_session_ids if isinstance(value, str) and value
        ]

    if runtime_state_bootstrap:
        if session_id and session_id in runtime_state_session_ids:
            if bootstrap_url_matches_current_runtime(
                runtime_state_bootstrap,
                session_id=session_id,
                backend_url=backend_url,
            ):
                return runtime_state_bootstrap
        elif backend_url and runtime_state_backend == backend_url:
            if bootstrap_url_matches_current_runtime(
                runtime_state_bootstrap,
                session_id=session_id,
                backend_url=backend_url,
            ):
                return runtime_state_bootstrap

    if session_id:
        for block in reversed(runtime_blocks):
            session_ids = block["session_ids"]
            assert isinstance(session_ids, list)
            if session_id not in session_ids:
                continue
            bootstrap_url = block["bootstrap_url"]
            assert bootstrap_url is None or isinstance(bootstrap_url, str)
            if bootstrap_url_matches_current_runtime(
                bootstrap_url,
                session_id=session_id,
                backend_url=backend_url,
            ):
                return bootstrap_url

    if backend_url:
        for block in reversed(runtime_blocks):
            backend_urls = block["backend_urls"]
            assert isinstance(backend_urls, list)
            if backend_url not in backend_urls:
                continue
            bootstrap_url = block["bootstrap_url"]
            assert bootstrap_url is None or isinstance(bootstrap_url, str)
            if bootstrap_url_matches_current_runtime(
                bootstrap_url,
                session_id=session_id,
                backend_url=backend_url,
            ):
                return bootstrap_url

    if status_bootstrap_plain and (
        not backend_url or url_origin(status_bootstrap_plain) == backend_url
    ):
        return status_bootstrap_plain

    return None

status_payload = os.environ["SETTA_STATUS_PAYLOAD"]
cdp_payload = json.loads(os.environ["CDP_PORT_JSON"])
allow_missing_connect_info = os.environ.get("ALLOW_MISSING_CONNECT_INFO") == "1"
connect_info_available = status_payload.startswith("__SETTA_JSON_B64__")
runtime_state = load_runtime_state(os.environ.get("RUNTIME_STATE_PATH") or None)
runtime_blocks = parse_runtime_blocks(os.environ.get("RUNTIME_LOG_PATH") or None)

status: dict[str, object]
session: dict[str, object]
if connect_info_available:
    status = json.loads(base64.b64decode(status_payload[len("__SETTA_JSON_B64__") :]).decode())
    raw_session = status.get("session") or {}
    if isinstance(raw_session, dict):
        session = raw_session
    else:
        session = {}
else:
    if not allow_missing_connect_info:
        raise SystemExit(1)
    status = {}
    session = {}

backend_url = None
host = session.get("host")
port = session.get("port")
if host and port:
    backend_url = f"http://{host}:{port}"
backend_url_source = "setta_status"
if not backend_url:
    backend_url = os.environ.get("LOG_BACKEND_URL") or None
    if runtime_state:
        runtime_state_backend = non_empty_string(runtime_state.get("backendUrl"))
        if runtime_state_backend and backend_url == runtime_state_backend:
            backend_url_source = "runtime_state"
        else:
            backend_url_source = "runtime_log"
    else:
        backend_url_source = "runtime_log"

frontend_url, frontend_url_source = frontend_url_for_current_runtime(
    runtime_blocks,
    runtime_state,
    session.get("id"),
    backend_url,
)

debug_port = positive_int(cdp_payload.get("debugPort"))
debug_port_source = non_empty_string(cdp_payload.get("source"))
debug_port_pid = cdp_payload.get("pid")
if debug_port_source == "default":
    runtime_state_debug_port = positive_int(runtime_state.get("debugPort"))
    if runtime_state_debug_port is not None:
        debug_port = runtime_state_debug_port
        debug_port_source = "runtime_state"
        debug_port_pid = None
    else:
        log_debug_port = positive_int(os.environ.get("LOG_DEBUG_PORT"))
        if log_debug_port is not None:
            debug_port = log_debug_port
            debug_port_source = "runtime_log"
            debug_port_pid = None

bootstrap_url = bootstrap_url_for_current_runtime(
    status_bootstrap_fragment=non_empty_string(status.get("bootstrapUrlFragment")),
    status_bootstrap_plain=non_empty_string(status.get("bootstrapUrlPlain")),
    runtime_blocks=runtime_blocks,
    runtime_state=runtime_state,
    session_id=non_empty_string(session.get("id")),
    backend_url=backend_url,
)
if not bootstrap_url and not connect_info_available:
    bootstrap_url = (
        os.environ.get("LOG_BOOTSTRAP_URL")
        or non_empty_string(runtime_state.get("bootstrapUrl"))
    )

print(
    json.dumps(
        {
            "workspaceRoot": os.environ["WORKTREE_ROOT"],
            "connectInfoAvailable": connect_info_available,
            "frontendUrl": frontend_url,
            "frontendUrlSource": frontend_url_source,
            "backendUrl": backend_url,
            "backendUrlSource": backend_url_source,
            "bootstrapUrl": bootstrap_url,
            "runtimeLogPath": os.environ.get("RUNTIME_LOG_PATH") or None,
            "session": session,
            "runtimeRoot": status.get("runtimeRoot"),
            "settaFilesRoot": status.get("settaFilesRoot"),
            "settaHome": status.get("settaHome"),
            "debugPort": debug_port,
            "debugPortSource": debug_port_source,
            "debugPortPid": debug_port_pid,
            "profileDir": cdp_payload.get("profileDir"),
            "mcpRunDir": cdp_payload.get("mcpRunDir"),
            "runtimeMetadataPath": cdp_payload.get("runtimeMetadataPath"),
        }
    )
)
PY
