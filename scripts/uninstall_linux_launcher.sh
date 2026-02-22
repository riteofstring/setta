#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/uninstall_linux_launcher.sh [options]

Remove Linux desktop launcher artifacts for Setta.

Options:
  --setta-bin PATH           Setta executable used for metadata removal
                             Default: first "setta" on PATH, when available
  --setta-home PATH          Optional Setta home override forwarded to launcher remove
  --applications-dir PATH    Desktop entry directory
                             Default: ~/.local/share/applications
  --desktop-entry-name NAME  Desktop entry file name (default: setta.desktop)
  --wrapper-path PATH        Wrapper command path
                             Default: ~/.local/share/setta/launcher/setta-launcher
  --desktop-shortcut-path    Desktop shortcut path
                             Default: ~/Desktop/<desktop-entry-name>
  -h, --help                 Show this help message.
EOF
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
desktop_shortcut_path=""

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

if [[ -z "${desktop_entry_name}" ]]; then
  echo "--desktop-entry-name must be non-empty." >&2
  exit 1
fi

if [[ -z "${setta_bin}" ]]; then
  setta_bin="$(command -v setta || true)"
fi

applications_dir_abs="$(resolve_abs_path "${applications_dir}")"
desktop_entry_path_abs="$(resolve_abs_path "${applications_dir_abs}/${desktop_entry_name}")"
wrapper_path_abs="$(resolve_abs_path "${wrapper_path}")"
if [[ -z "${desktop_shortcut_path}" ]]; then
  desktop_shortcut_path="~/Desktop/${desktop_entry_name}"
fi
desktop_shortcut_path_abs="$(resolve_abs_path "${desktop_shortcut_path}")"

if [[ -n "${setta_bin}" ]]; then
  setta_bin_abs="$(resolve_abs_path "${setta_bin}")"
  if [[ -x "${setta_bin_abs}" ]]; then
    launcher_uninstall_cmd=("${setta_bin_abs}")
    if [[ -n "${setta_home}" ]]; then
      launcher_uninstall_cmd+=("--setta-home" "${setta_home}")
    fi
    launcher_uninstall_cmd+=("launcher" "remove" "--json")
    if ! "${launcher_uninstall_cmd[@]}" >/dev/null; then
      echo "Warning: setta launcher remove returned a non-zero exit code." >&2
    fi
  fi
fi

removed_paths=()
if [[ -e "${desktop_entry_path_abs}" ]]; then
  rm -rf "${desktop_entry_path_abs}"
  removed_paths+=("${desktop_entry_path_abs}")
fi
if [[ -e "${desktop_shortcut_path_abs}" ]]; then
  rm -rf "${desktop_shortcut_path_abs}"
  removed_paths+=("${desktop_shortcut_path_abs}")
fi
if [[ -e "${wrapper_path_abs}" ]]; then
  rm -rf "${wrapper_path_abs}"
  removed_paths+=("${wrapper_path_abs}")
fi

wrapper_dir="$(dirname "${wrapper_path_abs}")"
if [[ -d "${wrapper_dir}" ]]; then
  rmdir "${wrapper_dir}" 2>/dev/null || true
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${applications_dir_abs}" >/dev/null 2>&1 || true
fi

if [[ ${#removed_paths[@]} -eq 0 ]]; then
  echo "No Linux launcher artifacts were present."
else
  echo "Removed Linux launcher artifacts:"
  for removed in "${removed_paths[@]}"; do
    echo "  ${removed}"
  done
fi
