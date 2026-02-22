#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/uninstall_macos_launcher.sh [options]

Thin wrapper that delegates launcher removal to `setta launcher remove`.

Options:
  --setta-bin PATH   Setta executable used for metadata/artifact removal.
                     Default: first "setta" on PATH
  --setta-home PATH  Optional Setta home override forwarded to launcher remove
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

if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"${remove_json}"; then
  echo "setta launcher remove did not return a successful JSON payload." >&2
  exit 1
fi

echo "${remove_json}"
