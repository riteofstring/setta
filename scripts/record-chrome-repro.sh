#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")
SETTA_CLI_HELPER="${ROOT_DIR}/scripts/lib/setta_cli_command.sh"
if [[ ! -f "${SETTA_CLI_HELPER}" ]]; then
  echo "Missing Setta CLI helper: ${SETTA_CLI_HELPER}" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "${SETTA_CLI_HELPER}"

if [[ -n "${HOME:-}" ]]; then
  DEFAULT_SETTA_HOME="${HOME}/.setta-development"
else
  DEFAULT_SETTA_HOME=".setta-development"
fi
DEFAULT_DEV_SETTA_FILES_ROOT="${WORKTREE_ROOT}/setta_files_dev"

resolve_python_bin() {
  if [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
    printf '%s\n' "${ROOT_DIR}/.venv/bin/python"
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    printf '%s\n' "python"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "python3"
    return 0
  fi
  return 1
}

PYTHON_BIN="$(resolve_python_bin || true)"
if [[ -z "${PYTHON_BIN}" ]]; then
  echo "Could not find Python for the Chrome repro recorder." >&2
  exit 1
fi

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
}

write_latest_recording_pointer() {
  local recording_root="$1"
  local artifact_dir="$2"
  local latest_json="${recording_root}/latest.json"
  local latest_link="${recording_root}/latest"

  mkdir -p "${recording_root}"
  "${PYTHON_BIN}" - "${latest_json}" "${recording_root}" "${artifact_dir}" <<'PY'
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

latest_json = Path(sys.argv[1])
recording_root = Path(sys.argv[2]).resolve()
artifact_dir = Path(sys.argv[3]).resolve()
payload = {
    "format": "setta.chrome-repro-latest/v1",
    "updatedAt": datetime.now(UTC).isoformat(),
    "recordingRoot": str(recording_root),
    "artifactDir": str(artifact_dir),
    "sessionFile": str(artifact_dir / "session.json"),
    "recordingFile": str(artifact_dir / "recording.json"),
    "launcherFile": str(artifact_dir / "launcher.json"),
    "llmArtifactsDir": str(artifact_dir / "llm_engine_artifacts"),
    "llmArtifactsManifest": str(artifact_dir / "llm_engine_artifacts" / "manifest.json"),
}
latest_json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY

  rm -f "${latest_link}"
  ln -s "${artifact_dir}" "${latest_link}"
}

resolve_active_setta_files_root() {
  if [[ -n "${SETTA_FILES_ROOT:-}" ]]; then
    printf '%s\n' "${SETTA_FILES_ROOT}"
    return 0
  fi

  if [[ -f "${ROOT_DIR}/activate.sh" ]]; then
    # shellcheck disable=SC1090
    source "${ROOT_DIR}/activate.sh"
  fi
  if ! setta_cli_command_init "${ROOT_DIR}"; then
    return 1
  fi

  local paths_payload=""
  paths_payload="$("${SETTA_CLI_CMD[@]}" paths --json --workspace "${SETTA_WORKSPACE_ROOT}" 2>/dev/null || true)"
  if [[ "${paths_payload}" != __SETTA_JSON_B64__* ]]; then
    return 1
  fi

  local b64_payload="${paths_payload#__SETTA_JSON_B64__}"
  SETTA_PATHS_B64="${b64_payload}" "${PYTHON_BIN}" - <<'PY'
import base64
import json
import os
import sys

payload = os.environ.get("SETTA_PATHS_B64", "")
if not payload:
    sys.exit(1)
data = json.loads(base64.b64decode(payload).decode("utf-8"))
root = data.get("settaFilesRoot", "")
if not isinstance(root, str) or root.strip() == "":
    sys.exit(1)
print(root.strip())
PY
}

resolve_default_recording_root() {
  if [[ -n "${SETTA_CHROME_REPRO_ROOT_DIR:-}" ]]; then
    printf '%s\n' "${SETTA_CHROME_REPRO_ROOT_DIR}"
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

  printf '%s/%s%s\n' "${TMPDIR:-/tmp}/setta-chrome-recordings" "${repo_name}" "${repo_suffix}"
}

usage() {
  cat <<'EOF'
Usage: ./scripts/record-chrome-repro.sh [--artifact-dir <dir>] [--reset]

Starts Setta with the normal dev-state defaults, launches a dedicated Chrome
profile with a repo-owned recording extension, and writes the captured browser
events into a temp artifact bundle when that Chrome window exits.

By default, the recorder uses the normal dev state:
  SETTA_HOME=~/.setta-development
  SETTA_FILES_ROOT=<worktree>/setta_files_dev
  SETTA_PROJECT_PATH=/home

Close the dedicated Chrome window when you are done recording.
After the run, resolve the newest bundle with:
  ./scripts/latest-chrome-recording.sh --json

Options:
  --artifact-dir <dir>  Override the recording bundle directory.
  --reset               Reset Setta state first using the normal dev-state roots.
  -h, --help            Show this help.

Environment:
  SETTA_CHROME_REPRO_ROOT_DIR         Override the default temp recording root.
  SETTA_CHROME_REPRO_SKIP_DEV_START   Skip launching the local dev instance.
  SETTA_CHROME_REPRO_BOOTSTRAP_URL    Use this bootstrap URL directly.
  SETTA_CHROME_REPRO_DEV_MODE         Dev runner mode: start | startr (default: start)
  SETTA_CHROME_REPRO_LOG_LEVEL        Backend log level for repro runs (default: debug)
  CHROME_BIN                          Path to Chrome/Chromium binary.
  CHROME_EXTRA_ARGS                   Extra Chrome flags (space-separated).

The recorder prefers Playwright's bundled Chrome for Testing when available,
because recent branded Google Chrome builds can reject unpacked extensions.
EOF
}

resolve_playwright_chrome_bin() {
  if ! command -v pnpm >/dev/null 2>&1; then
    return 1
  fi
  if [[ ! -f "${ROOT_DIR}/frontend/package.json" ]]; then
    return 1
  fi

  local candidate=""
  candidate="$(pnpm -C "${ROOT_DIR}/frontend" exec node -p "require('@playwright/test').chromium.executablePath()" 2>/dev/null || true)"
  if [[ -z "${candidate}" ]] || [[ ! -x "${candidate}" ]]; then
    return 1
  fi
  printf '%s\n' "${candidate}"
}

resolve_chrome_bin() {
  if [[ -n "${CHROME_BIN:-}" ]]; then
    printf '%s\n' "${CHROME_BIN}"
    return 0
  fi

  local playwright_chrome_bin=""
  playwright_chrome_bin="$(resolve_playwright_chrome_bin || true)"
  if [[ -n "${playwright_chrome_bin}" ]]; then
    printf '%s\n' "${playwright_chrome_bin}"
    return 0
  fi

  if [[ "${OSTYPE:-}" == "darwin"* ]]; then
    if [[ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]]; then
      printf '%s\n' "/Applications/Chromium.app/Contents/MacOS/Chromium"
      return 0
    fi
    if [[ -x "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" ]]; then
      printf '%s\n' "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
      return 0
    fi
  fi

  if command -v chromium >/dev/null 2>&1; then
    command -v chromium
    return 0
  fi
  if command -v chromium-browser >/dev/null 2>&1; then
    command -v chromium-browser
    return 0
  fi
  if command -v google-chrome >/dev/null 2>&1; then
    command -v google-chrome
    return 0
  fi
  if [[ "${OSTYPE:-}" == "darwin"* ]] && [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
    printf '%s\n' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    return 0
  fi
  return 1
}

chrome_binary_may_reject_unpacked_extensions() {
  local chrome_bin="$1"
  case "${chrome_bin}" in
    *"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"|*/google-chrome)
      return 0
      ;;
  esac
  return 1
}

pick_free_port() {
  "${PYTHON_BIN}" - <<'PY'
import socket

with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
}

wait_for_url() {
  local target_url="$1"
  local label="$2"
  local timeout_seconds="$3"

  "${PYTHON_BIN}" - "${target_url}" "${label}" "${timeout_seconds}" <<'PY'
import sys
import time
import urllib.request

target_url = sys.argv[1]
label = sys.argv[2]
timeout_seconds = int(sys.argv[3])

deadline = time.time() + timeout_seconds
last_error = None
while time.time() < deadline:
    try:
        request = urllib.request.Request(target_url, method="GET")
        with urllib.request.urlopen(request, timeout=2) as response:
            status = getattr(response, "status", 200)
            if 200 <= status < 500:
                raise SystemExit(0)
    except Exception as exc:  # pragma: no cover - exercised via script tests
        last_error = str(exc)
    time.sleep(1)

message = f"Timed out waiting for {label} at {target_url}"
if last_error:
    message = f"{message}: {last_error}"
raise SystemExit(message)
PY
}

bootstrap_url_ready() {
  local target_url="$1"
  local target_no_fragment="${target_url%%#*}"
  wait_for_url "${target_no_fragment}" "bootstrap URL" 120 >/dev/null 2>&1
}

read_bootstrap_url() {
  if [[ -n "${SETTA_CHROME_REPRO_BOOTSTRAP_URL:-}" ]]; then
    printf '%s\n' "${SETTA_CHROME_REPRO_BOOTSTRAP_URL}"
    return 0
  fi

  if [[ -f "${ROOT_DIR}/activate.sh" ]]; then
    # shellcheck disable=SC1090
    source "${ROOT_DIR}/activate.sh"
  fi
  if ! setta_cli_command_init "${ROOT_DIR}"; then
    return 1
  fi

  local status_payload=""
  status_payload="$("${SETTA_CLI_CMD[@]}" status --connect-info --latest --json --workspace "${SETTA_WORKSPACE_ROOT}" 2>/dev/null || true)"
  if [[ "${status_payload}" != __SETTA_JSON_B64__* ]]; then
    return 1
  fi

  local b64_payload="${status_payload#__SETTA_JSON_B64__}"
  SETTA_STATUS_B64="${b64_payload}" "${PYTHON_BIN}" - <<'PY'
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
}

wait_for_bootstrap_url() {
  local timeout_seconds="${1:-120}"
  local elapsed=0
  while [[ "${elapsed}" -lt "${timeout_seconds}" ]]; do
    local candidate=""
    candidate="$(read_bootstrap_url || true)"
    if [[ -n "${candidate}" ]] && bootstrap_url_ready "${candidate}"; then
      printf '%s\n' "${candidate}"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo "Timed out waiting for a Setta bootstrap URL." >&2
  return 1
}

copy_extension_template() {
  local destination_dir="$1"
  mkdir -p "${destination_dir}"
  cp -R "${ROOT_DIR}/scripts/chrome-repro-recorder-extension/." "${destination_dir}"
}

write_extension_config() {
  local extension_dir="$1"
  local collector_base_url="$2"
  "${PYTHON_BIN}" - "${extension_dir}/config.js" "${collector_base_url}" <<'PY'
import json
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
payload = {"collectorBaseUrl": sys.argv[2]}
config_path.write_text(
    "export const SETTA_CHROME_REPRO_CONFIG = "
    + json.dumps(payload, indent=2)
    + ";\n",
    encoding="utf-8",
)
PY
}

extension_registered_in_profile() {
  local profile_dir="$1"
  local extension_dir="$2"
  "${PYTHON_BIN}" - "${profile_dir}" "${extension_dir}" <<'PY'
import json
import sys
from pathlib import Path

profile_dir = Path(sys.argv[1])
extension_dir = Path(sys.argv[2]).resolve()

for relative_path in ("Default/Secure Preferences", "Default/Preferences"):
    prefs_path = profile_dir / relative_path
    if not prefs_path.is_file():
        continue
    try:
        payload = json.loads(prefs_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        continue
    settings = payload.get("extensions", {}).get("settings", {})
    if not isinstance(settings, dict):
        continue
    for entry in settings.values():
        if not isinstance(entry, dict):
            continue
        raw_path = entry.get("path")
        if not isinstance(raw_path, str):
            continue
        if Path(raw_path).resolve() == extension_dir:
            raise SystemExit(0)

raise SystemExit(1)
PY
}

wait_for_extension_registration() {
  local profile_dir="$1"
  local extension_dir="$2"
  local timeout_seconds="$3"
  local chrome_pid="$4"
  local elapsed=0

  while [[ "${elapsed}" -lt "${timeout_seconds}" ]]; do
    if extension_registered_in_profile "${profile_dir}" "${extension_dir}"; then
      return 0
    fi
    if ! kill -0 "${chrome_pid}" 2>/dev/null; then
      break
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

artifact_dir=""
reset_first=0

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
    --reset)
      reset_first=1
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

if [[ -z "${artifact_dir}" ]]; then
  recording_root="$(resolve_default_recording_root)"
  artifact_dir="${recording_root}/recording-$(date +%Y%m%d-%H%M%S)"
else
  recording_root="$(resolve_default_recording_root)"
fi

log_dir="${artifact_dir}/logs"
extension_dir="${artifact_dir}/extension"
profile_dir="${artifact_dir}/chrome-profile"
mkdir -p "${artifact_dir}" "${log_dir}" "${profile_dir}"

: "${SETTA_CHROME_REPRO_SKIP_DEV_START:=0}"
: "${SETTA_CHROME_REPRO_DEV_MODE:=start}"
: "${SETTA_CHROME_REPRO_LOG_LEVEL:=debug}"

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
export SETTA_NO_OPEN=1
export SETTA_LOG_LEVEL="${SETTA_CHROME_REPRO_LOG_LEVEL}"
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

if [[ "${reset_first}" -eq 1 ]]; then
  log "Resetting Setta state before recording."
  "${ROOT_DIR}/scripts/reset-setta-state.sh" --workspace "${SETTA_WORKSPACE_ROOT}"
fi

collector_pid=""
dev_pid=""
chrome_pid=""
cleanup_started=0

cleanup() {
  local exit_code="$?"
  if [[ "${cleanup_started}" -eq 1 ]]; then
    return
  fi
  cleanup_started=1

  if [[ -n "${collector_pid}" ]] && kill -0 "${collector_pid}" 2>/dev/null; then
    log "Stopping Chrome repro collector."
    kill "${collector_pid}" 2>/dev/null || true
    wait "${collector_pid}" || true
  fi

  if [[ -n "${dev_pid}" ]] && kill -0 "${dev_pid}" 2>/dev/null; then
    log "Stopping dev instance."
    kill "${dev_pid}" 2>/dev/null || true
    wait "${dev_pid}" || true
  fi

  if [[ -n "${chrome_pid}" ]] && kill -0 "${chrome_pid}" 2>/dev/null; then
    log "Stopping Chrome recorder."
    kill "${chrome_pid}" 2>/dev/null || true
    wait "${chrome_pid}" || true
  fi

  if [[ "${exit_code}" -eq 0 ]]; then
    local resolved_setta_files_root=""
    resolved_setta_files_root="$(resolve_active_setta_files_root || true)"
    if [[ -n "${resolved_setta_files_root}" ]]; then
      if ! "${PYTHON_BIN}" "${ROOT_DIR}/scripts/chrome_repro_collect_llm_artifacts.py" \
        --artifact-dir "${artifact_dir}" \
        --setta-files-root "${resolved_setta_files_root}" \
        >"${log_dir}/llm-artifacts.log" 2>&1; then
        log "Failed to collect LLM engine artifacts for ${artifact_dir}. See ${log_dir}/llm-artifacts.log."
      fi
    else
      log "Could not resolve the active setta_files root for LLM artifact bundling."
    fi
    if ! write_latest_recording_pointer "${recording_root}" "${artifact_dir}"; then
      log "Failed to update latest Chrome repro pointer under ${recording_root}."
    fi
    log "Chrome repro artifacts saved in ${artifact_dir}."
    log "Resolve the newest bundle later with ./scripts/latest-chrome-recording.sh --json"
  fi
}

trap cleanup EXIT INT TERM

collector_port="$(pick_free_port)"
collector_base_url="http://127.0.0.1:${collector_port}"
collector_log="${log_dir}/collector.log"

copy_extension_template "${extension_dir}"
write_extension_config "${extension_dir}" "${collector_base_url}"

log "Starting Chrome repro collector at ${collector_base_url}."
"${PYTHON_BIN}" "${ROOT_DIR}/scripts/chrome_repro_collector.py" \
  --artifact-dir "${artifact_dir}" \
  --port "${collector_port}" \
  >"${collector_log}" 2>&1 &
collector_pid="$!"
wait_for_url "${collector_base_url}/health" "Chrome repro collector" 30 >/dev/null

if [[ "${SETTA_CHROME_REPRO_SKIP_DEV_START}" != "1" ]]; then
  log "Starting Setta dev instance (${SETTA_CHROME_REPRO_DEV_MODE})."
  SETTA_BACKEND_LOG_FILE="${log_dir}/backend.log" \
    "${ROOT_DIR}/scripts/run-dev-instance.sh" --mode "${SETTA_CHROME_REPRO_DEV_MODE}" \
    >"${log_dir}/dev-instance.log" 2>&1 &
  dev_pid="$!"
fi

log "Waiting for Setta bootstrap URL."
bootstrap_url="$(wait_for_bootstrap_url 120)"

launcher_metadata_file="${artifact_dir}/launcher.json"
"${PYTHON_BIN}" - "${launcher_metadata_file}" "${artifact_dir}" "${bootstrap_url}" "${log_dir}" "${profile_dir}" "${extension_dir}" "${SETTA_WORKSPACE_ROOT}" "${SETTA_HOME}" "${CHROME_EXTRA_ARGS:-}" <<'PY'
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

metadata_file = Path(sys.argv[1])
payload = {
    "createdAt": datetime.now(UTC).isoformat(),
    "artifactDir": sys.argv[2],
    "bootstrapUrl": sys.argv[3],
    "logDir": sys.argv[4],
    "profileDir": sys.argv[5],
    "extensionDir": sys.argv[6],
    "workspaceRoot": sys.argv[7],
    "settaHome": sys.argv[8],
    "chromeExtraArgs": sys.argv[9],
}
metadata_file.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY

chrome_bin="$(resolve_chrome_bin || true)"
if [[ -z "${chrome_bin}" ]]; then
  echo "Could not find Chrome/Chromium. Set CHROME_BIN to the binary path." >&2
  exit 1
fi

chrome_log="${log_dir}/chrome.log"
chrome_launch_args=(
  "--user-data-dir=${profile_dir}"
  "--no-first-run"
  "--no-default-browser-check"
  "--disable-extensions-except=${extension_dir}"
  "--load-extension=${extension_dir}"
)
if [[ "${OSTYPE:-}" == "darwin"* ]]; then
  chrome_launch_args+=("--use-mock-keychain")
fi
if [[ -n "${CHROME_EXTRA_ARGS:-}" ]]; then
  chrome_extra_args=()
  read -r -a chrome_extra_args <<<"${CHROME_EXTRA_ARGS}"
  chrome_launch_args+=("${chrome_extra_args[@]}")
fi
chrome_launch_args+=("${bootstrap_url}")

log "Launching dedicated Chrome recorder window with ${chrome_bin}."
"${chrome_bin}" "${chrome_launch_args[@]}" >"${chrome_log}" 2>&1 &
chrome_pid="$!"

if ! wait_for_extension_registration "${profile_dir}" "${extension_dir}" 20 "${chrome_pid}"; then
  if kill -0 "${chrome_pid}" 2>/dev/null; then
    kill "${chrome_pid}" 2>/dev/null || true
    wait "${chrome_pid}" || true
  fi
  if chrome_binary_may_reject_unpacked_extensions "${chrome_bin}"; then
    echo "Chrome recorder extension failed to load. Branded Google Chrome can reject unpacked extensions; use Chrome for Testing/Chromium instead. Browser log: ${chrome_log}" >&2
  else
    echo "Chrome recorder extension failed to load for ${chrome_bin}. Browser log: ${chrome_log}" >&2
  fi
  exit 1
fi

log "Chrome recorder ready. Interact with that Chrome window now."
log "Close that Chrome window when you are done recording."
wait "${chrome_pid}"
