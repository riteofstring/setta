# Dev vs Built Setup

This repo has two different runtime shapes: dev (split frontend/backend) and built (single origin).

## Dev (Vite + Backend)
- Frontend: Vite on `http://127.0.0.1:3000` (`pnpm start`).
- Backend: Setta on `http://127.0.0.1:8000` (`frontend/backendStart.sh`).
- UI assets come from Vite; the backend does **not** serve static files in dev.
- In dev mode, requests from the local Vite origin auto-mint an auth cookie so
  the frontend can connect without manual bootstrapping.
- The bootstrap page (`/__setta__/bootstrap`) is still available for manual
  auth or non-local clients.
- CORS is enabled with credentials so the frontend can send cookies.
- Workspace vs state roots:
  `--workspace` (or `SETTA_WORKSPACE_ROOT`) controls code operations, while
  `--files-root` / `--files-root-base` (or env equivalents) control where
  `setta_files` lives. Defaults still follow the current working directory.

## Built (Single Origin)
- `./build.sh` builds the frontend and copies it to `backend/setta/static/frontend`.
- In non-dev mode, the backend serves the static bundle and the SPA at the same origin (no Vite).
- Auth bootstrap still happens on the backend, but redirects to `/` (same origin).

## Scripts and When to Use Them
- `dev_install.sh`: install deps for local dev (Python + pnpm), then clean build artifacts.
- `build.sh`: build the frontend bundle and package the backend (`python -m build`).
- `verify_install.sh`: packaging smoke test (builds, installs the sdist into the venv with `uv pip`, then cleans).
  - Use this when you want to validate the distribution packaging, not for normal dev.
  - sdist installs catch missing files/packaging errors; wheel installs match end-user installs but can skip sdist-only issues.

## Quick Checks
- Dev: `pnpm start` (Vite on 3000, backend on 8000).
- Built: `./build.sh`, then `source activate.sh && setta` to run the single-origin build.
