#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/install_macos_launcher.sh [options]

Thin wrapper that delegates launcher installation to `setta launcher setup`.

Options:
  --setta-bin PATH   Absolute or PATH-resolved Setta executable to bind.
                     Default: first "setta" on PATH
  --setta-home PATH  Optional Setta home override forwarded to launcher setup
  --app-path PATH    App bundle destination (default: ~/Applications/Setta.app)
  --icon-path PATH   Optional .icns icon copied into Setta.app resources
  --channel NAME     Launcher setup channel (default: macos-script)
  --open-mode MODE   Launcher open mode: browser | chrome-app (default: browser)
  -h, --help         Show this help message.
USAGE
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

setta_bin=""
setta_home=""
app_path="${HOME}/Applications/Setta.app"
icon_path=""
channel="macos-script"
open_mode="browser"

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
    --icon-path)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --icon-path." >&2
        usage
        exit 1
      fi
      icon_path="$2"
      shift 2
      ;;
    --icon-path=*)
      icon_path="${1#*=}"
      shift
      ;;
    --channel)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --channel." >&2
        usage
        exit 1
      fi
      channel="$2"
      shift 2
      ;;
    --channel=*)
      channel="${1#*=}"
      shift
      ;;
    --open-mode)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --open-mode." >&2
        usage
        exit 1
      fi
      open_mode="$2"
      shift 2
      ;;
    --open-mode=*)
      open_mode="${1#*=}"
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
if [[ -z "${channel}" ]]; then
  echo "--channel must be non-empty." >&2
  exit 1
fi
if [[ "${open_mode}" != "browser" && "${open_mode}" != "chrome-app" ]]; then
  echo "--open-mode must be one of: browser, chrome-app" >&2
  exit 1
fi

setta_bin_abs="$(resolve_abs_path "${setta_bin}")"
if [[ ! -x "${setta_bin_abs}" ]]; then
  echo "Setta executable is not runnable: ${setta_bin_abs}" >&2
  exit 1
fi
app_path_abs="$(resolve_abs_path "${app_path}")"

icon_path_abs=""
if [[ -n "${icon_path}" ]]; then
  icon_path_abs="$(resolve_abs_path "${icon_path}")"
  if [[ ! -f "${icon_path_abs}" ]]; then
    echo "Icon file does not exist: ${icon_path_abs}" >&2
    exit 1
  fi
  if [[ "${icon_path_abs##*.}" != "icns" ]]; then
    echo "--icon-path must point to a .icns file." >&2
    exit 1
  fi
fi

launcher_setup_cmd=("${setta_bin_abs}")
if [[ -n "${setta_home}" ]]; then
  launcher_setup_cmd+=("--setta-home" "${setta_home}")
fi
launcher_setup_cmd+=(
  "launcher"
  "setup"
  "--json"
  "--channel"
  "${channel}"
  "--open-mode"
  "${open_mode}"
  "--artifact-option"
  "app_path=${app_path_abs}"
)
if [[ -n "${icon_path_abs}" ]]; then
  launcher_setup_cmd+=("--artifact-option" "icon_path=${icon_path_abs}")
fi

install_json="$("${launcher_setup_cmd[@]}")"

python3 - "${install_json}" <<'PY'
import json
import shlex
import sys

payload = json.loads(sys.argv[1])
if not isinstance(payload, dict) or payload.get("ok") is not True:
    raise SystemExit("setta launcher setup did not return a successful JSON payload.")
metadata_path = payload.get("metadataPath")
target_command = payload.get("targetCommand")
managed_artifacts = payload.get("managedArtifacts")
if not isinstance(metadata_path, str) or not metadata_path.strip():
    raise SystemExit("launcher setup payload is missing metadataPath.")
if not isinstance(target_command, list) or not target_command:
    raise SystemExit("launcher setup payload is missing targetCommand.")
print(f"Launcher metadata written: {metadata_path}")
print(f"Bound launcher target: {shlex.join(target_command)}")
if isinstance(managed_artifacts, dict):
    app_path = managed_artifacts.get("macosApp")
    if isinstance(app_path, str) and app_path.strip():
        print(f"Managed macOS app: {app_path}")
PY
