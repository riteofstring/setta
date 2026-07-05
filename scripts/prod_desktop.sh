#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="${ROOT_DIR}/desktop"
ELECTRON_BIN="${DESKTOP_DIR}/node_modules/.bin/electron"
MAIN_BUILD="${DESKTOP_DIR}/out/main/index.js"
PRELOAD_BUILD="${DESKTOP_DIR}/out/preload/index.js"
RENDERER_BUILD="${DESKTOP_DIR}/out/renderer/index.html"
BACKEND_DIR="${DESKTOP_DIR}/out/backend"
BACKEND_BIN="${BACKEND_DIR}/setta-backend"
SETTA_CLI_BIN="${BACKEND_DIR}/setta"
if [[ "$(uname -s)" == MINGW* || "$(uname -s)" == CYGWIN* ]]; then
  BACKEND_BIN="${BACKEND_BIN}.exe"
  SETTA_CLI_BIN="${SETTA_CLI_BIN}.exe"
fi

build=0
electron_args=()
electron_arg_count=0
backend_pid=""
backend_ready_file=""
backend_token_file=""

usage() {
  cat <<'USAGE'
Usage: ./scripts/prod_desktop.sh [--build] [electron args...]

Run Setta from the last production build under desktop/out.

Options:
  --build      Rebuild the desktop bundle and backend binary before launching.
  --help, -h   Show this help.

Set SETTA_APP_DATA_DIR to isolate app state, for example:
  SETTA_APP_DATA_DIR="$HOME/.setta-prod-dogfood" ./scripts/prod_desktop.sh

Unknown arguments are passed to Electron before the app path, so flags such as
--remote-debugging-port=9229 work as expected.
USAGE
}

fail() {
  echo "prod_desktop.sh: $1" >&2
  exit 1
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "${backend_pid}" ]] && kill -0 "${backend_pid}" 2>/dev/null; then
    kill "${backend_pid}" 2>/dev/null || true
    wait "${backend_pid}" 2>/dev/null || true
  fi
  if [[ -n "${backend_ready_file}" ]]; then
    rm -f "${backend_ready_file}"
  fi
  if [[ -n "${backend_token_file}" ]]; then
    rm -f "${backend_token_file}"
  fi
  exit "${status}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      build=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      electron_args+=("$@")
      electron_arg_count=$((electron_arg_count + $#))
      break
      ;;
    *)
      electron_args+=("$1")
      electron_arg_count=$((electron_arg_count + 1))
      shift
      ;;
  esac
done

require_dependencies() {
  [[ -x "${ELECTRON_BIN}" ]] || fail "Electron is missing at ${ELECTRON_BIN}. Run ./update_dependencies.sh first."
  command -v node >/dev/null 2>&1 || fail "node is required to launch the production backend."
}

build_production() {
  command -v pnpm >/dev/null 2>&1 || fail "pnpm is required to build the desktop app."
  "${ROOT_DIR}/scripts/go.sh" version >/dev/null
  pnpm -C "${DESKTOP_DIR}" build
}

assert_production_build() {
  [[ -f "${MAIN_BUILD}" ]] || fail "desktop main build is missing: ${MAIN_BUILD}. Run ./scripts/prod_desktop.sh --build first."
  [[ -f "${PRELOAD_BUILD}" ]] || fail "desktop preload build is missing: ${PRELOAD_BUILD}. Run ./scripts/prod_desktop.sh --build first."
  [[ -f "${RENDERER_BUILD}" ]] || fail "desktop renderer build is missing: ${RENDERER_BUILD}. Run ./scripts/prod_desktop.sh --build first."
  [[ -x "${BACKEND_BIN}" ]] || fail "backend build is missing or not executable: ${BACKEND_BIN}. Run ./scripts/prod_desktop.sh --build first."
  [[ -x "${SETTA_CLI_BIN}" ]] || fail "setta CLI build is missing or not executable: ${SETTA_CLI_BIN}. Run ./scripts/prod_desktop.sh --build first."
}

app_data_dir() {
  if [[ -n "${SETTA_APP_DATA_DIR:-}" ]]; then
    printf '%s\n' "${SETTA_APP_DATA_DIR}"
    return
  fi
  [[ -n "${HOME:-}" ]] || fail "HOME is not set and SETTA_APP_DATA_DIR was not provided."
  printf '%s/.setta\n' "${HOME%/}"
}

parse_ready_field() {
  node -e '
const line = process.argv[1] ?? "";
const field = process.argv[2] ?? "";
try {
  const value = JSON.parse(line);
  if (
    value &&
    value.event === "ready" &&
    typeof value[field] === "string" &&
    value[field].length > 0
  ) {
    process.stdout.write(value[field]);
  }
} catch {}
' "$1" "$2"
}

parse_ready_addr() {
  parse_ready_field "$1" "addr"
}

parse_ready_bootstrap_token() {
  parse_ready_field "$1" "bootstrapToken"
}

start_backend() {
  local data_dir="$1"
  [[ "${data_dir}" = /* ]] || fail "SETTA_APP_DATA_DIR must be absolute: ${data_dir}"

  backend_ready_file="$(mktemp "${TMPDIR:-/tmp}/setta-prod-backend-ready.XXXXXX")"
  backend_token_file="$(mktemp "${TMPDIR:-/tmp}/setta-prod-backend-token.XXXXXX")"
  "${BACKEND_BIN}" --app-data-dir "${data_dir}" --bundled-cli-dir "${BACKEND_DIR}" --port 0 > >(
    while IFS= read -r line; do
      printf '%s\n' "${line}"
      if [[ ! -s "${backend_ready_file}" ]]; then
        local addr
        addr="$(parse_ready_addr "${line}")"
        if [[ -n "${addr}" ]]; then
          parse_ready_bootstrap_token "${line}" > "${backend_token_file}"
          printf '%s\n' "${addr}" > "${backend_ready_file}"
        fi
      fi
    done
  ) 2>&1 &
  backend_pid=$!
}

wait_for_backend() {
  local timeout_seconds="${SETTA_BACKEND_READY_TIMEOUT_SECONDS:-120}"
  [[ "${timeout_seconds}" =~ ^[0-9]+$ ]] || fail "SETTA_BACKEND_READY_TIMEOUT_SECONDS must be an integer."
  local deadline=$((SECONDS + timeout_seconds))
  while [[ ! -s "${backend_ready_file}" ]]; do
    if ((SECONDS >= deadline)); then
      fail "backend readiness timed out after ${timeout_seconds}s."
    fi
    if ! kill -0 "${backend_pid}" 2>/dev/null; then
      wait "${backend_pid}" 2>/dev/null || true
      fail "backend exited before it reported readiness."
    fi
    sleep 0.1
  done
}

launch_electron() {
  cd "${DESKTOP_DIR}"
  if [[ "${electron_arg_count}" -eq 0 ]]; then
    "${ELECTRON_BIN}" "."
    return
  fi
  "${ELECTRON_BIN}" "${electron_args[@]}" "."
}

require_dependencies
if [[ "${build}" -eq 1 ]]; then
  build_production
fi
assert_production_build

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

data_dir="$(app_data_dir)"
start_backend "${data_dir}"
wait_for_backend

export NODE_ENV=production
backend_url="http://$(< "${backend_ready_file}")"
backend_token="$(< "${backend_token_file}")"
[[ -n "${backend_token}" ]] || fail "backend readiness did not include a bootstrap token."
export SETTA_BACKEND_URL="${backend_url}"
export SETTA_BACKEND_TOKEN="${backend_token}"
unset ELECTRON_RENDERER_URL

launch_electron
