#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_PATH=""
RUNTIME_LOG_PATH=""
ALLOW_MISSING_CONNECT_INFO="0"
PLAYWRIGHT_ARGS=()
PARSE_PLAYWRIGHT_ARGS="0"

usage() {
  cat <<'EOF'
Usage: run-playwright-against-runtime.sh [--workspace PATH] [--runtime-log PATH] [--allow-missing-connect-info] [-- <playwright args...>]

Refresh the current dev runtime metadata, extract a fresh bootstrap token, and
run `pnpm -C frontend exec playwright test ...` with the matching runtime env.
EOF
}

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "${value}" ]]; then
    echo "Missing value for ${flag}" >&2
    exit 1
  fi
}

resolve_python_bin() {
  if [[ -n "${VIRTUAL_ENV:-}" ]] && [[ -x "${VIRTUAL_ENV}/bin/python" ]]; then
    printf '%s\n' "${VIRTUAL_ENV}/bin/python"
    return 0
  fi
  if [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
    printf '%s\n' "${ROOT_DIR}/.venv/bin/python"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    command -v python
    return 0
  fi

  echo "Could not resolve a Python interpreter." >&2
  exit 1
}

run_pnpm() {
  if declare -F setta_run_pnpm >/dev/null 2>&1; then
    setta_run_pnpm "${WORKSPACE_ROOT}" "$@"
    return
  fi
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
    return
  fi
  if command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
    return
  fi

  echo "pnpm or corepack is required on PATH." >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  if [[ "${PARSE_PLAYWRIGHT_ARGS}" == "1" ]]; then
    PLAYWRIGHT_ARGS+=("$1")
    shift
    continue
  fi

  case "$1" in
    --workspace)
      require_value "$1" "${2:-}"
      WORKSPACE_PATH="$2"
      shift 2
      ;;
    --workspace=*)
      WORKSPACE_PATH="${1#*=}"
      require_value "--workspace" "${WORKSPACE_PATH}"
      shift
      ;;
    --runtime-log)
      require_value "$1" "${2:-}"
      RUNTIME_LOG_PATH="$2"
      shift 2
      ;;
    --runtime-log=*)
      RUNTIME_LOG_PATH="${1#*=}"
      require_value "--runtime-log" "${RUNTIME_LOG_PATH}"
      shift
      ;;
    --allow-missing-connect-info)
      ALLOW_MISSING_CONNECT_INFO="1"
      shift
      ;;
    --)
      PARSE_PLAYWRIGHT_ARGS="1"
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

PYTHON_BIN="$(resolve_python_bin)"
runtime_info_args=()
if [[ -n "${WORKSPACE_PATH}" ]]; then
  runtime_info_args+=(--workspace "${WORKSPACE_PATH}")
fi
if [[ -n "${RUNTIME_LOG_PATH}" ]]; then
  runtime_info_args+=(--runtime-log "${RUNTIME_LOG_PATH}")
fi
if [[ "${ALLOW_MISSING_CONNECT_INFO}" == "1" ]]; then
  runtime_info_args+=(--allow-missing-connect-info)
fi

runtime_info_json="$("${SCRIPT_DIR}/dev-runtime-info.sh" "${runtime_info_args[@]}")"
runtime_assignments="$(
  RUNTIME_INFO_JSON="${runtime_info_json}" "${PYTHON_BIN}" - <<'PY'
import json
import os
import shlex
from pathlib import Path
from urllib.parse import parse_qsl, urlparse

data = json.loads(os.environ["RUNTIME_INFO_JSON"])
workspace_root = data.get("workspaceRoot") or ""
frontend_url = data.get("frontendUrl") or ""
backend_url = data.get("backendUrl") or ""
bootstrap_url = data.get("bootstrapUrl") or ""

if not workspace_root:
    raise SystemExit("Runtime info did not include workspaceRoot.")
if not frontend_url:
    raise SystemExit("Runtime info did not include frontendUrl.")
if not backend_url:
    raise SystemExit("Runtime info did not include backendUrl.")
if not bootstrap_url:
    raise SystemExit("Runtime info did not include bootstrapUrl.")

parsed = urlparse(bootstrap_url)
token = None
for key, value in parse_qsl(parsed.fragment, keep_blank_values=True):
    if key == "token":
        token = value
        break
if token is None:
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if key == "token":
            token = value
            break
if not token:
    raise SystemExit("Runtime bootstrapUrl did not include a bootstrap token.")

auth_cookie_name = os.environ.get("SETTA_AUTH_COOKIE_NAME") or f"setta_auth_{Path(workspace_root).name}"

for key, value in {
    "WORKSPACE_ROOT": workspace_root,
    "PLAYWRIGHT_BASE_URL": frontend_url,
    "SETTA_BACKEND_ORIGIN": backend_url,
    "SETTA_BOOTSTRAP_TOKEN": token,
    "SETTA_AUTH_COOKIE_NAME": auth_cookie_name,
}.items():
    print(f"{key}={shlex.quote(value)}")
PY
)"
eval "${runtime_assignments}"

if [[ -f "${WORKSPACE_ROOT}/activate.sh" ]]; then
  # shellcheck disable=SC1090
  source "${WORKSPACE_ROOT}/activate.sh"
fi
if [[ -f "${WORKSPACE_ROOT}/scripts/lib/node_tooling.sh" ]]; then
  # shellcheck disable=SC1090
  . "${WORKSPACE_ROOT}/scripts/lib/node_tooling.sh"
fi

cd "${WORKSPACE_ROOT}"
PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL}" \
SETTA_BACKEND_ORIGIN="${SETTA_BACKEND_ORIGIN}" \
SETTA_BOOTSTRAP_TOKEN="${SETTA_BOOTSTRAP_TOKEN}" \
SETTA_AUTH_COOKIE_NAME="${SETTA_AUTH_COOKIE_NAME}" \
run_pnpm -C frontend exec playwright test "${PLAYWRIGHT_ARGS[@]}"
