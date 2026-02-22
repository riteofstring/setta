#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/install_macos_launcher.sh [options]

Install Setta.app into the user's Applications folder and bind it to an
explicit Setta launcher target.

Options:
  --app-path PATH    App bundle destination (default: ~/Applications/Setta.app)
  --setta-bin PATH   Absolute or PATH-resolved Setta executable to bind.
                     Default: first "setta" on PATH
  --icon-path PATH   Optional .icns file copied into Setta.app resources
  --open-mode MODE   Launcher default open mode: browser | chrome-app
                     Default: browser
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
icon_path=""
open_mode="browser"

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

if [[ "${open_mode}" != "browser" && "${open_mode}" != "chrome-app" ]]; then
  echo "--open-mode must be one of: browser, chrome-app" >&2
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

app_path_abs="$(resolve_abs_path "${app_path}")"
app_contents_dir="${app_path_abs}/Contents"
app_macos_dir="${app_contents_dir}/MacOS"
app_resources_dir="${app_contents_dir}/Resources"
launcher_binary_path="${app_macos_dir}/setta-launcher"
info_plist_path="${app_contents_dir}/Info.plist"
icon_path_abs=""
icon_file_name=""

if [[ -n "${icon_path}" ]]; then
  icon_path_abs="$(resolve_abs_path "${icon_path}")"
  if [[ ! -f "${icon_path_abs}" ]]; then
    echo "Icon file does not exist: ${icon_path_abs}" >&2
    exit 1
  fi
  icon_file_name="$(basename "${icon_path_abs}")"
  if [[ "${icon_file_name##*.}" != "icns" ]]; then
    echo "--icon-path must point to a .icns file." >&2
    exit 1
  fi
fi

install_json="$(
  "${setta_bin_abs}" launcher install \
    --json \
    --channel macos-script \
    --open-mode "${open_mode}" \
    --managed-artifact "macosApp=${app_path_abs}"
)"

target_command_shell="$(
  python3 - "${install_json}" <<'PY'
import json
import shlex
import sys

raw = sys.argv[1]
payload = json.loads(raw)
if not isinstance(payload, dict) or payload.get("ok") is not True:
    raise SystemExit("setta launcher install did not return a successful JSON payload.")
raw_command = payload.get("targetCommand")
if not isinstance(raw_command, list) or not raw_command:
    raise SystemExit("setta launcher install payload is missing targetCommand.")
parts: list[str] = []
for part in raw_command:
    if not isinstance(part, str) or not part.strip():
        raise SystemExit("targetCommand entries must be non-empty strings.")
    parts.append(shlex.quote(part))
print(" ".join(parts))
PY
)"

mkdir -p "${app_macos_dir}" "${app_resources_dir}"
icon_plist_block=""
if [[ -n "${icon_path_abs}" ]]; then
  cp "${icon_path_abs}" "${app_resources_dir}/${icon_file_name}"
  icon_plist_block=$'  <key>CFBundleIconFile</key>\n  <string>'"${icon_file_name}"'</string>'
fi

cat > "${launcher_binary_path}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

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
  guidance="Setta could not start.\n\n\${output}\n\nReinstall launcher metadata with:\n${target_command_shell} launcher install --channel macos-script\n\nOr rerun:\n./scripts/install_macos_launcher.sh"

  printf '%b\n' "\${guidance}" >&2
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display alert \\"Setta Launch Failed\\" message \\"Open Terminal and run ./scripts/install_macos_launcher.sh to repair the launcher.\\" as critical buttons {\\"OK\\"} default button \\"OK\\"" >/dev/null 2>&1 || true
  fi
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
chmod 755 "${launcher_binary_path}"

cat > "${info_plist_path}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Setta</string>
  <key>CFBundleExecutable</key>
  <string>setta-launcher</string>
  <key>CFBundleIdentifier</key>
  <string>dev.setta.desktop</string>
  <key>CFBundleName</key>
  <string>Setta</string>
${icon_plist_block}
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
</dict>
</plist>
EOF

echo "Installed macOS launcher: ${app_path_abs}"
if [[ -n "${icon_path_abs}" ]]; then
  echo "Installed macOS icon: ${app_resources_dir}/${icon_file_name}"
fi
echo "Launch with Finder, Launchpad, or Spotlight: Setta"
