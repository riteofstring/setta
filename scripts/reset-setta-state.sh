#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/reset-setta-state.sh [--workspace path] [--profile name] [--setta-home path] [--setta-files-root path] [--setta-files-location mode] [--runtime-root path]

Resolves active Setta roots using the same precedence as runtime startup, then
deletes:
  - setta_files_root
  - runtime_root when runtime_root is outside setta_files_root

Safety guardrails block dangerous targets.
EOF
}

require_option_value() {
  local flag="$1"
  local arg_count="$2"
  if [[ "${arg_count}" -lt 2 ]]; then
    echo "Missing value for ${flag}" >&2
    exit 1
  fi
}

path_depth() {
  local target="$1"
  local trimmed="${target#/}"
  if [[ -z "${trimmed}" ]]; then
    echo 0
    return 0
  fi
  IFS='/' read -r -a parts <<< "${trimmed}"
  echo "${#parts[@]}"
}

workspace_override=""
profile_override=""
setta_home_override=""
setta_files_root_override=""
setta_files_location_override=""
runtime_root_override=""
repo_root_resolved="$(cd "${ROOT_DIR}" && pwd -P)"
home_resolved=""
if [[ -n "${HOME:-}" && -d "${HOME}" ]]; then
  home_resolved="$(cd "${HOME}" && pwd -P)"
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      require_option_value "$1" "$#"
      workspace_override="$2"
      shift 2
      ;;
    --profile)
      require_option_value "$1" "$#"
      profile_override="$2"
      shift 2
      ;;
    --setta-home)
      require_option_value "$1" "$#"
      setta_home_override="$2"
      shift 2
      ;;
    --setta-files-root)
      require_option_value "$1" "$#"
      setta_files_root_override="$2"
      shift 2
      ;;
    --setta-files-location)
      require_option_value "$1" "$#"
      setta_files_location_override="$2"
      shift 2
      ;;
    --runtime-root)
      require_option_value "$1" "$#"
      runtime_root_override="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -n "${setta_files_root_override}" && -n "${setta_files_location_override}" ]]; then
  echo "Cannot pass both --setta-files-root and --setta-files-location." >&2
  exit 1
fi

if [[ -n "${workspace_override}" ]]; then
  export SETTA_WORKSPACE_ROOT="${workspace_override}"
fi
if [[ -n "${profile_override}" ]]; then
  export SETTA_PROFILE="${profile_override}"
fi
if [[ -n "${setta_home_override}" ]]; then
  export SETTA_HOME="${setta_home_override}"
fi
if [[ -n "${setta_files_root_override}" ]]; then
  export SETTA_FILES_ROOT="${setta_files_root_override}"
  unset SETTA_FILES_LOCATION
fi
if [[ -n "${setta_files_location_override}" ]]; then
  export SETTA_FILES_LOCATION="${setta_files_location_override}"
  unset SETTA_FILES_ROOT
fi
if [[ -n "${runtime_root_override}" ]]; then
  export SETTA_RUNTIME_ROOT="${runtime_root_override}"
fi

resolved_roots="$(
  cd "${ROOT_DIR}" && . ./activate.sh >/dev/null 2>&1 && python - <<'PY'
from setta.utils.paths import resolve_setta_paths

paths = resolve_setta_paths()
setta_root = paths.setta_files_root.resolve(strict=False)
runtime_root = paths.runtime_root.resolve(strict=False)
print(setta_root)
if not runtime_root.is_relative_to(setta_root):
    print(runtime_root)
PY
)"

if [[ -z "${resolved_roots}" ]]; then
  echo "Failed to resolve Setta reset targets." >&2
  exit 1
fi

delete_targets=()
while IFS= read -r line; do
  if [[ -n "${line}" ]]; then
    delete_targets+=("${line}")
  fi
done <<< "${resolved_roots}"
if [[ "${#delete_targets[@]}" -eq 0 ]]; then
  echo "Failed to resolve Setta reset targets." >&2
  exit 1
fi

for target in "${delete_targets[@]}"; do
  if [[ -z "${target}" ]]; then
    echo "Refusing to delete an empty path." >&2
    exit 1
  fi
  if [[ "${target}" == "/" || "${target}" == "." || "${target}" == ".." ]]; then
    echo "Refusing to delete unsafe target: ${target}" >&2
    exit 1
  fi
  if [[ -n "${home_resolved}" && "${target}" == "${home_resolved}" ]]; then
    echo "Refusing to delete HOME as Setta reset target: ${target}" >&2
    exit 1
  fi
  if [[ "${target}" == "${repo_root_resolved}" ]]; then
    echo "Refusing to delete repository root as Setta reset target: ${target}" >&2
    exit 1
  fi

  target_depth="$(path_depth "${target}")"
  if [[ "${target_depth}" -lt 2 ]]; then
    echo "Refusing to delete shallow path (${target_depth}): ${target}" >&2
    exit 1
  fi
done

for target in "${delete_targets[@]}"; do
  rm -rf "${target}"
  echo "Deleted Setta reset target: ${target}"
done
