# Dev Scripts Guide

This guide lists dev scripts from highest-level entry points down to the lowest-level helpers.

## Layer 1: Top-level wrappers (repo root)

Use these first for day-to-day work.

- `./start.sh`
  - Starts the full dev stack (Vite + backend) using worktree-aware ports.
  - Wrapper over `scripts/run-dev-instance.sh`.
- `./reset.sh`
  - Same as `start.sh` but runs the frontend reset flow (wipes `setta_files`).
- `./ai.sh`
  - Starts dev + Chrome DevTools MCP helpers (worktree-aware ports).
  - Wrapper over `scripts/ai.sh`.
- `./aireset.sh`
  - Wipes `setta_files` then runs `./ai.sh`.
- `./kill.sh`
  - Stops dev processes + browser MCP helpers.
  - Wrapper over `scripts/kill-setta.sh`.
- `./worktree.sh`
  - Worktree creation + setup.
  - If you create a single worktree, enters it (starts a new shell there).
  - If you create multiple worktrees, stays in the current folder (equivalent to `--stay`).
- `./t.sh`
  - Runs tests (backend pytest + frontend Vitest + Playwright).
  - Flags: `--b` (backend-only), `--f` (frontend + Playwright only), `--all` (enables opt-in external agent integration tests).
  - Logs to `tests.log` at the repo root.
  - External agent integration tests (Claude/Codex/OpenCode) are opt-in; use `--all` (or set `SETTA_RUN_EXTERNAL_AGENT_INTEGRATION_TESTS=1`) to enable.
- `./gcf.sh`
  - Runs `pnpm gcf` (generate + cleanup + format) with env activation.
  - Logs to `gcf.log` at the repo root.
- `./gcft.sh`
  - Runs `pnpm gcft` (gcf + tests), with env activation.
  - Flags: `--all` (enables opt-in external agent integration tests).
- `./format_code.sh`
  - Formats Python via Ruff (requires env activation; see notes below).
- `./build.sh`
  - Builds the production frontend and bundles the backend wheel.
- `./build_and_upload.sh`
  - Builds + uploads release artifacts.
- `./cleanup.sh`
  - Removes stale build artifacts before packaging/publishing.
- `./verify_install.sh`
  - Release smoke test (builds + installs sdist via `uv pip`).
- `./dev_install.sh`
  - One-stop local setup (uv sync + frontend deps + sidecars).
- `./init_env.sh`
  - Creates/updates the Python environment.

## Layer 2: Repo `scripts/` helpers

These are used by the top-level wrappers or for advanced workflows.

- `./scripts/run-dev-instance.sh`
  - Launches dev server with worktree-based port offsets.
  - Modes: `start`, `startr`, `reset`.
- `./scripts/run_backend_tests.sh`
  - Backend pytest runner (invoked by `t.sh`).
- `./scripts/run-playwright-e2e.sh`
  - Playwright E2E runner (invoked by `t.sh`).
- `./scripts/cdp-port.sh`
  - Prints the Chrome DevTools Protocol port for the worktree.
  - Falls back to scanning running Chrome commands for this worktree profile when the MCP pid file is missing (for example when `TMPDIR` differs between shells).
- `./scripts/kill-setta.sh`
  - Stops dev processes.
- `./scripts/ai.sh`
  - Dev runs with browser MCP helpers (see `docs/guides/browser-mcp-quickstart.md`).
- `./scripts/start-browser-mcp.sh`, `./scripts/stop-browser-mcp.sh`, `./scripts/chrome-devtools-mcp.sh`
  - Browser MCP utilities.
  - `chrome-devtools-mcp.sh` pins a known-good MCP version and redirects startup stderr to `${TMPDIR:-/tmp}/setta-mcp-logs/`.
- `./scripts/bootstrap-url.sh`
  - Prints a bootstrap URL for a running session.

## Layer 3: Frontend `pnpm` scripts (from `frontend/`)

These are the underlying tasks used by the wrappers above.

- `pnpm start` / `pnpm startr`
  - Vite + backend (reload for backend on `startr`).
- `pnpm reset`
  - Wipes `setta_files` then starts dev server.
- `pnpm test`
  - Vitest (watchable).
- `pnpm generate`
  - Regenerates templates/types from `frontend/generation/`.
- `pnpm gcf`
  - Generate + cleanup + format (logs to `gcf.log` via `frontend/scripts/gcf.sh`).
- `pnpm gcft`
  - `pnpm gcf` + `./t.sh`.
  - To enable opt-in external agent integration tests, prefer `./gcft.sh --all` (or set `SETTA_RUN_EXTERNAL_AGENT_INTEGRATION_TESTS=1` when running this directly).
- `pnpm full-cleanup`
  - Knip + Python prune step.
- `pnpm worktree` / `pnpm worktrees`
  - Wrapper over `./worktree.sh`.

## Layer 4: Lowest-level entry points

Useful when you need to debug a specific subsystem.

- `frontend/backendStart.sh`
  - Starts the backend process (writes `backend.log` by default; override via `SETTA_BACKEND_LOG_FILE`).
- `frontend/generation/generate.sh`
  - Template/type generation (used by `pnpm generate`).
- `frontend/scripts/gcf.sh`
  - Implements `pnpm gcf` + logging.

## Notes

- **Env activation**: run `source activate.sh` before Python commands. The `gcf.sh` and `gcft.sh` wrappers already do this. `pnpm generate` still requires it when run directly.
- **Repo-root logs**: `backend.log`, `chrome_mcp_backend.log`, `tests.log`, `gcf.log` (and sometimes `frontend.log`, depending on runner env).
- **Playwright E2E logs**: `scripts/run-playwright-e2e.sh` writes `backend.log` and `frontend.log` under its `LOG_DIR` (defaults under `/tmp`; override via `SETTA_E2E_LOG_DIR`).
- **Reset**: `reset.sh` and `pnpm reset` wipe `setta_files` (including local backups under `setta_files/backups/`).
