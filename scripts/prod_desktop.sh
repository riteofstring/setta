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

# Production build + run the optimized bundle (electron-vite preview), so
# pan/zoom and other performance is measured on the real app, not the dev server
# (which is unminified, source-mapped, and HMR-laden, and can fabricate stalls
# that do not exist in production). dev_desktop.sh runs `pnpm dev`; this is its
# production counterpart.
echo "Building production bundle..."
pnpm -C "${ROOT_DIR}/desktop" build
echo "Launching production build (electron-vite preview)..."
exec pnpm -C "${ROOT_DIR}/desktop" exec electron-vite preview
