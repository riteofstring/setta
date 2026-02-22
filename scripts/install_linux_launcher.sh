#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/install_linux_launcher.sh [options]

Install Linux desktop launcher artifacts for Setta.

Options:
  --setta-bin PATH           Absolute or PATH-resolved Setta executable to bind.
                             Default: first "setta" on PATH
  --setta-home PATH          Optional Setta home override forwarded to launcher setup
  --applications-dir PATH    Desktop entry directory
                             Default: ~/.local/share/applications
  --desktop-entry-name NAME  Desktop entry file name (default: setta.desktop)
  --wrapper-path PATH        Wrapper command path
                             Default: ~/.local/share/setta/launcher/setta-launcher
  --desktop-shortcut         Also create a desktop shortcut file
  --desktop-shortcut-path    Desktop shortcut path
                             Default: ~/Desktop/<desktop-entry-name>
  --app-name NAME            Desktop entry Name value (default: Setta)
  --icon-path PATH           Optional icon path written to desktop entry
  --channel NAME             Launcher install channel (default: linux-script)
  --open-mode MODE           Launcher default open mode: browser | chrome-app
                             Default: browser
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
create_desktop_shortcut=0
desktop_shortcut_path=""
app_name="Setta"
icon_path=""
channel="linux-script"
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

if [[ -z "${desktop_entry_name}" ]]; then
  echo "--desktop-entry-name must be non-empty." >&2
  exit 1
fi
if [[ "${open_mode}" != "browser" && "${open_mode}" != "chrome-app" ]]; then
  echo "--open-mode must be one of: browser, chrome-app" >&2
  exit 1
fi
if [[ -z "${channel}" ]]; then
  echo "--channel must be non-empty." >&2
  exit 1
fi
if [[ -z "${app_name}" ]]; then
  echo "--app-name must be non-empty." >&2
  exit 1
fi

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

applications_dir_abs="$(resolve_abs_path "${applications_dir}")"
desktop_entry_path_abs="$(resolve_abs_path "${applications_dir_abs}/${desktop_entry_name}")"
wrapper_path_abs="$(resolve_abs_path "${wrapper_path}")"

desktop_shortcut_path_abs=""
if [[ "${create_desktop_shortcut}" == "1" ]]; then
  if [[ -z "${desktop_shortcut_path}" ]]; then
    desktop_shortcut_path="~/Desktop/${desktop_entry_name}"
  fi
  desktop_shortcut_path_abs="$(resolve_abs_path "${desktop_shortcut_path}")"
fi

icon_path_abs=""
if [[ -n "${icon_path}" ]]; then
  icon_path_abs="$(resolve_abs_path "${icon_path}")"
fi

launcher_install_cmd=("${setta_bin_abs}")
if [[ -n "${setta_home}" ]]; then
  launcher_install_cmd+=("--setta-home" "${setta_home}")
fi
launcher_install_cmd+=(
  "launcher"
  "setup"
  "--json"
  "--channel"
  "${channel}"
  "--open-mode"
  "${open_mode}"
  "--managed-artifact"
  "linuxDesktopEntry=${desktop_entry_path_abs}"
  "--managed-artifact"
  "linuxWrapper=${wrapper_path_abs}"
)
if [[ "${create_desktop_shortcut}" == "1" ]]; then
  launcher_install_cmd+=(
    "--managed-artifact"
    "linuxDesktopShortcut=${desktop_shortcut_path_abs}"
  )
fi

install_json="$("${launcher_install_cmd[@]}")"

target_command_shell="$(
  "${PYTHON_BIN}" - "${install_json}" <<'PY'
import json
import shlex
import sys

raw = sys.argv[1]
payload = json.loads(raw)
if not isinstance(payload, dict) or payload.get("ok") is not True:
    raise SystemExit("setta launcher setup did not return a successful JSON payload.")
raw_command = payload.get("targetCommand")
if not isinstance(raw_command, list) or not raw_command:
    raise SystemExit("setta launcher setup payload is missing targetCommand.")
parts: list[str] = []
for part in raw_command:
    if not isinstance(part, str) or not part.strip():
        raise SystemExit("targetCommand entries must be non-empty strings.")
    parts.append(shlex.quote(part))
print(" ".join(parts))
PY
)"

wrapper_dir="$(dirname "${wrapper_path_abs}")"
mkdir -p "${wrapper_dir}" "${applications_dir_abs}"

cat > "${wrapper_path_abs}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

show_failure_dialog() {
  local message="\${1-}"
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --title="Setta Launch Failed" --text="\${message}" --width=460 >/dev/null 2>&1 || true
    return
  fi
  if command -v kdialog >/dev/null 2>&1; then
    kdialog --error "\${message}" --title "Setta Launch Failed" >/dev/null 2>&1 || true
  fi
}

run_launcher() {
  local workspace_arg="\${1-}"
  local cmd="${target_command_shell} launcher"
  if [[ -n "\${workspace_arg}" ]]; then
    cmd="\${cmd} --workspace \$(printf '%q' "\${workspace_arg}")"
  fi

  local output=""
  if output="\$(eval "\${cmd}" 2>&1)"; then
    return 0
  fi

  local exit_code=\$?
  local guidance
  guidance="Setta could not start.\n\n\${output}\n\nRepair launcher metadata with:\n${target_command_shell} launcher repair\n\nOr rerun setup with:\n${target_command_shell} launcher setup --channel ${channel}"
  printf '%b\n' "\${guidance}" >&2
  show_failure_dialog "Setta could not start. Open a terminal and run 'setta launcher repair'."
  return "\${exit_code}"
}

if [[ \$# -gt 0 ]]; then
  first_path="\$1"
  if [[ -d "\${first_path}" ]]; then
    run_launcher "\${first_path}"
    exit \$?
  fi
  if [[ -e "\${first_path}" ]]; then
    run_launcher "\$(dirname "\${first_path}")"
    exit \$?
  fi
fi

run_launcher
exit \$?
EOF
chmod 755 "${wrapper_path_abs}"

wrapper_exec="$(
  "${PYTHON_BIN}" - "${wrapper_path_abs}" <<'PY'
import shlex
import sys

print(f"{shlex.quote(sys.argv[1])} %F")
PY
)"

icon_line=""
if [[ -n "${icon_path_abs}" ]]; then
  icon_line="Icon=${icon_path_abs}"
fi

cat > "${desktop_entry_path_abs}" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=${app_name}
Comment=Launch Setta
Exec=${wrapper_exec}
${icon_line}
Terminal=false
Categories=Development;IDE;
StartupNotify=true
EOF
chmod 644 "${desktop_entry_path_abs}"

if [[ "${create_desktop_shortcut}" == "1" ]]; then
  desktop_shortcut_dir="$(dirname "${desktop_shortcut_path_abs}")"
  mkdir -p "${desktop_shortcut_dir}"
  cp "${desktop_entry_path_abs}" "${desktop_shortcut_path_abs}"
  chmod 755 "${desktop_shortcut_path_abs}"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${applications_dir_abs}" >/dev/null 2>&1 || true
fi

echo "Installed Linux desktop entry: ${desktop_entry_path_abs}"
echo "Installed launcher wrapper: ${wrapper_path_abs}"
if [[ "${create_desktop_shortcut}" == "1" ]]; then
  echo "Installed desktop shortcut: ${desktop_shortcut_path_abs}"
fi
