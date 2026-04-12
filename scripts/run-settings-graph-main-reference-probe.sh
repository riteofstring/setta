#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

WORKTREE_PATH="${ROOT_DIR}"
WORKTREE_RUNTIME_LOG=""
MAIN_WORKTREE_PATH=""
MAIN_RUNTIME_LOG=""
TIMEOUT_MS="180000"
REPORTER="line"
GREP_PATTERN="settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary"
PLAYWRIGHT_EXECUTABLE_PATH_OVERRIDE="${PLAYWRIGHT_EXECUTABLE_PATH:-}"

usage() {
  cat <<'EOF'
Usage: run-settings-graph-main-reference-probe.sh --main-worktree PATH [options]

Refresh the live worktree and read-only main runtime facts via dev-runtime-info,
then run the canonical settings graph main-reference Playwright probe with the
current frontend/backend/bootstrap values.

Required:
  --main-worktree PATH         Path to the read-only main reference worktree

Optional:
  --worktree PATH              Path to the current worktree (default: repo root)
  --worktree-runtime-log PATH  Lifecycle log for the current worktree
  --main-runtime-log PATH      Lifecycle log for the main reference worktree
  --timeout-ms N               Playwright timeout in ms (default: 180000)
  --reporter NAME              Playwright reporter (default: line)
  --grep PATTERN               Test grep pattern for the probe lane
  --playwright-executable PATH Explicit browser executable for Playwright
  -h, --help                   Show this help

Example:
  ./scripts/run-settings-graph-main-reference-probe.sh \
    --worktree . \
    --worktree-runtime-log /tmp/worktree-ai.log \
    --main-worktree /home/ubuntu/dev/setta \
    --main-runtime-log /tmp/main-ai.log
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --worktree)
      WORKTREE_PATH="$2"
      shift 2
      ;;
    --worktree=*)
      WORKTREE_PATH="${1#*=}"
      shift
      ;;
    --worktree-runtime-log)
      WORKTREE_RUNTIME_LOG="$2"
      shift 2
      ;;
    --worktree-runtime-log=*)
      WORKTREE_RUNTIME_LOG="${1#*=}"
      shift
      ;;
    --main-worktree)
      MAIN_WORKTREE_PATH="$2"
      shift 2
      ;;
    --main-worktree=*)
      MAIN_WORKTREE_PATH="${1#*=}"
      shift
      ;;
    --main-runtime-log)
      MAIN_RUNTIME_LOG="$2"
      shift 2
      ;;
    --main-runtime-log=*)
      MAIN_RUNTIME_LOG="${1#*=}"
      shift
      ;;
    --timeout-ms)
      TIMEOUT_MS="$2"
      shift 2
      ;;
    --timeout-ms=*)
      TIMEOUT_MS="${1#*=}"
      shift
      ;;
    --reporter)
      REPORTER="$2"
      shift 2
      ;;
    --reporter=*)
      REPORTER="${1#*=}"
      shift
      ;;
    --grep)
      GREP_PATTERN="$2"
      shift 2
      ;;
    --grep=*)
      GREP_PATTERN="${1#*=}"
      shift
      ;;
    --playwright-executable)
      PLAYWRIGHT_EXECUTABLE_PATH_OVERRIDE="$2"
      shift 2
      ;;
    --playwright-executable=*)
      PLAYWRIGHT_EXECUTABLE_PATH_OVERRIDE="${1#*=}"
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

if [[ -z "${MAIN_WORKTREE_PATH}" ]]; then
  echo "Missing required --main-worktree." >&2
  usage >&2
  exit 1
fi

if [[ -n "${WORKTREE_RUNTIME_LOG}" ]] && [[ "${WORKTREE_RUNTIME_LOG}" != /* ]]; then
  WORKTREE_RUNTIME_LOG="${ROOT_DIR}/${WORKTREE_RUNTIME_LOG}"
fi

if [[ -n "${MAIN_RUNTIME_LOG}" ]] && [[ "${MAIN_RUNTIME_LOG}" != /* ]]; then
  MAIN_RUNTIME_LOG="${ROOT_DIR}/${MAIN_RUNTIME_LOG}"
fi

WORKTREE_RUNTIME_ARGS=(--workspace "${WORKTREE_PATH}")
if [[ -n "${WORKTREE_RUNTIME_LOG}" ]]; then
  WORKTREE_RUNTIME_ARGS+=(--runtime-log "${WORKTREE_RUNTIME_LOG}")
fi

MAIN_RUNTIME_ARGS=(--workspace "${MAIN_WORKTREE_PATH}")
if [[ -n "${MAIN_RUNTIME_LOG}" ]]; then
  MAIN_RUNTIME_ARGS+=(--runtime-log "${MAIN_RUNTIME_LOG}")
fi

WORKTREE_RUNTIME_JSON="$("${SCRIPT_DIR}/dev-runtime-info.sh" "${WORKTREE_RUNTIME_ARGS[@]}")"
MAIN_RUNTIME_JSON="$("${SCRIPT_DIR}/dev-runtime-info.sh" "${MAIN_RUNTIME_ARGS[@]}")"

extract_runtime_field() {
  local payload="$1"
  local jq_filter="$2"
  jq -r "${jq_filter}" <<<"${payload}"
}

extract_bootstrap_token() {
  local bootstrap_url="$1"

  python3 - "$bootstrap_url" <<'PY'
import sys
from urllib.parse import parse_qs, urlparse

bootstrap_url = sys.argv[1]
fragment = urlparse(bootstrap_url).fragment
query = fragment.split("?", 1)[1] if "?" in fragment else fragment
token = parse_qs(query).get("token", [""])[0]
print(token)
PY
}

resolve_playwright_executable_path() {
  if [[ -n "${PLAYWRIGHT_EXECUTABLE_PATH_OVERRIDE}" ]]; then
    printf '%s\n' "${PLAYWRIGHT_EXECUTABLE_PATH_OVERRIDE}"
    return 0
  fi

  local candidate=""
  for candidate in /usr/bin/google-chrome /usr/bin/google-chrome-stable /usr/bin/chromium-browser /usr/bin/chromium; do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  command -v google-chrome 2>/dev/null \
    || command -v google-chrome-stable 2>/dev/null \
    || command -v chromium-browser 2>/dev/null \
    || command -v chromium 2>/dev/null \
    || true
}

WORKTREE_FRONTEND_URL="$(extract_runtime_field "${WORKTREE_RUNTIME_JSON}" '.frontendUrl // ""')"
WORKTREE_BACKEND_URL="$(extract_runtime_field "${WORKTREE_RUNTIME_JSON}" '.backendUrl // ""')"
WORKTREE_BOOTSTRAP_URL="$(extract_runtime_field "${WORKTREE_RUNTIME_JSON}" '.bootstrapUrl // ""')"
MAIN_FRONTEND_URL="$(extract_runtime_field "${MAIN_RUNTIME_JSON}" '.frontendUrl // ""')"
MAIN_BACKEND_URL="$(extract_runtime_field "${MAIN_RUNTIME_JSON}" '.backendUrl // ""')"
MAIN_BOOTSTRAP_URL="$(extract_runtime_field "${MAIN_RUNTIME_JSON}" '.bootstrapUrl // ""')"

if [[ -z "${WORKTREE_FRONTEND_URL}" || -z "${WORKTREE_BACKEND_URL}" || -z "${WORKTREE_BOOTSTRAP_URL}" ]]; then
  echo "Current worktree runtime info is incomplete." >&2
  echo "${WORKTREE_RUNTIME_JSON}" >&2
  exit 1
fi

if [[ -z "${MAIN_FRONTEND_URL}" || -z "${MAIN_BACKEND_URL}" || -z "${MAIN_BOOTSTRAP_URL}" ]]; then
  echo "Main reference runtime info is incomplete." >&2
  echo "${MAIN_RUNTIME_JSON}" >&2
  exit 1
fi

WORKTREE_BOOTSTRAP_TOKEN="$(extract_bootstrap_token "${WORKTREE_BOOTSTRAP_URL}")"
if [[ -z "${WORKTREE_BOOTSTRAP_TOKEN}" ]]; then
  echo "Failed to extract SETTA_BOOTSTRAP_TOKEN from worktree bootstrap URL." >&2
  exit 1
fi

PLAYWRIGHT_EXECUTABLE_PATH_OVERRIDE="$(resolve_playwright_executable_path)"

echo "Resolved worktree runtime: frontend=${WORKTREE_FRONTEND_URL} backend=${WORKTREE_BACKEND_URL}" >&2
echo "Resolved main runtime: frontend=${MAIN_FRONTEND_URL} backend=${MAIN_BACKEND_URL}" >&2
if [[ -n "${PLAYWRIGHT_EXECUTABLE_PATH_OVERRIDE}" ]]; then
  echo "Resolved Playwright executable: ${PLAYWRIGHT_EXECUTABLE_PATH_OVERRIDE}" >&2
fi

cd "${ROOT_DIR}"

env \
  BOOTSTRAP_ENABLED=0 \
  DEVTOOLS_OPEN_WITH_CHROME=0 \
  DEVTOOLS_HEADLESS="${DEVTOOLS_HEADLESS:-1}" \
  PLAYWRIGHT_HEADLESS="${PLAYWRIGHT_HEADLESS:-1}" \
  PLAYWRIGHT_BASE_URL="${WORKTREE_FRONTEND_URL}" \
  SETTA_BACKEND_ORIGIN="${WORKTREE_BACKEND_URL}" \
  SETTA_BOOTSTRAP_TOKEN="${WORKTREE_BOOTSTRAP_TOKEN}" \
  SETTA_MAIN_REFERENCE_FRONTEND_URL="${MAIN_FRONTEND_URL}" \
  SETTA_MAIN_REFERENCE_BACKEND_ORIGIN="${MAIN_BACKEND_URL}" \
  SETTA_MAIN_REFERENCE_BOOTSTRAP_URL="${MAIN_BOOTSTRAP_URL}" \
  PLAYWRIGHT_EXECUTABLE_PATH="${PLAYWRIGHT_EXECUTABLE_PATH_OVERRIDE}" \
  pnpm -C frontend exec playwright test \
    tests/e2e/settings/settings-view-modes-main-reference.spec.ts \
    --grep "${GREP_PATTERN}" \
    --reporter="${REPORTER}" \
    --timeout="${TIMEOUT_MS}"
