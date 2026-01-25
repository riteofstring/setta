# Git Worktree Isolation Plan

This plan outlines what we need so two git worktrees can run fully isolated
Setta instances side-by-side (dev or built) without port, CORS, or auth
collisions.

## Goals
- Run two Setta instances concurrently from separate git worktrees.
- Keep runtime state isolated per worktree (`setta_files/`, sessions, logs).
- Avoid port collisions for both backend + Vite frontend.
- Prevent auth cookie clashes so both instances can stay open in the same browser.

## Current Constraints
- `setta_files/` is relative to `cwd` (`backend/setta/utils/constants.py`), so it is
  isolated as long as each worktree is started from its own root.
- `frontend/backendStart.sh` pins the backend to port `8000` unless `--port` is
  passed.
- Vite dev server is pinned to `3000` via `frontend/vite.config.ts`.
- Frontend dev backend origin is fixed to `http://127.0.0.1:8000` in
  `frontend/src/utils/c_addresses.ts`.
- Backend CORS origins in dev mode assume the frontend runs on the same host +
  `C.DEV_MODE_FRONTEND_PORT` (defaults to 3000).
- Auth cookie name is always `setta_auth`, which collides across ports on the
  same host.

## Plan

### 1) Worktree setup (no code changes)
- Create two worktrees (ex: `git worktree add ../setta-a <branch>` and
  `git worktree add ../setta-b <branch>`).
- Run `./init_env.sh` + `./dev_install.sh` in each worktree to create isolated
  `.venv/` and `frontend/node_modules/`.
- Keep `setta_files/` per worktree; do not symlink it.
- If needed, keep separate `.env` files (LLM keys, etc.) per worktree root.

### 2) Make dev ports + hosts configurable (code changes)
Goal: allow a per-instance backend port/host + Vite port/host without editing
generated files.

Backend startup (dev):
- Update `frontend/backendStart.sh` to honor:
  - `SETTA_HOST` (maps to `setta --host`, default `127.0.0.1`)
  - `SETTA_PORT` (maps to `setta --port`, default `8000`)
  - `SETTA_DEV_FRONTEND_PORT` (used for backend CORS)

Backend CORS:
- Update `backend/setta/utils/constants.py` so `C.FRONTEND_ORIGINS` uses
  `SETTA_DEV_FRONTEND_PORT` when `SETTA_DEV_MODE` is set. This keeps CORS in
  sync when Vite runs on a non-3000 port.

Vite dev server:
- Update `frontend/vite.config.ts` to prefer env overrides, for example:
  - `process.env.SETTA_DEV_FRONTEND_PORT` for `server.port`
  - `process.env.SETTA_HOST` (or `process.env.SETTA_DEV_FRONTEND_HOST`) for
    `server.host`
  - Fallback to `C.DEV_MODE_FRONTEND_PORT` + `C.DEFAULT_HOST` when unset.

Frontend backend origin:
- Update `frontend/src/utils/c_addresses.ts` to prefer
  `import.meta.env.VITE_BACKEND_ORIGIN` (and optionally
  `import.meta.env.VITE_BACKEND_WS_ORIGIN`) in dev mode.
- Fallback to the current `C.DEFAULT_HOST`/`C.DEFAULT_PORT` behavior when env
  overrides are absent.

### 3) Cookie isolation
Auth cookies are host-scoped (not port-scoped), so two instances on the same
host collide by default.

Two options:
- Operational (no code): run each instance with a different host
  (`127.0.0.1` vs `localhost`) and open them in separate browser profiles.
- Code change (preferred for same-browser use): add
  `SETTA_AUTH_COOKIE_NAME` support in `backend/setta/utils/constants.py` so each
  instance can mint a unique cookie name. This keeps the same browser safe.

### 4) Optional helper script
Create a wrapper script (ex: `scripts/run-dev-instance.sh`) that takes an
instance name and exports a consistent set of env vars:
- `SETTA_HOST`
- `SETTA_PORT`
- `SETTA_DEV_FRONTEND_PORT`
- `VITE_BACKEND_ORIGIN`
- `SETTA_AUTH_COOKIE_NAME`
Then it can call `pnpm start` (or `pnpm startr`) to run both servers.

### 5) Validation checklist
- Start both worktrees; confirm `setta status` in each shows only local sessions.
- Open both UIs and verify CORS + websocket connections succeed.
- Ensure tokens/cookies do not bounce between instances.
- Confirm `setta_files/run/` and `setta_files/llm_config.json` are unique per
  worktree.

## Built-Mode Variant
If you want isolation without Vite:
- Run `./build.sh` inside each worktree.
- Start each backend with unique ports:
  `source activate.sh && setta --host 127.0.0.1 --port 8000` (worktree A),
  `source activate.sh && setta --host localhost --port 8100` (worktree B).
- Still apply cookie isolation if both are open in the same browser.

## Example Dev Commands (target state)
Worktree A:
```sh
cd ../setta-a/frontend
SETTA_HOST=127.0.0.1 \
SETTA_PORT=8000 \
SETTA_DEV_FRONTEND_PORT=3000 \
VITE_BACKEND_ORIGIN=http://127.0.0.1:8000 \
SETTA_AUTH_COOKIE_NAME=setta_auth_a \
pnpm start
```

Worktree B:
```sh
cd ../setta-b/frontend
SETTA_HOST=localhost \
SETTA_PORT=8100 \
SETTA_DEV_FRONTEND_PORT=3100 \
VITE_BACKEND_ORIGIN=http://localhost:8100 \
SETTA_AUTH_COOKIE_NAME=setta_auth_b \
pnpm start
```

## Open Questions
- Which env var names do we want to standardize (`SETTA_DEV_FRONTEND_PORT` vs
  `VITE_DEV_SERVER_PORT`)?
- Do we want a committed helper script, or keep this as a manual workflow?
- Should we add a small doc entry in `docs/dev-vs-built.md` once the behavior
  exists?
