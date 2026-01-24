#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:3000}"
SETTA_BACKEND_ORIGIN="${SETTA_BACKEND_ORIGIN:-http://127.0.0.1:8000}"

if [[ -z "${PLAYWRIGHT_HOST_PLATFORM_OVERRIDE:-}" ]]; then
  if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
    export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="mac-arm64"
  fi
fi

BOOTSTRAP_TOKEN="$(
  source "${ROOT_DIR}/activate.sh"
  python - <<'PY'
import json
from datetime import datetime
from pathlib import Path
from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER

sessions_root = Path("setta_files/run/sessions")
candidates = []
for session_dir in sessions_root.iterdir():
    session_path = session_dir / "session.json"
    if not session_path.exists():
        continue
    data = json.loads(session_path.read_text())
    started_at = data.get("startedAt")
    if not started_at:
        continue
    candidates.append((datetime.fromisoformat(started_at.replace("Z", "+00:00")), data))

if not candidates:
    raise SystemExit("No sessions found under setta_files/run/sessions. Start the backend first.")

candidates.sort(key=lambda item: item[0], reverse=True)
latest = candidates[0][1]
secret = Path(latest["secretPath"]).read_bytes()
print(BOOTSTRAP_TOKEN_MANAGER.mint(latest["id"], secret))
PY
)"

cd "${ROOT_DIR}/frontend"
PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL}" \
SETTA_BACKEND_ORIGIN="${SETTA_BACKEND_ORIGIN}" \
SETTA_BOOTSTRAP_TOKEN="${BOOTSTRAP_TOKEN}" \
pnpm exec playwright test --timeout=60000 --reporter=line "$@"
