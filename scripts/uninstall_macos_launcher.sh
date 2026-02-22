#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/uninstall_macos_launcher.sh [options]

Remove Setta.app and launcher metadata/artifacts tracked by Setta.

Options:
  --app-path PATH    App bundle destination (default: ~/Applications/Setta.app)
  --setta-bin PATH   Setta executable used for metadata removal.
                     Default: first "setta" on PATH, when available
  -h, --help         Show this help message.
EOF
}

resolve_abs_path() {
  local raw_path="${1-}"
  if [[ -z "${raw_path}" ]]; then
    echo "Missing path value." >&2
    return 1
  fi
  python3 - "${raw_path}" <<'PY'
import os
import sys
from pathlib import Path

raw = sys.argv[1].strip()
if not raw:
    print("Missing path value.", file=sys.stderr)
    raise SystemExit(1)
print(str(Path(os.path.expandvars(os.path.expanduser(raw))).resolve(strict=False)))
PY
}

app_path="${HOME}/Applications/Setta.app"
setta_bin=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-path)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --app-path." >&2
        usage
        exit 1
      fi
      app_path="$2"
      shift 2
      ;;
    --app-path=*)
      app_path="${1#*=}"
      shift
      ;;
    --setta-bin)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --setta-bin." >&2
        usage
        exit 1
      fi
      setta_bin="$2"
      shift 2
      ;;
    --setta-bin=*)
      setta_bin="${1#*=}"
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

if [[ -z "${setta_bin}" ]]; then
  setta_bin="$(command -v setta || true)"
fi

if [[ -n "${setta_bin}" ]]; then
  setta_bin_abs="$(resolve_abs_path "${setta_bin}")"
  if [[ -x "${setta_bin_abs}" ]]; then
    "${setta_bin_abs}" launcher remove --json >/dev/null
  fi
fi

app_path_abs="$(resolve_abs_path "${app_path}")"
if [[ -e "${app_path_abs}" ]]; then
  rm -rf "${app_path_abs}"
  echo "Removed macOS launcher: ${app_path_abs}"
else
  echo "Launcher app not present: ${app_path_abs}"
fi
