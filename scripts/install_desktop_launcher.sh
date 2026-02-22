#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/install_desktop_launcher.sh [options]

Install or upgrade Setta via uv tool, then bind desktop-launcher metadata to
the installed Setta executable.

Options:
  --package SPEC      Package spec passed to uv tool install (default: setta)
  --channel NAME      Launcher install channel (default: uv-tool-script)
  --open-mode MODE    Launcher open mode: browser | chrome-app
                      Default: browser
  --setta-home PATH   Optional Setta home override forwarded to launcher install
  -h, --help          Show this help message.
EOF
}

package_spec="setta"
channel="uv-tool-script"
open_mode="browser"
setta_home=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --package." >&2
        usage
        exit 1
      fi
      package_spec="$2"
      shift 2
      ;;
    --package=*)
      package_spec="${1#*=}"
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

if [[ -z "${package_spec}" ]]; then
  echo "--package must be non-empty." >&2
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

uv_bin="$(command -v uv || true)"
if [[ -z "${uv_bin}" ]]; then
  echo "uv is required but was not found on PATH." >&2
  echo "Install uv from https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 1
fi

"${uv_bin}" tool install --upgrade "${package_spec}"

uv_tool_bin_dir="$("${uv_bin}" tool dir --bin)"
if [[ -z "${uv_tool_bin_dir}" ]]; then
  echo "Could not resolve uv tool executable directory." >&2
  exit 1
fi

setta_bin="${uv_tool_bin_dir}/setta"
if [[ ! -x "${setta_bin}" ]]; then
  echo "Expected Setta executable at ${setta_bin}, but it is not runnable." >&2
  echo "Run 'uv tool update-shell' if uv tool executables are not on PATH." >&2
  exit 1
fi

launcher_install_cmd=(
  "${setta_bin}"
)
if [[ -n "${setta_home}" ]]; then
  launcher_install_cmd+=("--setta-home" "${setta_home}")
fi
launcher_install_cmd+=(
  "launcher"
  "install"
  "--json"
  "--channel"
  "${channel}"
  "--open-mode"
  "${open_mode}"
)

install_json="$("${launcher_install_cmd[@]}")"

if command -v python3 >/dev/null 2>&1; then
  python3 - "${install_json}" <<'PY'
import json
import shlex
import sys

raw = sys.argv[1]
payload = json.loads(raw)
if not isinstance(payload, dict) or payload.get("ok") is not True:
    raise SystemExit("setta launcher install did not return a successful JSON payload.")
metadata_path = payload.get("metadataPath")
target_command = payload.get("targetCommand")
if not isinstance(metadata_path, str) or not metadata_path.strip():
    raise SystemExit("launcher install payload is missing metadataPath.")
if not isinstance(target_command, list) or not target_command:
    raise SystemExit("launcher install payload is missing targetCommand.")
print(f"Launcher metadata written: {metadata_path}")
print(f"Bound launcher target: {shlex.join(target_command)}")
PY
else
  echo "Launcher metadata install succeeded."
  echo "${install_json}"
fi
