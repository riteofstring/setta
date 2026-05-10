#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
artifact_helper="${repo_root}/scripts/lib/distribution_artifact_path.sh"

if [[ ! -f "${artifact_helper}" ]]; then
  echo "Missing distribution artifact helper: ${artifact_helper}" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "${artifact_helper}"

cleanup_on_exit() {
  (cd "${repo_root}" && ./cleanup.sh) || true
}

trap cleanup_on_exit EXIT

cd "${repo_root}"
SETTA_INIT_ENV_NO_INSTALL_PROJECT=1
. ./init_env.sh
./build.sh
filepath="$(setta_resolve_single_dist_artifact "${repo_root}/dist" "*.tar.gz" "sdist")"
uv pip install --force-reinstall "$filepath"
python - <<'PY'
import json
import subprocess
import sys
import uuid

import setta

section_key = {"type": "Section", "sectionId": "section-config"}
param_key = {
    "type": "SectionParam",
    "sectionId": "section-config",
    "codeObjId": "count",
}
call_id = uuid.uuid4().hex
envelope = {
    "callId": call_id,
    "commandName": "listener_render_realtime_dependency_values",
    "payload": {
        "dependencyCatalog": {
            "entries": [
                {
                    "dependencyKey": section_key,
                    "name": "Config",
                    "fullPathName": "Config",
                    "dependencies": [param_key],
                    "includeInCodegen": True,
                    "sectionType": "Dict",
                    "codeObjType": None,
                    "passingStyle": None,
                    "controlCodeObjId": None,
                    "controlCodeObjType": None,
                    "sectionRepresentation": None,
                    "controlValueRepresentation": None,
                    "valueRepresentation": None,
                },
                {
                    "dependencyKey": param_key,
                    "name": "count",
                    "fullPathName": "Config.count",
                    "dependencies": [],
                    "includeInCodegen": True,
                    "sectionType": None,
                    "codeObjType": "CodeParam",
                    "passingStyle": None,
                    "controlCodeObjId": None,
                    "controlCodeObjType": None,
                    "sectionRepresentation": None,
                    "controlValueRepresentation": None,
                    "valueRepresentation": "expression",
                },
            ]
        },
        "currentDependencyValues": {
            "entries": [
                {
                    "dependencyKey": section_key,
                    "renderedValue": "{'count': 1}",
                },
                {
                    "dependencyKey": param_key,
                    "renderedValue": "1",
                },
            ]
        },
        "deltas": [
            {
                "dependency": param_key,
                "value": {"payload": "2", "type": "Literal"},
                "binaryPayloadBase64": None,
            }
        ],
    },
}

process = subprocess.Popen(
    [sys.executable, "-m", "setta", "sdk-local-core"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)
try:
    assert process.stdout is not None
    assert process.stdin is not None
    handshake_line = process.stdout.readline()
    assert handshake_line
    handshake = json.loads(handshake_line)
    assert handshake["protocolVersion"] == 1
    assert handshake["sdkVersion"] == setta.__version__
    assert isinstance(handshake["coreVersion"], str)
    assert handshake["coreVersion"]
    assert isinstance(handshake["sdkContractVersion"], int)
    assert handshake["sdkContractVersion"] > 0

    process.stdin.write(json.dumps(envelope))
    process.stdin.write("\n")
    process.stdin.flush()

    result_line = process.stdout.readline()
    assert result_line
    result = json.loads(result_line)
    assert result["callId"] == call_id
    assert result["ok"] is True
    entries = result["result"]["dependencyValues"]["entries"]
    assert any(
        entry["dependencyKey"]["type"] == "SectionParam"
        and entry["dependencyKey"]["sectionId"] == "section-config"
        and entry["dependencyKey"]["codeObjId"] == "count"
        and entry["renderedValue"] == "2"
        for entry in entries
    )
    assert any(
        entry["dependencyKey"]["type"] == "Section"
        and entry["dependencyKey"]["sectionId"] == "section-config"
        and entry["renderedValue"] == "{'count': 2}"
        for entry in entries
    )
finally:
    if process.stdin is not None:
        process.stdin.close()
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=1)
    if process.stdout is not None:
        process.stdout.close()
    if process.stderr is not None:
        process.stderr.close()
print("retained sdk smoke ok")
PY
