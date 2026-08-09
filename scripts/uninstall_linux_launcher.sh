#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/uninstall_linux_launcher.sh [options]

Thin wrapper that delegates launcher removal to `setta launcher remove`.

Options:
  --setta-bin PATH   Setta executable used for metadata/artifact removal.
                     Default: first "setta" on PATH
  --setta-home PATH  Optional Setta home override forwarded to launcher remove
  -h, --help         Show this help message.
USAGE
}

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Could not find a Python interpreter (python3 or python)." >&2
  exit 1
fi

resolve_abs_path() {
  local raw_path="${1-}"
  if [[ -z "${raw_path}" ]]; then
    echo "Missing path value." >&2
    return 1
  fi
  "${PYTHON_BIN}" - "${raw_path}" <<'PY'
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

setta_bin=""
setta_home=""

while [[ $# -gt 0 ]]; do
  case "$1" in
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
    --setta-home)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --setta-home." >&2
        usage
        exit 1
      fi
      setta_home="$2"
      shift 2
      ;;
    --setta-home=*)
      setta_home="${1#*=}"
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
if [[ -z "${setta_bin}" ]]; then
  echo "Could not find setta executable. Use --setta-bin PATH." >&2
  exit 1
fi

setta_bin_abs="$(resolve_abs_path "${setta_bin}")"
if [[ ! -x "${setta_bin_abs}" ]]; then
  echo "Setta executable is not runnable: ${setta_bin_abs}" >&2
  exit 1
fi

launcher_remove_cmd=("${setta_bin_abs}")
if [[ -n "${setta_home}" ]]; then
  launcher_remove_cmd+=("--setta-home" "${setta_home}")
fi
launcher_remove_cmd+=("launcher" "remove" "--json")

remove_json="$("${launcher_remove_cmd[@]}")"

"${PYTHON_BIN}" - "${remove_json}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if not isinstance(payload, dict) or payload.get("ok") is not True:
    raise SystemExit("setta launcher remove did not return a successful JSON payload.")
removed = payload.get("removedPaths")
missing = payload.get("missingPaths")
print(f"Launcher metadata removed: {payload.get('metadataRemoved')}")
if isinstance(removed, list):
    for path in removed:
        print(f"Removed: {path}")
if isinstance(missing, list):
    for path in missing:
        print(f"Missing: {path}")
PY
