# Dev Scripts Guide

This guide lists dev scripts from highest-level entry points down to the lowest-level helpers.

## Layer 1: Top-level wrappers (repo root)

Use these first for day-to-day work.

- `./start.sh`
  - Starts the full dev stack (Vite + backend) using worktree-aware ports.
  - Prefers worktree-derived ports and auto-selects the next free ports when collisions occur.
  - Defaults runtime paths to `SETTA_HOME=~/.setta-development` and `<worktree>/setta_files_dev`.
  - Accepts runtime path flags: `--profile`, `--setta-home`, `--setta-files-root`, `--setta-files-location`, `--runtime-root`.
  - Wrapper over `scripts/run-dev-instance.sh`.
- `./reset.sh`
  - Same as `start.sh` but first resolves and wipes the active Setta state root.
  - Accepts the same runtime path flags as `start.sh`.
- `./ai.sh`
  - Starts dev + Chrome DevTools MCP helpers (worktree-aware ports).
  - Prefers worktree-derived backend/frontend/CDP ports and auto-selects free ports when collisions occur.
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
  - Runs tests (Go suite + Python pytest + frontend Vitest + Playwright).
  - Flags: `--b` (Go + Python coverage only), `--f` (frontend + Playwright only), `--all` (enables opt-in live-provider integration tests).
  - Logs to `tests.log` at the repo root.
  - Live-provider integration tests (real OpenAI/Anthropic managed chat checks) are opt-in; use `--all` (or set `SETTA_RUN_EXTERNAL_AGENT_INTEGRATION_TESTS=1`) to enable.
- `./gcf.sh`
  - Runs `pnpm gcf` (generate + cleanup + Go/Python/frontend formatting) with env activation.
  - Logs to `gcf.log` at the repo root.
- `./gcft.sh`
  - Runs `pnpm gcft` (gcf + tests), with env activation.
  - Flags: `--all` (enables opt-in live-provider integration tests).
- `./format_code.sh`
  - Formats Python via Ruff (requires env activation; see notes below).
- `./build.sh`
  - Builds the production frontend, stages built assets, and packages the backend through the shared packaged-distribution helper.
- `./build_and_upload.sh`
  - Builds + uploads release artifacts.
- `./cleanup.sh`
  - Removes stale build artifacts before packaging/publishing.
- `./verify_install.sh`
  - Dedicated sdist-completeness smoke (runs the full `build.sh` path, then installs the built sdist via `uv pip`).
- `./install_built_setta.sh`
  - Builds Setta and installs the latest wheel into an isolated uv venv.
  - This is the wheel-based packaged-user install check, not the sdist smoke path.
  - Default install root: `.venv_for_built_setta` (override with `--install-root`).
- `source ./activate_built_setta.sh`
  - Activates the isolated built-install venv in the current shell.
  - Resets runtime defaults for built behavior (`SETTA_HOME=~/.setta`, local workspace `setta_files`).
- `./dev_install.sh`
  - One-stop default local setup (Go toolchain readiness + frozen frontend deps + frozen sidecars).
- `./dev_install_python.sh`
  - Opt-in setup for Python tooling with a frozen `uv` sync, then runs the default local dev install.
- `./update_dependencies.sh`
  - Explicit dependency refresh path for Python and pnpm lockfiles.
  - Runs `uv lock --upgrade` with the repo release-age policy, strips the transient `uv` cutoff metadata from `uv.lock`, syncs the Python env, refreshes both pnpm lockfiles, verifies their npm publish dates against the repo minimum age, then installs from them.
- `./init_env.sh`
  - Checks that `uv.lock` is current, then syncs the Python environment without rewriting the lockfile.
  - Uses `SETTA_PYTHON_VERSION` (default `3.13`) when running `uv sync --frozen` with explicit `source` and `dev` extras for repo workflows.
  - When `supply_chain_policy.env` is present, also verifies the locked Python artifacts are at least the configured age.
- `./audit_supply_chain.sh`
  - Runs `pip-audit`, `govulncheck`, Python/Go/pnpm release-age checks, and `pnpm audit` for both `frontend/` and the sidecar package.
  - Uses `supply_chain_policy.env` when present; defaults to a 7-day minimum release age otherwise.
  - This is the full visibility pass, not an instruction to upgrade everything it reports.
- `./configure_supply_chain.sh`
  - Updates the dependency release-age policy.
  - `--local-only` (default) updates `supply_chain_policy.env` plus the repo-local pnpm configs under `frontend/` and the sidecar package.
  - `--global` updates user-level `npm` and `pnpm` config instead.
  - `--days N` changes the minimum package age.

## Layer 2: Repo `scripts/` helpers

These are used by the top-level wrappers or for advanced workflows.

- `./scripts/run-dev-instance.sh`
  - Launches dev server with worktree-based preferred port offsets.
  - Automatically finds the next free backend/frontend ports if the preferred ports are already in use.
  - Modes: `start`, `startr`, `reset`.
  - Defaults runtime paths to `SETTA_HOME=~/.setta-development` and `<worktree>/setta_files_dev`.
  - Supports runtime identity flags: `--profile`, `--setta-home`, `--setta-files-root`, `--setta-files-location`, `--runtime-root`.
- `./scripts/reset-setta-state.sh`
  - Resolves the active Setta state root and deletes it.
  - Used by `reset`/`aireset` flows.
- `./scripts/run_backend_tests.sh`
  - Python pytest runner (invoked by `t.sh`).
- `./scripts/run_go_tests.sh`
  - Go test wrapper (invoked by `t.sh`).
  - Runs `./scripts/go.sh test ./... -count=1` and accepts extra `go test` args.
- `./scripts/run-playwright-e2e.sh`
  - Playwright E2E runner (invoked by `t.sh`).
  - Always uses disposable temp `SETTA_WORKSPACE_ROOT` + `SETTA_HOME` paths for isolation.
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
- `pnpm -C frontend generate-go-frontend-bindings`
  - Regenerates only the canonical frontend route/type/endpoint files.
- `pnpm -C frontend generate-go-python-types`
  - Regenerates the Go-owned Python SDK/shared types, then runs the generated-type prune pass.
- `pnpm gcf`
  - Generate + cleanup + Go/Python/frontend formatting (logs to `gcf.log` via `frontend/scripts/gcf.sh`).
- `pnpm gcft`
  - `pnpm gcf` + `./t.sh`.
  - To enable opt-in live-provider integration tests, prefer `./gcft.sh --all` (or set `SETTA_RUN_EXTERNAL_AGENT_INTEGRATION_TESTS=1` when running this directly).
- `pnpm full-cleanup`
  - Knip + Python prune step.
- `pnpm worktree` / `pnpm worktrees`
  - Wrapper over `./worktree.sh`.

## Layer 4: Lowest-level entry points

Useful when you need to debug a specific subsystem.

- `frontend/backendStart.sh`
  - Starts the backend process for source/dev runs (writes `backend.log` by default; override via `SETTA_BACKEND_LOG_FILE`).
- `frontend/generation/generate.sh`
  - Template/type generation (used by `pnpm generate`).
- `frontend/generation/generate_go_frontend_bindings.sh`
  - Direct frontend route/type/endpoint generation helper.
- `frontend/generation/generate_go_python_types.sh`
  - Direct Go-to-Python generation helper (SDK contracts + shared types + generated-type pruning).
- `frontend/scripts/gcf.sh`
  - Implements `pnpm gcf` + logging.
- `scripts/latest-chrome-recording.sh`
  - Resolves the newest Chrome repro recording bundle, its key logs/metadata, and bundled LLM artifact paths.

## Notes

- **Env activation**: the default `start.sh` / `reset.sh` / `ai.sh` loop does not require Python activation. Run `source activate.sh` before Python commands. The `gcf.sh` and `gcft.sh` wrappers already do this. `pnpm generate` still requires it when run directly; `pnpm -C frontend generate-go-frontend-bindings` does not.
- **Supply-chain policy**: `supply_chain_policy.env` is the repo-local minimum release age policy used by `init_env.sh`, `update_dependencies.sh`, and `audit_supply_chain.sh`. Current `uv` only supports an absolute `--exclude-newer` cutoff and persists that cutoff into `uv.lock`, so the repo uses `--exclude-newer` only during explicit lock refreshes and enforces the rolling age policy during installs/audits with `scripts/check_uv_lock_release_age.py`. Go does not expose a native install-time minimum-age setting, so Go age enforcement is audit-only. pnpm’s resolver setting is `minimum-release-age` in minutes; the repo also enforces checked-in pnpm lockfiles with `scripts/check_pnpm_lock_release_age.py` because config alone is not sufficient protection.
- **Audit remediation policy**:
  - Start with `./audit_supply_chain.sh`, then triage by severity instead of upgrading every reported package.
  - Default policy is to fix critical/high findings only unless the developer explicitly asks for broader cleanup.
  - Prefer minimal official-upstream upgrades. Use narrow `pnpm.overrides` for Node transitives when needed, but do not adopt obscure forks or republished packages just to make the audit green.
  - Python severity should be confirmed from OSV/GHSA metadata because `pip-audit` table output does not include severity.
  - Go remediation should focus on code-reachable `govulncheck` findings.
  - Recheck the 7-day minimum release age before keeping any dependency upgrade.
- **Repo-root logs**: `backend.log`, `chrome_mcp_backend.log`, `tests.log`, `gcf.log` (and sometimes `frontend.log`, depending on runner env).
- **Playwright E2E logs**: `scripts/run-playwright-e2e.sh` writes `backend.log` and `frontend.log` under its `LOG_DIR` (defaults under `/tmp`; override via `SETTA_E2E_LOG_DIR`).
- **Reset**: `reset.sh` and `pnpm reset` delete the resolved active Setta state root (including backups under that root).
