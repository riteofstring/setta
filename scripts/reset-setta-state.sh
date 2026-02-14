#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/reset-setta-state.sh [--workspace path] [--profile name] [--setta-home path] [--setta-files-root path] [--setta-files-location mode] [--runtime-root path]

Resolves active Setta roots using the same precedence as runtime startup, then
deletes only the canonical setta_files_root target.

Safety guardrails block dangerous or non-canonical targets.
Detached runtime roots are rejected (no deletion occurs).
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

is_allowed_setta_target() {
  local target="$1"
  local workspace_root="$2"
  local setta_home="$3"
  local local_setta_files="${workspace_root}/setta_files"
  local local_setta_files_dev="${workspace_root}/setta_files_dev"
  local global_setta_base="${setta_home}/setta_files"
  local global_setta_base_dev="${setta_home}/setta_files_dev"

  if [[ "${target}" == "${local_setta_files}" || "${target}" == "${local_setta_files_dev}" ]]; then
    return 0
  fi
  if [[ "${target}" == "${global_setta_base}" || "${target}" == "${global_setta_base}/"* ]]; then
    return 0
  fi
  if [[ "${target}" == "${global_setta_base_dev}" || "${target}" == "${global_setta_base_dev}/"* ]]; then
    return 0
  fi
  return 1
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

resolved_paths="$(
  cd "${ROOT_DIR}" && . ./activate.sh >/dev/null 2>&1 && python - <<'PY'
import sys

from setta.utils.paths import resolve_setta_paths

try:
    paths = resolve_setta_paths()
except ValueError as exc:
    print(str(exc), file=sys.stderr)
    raise SystemExit(1)

workspace_root = paths.workspace_root.resolve(strict=False)
setta_home = paths.setta_home.resolve(strict=False)
setta_root = paths.setta_files_root.resolve(strict=False)
runtime_root = paths.runtime_root.resolve(strict=False)

print(f"WORKSPACE_ROOT={workspace_root}")
print(f"SETTA_HOME={setta_home}")
print(f"SETTA_FILES_ROOT={setta_root}")
print(f"RUNTIME_ROOT={runtime_root}")
print(f"RUNTIME_WITHIN_SETTA_ROOT={int(runtime_root.is_relative_to(setta_root))}")
PY
)"

if [[ -z "${resolved_paths}" ]]; then
  echo "Failed to resolve Setta paths for reset." >&2
  exit 1
fi

resolved_workspace_root=""
resolved_setta_home=""
resolved_setta_files_root=""
resolved_runtime_root=""
runtime_within_setta_root=""

while IFS='=' read -r key value; do
  case "${key}" in
    WORKSPACE_ROOT)
      resolved_workspace_root="${value}"
      ;;
    SETTA_HOME)
      resolved_setta_home="${value}"
      ;;
    SETTA_FILES_ROOT)
      resolved_setta_files_root="${value}"
      ;;
    RUNTIME_ROOT)
      resolved_runtime_root="${value}"
      ;;
    RUNTIME_WITHIN_SETTA_ROOT)
      runtime_within_setta_root="${value}"
      ;;
  esac
done <<< "${resolved_paths}"

if [[ -z "${resolved_workspace_root}" || -z "${resolved_setta_home}" || -z "${resolved_setta_files_root}" || -z "${resolved_runtime_root}" || -z "${runtime_within_setta_root}" ]]; then
  echo "Failed to resolve Setta paths for reset." >&2
  exit 1
fi

if [[ "${runtime_within_setta_root}" != "1" ]]; then
  echo "Refusing to reset with detached runtime root." >&2
  echo "Resolved setta_files_root: ${resolved_setta_files_root}" >&2
  echo "Resolved runtime_root: ${resolved_runtime_root}" >&2
  exit 1
fi

delete_targets=("${resolved_setta_files_root}")

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
  if ! is_allowed_setta_target "${target}" "${resolved_workspace_root}" "${resolved_setta_home}"; then
    echo "Refusing to delete non-canonical Setta target: ${target}" >&2
    echo "Allowed targets are workspace-local setta_files/setta_files_dev or paths under ${resolved_setta_home}/setta_files and ${resolved_setta_home}/setta_files_dev." >&2
    exit 1
  fi
done

for target in "${delete_targets[@]}"; do
  rm -rf "${target}"
  echo "Deleted Setta reset target: ${target}"
done
