#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/release/smoke_test_native_installer_macos.sh --pkg /path/to/SettaDesktop-<version>.pkg
USAGE
}

pkg_path=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pkg)
      pkg_path="$2"
      shift 2
      ;;
    --pkg=*)
      pkg_path="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${pkg_path}" ]]; then
  echo "--pkg is required." >&2
  exit 1
fi
if [[ ! -f "${pkg_path}" ]]; then
  echo "Package not found: ${pkg_path}" >&2
  exit 1
fi

for required_bin in uv python3 installer; do
  if ! command -v "${required_bin}" >/dev/null 2>&1; then
    echo "Missing required command: ${required_bin}" >&2
    exit 1
  fi
done

echo "[native-smoke][macos] Installing ${pkg_path}..."
sudo installer -pkg "${pkg_path}" -target /

uv_tool_bin_dir="$(uv tool dir --bin)"
setta_bin="${uv_tool_bin_dir}/setta"
if [[ ! -x "${setta_bin}" ]]; then
  echo "Setta executable not found after pkg install: ${setta_bin}" >&2
  exit 1
fi

status_json="$("${setta_bin}" launcher status --json)"
python3 - "${status_json}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if payload.get("ok") is not True:
    raise SystemExit("launcher status failed after pkg install")
if payload.get("installed") is not True:
    raise SystemExit("native pkg install did not bootstrap launcher metadata")
managed = payload.get("managedArtifacts") or {}
if not managed:
    raise SystemExit("native pkg install did not report managed artifacts")
print("[native-smoke][macos] launcher status OK")
PY

