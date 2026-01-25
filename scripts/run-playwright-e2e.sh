#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_ROOT=$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "${ROOT_DIR}")

instance_offset() {
  local instance_name="$1"
  local segment="${instance_name}"

  case "${segment}" in
    setta.*)
      segment="${segment#setta.}"
      ;;
  esac
  case "${segment}" in
    *-*)
      segment="${segment##*-}"
      ;;
  esac
  case "${segment}" in
    *_*)
      segment="${segment##*_}"
      ;;
  esac
  case "${segment}" in
    *.*)
      segment="${segment##*.}"
      ;;
  esac

  local offset="${segment##*[!0-9]}"
  if [ -z "${offset}" ] && [ "${#segment}" -eq 1 ]; then
    case "${segment}" in
      [a-z])
        offset=$(( $(printf '%d' "'${segment}") - 97 ))
        ;;
      [A-Z])
        offset=$(( $(printf '%d' "'${segment}") - 65 ))
        ;;
    esac
  fi
  if [ -z "${offset}" ] && [ -n "${segment}" ]; then
    if command -v cksum >/dev/null 2>&1; then
      CKSUM_OUTPUT=$(printf "%s" "${segment}" | cksum)
      CKSUM_VALUE=${CKSUM_OUTPUT%% *}
      if [ -n "${CKSUM_VALUE}" ]; then
        offset=$(( CKSUM_VALUE % 100 ))
      fi
    fi
  fi
  echo "${offset:-0}"
}

INSTANCE_NAME=$(basename "${WORKTREE_ROOT}")
INSTANCE_OFFSET="$(instance_offset "${INSTANCE_NAME}")"
DEFAULT_BACKEND_PORT=$((8000 + INSTANCE_OFFSET))
DEFAULT_FRONTEND_PORT=$((3000 + INSTANCE_OFFSET))

SETTA_HOST="${SETTA_HOST:-127.0.0.1}"
SETTA_PORT="${SETTA_PORT:-${DEFAULT_BACKEND_PORT}}"
SETTA_DEV_FRONTEND_PORT="${SETTA_DEV_FRONTEND_PORT:-${DEFAULT_FRONTEND_PORT}}"
PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://${SETTA_HOST}:${SETTA_DEV_FRONTEND_PORT}}"
SETTA_BACKEND_ORIGIN="${SETTA_BACKEND_ORIGIN:-http://${SETTA_HOST}:${SETTA_PORT}}"

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
pnpm exec playwright test --reporter=line "$@"
