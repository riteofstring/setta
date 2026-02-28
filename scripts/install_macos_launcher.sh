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
  --open-mode MODE   Launcher open mode: browser | chrome-app (default: chrome-app)
  -h, --help         Show this help message.
USAGE
}

resolve_abs_path() {
  local raw_path="${1-}"
  if [[ -z "${raw_path}" ]]; then
    echo "Missing path value." >&2
    return 1
  fi

  local expanded_path="${raw_path}"
  if [[ "${expanded_path}" == "~" ]]; then
    expanded_path="${HOME}"
  elif [[ "${expanded_path}" == "~/"* ]]; then
    expanded_path="${HOME}/${expanded_path#~/}"
  fi

  local absolute_path="${expanded_path}"
  if [[ "${absolute_path}" != /* ]]; then
    absolute_path="$(pwd)/${absolute_path}"
  fi

  if [[ -e "${absolute_path}" ]]; then
    if [[ -d "${absolute_path}" ]]; then
      (
        cd "${absolute_path}"
        pwd -P
      )
      return
    fi
    local existing_parent
    existing_parent="$(dirname "${absolute_path}")"
    local existing_leaf
    existing_leaf="$(basename "${absolute_path}")"
    (
      cd "${existing_parent}"
      printf '%s/%s\n' "$(pwd -P)" "${existing_leaf}"
    )
    return
  fi

  local probe="${absolute_path}"
  local suffix=""
  while [[ ! -e "${probe}" ]]; do
    local parent
    parent="$(dirname "${probe}")"
    local leaf
    leaf="$(basename "${probe}")"
    suffix="/${leaf}${suffix}"
    if [[ "${parent}" == "${probe}" ]]; then
      break
    fi
    probe="${parent}"
  done
  if [[ ! -e "${probe}" ]]; then
    echo "Could not resolve path: ${raw_path}" >&2
    return 1
  fi
  if [[ -d "${probe}" ]]; then
    (
      cd "${probe}"
      printf '%s%s\n' "$(pwd -P)" "${suffix}"
    )
    return
  fi
  local probe_parent
  probe_parent="$(dirname "${probe}")"
  local probe_leaf
  probe_leaf="$(basename "${probe}")"
  (
    cd "${probe_parent}"
    printf '%s/%s%s\n' "$(pwd -P)" "${probe_leaf}" "${suffix}"
  )
}

setta_bin=""
setta_home=""
app_path="${HOME}/Applications/Setta.app"
icon_path=""
channel="macos-script"
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
  "--install-source"
  "installer-managed"
  "--open-mode"
  "${open_mode}"
  "--artifact-option"
  "app_path=${app_path_abs}"
)
if [[ -n "${icon_path_abs}" ]]; then
  launcher_setup_cmd+=("--artifact-option" "icon_path=${icon_path_abs}")
fi

install_json="$("${launcher_setup_cmd[@]}")"

if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"${install_json}"; then
  echo "setta launcher setup did not return a successful JSON payload." >&2
  exit 1
fi

echo "${install_json}"
