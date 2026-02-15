#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FIXTURE_ROOT="${ROOT_DIR}/tests/fixtures/plugins"

if [[ ! -d "${FIXTURE_ROOT}" ]]; then
  echo "Fixture root not found: ${FIXTURE_ROOT}" >&2
  exit 1
fi

source "${ROOT_DIR}/activate.sh"
if ! command -v setta >/dev/null 2>&1; then
  echo "setta command not found after activate.sh. Ensure the environment is initialized." >&2
  exit 1
fi

echo "reset: collecting fixture plugin ids from ${FIXTURE_ROOT}..."
plugin_ids="$(
  python - "${FIXTURE_ROOT}" <<'PY'
import json
import pathlib
import sys

fixture_root = pathlib.Path(sys.argv[1])
plugin_ids: set[str] = set()
for manifest_path in sorted(fixture_root.rglob("setta.plugin.json")):
    with manifest_path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    plugin_id = payload.get("id")
    if isinstance(plugin_id, str) and plugin_id.strip():
        plugin_ids.add(plugin_id.strip())

for plugin_id in sorted(plugin_ids):
    print(plugin_id)
PY
)"

plugin_count=0
while IFS= read -r plugin_id; do
  [[ -z "${plugin_id}" ]] && continue
  plugin_count=$((plugin_count + 1))
done <<< "${plugin_ids}"

echo "reset: found ${plugin_count} fixture plugin id(s)."

removed_count=0
while IFS= read -r plugin_id; do
  [[ -z "${plugin_id}" ]] && continue
  echo "reset: unlink attempts for ${plugin_id}..."
  for scope in workspace setta_files global; do
    if unlink_output="$(setta plugins unlink "${plugin_id}" --scope "${scope}" 2>&1)"; then
      echo "removed ${plugin_id} from ${scope}"
      removed_count=$((removed_count + 1))
      continue
    fi
    if grep -Eqi "not found|not installed|no plugin" <<<"${unlink_output}"; then
      echo "no ${plugin_id} entry in ${scope}"
      continue
    fi
    echo "reset: failed to unlink ${plugin_id} from ${scope}" >&2
    echo "${unlink_output}" >&2
    exit 1
  done
done <<< "${plugin_ids}"

echo "reset: rescanning plugins..."
if ! rescan_output="$(setta plugins rescan 2>&1)"; then
  echo "reset: plugin rescan failed." >&2
  echo "${rescan_output}" >&2
  exit 1
fi
echo "reset: rescan complete."

echo "plugin fixture reset complete (removed entries: ${removed_count})"
