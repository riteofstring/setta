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
. ./init_env.sh
./build.sh
filepath="$(setta_resolve_single_dist_artifact "${repo_root}/dist" "*.tar.gz" "sdist")"
uv pip install --force-reinstall "$filepath"
python - <<'PY'
from setta.api.listener import SettaListener
from setta.api.runner import SettaRunner
from setta.api.runtime_compat import verify_running_backend_compatibility
from setta.sdk_contracts.generated import SETTA_SDK_CONTRACT_VERSION

assert callable(verify_running_backend_compatibility)
assert isinstance(SETTA_SDK_CONTRACT_VERSION, int)

runner = SettaRunner(base_url="http://127.0.0.1:8000")
listener = SettaListener(project_config_id="packaged-project")

assert runner is not None
assert listener.websocket_endpoint.endswith(listener._socket_id)
print("retained sdk smoke ok")
PY
