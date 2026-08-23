#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "${script_dir}/.." && pwd -P)"
backend_pid=""
vite_pid=""
project_path=""
create_project="false"
backend_port="8080"
preview_port="5173"

usage() {
  echo "Usage: $0 --project PATH [--create] [--backend-port PORT] [--preview-port PORT]" >&2
}

while (($# > 0)); do
  case "$1" in
    --project)
      if (($# < 2)) || [[ -z "$2" ]]; then
        usage
        exit 2
      fi
      project_path="$2"
      shift 2
      ;;
    --create)
      create_project="true"
      shift
      ;;
    --backend-port)
      if (($# < 2)) || [[ -z "$2" ]]; then
        usage
        exit 2
      fi
      backend_port="$2"
      shift 2
      ;;
    --preview-port)
      if (($# < 2)) || [[ -z "$2" ]]; then
        usage
        exit 2
      fi
      preview_port="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

if [[ -z "${project_path}" ]]; then
  usage
  exit 2
fi

validate_port() {
  local port_name="$1"
  local port_value="$2"

  if [[ ! "${port_value}" =~ ^[1-9][0-9]{0,4}$ ]] || ((10#${port_value} > 65535)); then
    echo "${port_name} must be an integer between 1 and 65535." >&2
    exit 2
  fi
}

validate_port "--backend-port" "${backend_port}"
validate_port "--preview-port" "${preview_port}"

require_command() {
  local command_name="$1"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Python Canvas requires ${command_name} on PATH." >&2
    exit 1
  fi
}

resolve_go_command() {
  local code_policy_path=""
  local code_policy_prefix=""
  local code_policy_version=""
  local release_digest=""
  local os_tag=""
  local arch_tag=""
  local pinned_go=""
  local -a code_policy_prefixes=()

  code_policy_version="$(
    sed -n 's/^[[:space:]]*"codePolicyVersion":[[:space:]]*"\([^"]*\)".*/\1/p' \
      "${repo_root}/.code-policy.lock.json"
  )"
  release_digest="$(
    sed -n 's/^[[:space:]]*"releaseDigest":[[:space:]]*"\([^"]*\)".*/\1/p' \
      "${repo_root}/.code-policy.lock.json"
  )"
  case "$(uname -s)" in
    Darwin) os_tag="darwin" ;;
    Linux) os_tag="linux" ;;
  esac
  case "$(uname -m)" in
    arm64 | aarch64) arch_tag="arm64" ;;
    x86_64 | amd64) arch_tag="amd64" ;;
  esac

  code_policy_path="$(command -v code-policy 2>/dev/null || true)"
  if [[ -n "${code_policy_path}" ]]; then
    code_policy_prefixes+=("$(cd "$(dirname "${code_policy_path}")/.." && pwd -P)")
  fi
  if [[ -n "${HOME:-}" ]]; then
    code_policy_prefixes+=("${HOME}/.local/share/code-policy")
  fi

  for code_policy_prefix in "${code_policy_prefixes[@]}"; do
    pinned_go="${code_policy_prefix}/releases/${code_policy_version}-${release_digest}/.tools/go/${os_tag}-${arch_tag}/go/bin/go"
    if [[ -n "${code_policy_version}" && -n "${release_digest}" && -x "${pinned_go}" ]]; then
      printf '%s\n' "${pinned_go}"
      return 0
    fi
  done

  return 1
}

stop_services() {
  local exit_code=$?

  trap - EXIT INT TERM HUP
  if [[ -n "${vite_pid}" ]] && kill -0 "${vite_pid}" 2>/dev/null; then
    kill -TERM "${vite_pid}" 2>/dev/null || true
    wait "${vite_pid}" 2>/dev/null || true
  fi
  if [[ -n "${backend_pid}" ]] && kill -0 "${backend_pid}" 2>/dev/null; then
    kill -TERM "${backend_pid}" 2>/dev/null || true
    wait "${backend_pid}" 2>/dev/null || true
  fi
  exit "${exit_code}"
}

wait_for_backend() {
  local attempt=0

  while ((attempt < 150)); do
    if ! kill -0 "${backend_pid}" 2>/dev/null; then
      wait "${backend_pid}" 2>/dev/null || true
      echo "Python Canvas backend exited before it became ready." >&2
      return 1
    fi
    if curl --fail --silent --show-error "http://127.0.0.1:${backend_port}/api/v2/project" \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
    attempt=$((attempt + 1))
  done

  echo "Python Canvas backend did not become ready within 15 seconds." >&2
  return 1
}

trap stop_services EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

require_command pnpm
require_command curl
if ! go_command="$(resolve_go_command)"; then
  echo "Python Canvas could not find the Go toolchain carried by this repo's locked Code Policy release." >&2
  echo "Reinstall the locked Code Policy release and run this script again." >&2
  exit 1
fi

cd "${repo_root}"

echo "Installing frozen dependencies..."
pnpm install --frozen-lockfile

echo "Building @setta/workspace..."
pnpm --filter @setta/workspace run build

echo "Building Python Canvas production frontend..."
pnpm --filter @setta/python-canvas run build

if curl --fail --silent "http://127.0.0.1:${backend_port}/api/v2/project" >/dev/null 2>&1; then
  echo "Port ${backend_port} already has a Python Canvas backend. Stop it and run this script again." >&2
  exit 1
fi

echo "Starting the Go backend and pinned Basedpyright..."
backend_args=(
  --project "${project_path}"
  --port "${backend_port}"
  --app-origin "http://127.0.0.1:${preview_port}"
)
if [[ "${create_project}" == "true" ]]; then
  backend_args+=(--create)
fi
"${go_command}" -C apps/python-canvas/backend run ./cmd/python-canvas "${backend_args[@]}" &
backend_pid=$!
wait_for_backend

echo
echo "Python Canvas backend is ready."
echo "Open http://127.0.0.1:${preview_port}. Press Ctrl-C here to stop everything."
echo

(
  cd "${repo_root}/apps/python-canvas"
  PYTHON_CANVAS_BACKEND_ORIGIN="http://127.0.0.1:${backend_port}" \
    exec ./node_modules/.bin/vite preview --host 127.0.0.1 --port "${preview_port}" --strictPort
) &
vite_pid=$!
wait "${vite_pid}"
