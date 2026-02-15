#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

usage() {
  cat <<'USAGE'
Usage: scripts/plugin-fixtures/unlink.sh <plugin-id> [--scope workspace|setta_files|global] [--no-rescan]

Examples:
  scripts/plugin-fixtures/unlink.sh setta-fixture-frontend
  scripts/plugin-fixtures/unlink.sh setta-fixture-frontend --scope global
USAGE
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 1
fi

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  usage
  exit 0
fi

plugin_id="$1"
shift
scope=""
rescan_after_unlink=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --scope" >&2
        exit 1
      fi
      scope="$2"
      shift 2
      ;;
    --no-rescan)
      rescan_after_unlink=0
      shift
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

if [[ -n "${scope}" ]]; then
  case "${scope}" in
    workspace|setta_files|global)
      ;;
    *)
      echo "Invalid scope: ${scope}. Expected workspace|setta_files|global." >&2
      exit 1
      ;;
  esac
fi

source "${ROOT_DIR}/activate.sh"

if [[ -n "${scope}" ]]; then
  setta plugins unlink "${plugin_id}" --scope "${scope}"
else
  setta plugins unlink "${plugin_id}"
fi
if [[ ${rescan_after_unlink} -eq 1 ]]; then
  setta plugins rescan >/dev/null
fi

echo "unlinked plugin: ${plugin_id}"
