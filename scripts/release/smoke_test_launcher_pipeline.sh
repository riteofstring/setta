#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/release/smoke_test_launcher_pipeline.sh [options]

Runs an end-to-end desktop launcher smoke flow:
1) clean install via bootstrap script
2) launcher open flow
3) package upgrade + relaunch
4) deliberate artifact break + repair
5) launcher remove + cleanup verification

Options:
  --package SPEC          Package spec for bootstrap and update (default: setta)
  --bootstrap-script PATH Bootstrap shell script (default: scripts/install_desktop_launcher.sh)
  --setta-home PATH       Optional explicit SETTA_HOME root
  --workspace PATH        Optional workspace path for launcher open flow
  -h, --help              Show this help message
USAGE
}

package_spec="setta"
bootstrap_script="scripts/install_desktop_launcher.sh"
setta_home_override=""
workspace_override=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package)
      package_spec="$2"
      shift 2
      ;;
    --package=*)
      package_spec="${1#*=}"
      shift
      ;;
    --bootstrap-script)
      bootstrap_script="$2"
      shift 2
      ;;
    --bootstrap-script=*)
      bootstrap_script="${1#*=}"
      shift
      ;;
    --setta-home)
      setta_home_override="$2"
      shift 2
      ;;
    --setta-home=*)
      setta_home_override="${1#*=}"
      shift
      ;;
    --workspace)
      workspace_override="$2"
      shift 2
      ;;
    --workspace=*)
      workspace_override="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${package_spec}" ]]; then
  echo "--package must be non-empty." >&2
  exit 1
fi

if [[ ! -f "${bootstrap_script}" ]]; then
  echo "Bootstrap script not found: ${bootstrap_script}" >&2
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required for launcher smoke tests." >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for launcher smoke tests." >&2
  exit 1
fi

temp_root="$(mktemp -d)"
cleanup() {
  if [[ -n "${setta_bin:-}" && -x "${setta_bin}" && -n "${workspace_root:-}" ]]; then
    "${setta_bin}" --setta-home "${setta_home}" stop --workspace "${workspace_root}" --all >/dev/null 2>&1 || true
  fi
  rm -rf "${temp_root}"
}
trap cleanup EXIT

export HOME="${temp_root}/home"
mkdir -p "${HOME}"

setta_home="${setta_home_override}"
if [[ -z "${setta_home}" ]]; then
  setta_home="${temp_root}/setta-home"
fi
mkdir -p "${setta_home}"

workspace_root="${workspace_override}"
if [[ -z "${workspace_root}" ]]; then
  workspace_root="${temp_root}/workspace"
fi
mkdir -p "${workspace_root}"

echo "[launcher-smoke] Installing launcher bootstrap assets..."
bash "${bootstrap_script}" \
  --package "${package_spec}" \
  --setta-home "${setta_home}" \
  --channel "uv-tool-script" \
  --open-mode "browser"

uv_tool_bin_dir="$(uv tool dir --bin)"
setta_bin="${uv_tool_bin_dir}/setta"
if [[ ! -x "${setta_bin}" ]]; then
  echo "Setta executable not found after bootstrap install: ${setta_bin}" >&2
  exit 1
fi

echo "[launcher-smoke] Verifying clean launcher install..."
status_json="$("${setta_bin}" --setta-home "${setta_home}" launcher status --json)"
python3 - "${status_json}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if payload.get("ok") is not True:
    raise SystemExit("launcher status failed after install")
if payload.get("installed") is not True:
    raise SystemExit("launcher not installed after bootstrap")
managed = payload.get("managedArtifacts") or {}
if not managed:
    raise SystemExit("launcher install did not produce managed artifacts")
print("[launcher-smoke] install status OK")
PY

echo "[launcher-smoke] Running launcher open flow..."
launch_json="$("${setta_bin}" --setta-home "${setta_home}" launcher --json --workspace "${workspace_root}" --no-open)"
python3 - "${launch_json}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if payload.get("ok") is not True:
    raise SystemExit("launcher open failed")
if not payload.get("bootstrapUrl"):
    raise SystemExit("launcher open did not return bootstrapUrl")
if payload.get("openWorkspaceSwitcher"):
    raise SystemExit("explicit workspace launch unexpectedly opened switcher")
print("[launcher-smoke] launch flow OK")
PY
"${setta_bin}" --setta-home "${setta_home}" stop --workspace "${workspace_root}" --all >/dev/null 2>&1 || true

echo "[launcher-smoke] Upgrading package and relaunching..."
update_json="$("${setta_bin}" --setta-home "${setta_home}" launcher update --json --package "${package_spec}")"
python3 - "${update_json}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if payload.get("ok") is not True:
    raise SystemExit("launcher update failed")
status = payload.get("status") or {}
if status.get("installed") is not True:
    raise SystemExit("launcher update returned non-installed status")
print("[launcher-smoke] update flow OK")
PY
relaunch_json="$("${setta_bin}" --setta-home "${setta_home}" launcher --json --workspace "${workspace_root}" --no-open)"
python3 - "${relaunch_json}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if payload.get("ok") is not True:
    raise SystemExit("launcher relaunch failed after update")
if not payload.get("bootstrapUrl"):
    raise SystemExit("launcher relaunch missing bootstrapUrl")
print("[launcher-smoke] relaunch flow OK")
PY
"${setta_bin}" --setta-home "${setta_home}" stop --workspace "${workspace_root}" --all >/dev/null 2>&1 || true

echo "[launcher-smoke] Refreshing launcher status after update..."
post_update_status_json="$("${setta_bin}" --setta-home "${setta_home}" launcher status --json)"

echo "[launcher-smoke] Deliberately breaking a managed artifact..."
artifact_to_break="$(python3 - "${post_update_status_json}" <<'PY'
import json
import pathlib
import sys

payload = json.loads(sys.argv[1])
existing = payload.get("existingManagedArtifacts") or []
if existing:
    print(existing[0])
    raise SystemExit(0)
managed = payload.get("managedArtifacts") or {}
for value in managed.values():
    if isinstance(value, str) and value.strip():
        print(value)
        raise SystemExit(0)
raise SystemExit("no managed artifact path found to break")
PY
)"
if [[ ! -e "${artifact_to_break}" ]]; then
  echo "Selected managed artifact does not exist after update: ${artifact_to_break}" >&2
  exit 1
fi
if [[ -d "${artifact_to_break}" ]]; then
  rm -rf "${artifact_to_break}"
else
  rm -f "${artifact_to_break}"
fi

repair_json="$("${setta_bin}" --setta-home "${setta_home}" launcher repair --json)"
python3 - "${repair_json}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if payload.get("ok") is not True:
    raise SystemExit("launcher repair failed")
status = payload.get("status") or {}
missing = status.get("missingManagedArtifacts") or []
if missing:
    raise SystemExit(f"launcher repair left missing artifacts: {missing}")
print("[launcher-smoke] repair flow OK")
PY

echo "[launcher-smoke] Removing launcher install..."
remove_json="$("${setta_bin}" --setta-home "${setta_home}" launcher remove --json)"
python3 - "${remove_json}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if payload.get("ok") is not True:
    raise SystemExit("launcher remove failed")
if payload.get("metadataRemoved") is not True:
    raise SystemExit("launcher remove did not remove metadata")
print("[launcher-smoke] remove flow OK")
PY

status_after_remove="$("${setta_bin}" --setta-home "${setta_home}" launcher status --json)"
python3 - "${status_after_remove}" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
if payload.get("ok") is not True:
    raise SystemExit("launcher status failed after remove")
if payload.get("installed"):
    raise SystemExit("launcher still installed after remove")
print("[launcher-smoke] uninstall verification OK")
PY

echo "[launcher-smoke] All smoke checks passed."
