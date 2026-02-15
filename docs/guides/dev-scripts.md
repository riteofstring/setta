# Dev Scripts Guide

This guide lists dev scripts from highest-level entry points down to the lowest-level helpers.

## Layer 1: Top-level wrappers (repo root)

Use these first for day-to-day work.

- `./start.sh`
  - Starts the full dev stack (Vite + backend) using worktree-aware ports.
  - Defaults runtime paths to `SETTA_HOME=~/.setta-development` and `<worktree>/setta_files_dev`.
  - Accepts runtime path flags: `--profile`, `--setta-home`, `--setta-files-root`, `--setta-files-location`, `--runtime-root`.
  - Wrapper over `scripts/run-dev-instance.sh`.
- `./reset.sh`
  - Same as `start.sh` but first resolves and wipes the active Setta state root.
  - Accepts the same runtime path flags as `start.sh`.
- `./ai.sh`
  - Starts dev + Chrome DevTools MCP helpers (worktree-aware ports).
  - Uses the same default dev paths as `start.sh`.
  - Accepts the same runtime path flags as `start.sh`.
  - Wrapper over `scripts/ai.sh`.
- `./aireset.sh`
  - Wipes the resolved active state root, then runs `./ai.sh`.
  - Uses the same default dev paths as `start.sh`.
  - Accepts the same runtime path flags as `start.sh` (except `--force` / `--yes`).
- `./kill.sh`
  - Stops dev processes + browser MCP helpers.
  - Wrapper over `scripts/kill-setta.sh`.
- `./worktree.sh`
  - Worktree creation + setup.
  - Default mode creates a new branch per worktree (`git worktree add -b`).
  - Use `--existing` to create worktrees from already-existing local branches.
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
- `./install_built_setta.sh`
  - Builds Setta and installs the latest wheel into an isolated uv venv.
  - Default install root: `.venv_for_built_setta` (override with `--install-root`).
- `source ./activate_built_setta.sh`
  - Activates the isolated built-install venv in the current shell.
  - Resets runtime defaults for built behavior (`SETTA_HOME=~/.setta`, local workspace `setta_files`).
- `./dev_install.sh`
  - One-stop local setup (uv sync + frontend deps + sidecars).
- `./init_env.sh`
  - Creates/updates the Python environment.

## Layer 2: Repo `scripts/` helpers

These are used by the top-level wrappers or for advanced workflows.

- `./scripts/run-dev-instance.sh`
  - Launches dev server with worktree-based port offsets.
  - Modes: `start`, `startr`, `reset`.
  - Defaults runtime paths to `SETTA_HOME=~/.setta-development` and `<worktree>/setta_files_dev`.
  - Supports runtime identity flags: `--profile`, `--setta-home`, `--setta-files-root`, `--setta-files-location`, `--runtime-root`.
- `./scripts/reset-setta-state.sh`
  - Resolves the active Setta state root and deletes it.
  - Used by `reset`/`aireset` flows.
- `./scripts/run_backend_tests.sh`
  - Backend pytest runner (invoked by `t.sh`).
- `./scripts/run-playwright-e2e.sh`
  - Playwright E2E runner (invoked by `t.sh`).
- `./scripts/plugin-fixtures/build.sh`
  - Builds fixture frontend assets under `tests/fixtures/plugins/**/frontend/dist`.
  - Used by fixture link/smoke flows and test runners.
- `./scripts/plugin-fixtures/cache.sh`
  - Shared cache/signature helpers used by backend test and Playwright runners.
  - Skips fixture rebuild/copy when fixture inputs are unchanged.
- `./scripts/plugin-fixtures/link.sh`, `./scripts/plugin-fixtures/reset.sh`, `./scripts/plugin-fixtures/smoke.sh`
  - Fixture plugin helpers for manual plugin verification.
  - See `docs/guides/plugin-fixture-manual-smoke.md`.
- `./scripts/cdp-port.sh`
  - Prints the Chrome DevTools Protocol port for the worktree.
  - Falls back to scanning running Chrome commands for this worktree profile when the MCP pid file is missing (for example when `TMPDIR` differs between shells).
- `./scripts/kill-setta.sh`
  - Stops dev processes.
- `./scripts/ai.sh`
  - Dev runs with browser MCP helpers (see `docs/guides/browser-mcp-quickstart.md`).
  - Defaults runtime paths to `SETTA_HOME=~/.setta-development` and `<worktree>/setta_files_dev`.
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
  - Resolves + wipes the active Setta state root, then starts dev server.
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
- **Reset**: `reset.sh` and `pnpm reset` delete the resolved active Setta state root (including backups under that root).
