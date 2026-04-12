#!/usr/bin/env bash
set -euo pipefail

CHROME_BIN="${CHROME_BIN:-}"
FOREGROUND="0"
CHROME_EXTRA_ARGS="${CHROME_EXTRA_ARGS:-}"
BROWSER_MODE="${BROWSER_MODE:-}"
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
PROFILE_DIR="${PROFILE_DIR:-${MCP_RUN_DIR}/devtools-profile}"
BOOTSTRAP_ENABLED="${BOOTSTRAP_ENABLED:-1}"
BOOTSTRAP_WAIT_SECONDS="${BOOTSTRAP_WAIT_SECONDS:-120}"
DEVTOOLS_CLOSE_BLANK_TABS="${DEVTOOLS_CLOSE_BLANK_TABS:-1}"
DEVTOOLS_OPEN_WITH_CHROME="${DEVTOOLS_OPEN_WITH_CHROME:-1}"
BOOTSTRAP_VERBOSE="${BOOTSTRAP_VERBOSE:-1}"
DEVTOOLS_HEADLESS="${DEVTOOLS_HEADLESS:-0}"
BOOTSTRAP_LOG_PATH="${SETTA_BOOTSTRAP_LOG_PATH:-${SETTA_BACKEND_LOG_FILE:-${ROOT_DIR}/backend.log}}"

CHROME_ARGS=()
HEADLESS_CHROME_ARGS=()
if [[ -n "${CHROME_EXTRA_ARGS}" ]]; then
  # shellcheck disable=SC2206
  CHROME_ARGS=(${CHROME_EXTRA_ARGS})
fi

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

clear_devtools_profile_auth_cookies() {
  local profile_dir="$1"
  local python_bin=""
  python_bin="$(resolve_python_bin || true)"
  if [[ -z "${python_bin}" ]]; then
    return 0
  fi
  "${python_bin}" \
    "${SCRIPT_DIR}/lib/clear_devtools_profile_auth_cookies.py" \
    --profile-dir "${profile_dir}"
}

write_pid() {
  mkdir -p "$MCP_RUN_DIR"
  printf "%s\n" "$2" > "$1"
}

find_active_devtools_pid() {
  local profile_needle="setta-mcp/${INSTANCE_NAME}-${PROFILE_SUFFIX}/devtools-profile"

  ps -ax -o pid= -o command= 2>/dev/null \
    | awk -v needle="${profile_needle}" -v port="${DEBUG_PORT}" '
        index($0, needle) && index($0, "--remote-debugging-port=" port) {
          print $1
          next
        }
        index($0, needle) && index($0, "--remote-debugging-port " port) {
          print $1
        }
      ' \
    | sed '/^[[:space:]]*$/d' \
    | sort -n \
    | tail -n 1
}

write_runtime_manifest() {
  local pid=""
  local python_bin=""
  local manifest_path="${MCP_RUN_DIR}/devtools-runtime.json"

  mkdir -p "${MCP_RUN_DIR}"
  if [[ -f "${MCP_RUN_DIR}/devtools.pid" ]]; then
    pid="$(cat "${MCP_RUN_DIR}/devtools.pid" 2>/dev/null || true)"
  fi

  python_bin="$(resolve_python_bin || true)"
  if [[ -z "${python_bin}" ]]; then
    cat > "${manifest_path}" <<EOF
{"workspaceRoot":"${WORKTREE_ROOT}","debugPort":${DEBUG_PORT},"pid":${pid:-null},"profileDir":"${PROFILE_DIR}","mcpRunDir":"${MCP_RUN_DIR}"}
EOF
    return 0
  fi

  WORKTREE_ROOT="${WORKTREE_ROOT}" \
  DEBUG_PORT="${DEBUG_PORT}" \
  DEVTOOLS_PID="${pid}" \
  PROFILE_DIR="${PROFILE_DIR}" \
  MCP_RUN_DIR="${MCP_RUN_DIR}" \
  MANIFEST_PATH="${manifest_path}" \
  "${python_bin}" - <<'PY'
import json
import os
from datetime import datetime, timezone

manifest_path = os.environ["MANIFEST_PATH"]
pid_raw = os.environ.get("DEVTOOLS_PID", "").strip()

payload = {
    "workspaceRoot": os.environ["WORKTREE_ROOT"],
    "debugPort": int(os.environ["DEBUG_PORT"]),
    "pid": int(pid_raw) if pid_raw else None,
    "profileDir": os.environ["PROFILE_DIR"],
    "mcpRunDir": os.environ["MCP_RUN_DIR"],
    "updatedAt": datetime.now(timezone.utc).isoformat(),
}

with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY
}

record_active_devtools_browser() {
  local detected_pid=""

  for _ in {1..20}; do
    detected_pid="$(find_active_devtools_pid || true)"
    if [[ -n "${detected_pid}" ]] && kill -0 "${detected_pid}" 2>/dev/null; then
      write_pid "${MCP_RUN_DIR}/devtools.pid" "${detected_pid}"
      break
    fi
    sleep 0.25
  done

  write_runtime_manifest
}

launch_background_browser() {
  local python_bin=""
  local pid=""

  python_bin="$(resolve_python_bin || true)"
  if [[ -n "${python_bin}" ]]; then
    pid="$(
      "${python_bin}" - "$@" <<'PY'
import subprocess
import sys

proc = subprocess.Popen(
    sys.argv[1:],
    stdin=subprocess.DEVNULL,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    start_new_session=True,
)
print(proc.pid)
PY
    )"
    write_pid "${MCP_RUN_DIR}/devtools.pid" "${pid}"
    return 0
  fi

  nohup "$@" >/dev/null 2>&1 &
  write_pid "${MCP_RUN_DIR}/devtools.pid" "$!"
}

get_bootstrap_url() {
  local status_payload=""
  local status_url=""

  if [[ -f "${ROOT_DIR}/activate.sh" ]]; then
    # Ensure the python env is active for the Setta CLI.
    # shellcheck disable=SC1090
    source "${ROOT_DIR}/activate.sh"
  fi
  if ! command -v setta >/dev/null 2>&1; then
    extract_bootstrap_url_from_runtime_log "${BOOTSTRAP_LOG_PATH}" || return 1
    return 0
  fi

  status_payload="$(setta status --connect-info --latest --json --workspace "${WORKTREE_ROOT}" 2>/dev/null || true)"
  if [[ "$status_payload" == __SETTA_JSON_B64__* ]]; then
    local b64_payload="${status_payload#__SETTA_JSON_B64__}"
    local python_bin=""
    python_bin="$(resolve_python_bin || true)"
    if [[ -n "$python_bin" ]]; then
      status_url="$(
        SETTA_STATUS_B64="$b64_payload" "$python_bin" - <<'PY'
import base64
import json
import os
import sys

payload = os.environ.get("SETTA_STATUS_B64", "")
if not payload:
    sys.exit(1)
data = json.loads(base64.b64decode(payload).decode("utf-8"))
url = data.get("bootstrapUrlFragment", "") or data.get("bootstrapUrlPlain", "")
if url:
    print(url)
PY
      )"
    fi
  fi

  if [[ -n "${status_url}" ]]; then
    printf '%s\n' "${status_url}"
    return 0
  fi

  extract_bootstrap_url_from_runtime_log "${BOOTSTRAP_LOG_PATH}" || return 1
}

extract_bootstrap_url_from_runtime_log() {
  local log_path="$1"
  local python_bin=""

  if [[ ! -f "${log_path}" ]]; then
    return 1
  fi

  python_bin="$(resolve_python_bin || true)"
  if [[ -z "${python_bin}" ]]; then
    return 1
  fi

  BOOTSTRAP_LOG_PATH_TO_PARSE="${log_path}" "$python_bin" - <<'PY'
import os
import re
import sys
from pathlib import Path

BOOTSTRAP_URL_RE = re.compile(r"http://\S+/__setta__/bootstrap(?:#\S+)?")
BIND_RE = re.compile(r"Bind:\s*([^\s:]+):(\d+)")
SESSION_RE = re.compile(r"Setta running \(session ([^)]+)\)")
TOKEN_RE = re.compile(r"and paste:\s*(\S+)")
URL_TOKEN_RE = re.compile(r"[?#&]token=([^&#\s]+)")


def parse_bootstrap_url(log_path: Path) -> str | None:
    try:
        lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return None

    blocks: list[dict[str, str | None]] = []
    current: dict[str, str | None] | None = None

    for line in lines:
        session_match = SESSION_RE.search(line)
        if session_match:
            if current is not None:
                blocks.append(current)
            current = {
                "session_id": session_match.group(1),
                "bind_host": None,
                "bind_port": None,
                "bootstrap_url": None,
                "token": None,
            }
            continue

        if current is None:
            continue

        bind_match = BIND_RE.search(line)
        if bind_match:
            current["bind_host"] = bind_match.group(1)
            current["bind_port"] = bind_match.group(2)

        url_match = BOOTSTRAP_URL_RE.search(line)
        if url_match:
            url = url_match.group(0)
            current["bootstrap_url"] = url
            token_match = URL_TOKEN_RE.search(url)
            if token_match:
                current["token"] = token_match.group(1)

        token_match = TOKEN_RE.search(line)
        if token_match:
            current["token"] = token_match.group(1)

    if current is not None:
        blocks.append(current)

    for block in reversed(blocks):
        bootstrap_url = block["bootstrap_url"]
        if bootstrap_url and "${LOCAL_PORT}" not in bootstrap_url:
            return bootstrap_url
        bind_host = block["bind_host"]
        bind_port = block["bind_port"]
        token = block["token"]
        if bind_host and bind_port and token:
            return f"http://{bind_host}:{bind_port}/__setta__/bootstrap#token={token}"

    return None


bootstrap_url = parse_bootstrap_url(Path(os.environ["BOOTSTRAP_LOG_PATH_TO_PARSE"]))
if bootstrap_url:
    print(bootstrap_url)
    sys.exit(0)
sys.exit(1)
PY
}

open_devtools_tab() {
  local target_url="$1"
  if [[ -z "$target_url" ]]; then
    return 1
  fi
  local python_bin=""
  python_bin="$(resolve_python_bin || true)"
  if [[ -z "$python_bin" ]]; then
    return 1
  fi

  TARGET_URL="$target_url" DEBUG_PORT="$DEBUG_PORT" "$python_bin" - <<'PY'
import json
import os
import sys
import urllib.parse
import urllib.request

target = os.environ.get("TARGET_URL", "")
port = os.environ.get("DEBUG_PORT", "")
if not target or not port:
    sys.exit(1)

encoded = urllib.parse.quote(target, safe="")
endpoint = f"http://127.0.0.1:{port}/json/new?{encoded}"
payload = None


def _request(method, url):
    req = urllib.request.Request(url, method=method)
    return urllib.request.urlopen(req, timeout=2)


try:
    request = urllib.request.Request(endpoint, method="PUT")
    with urllib.request.urlopen(request, timeout=2) as response:
        payload = response.read()
except Exception:
    try:
        with urllib.request.urlopen(endpoint, timeout=2) as response:
            payload = response.read()
    except Exception:
        sys.exit(1)

if not payload:
    sys.exit(1)

try:
    data = json.loads(payload.decode("utf-8"))
except Exception:
    sys.exit(1)

target_id = data.get("id")

if os.environ.get("DEVTOOLS_CLOSE_BLANK_TABS") == "1" and target_id:
    list_url = f"http://127.0.0.1:{port}/json/list"
    try:
        with urllib.request.urlopen(list_url, timeout=2) as response:
            pages = json.loads(response.read().decode("utf-8"))
    except Exception:
        sys.exit(0)

    for page in pages:
        if page.get("id") == target_id:
            continue
        if page.get("url") != "about:blank":
            continue
        close_url = f"http://127.0.0.1:{port}/json/close/{page['id']}"
        try:
            with _request("PUT", close_url):
                pass
        except Exception:
            try:
                with urllib.request.urlopen(close_url, timeout=2):
                    pass
            except Exception:
                continue
PY
}

bootstrap_url_ready() {
  local target_url="$1"
  if [[ -z "$target_url" ]]; then
    return 1
  fi
  local python_bin=""
  python_bin="$(resolve_python_bin || true)"
  if [[ -z "$python_bin" ]]; then
    return 0
  fi
  local url_no_fragment="${target_url%%#*}"
  if [[ -z "$url_no_fragment" ]]; then
    return 1
  fi

  TARGET_URL="$url_no_fragment" "$python_bin" - <<'PY'
import os
import sys
import urllib.request

target = os.environ.get("TARGET_URL", "")
if not target:
    sys.exit(1)

try:
    req = urllib.request.Request(target, method="GET")
    with urllib.request.urlopen(req, timeout=2) as response:
        status = getattr(response, "status", 200)
        if 200 <= status < 400:
            sys.exit(0)
        sys.exit(1)
except Exception:
    sys.exit(1)
PY
}

open_bootstrap_in_devtools() {
  if [[ "${BOOTSTRAP_ENABLED}" != "1" ]]; then
    return 0
  fi

  local elapsed=0
  while (( elapsed < BOOTSTRAP_WAIT_SECONDS )); do
    local url=""
    if url="$(get_bootstrap_url 2>/dev/null)"; then
      if [[ -n "$url" ]]; then
        if bootstrap_url_ready "$url"; then
          echo "Bootstrap URL (recommended):"
          echo "$url"
          open_devtools_tab "$url" >/dev/null 2>&1 || true
          if [[ "${DEVTOOLS_OPEN_WITH_CHROME}" == "1" ]]; then
            "$CHROME_BIN" --user-data-dir="$PROFILE_DIR" "$url" >/dev/null 2>&1 &
          fi
          return 0
        fi
        if [[ "$BOOTSTRAP_VERBOSE" == "1" ]] && (( elapsed % 5 == 0 )); then
          echo "Bootstrap URL not yet ready: $url"
        fi
      elif [[ "$BOOTSTRAP_VERBOSE" == "1" ]] && (( elapsed % 5 == 0 )); then
        echo "Bootstrap URL not yet available (setta status returned empty)."
      fi
    elif [[ "$BOOTSTRAP_VERBOSE" == "1" ]] && (( elapsed % 5 == 0 )); then
      echo "Bootstrap URL not yet available (setta status failed)."
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  if [[ "$BOOTSTRAP_VERBOSE" == "1" ]]; then
    echo "Timed out waiting for Setta bootstrap URL."
  fi
}

usage() {
  cat <<'EOF'
Usage: start-browser-mcp.sh [--devtools] [--foreground] [--browser-mode headed|headless]

Starts a dedicated Chrome/Chromium instance with remote debugging enabled for
chrome-devtools-mcp. This is separate from your main profile.

Environment variables:
  DEBUG_PORT   Remote debugging port (default: 9222 + worktree offset)
  MCP_RUN_DIR  Base dir for MCP state (default: ${TMPDIR:-/tmp}/setta-mcp/<worktree>)
  PROFILE_DIR  User data dir for the debug instance (default: ${TMPDIR:-/tmp}/setta-mcp/<worktree>/devtools-profile)
  BOOTSTRAP_ENABLED  Open /__setta__/bootstrap with token when possible (default: 1)
  BOOTSTRAP_WAIT_SECONDS  Seconds to wait for a bootstrap URL before giving up (default: 120)
  DEVTOOLS_CLOSE_BLANK_TABS  Close about:blank tabs after opening Setta (default: 1)
  DEVTOOLS_OPEN_WITH_CHROME  Also ask Chrome to open the URL in the devtools profile (default: 1)
  DEVTOOLS_HEADLESS  Launch the devtools browser in headless mode when set to 1 (default: 0)
  CHROME_BIN   Path to Chrome/Chromium binary (auto-detected if unset)
  CHROME_EXTRA_ARGS  Extra Chrome flags (space-separated)

Flags:
  --devtools       Start Chrome with remote debugging for chrome-devtools-mcp
  --foreground     Keep the debug browser attached to this terminal (devtools only)
  --browser-mode   headed or headless; overrides DEVTOOLS_HEADLESS for this run
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --devtools)
      shift
      ;;
    --foreground)
      FOREGROUND="1"
      shift
      ;;
    --browser-mode)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --browser-mode" >&2
        usage >&2
        exit 1
      fi
      BROWSER_MODE="$2"
      shift 2
      ;;
    --browser-mode=*)
      BROWSER_MODE="${1#*=}"
      if [[ -z "${BROWSER_MODE}" ]]; then
        echo "Missing value for --browser-mode" >&2
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

if [[ -n "${BROWSER_MODE}" ]]; then
  case "${BROWSER_MODE}" in
    headed)
      DEVTOOLS_HEADLESS="0"
      ;;
    headless)
      DEVTOOLS_HEADLESS="1"
      ;;
    *)
      echo "Invalid value for --browser-mode: ${BROWSER_MODE}. Expected headed or headless." >&2
      exit 1
      ;;
  esac
fi

case "${DEVTOOLS_HEADLESS}" in
  0|1) ;;
  *)
    echo "Invalid DEVTOOLS_HEADLESS value: ${DEVTOOLS_HEADLESS}. Expected 0 or 1." >&2
    exit 1
    ;;
esac

if [[ "${DEVTOOLS_HEADLESS}" == "1" ]]; then
  DEVTOOLS_OPEN_WITH_CHROME="0"
  HEADLESS_CHROME_ARGS=(--headless)
fi

if [[ -z "$CHROME_BIN" ]]; then
  if [[ "${OSTYPE:-}" == "darwin"* ]]; then
    if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
      CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    elif [[ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]]; then
      CHROME_BIN="/Applications/Chromium.app/Contents/MacOS/Chromium"
    fi
  fi
fi

if [[ -z "$CHROME_BIN" ]]; then
  if command -v google-chrome >/dev/null 2>&1; then
    CHROME_BIN="$(command -v google-chrome)"
  elif command -v chromium-browser >/dev/null 2>&1; then
    CHROME_BIN="$(command -v chromium-browser)"
  elif command -v chromium >/dev/null 2>&1; then
    CHROME_BIN="$(command -v chromium)"
  fi
fi

if [[ -z "$CHROME_BIN" ]]; then
  echo "Could not find Chrome/Chromium. Set CHROME_BIN to the browser executable." >&2
  exit 1
fi

if command -v lsof >/dev/null 2>&1; then
  if lsof -iTCP:"$DEBUG_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $DEBUG_PORT is already in use. Set DEBUG_PORT to a free port." >&2
    exit 1
  fi
fi

mkdir -p "$PROFILE_DIR"
clear_devtools_profile_auth_cookies "$PROFILE_DIR"

BACKGROUND_CHROME_ARGS=(
  --remote-debugging-port="$DEBUG_PORT"
  --user-data-dir="$PROFILE_DIR"
  --no-first-run
  --no-default-browser-check
)
if [[ ${#HEADLESS_CHROME_ARGS[@]} -gt 0 ]]; then
  BACKGROUND_CHROME_ARGS+=("${HEADLESS_CHROME_ARGS[@]}")
fi
if [[ ${#CHROME_ARGS[@]} -gt 0 ]]; then
  BACKGROUND_CHROME_ARGS+=("${CHROME_ARGS[@]}")
fi
BACKGROUND_CHROME_ARGS+=(about:blank)

OPEN_CHROME_ARGS=(
  --remote-debugging-port="$DEBUG_PORT"
  --user-data-dir="$PROFILE_DIR"
  --no-first-run
  --no-default-browser-check
)
if [[ ${#CHROME_ARGS[@]} -gt 0 ]]; then
  OPEN_CHROME_ARGS+=("${CHROME_ARGS[@]}")
fi
OPEN_CHROME_ARGS+=(about:blank)

echo "Starting Chrome with remote debugging on port $DEBUG_PORT..."
if [[ "$FOREGROUND" == "1" ]]; then
  write_pid "${MCP_RUN_DIR}/devtools.pid" "$$"
  write_runtime_manifest
  open_bootstrap_in_devtools
  exec "$CHROME_BIN" "${BACKGROUND_CHROME_ARGS[@]}"
else
  if [[ "${DEVTOOLS_HEADLESS}" == "1" ]]; then
    launch_background_browser "$CHROME_BIN" "${BACKGROUND_CHROME_ARGS[@]}"
  else
    app_bundle=""
    if [[ "${OSTYPE:-}" == "darwin"* ]]; then
      case "$CHROME_BIN" in
        *.app/Contents/MacOS/*)
          app_bundle="${CHROME_BIN%/Contents/MacOS/*}"
          ;;
      esac
    fi
    if [[ -n "$app_bundle" ]] && command -v open >/dev/null 2>&1; then
      if ! open -g -n -a "$app_bundle" --args "${OPEN_CHROME_ARGS[@]}" >/dev/null 2>&1; then
        launch_background_browser "$CHROME_BIN" "${OPEN_CHROME_ARGS[@]}"
      fi
    else
      launch_background_browser "$CHROME_BIN" "${OPEN_CHROME_ARGS[@]}"
    fi
  fi
  record_active_devtools_browser
  open_bootstrap_in_devtools
  write_runtime_manifest
  echo "chrome-devtools-mcp expects: http://127.0.0.1:$DEBUG_PORT"
  if [[ "${DEVTOOLS_HEADLESS}" == "1" ]]; then
    echo "To stop the debug browser, kill its process."
  else
    echo "To stop the debug browser, quit that Chrome window or kill its process."
  fi
fi
