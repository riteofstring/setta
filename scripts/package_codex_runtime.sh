#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_bin="${SETTA_CODEX_BIN:-}"
resources_dir="${repo_root}/build/Resources"
platform=""

usage() {
  cat <<'EOF'
Usage: scripts/package_codex_runtime.sh [--source PATH] [--resources-dir DIR] [--platform GOOS/GOARCH]

Copies the selected standalone codex-app-server into:
  <resources-dir>/codex-runtime/<goos>-<goarch>/codex-app-server

and writes the sidecar codex-runtime-manifest.json required by Setta's bundled
runtime resolver. --source defaults to SETTA_CODEX_BIN when set.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      source_bin="${2:-}"
      shift 2
      ;;
    --resources-dir)
      resources_dir="${2:-}"
      shift 2
      ;;
    --platform)
      platform="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${source_bin}" ]]; then
  echo "missing --source PATH or SETTA_CODEX_BIN" >&2
  exit 2
fi

args=(
  "run"
  "./cmd/package-codex-runtime"
  "--source"
  "${source_bin}"
  "--resources-dir"
  "${resources_dir}"
)
if [[ -n "${platform}" ]]; then
  args+=("--platform" "${platform}")
fi

cd "${repo_root}"
"${repo_root}/scripts/go.sh" "${args[@]}"
