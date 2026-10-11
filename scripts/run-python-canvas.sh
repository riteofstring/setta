#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "${script_dir}/.." && pwd -P)"
project_path=""
create_project="false"
server_port="0"

usage() {
  echo "Usage: $0 --project PATH [--create] [--port PORT]" >&2
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
    --port)
      if (($# < 2)) || [[ -z "$2" ]]; then
        usage
        exit 2
      fi
      server_port="$2"
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
if [[ ! "${server_port}" =~ ^[0-9]{1,5}$ ]] || ((10#${server_port} > 65535)); then
  echo "--port must be an integer between 0 and 65535." >&2
  exit 2
fi

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Python Canvas development requires ${command_name} on PATH." >&2
    exit 1
  fi
}

resolve_go_command() {
  local code_polishy_path=""
  local code_polishy_prefix=""
  local code_polishy_version=""
  local release_digest=""
  local os_tag=""
  local arch_tag=""
  local pinned_go=""
  local -a code_polishy_prefixes=()

  code_polishy_version="$(
    sed -n 's/^[[:space:]]*"codePolishyVersion":[[:space:]]*"\([^"]*\)".*/\1/p' \
      "${repo_root}/.code-polishy.lock.json"
  )"
  release_digest="$(
    sed -n 's/^[[:space:]]*"releaseDigest":[[:space:]]*"\([^"]*\)".*/\1/p' \
      "${repo_root}/.code-polishy.lock.json"
  )"
  case "$(uname -s)" in
    Darwin) os_tag="darwin" ;;
    Linux) os_tag="linux" ;;
  esac
  case "$(uname -m)" in
    arm64 | aarch64) arch_tag="arm64" ;;
    x86_64 | amd64) arch_tag="amd64" ;;
  esac

  code_polishy_path="$(command -v code-polishy 2>/dev/null || true)"
  if [[ -n "${code_polishy_path}" ]]; then
    code_polishy_prefixes+=("$(cd "$(dirname "${code_polishy_path}")/.." && pwd -P)")
  fi
  if [[ -n "${HOME:-}" ]]; then
    code_polishy_prefixes+=("${HOME}/.local/share/code-polishy")
  fi

  for code_polishy_prefix in "${code_polishy_prefixes[@]}"; do
    pinned_go="${code_polishy_prefix}/releases/${code_polishy_version}-${release_digest}/.tools/go/${os_tag}-${arch_tag}/go/bin/go"
    if [[ -n "${code_polishy_version}" && -n "${release_digest}" && -x "${pinned_go}" ]]; then
      printf '%s\n' "${pinned_go}"
      return 0
    fi
  done
  return 1
}

require_command pnpm
require_command python3
if ! go_command="$(resolve_go_command)"; then
  echo "Python Canvas could not find the Go toolchain carried by this repository's locked Code Polishy release." >&2
  exit 1
fi

cd "${repo_root}"
pnpm install --frozen-lockfile
pnpm --filter @riteofstring/setta run build
pnpm --filter @setta/python-canvas run build

launcher_python="$(python3 -c 'import sys; print(sys.executable)')"
canonical_project="$(python3 -c 'import pathlib, sys; print(pathlib.Path(sys.argv[1]).expanduser().resolve(strict=False))' "${project_path}")"
session_nonce="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
basedpyright="${repo_root}/apps/python-canvas/node_modules/.bin/basedpyright-langserver"
web_root="${repo_root}/apps/python-canvas/dist"

if [[ ! -x "${basedpyright}" ]]; then
  echo "The frozen Basedpyright language-server entrypoint is missing after setup." >&2
  exit 1
fi

server_args=(
  serve
  --project "${canonical_project}"
  --launcher-python "${launcher_python}"
  --basedpyright "${basedpyright}"
  --web-root "${web_root}"
  --port "${server_port}"
  --session-nonce "${session_nonce}"
  --supervised-stdin
)
if [[ "${create_project}" == "true" ]]; then
  server_args+=(--create)
fi

echo "Python Canvas readiness JSON follows. Open its URL; press Ctrl-C here to stop."
exec "${go_command}" -C apps/python-canvas/backend run ./cmd/python-canvas "${server_args[@]}"
