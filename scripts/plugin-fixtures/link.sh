#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FIXTURE_ROOT="${ROOT_DIR}/tests/fixtures/plugins"

usage() {
  cat <<'USAGE'
Usage: scripts/plugin-fixtures/link.sh <fixture-name> [--scope workspace|environment|global] [--no-rescan]

Examples:
  scripts/plugin-fixtures/link.sh frontend
  scripts/plugin-fixtures/link.sh backend-static-router --scope global
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

fixture_name="$1"
shift
scope="workspace"
rescan_after_link=1

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
      rescan_after_link=0
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

case "${scope}" in
  workspace|environment|global)
    ;;
  *)
    echo "Invalid scope: ${scope}" >&2
    exit 1
    ;;
esac

fixture_path="${FIXTURE_ROOT}/${fixture_name}"
if [[ ! -d "${fixture_path}" ]]; then
  echo "Fixture not found: ${fixture_path}" >&2
  exit 1
fi
if [[ ! -f "${fixture_path}/setta.plugin.json" ]]; then
  echo "Missing fixture manifest: ${fixture_path}/setta.plugin.json" >&2
  exit 1
fi

echo "link: building fixture frontend assets for '${fixture_name}'..."
"${SCRIPT_DIR}/build.sh" "${fixture_name}"

source "${ROOT_DIR}/activate.sh"

echo "link: linking fixture '${fixture_name}' from ${fixture_path} (scope=${scope})..."
setta plugins link "${fixture_path}" --scope "${scope}" --force
if [[ ${rescan_after_link} -eq 1 ]]; then
  echo "link: rescanning plugins..."
  setta plugins rescan >/dev/null
  echo "link: rescan complete."
fi

python - "${fixture_path}/setta.plugin.json" <<'PY'
import json
import sys

manifest_path = sys.argv[1]
with open(manifest_path, encoding="utf-8") as handle:
    payload = json.load(handle)
print(f"linked fixture plugin: {payload['id']} ({payload['version']})")
PY
