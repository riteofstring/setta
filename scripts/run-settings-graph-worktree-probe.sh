#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

WORKTREE_PATH="${ROOT_DIR}"
WORKTREE_RUNTIME_LOG=""
TIMEOUT_MS="180000"
REPORTER="line"
GREP_PATTERN="settings graph worktree performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on the live canary"
PLAYWRIGHT_EXECUTABLE_PATH_OVERRIDE="${PLAYWRIGHT_EXECUTABLE_PATH:-}"

usage() {
  cat <<'EOF'
Usage: run-settings-graph-worktree-probe.sh [options]

Refresh the live worktree runtime facts via dev-runtime-info, then run the
worktree-only settings graph motion probe with the current frontend/backend/
bootstrap values.

Optional:
  --worktree PATH              Path to the current worktree (default: repo root)
  --worktree-runtime-log PATH  Lifecycle log for the current worktree
  --timeout-ms N               Playwright timeout in ms (default: 180000)
  --reporter NAME              Playwright reporter (default: line)
  --grep PATTERN               Test grep pattern for the probe lane
  --playwright-executable PATH Explicit browser executable for Playwright
  -h, --help                   Show this help

Example:
  ./scripts/run-settings-graph-worktree-probe.sh \
    --worktree . \
    --worktree-runtime-log /tmp/worktree-ai.log
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

if [[ -n "${WORKTREE_RUNTIME_LOG}" ]] && [[ "${WORKTREE_RUNTIME_LOG}" != /* ]]; then
  WORKTREE_RUNTIME_LOG="${ROOT_DIR}/${WORKTREE_RUNTIME_LOG}"
fi

WORKTREE_RUNTIME_ARGS=(--workspace "${WORKTREE_PATH}")
if [[ -n "${WORKTREE_RUNTIME_LOG}" ]]; then
  WORKTREE_RUNTIME_ARGS+=(--runtime-log "${WORKTREE_RUNTIME_LOG}")
fi

WORKTREE_RUNTIME_JSON="$("${SCRIPT_DIR}/dev-runtime-info.sh" "${WORKTREE_RUNTIME_ARGS[@]}")"

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

if [[ -z "${WORKTREE_FRONTEND_URL}" || -z "${WORKTREE_BACKEND_URL}" || -z "${WORKTREE_BOOTSTRAP_URL}" ]]; then
  echo "Current worktree runtime info is incomplete." >&2
  echo "${WORKTREE_RUNTIME_JSON}" >&2
  exit 1
fi

WORKTREE_BOOTSTRAP_TOKEN="$(extract_bootstrap_token "${WORKTREE_BOOTSTRAP_URL}")"
if [[ -z "${WORKTREE_BOOTSTRAP_TOKEN}" ]]; then
  echo "Failed to extract SETTA_BOOTSTRAP_TOKEN from worktree bootstrap URL." >&2
  exit 1
fi

PLAYWRIGHT_EXECUTABLE_PATH_OVERRIDE="$(resolve_playwright_executable_path)"

echo "Resolved worktree runtime: frontend=${WORKTREE_FRONTEND_URL} backend=${WORKTREE_BACKEND_URL}" >&2
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
  PLAYWRIGHT_EXECUTABLE_PATH="${PLAYWRIGHT_EXECUTABLE_PATH_OVERRIDE}" \
  pnpm -C frontend exec playwright test \
    tests/e2e/settings/settings-view-modes.spec.ts \
    --grep "${GREP_PATTERN}" \
    --reporter="${REPORTER}" \
    --timeout="${TIMEOUT_MS}"
