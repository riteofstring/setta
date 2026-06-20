#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required to start the desktop app." >&2
  exit 1
fi

if [[ ! -d "${ROOT_DIR}/desktop/node_modules" ]]; then
  echo "Desktop dependencies are not installed. Run ./update_dependencies.sh first." >&2
  exit 1
fi

"${ROOT_DIR}/scripts/go.sh" version >/dev/null

exec pnpm -C "${ROOT_DIR}/desktop" dev
