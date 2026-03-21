#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SETTA_PATH_FLAGS_HELPER="${ROOT_DIR}/scripts/lib/setta_path_flags.sh"

if [[ ! -f "${SETTA_PATH_FLAGS_HELPER}" ]]; then
  echo "Missing Setta path flags helper: ${SETTA_PATH_FLAGS_HELPER}" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "${SETTA_PATH_FLAGS_HELPER}"

usage() {
  cat <<'EOF'
Usage: ./scripts/reset-setta-state.sh [--workspace path] [--profile name] [--setta-home path] [--setta-files-root path] [--setta-files-location mode] [--runtime-root path]

Resolves active Setta roots using the same precedence as runtime startup, then
deletes only the canonical setta_files_root target.

Safety guardrails block dangerous or non-canonical targets.
Detached runtime roots are rejected (no deletion occurs).
EOF
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
repo_root_resolved="$(cd "${ROOT_DIR}" && pwd -P)"
home_resolved=""
if [[ -n "${HOME:-}" && -d "${HOME}" ]]; then
  home_resolved="$(cd "${HOME}" && pwd -P)"
fi

setta_path_flags_init "${SETTA_HOME:-}" "${SETTA_FILES_ROOT:-}"
setta_path_flags_seed_from_env

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      setta_require_option_value "$1" "$#" "${2-}"
      workspace_override="$2"
      shift 2
      ;;
    --workspace=*)
      workspace_override="${1#--workspace=}"
      if [[ -z "${workspace_override}" ]]; then
        echo "Missing value for --workspace" >&2
        exit 1
      fi
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if setta_path_flags_try_parse "$@"; then
        shift "${SETTA_PATH_FLAGS_CONSUMED}"
        continue
      fi
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

setta_path_flags_validate
setta_path_flags_apply_env

if [[ -n "${workspace_override}" ]]; then
  export SETTA_WORKSPACE_ROOT="${workspace_override}"
fi

resolved_paths="$(
  cd "${ROOT_DIR}" && . ./activate.sh >/dev/null && python - <<'PY'
import sys

from setta.utils.paths import resolve_setta_paths

try:
    paths = resolve_setta_paths()
except ValueError as exc:
    print(str(exc), file=sys.stderr)
    raise SystemExit(1)

setta_root = paths.setta_files_root.resolve(strict=False)
runtime_root = paths.runtime_root.resolve(strict=False)

print(f"SETTA_FILES_ROOT={setta_root}")
print(f"RUNTIME_ROOT={runtime_root}")
print(f"RUNTIME_WITHIN_SETTA_ROOT={int(runtime_root.is_relative_to(setta_root))}")
PY
)"

if [[ -z "${resolved_paths}" ]]; then
  echo "Failed to resolve Setta paths for reset." >&2
  exit 1
fi

resolved_setta_files_root=""
resolved_runtime_root=""
runtime_within_setta_root=""

while IFS='=' read -r key value; do
  case "${key}" in
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

if [[ -z "${resolved_setta_files_root}" || -z "${resolved_runtime_root}" || -z "${runtime_within_setta_root}" ]]; then
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
done

for target in "${delete_targets[@]}"; do
  rm -rf "${target}"
  echo "Deleted Setta reset target: ${target}"
done
