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

plugin_ids="$(
  python - "${FIXTURE_ROOT}" <<'PY'
import json
import pathlib
import sys

fixture_root = pathlib.Path(sys.argv[1])
plugin_ids: set[str] = set()
for manifest_path in sorted(fixture_root.glob("*/setta.plugin.json")):
    with manifest_path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    plugin_id = payload.get("id")
    if isinstance(plugin_id, str) and plugin_id.strip():
        plugin_ids.add(plugin_id.strip())

for plugin_id in sorted(plugin_ids):
    print(plugin_id)
PY
)"

removed_count=0
while IFS= read -r plugin_id; do
  [[ -z "${plugin_id}" ]] && continue
  for scope in workspace environment global; do
    if setta plugins unlink "${plugin_id}" --scope "${scope}" >/dev/null 2>&1; then
      echo "removed ${plugin_id} from ${scope}"
      removed_count=$((removed_count + 1))
    fi
  done
done <<< "${plugin_ids}"

setta plugins rescan >/dev/null || true

echo "plugin fixture reset complete (removed entries: ${removed_count})"
