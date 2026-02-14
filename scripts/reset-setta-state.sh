#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/reset-setta-state.sh [--workspace path] [--profile name] [--setta-home path] [--setta-files-root path] [--setta-files-location mode] [--runtime-root path]

Resolves the active Setta state root using the same precedence as runtime startup,
then deletes that resolved state root.
EOF
}

workspace_override=""
profile_override=""
setta_home_override=""
setta_files_root_override=""
setta_files_location_override=""
runtime_root_override=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      workspace_override="$2"
      shift 2
      ;;
    --profile)
      profile_override="$2"
      shift 2
      ;;
    --setta-home)
      setta_home_override="$2"
      shift 2
      ;;
    --setta-files-root)
      setta_files_root_override="$2"
      shift 2
      ;;
    --setta-files-location)
      setta_files_location_override="$2"
      shift 2
      ;;
    --runtime-root)
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
fi
if [[ -n "${setta_files_location_override}" ]]; then
  export SETTA_FILES_LOCATION="${setta_files_location_override}"
fi
if [[ -n "${runtime_root_override}" ]]; then
  export SETTA_RUNTIME_ROOT="${runtime_root_override}"
fi

resolved_state_root="$(
  cd "${ROOT_DIR}" && . ./activate.sh >/dev/null 2>&1 && python - <<'PY'
from setta.utils.paths import resolve_setta_paths

paths = resolve_setta_paths()
print(paths.setta_files_root)
PY
)"

if [[ -z "${resolved_state_root}" ]]; then
  echo "Failed to resolve Setta state root." >&2
  exit 1
fi
if [[ "${resolved_state_root}" == "/" ]]; then
  echo "Refusing to delete / as Setta state root." >&2
  exit 1
fi

rm -rf "${resolved_state_root}"
echo "Deleted Setta state root: ${resolved_state_root}"
