#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

resolve_python_bin() {
  if [[ -x "${ROOT_DIR}/.venv/bin/python" ]]; then
    printf '%s\n' "${ROOT_DIR}/.venv/bin/python"
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    printf '%s\n' "python"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "python3"
    return 0
  fi
  return 1
}

resolve_default_recording_root() {
  if [[ -n "${SETTA_CHROME_REPRO_ROOT_DIR:-}" ]]; then
    printf '%s\n' "${SETTA_CHROME_REPRO_ROOT_DIR}"
    return
  fi

  local repo_name repo_suffix
  repo_name="$(basename "${ROOT_DIR}" | tr -cs 'A-Za-z0-9._-' '-')"
  repo_name="${repo_name#-}"
  repo_name="${repo_name%-}"
  if [[ -z "${repo_name}" ]]; then
    repo_name="setta"
  fi

  repo_suffix=""
  if command -v cksum >/dev/null 2>&1; then
    repo_suffix="-$(printf '%s' "${ROOT_DIR}" | cksum | awk '{print $1}')"
  fi

  printf '%s/%s%s\n' "${TMPDIR:-/tmp}/setta-chrome-recordings" "${repo_name}" "${repo_suffix}"
}

usage() {
  cat <<'EOF'
Usage: ./scripts/latest-chrome-recording.sh [--json] [--field <name>] [--root <dir>]

Resolves the newest Chrome repro recording bundle produced by
./scripts/record-chrome-repro.sh.

By default, prints the artifact bundle directory.

Options:
  --json           Print a JSON summary with bundle, log, and metadata paths.
  --field <name>   Print one summary field value instead of the bundle path.
  --root <dir>     Override the recording root to inspect.
  -h, --help       Show this help.

Examples:
  ./scripts/latest-chrome-recording.sh
  ./scripts/latest-chrome-recording.sh --json
  ./scripts/latest-chrome-recording.sh --field backendLog
EOF
}

PYTHON_BIN="$(resolve_python_bin || true)"
if [[ -z "${PYTHON_BIN}" ]]; then
  echo "Could not find Python for the Chrome repro resolver." >&2
  exit 1
fi

recording_root=""
output_json=0
field_name="artifactDir"

while (( $# > 0 )); do
  case "$1" in
    --json)
      output_json=1
      shift
      ;;
    --field)
      shift
      if (( $# == 0 )); then
        echo "Missing value for --field" >&2
        exit 1
      fi
      field_name="$1"
      shift
      ;;
    --root)
      shift
      if (( $# == 0 )); then
        echo "Missing value for --root" >&2
        exit 1
      fi
      recording_root="$1"
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

if [[ -z "${recording_root}" ]]; then
  recording_root="$(resolve_default_recording_root)"
fi

"${PYTHON_BIN}" - "${recording_root}" "${output_json}" "${field_name}" <<'PY'
import json
import sys
from pathlib import Path


def load_json(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def resolve_latest_bundle(recording_root: Path) -> tuple[Path, str]:
    latest_json_path = recording_root / "latest.json"
    latest_payload = load_json(latest_json_path)
    latest_artifact = latest_payload.get("artifactDir")
    if isinstance(latest_artifact, str):
        latest_bundle = Path(latest_artifact)
        if latest_bundle.is_dir():
            return latest_bundle.resolve(), "latest-json"

    latest_link = recording_root / "latest"
    if latest_link.exists():
        latest_bundle = latest_link.resolve()
        if latest_bundle.is_dir():
            return latest_bundle, "latest-symlink"

    candidates = sorted(
        (
            path
            for path in recording_root.iterdir()
            if path.is_dir() and path.name.startswith("recording-")
        ),
        key=lambda path: path.name,
    )
    if candidates:
        return candidates[-1].resolve(), "scan"
    raise SystemExit(
        f"No Chrome repro recordings found under {recording_root}. "
        "Run ./scripts/record-chrome-repro.sh first or pass --root."
    )


recording_root = Path(sys.argv[1]).resolve()
output_json = sys.argv[2] == "1"
field_name = sys.argv[3]

if not recording_root.exists():
    raise SystemExit(
        f"Chrome repro recording root does not exist: {recording_root}. "
        "Run ./scripts/record-chrome-repro.sh first or pass --root."
    )

artifact_dir, pointer_source = resolve_latest_bundle(recording_root)
session_file = artifact_dir / "session.json"
launcher_file = artifact_dir / "launcher.json"
recording_file = artifact_dir / "recording.json"
session_payload = load_json(session_file)
launcher_payload = load_json(launcher_file)

summary = {
    "recordingRoot": str(recording_root),
    "pointerSource": pointer_source,
    "artifactDir": str(artifact_dir),
    "sessionFile": str(session_file),
    "recordingFile": str(recording_file),
    "launcherFile": str(launcher_file),
    "eventsFile": session_payload.get("eventsFile", str(artifact_dir / "events.ndjson")),
    "consoleEventsFile": session_payload.get(
        "consoleEventsFile", str(artifact_dir / "console.ndjson")
    ),
    "transportEventsFile": session_payload.get(
        "transportEventsFile", str(artifact_dir / "transport.ndjson")
    ),
    "transportDetailsFile": session_payload.get(
        "transportDetailsFile", str(artifact_dir / "transport_details.ndjson")
    ),
    "appStateEventsFile": session_payload.get(
        "appStateEventsFile", str(artifact_dir / "app_state.ndjson")
    ),
    "logsDir": str(artifact_dir / "logs"),
    "backendLog": str(artifact_dir / "logs" / "backend.log"),
    "devInstanceLog": str(artifact_dir / "logs" / "dev-instance.log"),
    "collectorLog": str(artifact_dir / "logs" / "collector.log"),
    "chromeLog": str(artifact_dir / "logs" / "chrome.log"),
    "createdAt": session_payload.get("createdAt"),
    "finalizedAt": session_payload.get("finalizedAt"),
    "eventCount": session_payload.get("eventCount"),
    "stopReason": session_payload.get("stopReason"),
    "bootstrapUrl": launcher_payload.get("bootstrapUrl"),
}

if output_json:
    print(json.dumps(summary, indent=2, ensure_ascii=True))
    raise SystemExit(0)

if field_name not in summary:
    available = ", ".join(sorted(summary))
    raise SystemExit(f"Unknown field '{field_name}'. Available fields: {available}")

value = summary[field_name]
if value is None:
    raise SystemExit(f"Field '{field_name}' is not available for {artifact_dir}")
print(value)
PY
