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
    unlink_stderr_file="$(mktemp)"
    if ! unlink_output="$(
      setta plugins unlink "${plugin_id}" --scope "${scope}" --ignore-missing --json \
        2>"${unlink_stderr_file}"
    )"; then
      echo "reset: failed to unlink ${plugin_id} from ${scope}" >&2
      cat "${unlink_stderr_file}" >&2
      echo "${unlink_output}" >&2
      rm -f "${unlink_stderr_file}"
      exit 1
    fi
    if [[ -s "${unlink_stderr_file}" ]]; then
      cat "${unlink_stderr_file}" >&2
    fi
    rm -f "${unlink_stderr_file}"
    unlink_state="$(
      python - "${unlink_output}" <<'PY'
import json
import sys

output = sys.argv[1]
last_non_empty_line = None
for raw_line in output.splitlines():
    line = raw_line.strip()
    if line:
        last_non_empty_line = line

if last_non_empty_line is None:
    raise SystemExit("Missing JSON output from setta plugins unlink.")

payload = json.loads(last_non_empty_line)
if payload.get("ignoredMissing"):
    print("missing")
else:
    print("removed")
PY
    )"
    if [[ "${unlink_state}" == "missing" ]]; then
      echo "no ${plugin_id} entry in ${scope}"
      continue
    fi
    echo "removed ${plugin_id} from ${scope}"
    removed_count=$((removed_count + 1))
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
