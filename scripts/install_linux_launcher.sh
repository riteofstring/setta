#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/install_linux_launcher.sh [options]

Thin wrapper that delegates launcher installation to `setta launcher setup`.

Options:
  --setta-bin PATH           Absolute or PATH-resolved Setta executable to bind.
                             Default: first "setta" on PATH
  --setta-home PATH          Optional Setta home override forwarded to launcher setup
  --applications-dir PATH    Desktop entry directory (default: ~/.local/share/applications)
  --desktop-entry-name NAME  Desktop entry file name (default: setta.desktop)
  --wrapper-path PATH        Wrapper command path (default: ~/.local/share/setta/launcher/setta-launcher)
  --desktop-shortcut         Also create a desktop shortcut file
  --desktop-shortcut-path    Desktop shortcut path (default: ~/Desktop/<desktop-entry-name>)
  --app-name NAME            Desktop entry Name value (default: Setta)
  --icon-path PATH           Optional icon path written to desktop entry
  --channel NAME             Launcher setup channel (default: linux-script)
  --open-mode MODE           Launcher open mode: browser | chrome-app (default: chrome-app)
  -h, --help                 Show this help message.
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
applications_dir="~/.local/share/applications"
desktop_entry_name="setta.desktop"
wrapper_path="~/.local/share/setta/launcher/setta-launcher"
create_desktop_shortcut=0
desktop_shortcut_path=""
app_name="Setta"
icon_path=""
channel="linux-script"
open_mode="chrome-app"

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
    --applications-dir)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --applications-dir." >&2
        usage
        exit 1
      fi
      applications_dir="$2"
      shift 2
      ;;
    --applications-dir=*)
      applications_dir="${1#*=}"
      shift
      ;;
    --desktop-entry-name)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --desktop-entry-name." >&2
        usage
        exit 1
      fi
      desktop_entry_name="$2"
      shift 2
      ;;
    --desktop-entry-name=*)
      desktop_entry_name="${1#*=}"
      shift
      ;;
    --wrapper-path)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --wrapper-path." >&2
        usage
        exit 1
      fi
      wrapper_path="$2"
      shift 2
      ;;
    --wrapper-path=*)
      wrapper_path="${1#*=}"
      shift
      ;;
    --desktop-shortcut)
      create_desktop_shortcut=1
      shift
      ;;
    --desktop-shortcut-path)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --desktop-shortcut-path." >&2
        usage
        exit 1
      fi
      desktop_shortcut_path="$2"
      shift 2
      ;;
    --desktop-shortcut-path=*)
      desktop_shortcut_path="${1#*=}"
      shift
      ;;
    --app-name)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --app-name." >&2
        usage
        exit 1
      fi
      app_name="$2"
      shift 2
      ;;
    --app-name=*)
      app_name="${1#*=}"
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
if [[ -z "${desktop_entry_name}" ]]; then
  echo "--desktop-entry-name must be non-empty." >&2
  exit 1
fi
if [[ -z "${app_name}" ]]; then
  echo "--app-name must be non-empty." >&2
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
applications_dir_abs="$(resolve_abs_path "${applications_dir}")"
wrapper_path_abs="$(resolve_abs_path "${wrapper_path}")"

icon_path_abs=""
if [[ -n "${icon_path}" ]]; then
  icon_path_abs="$(resolve_abs_path "${icon_path}")"
  if [[ ! -f "${icon_path_abs}" ]]; then
    echo "Icon file does not exist: ${icon_path_abs}" >&2
    exit 1
  fi
fi

desktop_shortcut_path_abs=""
if [[ "${create_desktop_shortcut}" == "1" ]]; then
  if [[ -z "${desktop_shortcut_path}" ]]; then
    desktop_shortcut_path="~/Desktop/${desktop_entry_name}"
  fi
  desktop_shortcut_path_abs="$(resolve_abs_path "${desktop_shortcut_path}")"
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
  "--install-source"
  "installer-managed"
  "--open-mode"
  "${open_mode}"
  "--artifact-option"
  "applications_dir=${applications_dir_abs}"
  "--artifact-option"
  "desktop_entry_name=${desktop_entry_name}"
  "--artifact-option"
  "wrapper_path=${wrapper_path_abs}"
  "--artifact-option"
  "app_name=${app_name}"
)
if [[ -n "${icon_path_abs}" ]]; then
  launcher_setup_cmd+=("--artifact-option" "icon_path=${icon_path_abs}")
fi
if [[ "${create_desktop_shortcut}" == "1" ]]; then
  launcher_setup_cmd+=(
    "--artifact-option"
    "desktop_shortcut=true"
    "--artifact-option"
    "desktop_shortcut_path=${desktop_shortcut_path_abs}"
  )
else
  launcher_setup_cmd+=("--artifact-option" "desktop_shortcut=false")
fi

install_json="$("${launcher_setup_cmd[@]}")"

"${PYTHON_BIN}" - "${install_json}" <<'PY'
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
    desktop_entry = managed_artifacts.get("linuxDesktopEntry")
    wrapper = managed_artifacts.get("linuxWrapper")
    desktop_shortcut = managed_artifacts.get("linuxDesktopShortcut")
    if isinstance(desktop_entry, str) and desktop_entry.strip():
        print(f"Managed desktop entry: {desktop_entry}")
    if isinstance(wrapper, str) and wrapper.strip():
        print(f"Managed wrapper: {wrapper}")
    if isinstance(desktop_shortcut, str) and desktop_shortcut.strip():
        print(f"Managed desktop shortcut: {desktop_shortcut}")
PY
