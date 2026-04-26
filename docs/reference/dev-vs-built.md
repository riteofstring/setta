# Dev vs Built Setup

This repo has two different runtime shapes: dev (split frontend/backend) and built (single origin).

## Dev (Vite + Backend)
- Frontend: Vite on `http://127.0.0.1:3000` (`pnpm start`).
- Backend: Setta on `http://127.0.0.1:8000` (`frontend/backendStart.sh`),
  launched from the source checkout through `./scripts/go.sh run ./cmd/setta`.
- UI assets come from Vite; the backend does **not** serve static files in dev.
- In dev mode, requests from the local Vite origin auto-mint an auth cookie so
  the frontend can connect without manual bootstrapping.
- The bootstrap page (`/__setta__/bootstrap`) is still available for manual
  auth or non-local clients.
- CORS is enabled with credentials so the frontend can send cookies.
- Workspace vs `setta_files`:
  `--workspace` (or `SETTA_WORKSPACE_ROOT`) controls code operations.
  `setta_files` is either local (`<workspace>/setta_files`) or global (under
  `<globalSettaFilesBase>/<workspace-name>-<hash>`, defaulting to
  `<setta_home>/setta_files/<workspace-name>-<hash>`). Local always wins when it
  exists unless you use an explicit `setta_files_root`.
  Control selection via `--setta-files-root`, `--setta-files-location`,
  `--profile`, and matching env vars (`SETTA_FILES_ROOT`,
  `SETTA_FILES_LOCATION`, `SETTA_PROFILE`) plus `<setta_home>/config.json`
  (see `docs/reference/setta-files.md`).

## Built (Single Origin)
- `./build.sh` builds the frontend and copies it to `backend/setta/static/frontend`.
- `./build.sh` also stages packaged Go binaries under `backend/setta/go_bin`
  before building the Python distribution.
- In non-dev mode, the backend serves the static bundle and the SPA at the same origin (no Vite).
- Installed `setta` and `python -m setta` enter through the Python package
  entrypoint, which dispatches into the packaged Go binaries.
- The source SDK modules remain part of the repo/sdist source boundary, not the
  slim wheel-based packaged-user install path.
- Auth bootstrap still happens on the backend, but redirects to `/` (same origin).

## Scripts and When to Use Them
- `dev_install.sh`: install the default local dev deps with frozen lockfiles
  (sync the repo Python environment with the `defaults`, `source`, and `dev`
  extras, ensure the pinned Go toolchain and repo-local `gopls` are available,
  then install frontend deps, sidecars, and clean build artifacts).
- `update_dependencies.sh`: explicitly refresh the Python and pnpm lockfiles, then sync/install against the refreshed lock state.
- `build.sh`: build the frontend bundle, stage built assets, build packaged Go binaries, then package the wheel through `./scripts/build_python_distribution_with_go_binaries.sh`.
- `verify_install.sh`: dedicated sdist-completeness smoke (runs the full `./build.sh` path, installs the resulting sdist into the venv with `uv pip`, then cleans).
  - Use this when you want to catch missing packaged-source files or other sdist-only packaging regressions.
  - This is not the normal packaged-user install path.
- Built install flows use the packaged default dependency boundary, not the repo-local `defaults` / `source` / `dev` extras.
- `install_built_setta.sh`: build + install the latest wheel into an isolated venv (`.venv_for_built_setta` by default).
  - Use this when you want to validate the wheel-based packaged-user install path.
- `activate_built_setta.sh`: source-only helper to activate the isolated built venv and switch defaults to built runtime paths.

## Quick Checks
- Dev: `pnpm start` (Vite on 3000, backend on 8000).
- Source-checkout backend smoke: `./scripts/go.sh run ./cmd/setta --no-open`.
- Built/package smoke: `./verify_install.sh`.
- Built (isolated venv): `./install_built_setta.sh`, then `source ./activate_built_setta.sh`, then `setta`.
