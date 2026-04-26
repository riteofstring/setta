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
  - Safe for Codex to start directly when temporary CDP/browser verification is needed.
  - If Codex starts it for temporary verification, cleanup should stop the `./ai.sh` session, not just browser MCP. Use `./kill.sh` as the repo-scoped fallback.
  - Wrapper over `scripts/ai.sh`.
- `./aireset.sh`
  - Wipes the resolved active state root, then runs `./ai.sh`.
  - Uses the same default dev paths as `start.sh`.
  - Accepts the same runtime path flags as `start.sh` (except `--force` / `--yes`).
  - Prefer only when Codex needs a clean reset before browser verification.
  - Cleanup has the same requirement as `./ai.sh`: stop the session, not only the browser MCP helper.
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
  - Prints phase start/finish lines plus a 10-second heartbeat during long quiet steps. Override the heartbeat with `GCF_PROGRESS_INTERVAL_SECONDS=<seconds>`.
- `./gcft.sh`
  - Runs `pnpm gcft` (gcf + tests), with env activation.
  - Flags: `--all` (enables opt-in live-provider integration tests).
- `./format_code.sh`
  - Formats Python via Ruff (requires env activation; see notes below).
- `./check_quality.sh`
  - Runs maintainability-oriented quality checks with an emphasis on cyclomatic complexity.
  - Defaults to the current git changes relative to `HEAD` plus untracked files so it works before staging or committing.
  - Use `--staged` when you intentionally want to verify only the staged set.
  - Python: `ruff check` plus `C901` complexity checks, failing at complexity `>= 10`.
  - Frontend: existing ESLint rules plus extra complexity/depth/parameter guards on selected files, failing at complexity `>= 10` (`max-depth` `4`, `max-params` `5` still apply separately).
  - Go: `go vet` on changed packages plus pinned `gocyclo` checks on changed files, failing at complexity `>= 12`.
  - Supports `--all`, `--git-changes`, `--staged`, `--files <path>...`, and per-language `--*-max` thresholds.
- `./check_types.sh`
  - Runs full-repo type checks across Go, Python, and frontend TypeScript.
  - Go: compile-only `go test -run '^$' -count=1 ./...` through the pinned repo Go toolchain.
  - Python: `ty check` across all tracked repo Python files after env activation.
  - Frontend: `pnpm -C frontend typecheck` (`tsc --noEmit`).
  - Supports `--go`, `--python`, and `--frontend` to limit the run to selected language groups.
- `./report_quality_hotspots.sh`
  - Reports the highest-complexity code hotspots across the repo, grouped by Go, Python, and frontend.
  - Defaults to the top `20` hotspots per language section and uses the same default threshold floor as `./check_quality.sh`: Python `10`, frontend `10`, Go `12`.
  - Supports `--top`, `--python-min`, `--frontend-min`, and `--go-min` to narrow the report.
  - Intended for cleanup planning and hotspot discovery, not commit gating.
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
  - One-stop default local setup (frozen Python env with the `defaults`, `source`, and `dev` extras; Go toolchain readiness; pinned repo-local `gopls`; frozen frontend deps; frozen sidecars).
- `./update_dependencies.sh`
  - Explicit dependency refresh path for Python and pnpm lockfiles.
  - Runs `uv lock --upgrade` with the repo release-age policy, strips the transient `uv` cutoff metadata from `uv.lock`, syncs the Python env, refreshes both pnpm lockfiles, verifies their npm publish dates against the repo minimum age, then installs from them.
- `./init_env.sh`
  - Checks that `uv.lock` is current, then syncs the Python environment without rewriting the lockfile.
  - Uses `SETTA_PYTHON_VERSION` (default `3.13`) when running `uv sync --frozen` with explicit `defaults`, `source`, and `dev` extras for repo workflows.
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
  - Requires `./dev_install.sh` first and fails fast instead of auto-installing missing deps.
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
  - Sources `./activate.sh` internally, so it can be run directly from the repo root as long as the repo `.venv` exists.
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
  - Requires `./dev_install.sh` first and fails fast instead of auto-installing missing deps.
  - On exit it stops browser MCP helpers automatically and kills the owned dev process.
  - If you start browser MCP separately, use `./scripts/stop-browser-mcp.sh --devtools` for cleanup.
- `./scripts/start-browser-mcp.sh`, `./scripts/stop-browser-mcp.sh`, `./scripts/chrome-devtools-mcp.sh`
  - Browser MCP utilities.
  - `chrome-devtools-mcp.sh` pins a known-good MCP version and redirects startup stderr to `${TMPDIR:-/tmp}/setta-mcp-logs/`.
- `./scripts/bootstrap-url.sh`
  - Prints a bootstrap URL for a running session.
- `./scripts/run-codex-loop.sh`
  - Lowest-level `codex exec` loop helper used by the specialized wrappers below.
  - Accepts prompt/follow-up prompt files, pre/post iteration hooks, iteration counts, session rotation, inactivity watchdogs, retry behavior, and yolo mode.
- `./scripts/run-codex-branch-review-loop.sh`
  - Generic branch-review loop for having Codex review the current branch, consolidate findings, implement fixes, simplify the iteration diff, and commit the result.
  - Pass extra branch-specific instructions with `--extra-prompt` or `--extra-prompt-file`.
  - Defaults to `gpt-5.5`, `xhigh`, yolo mode, and a 30-minute transcript inactivity watchdog.
- `./scripts/run-codex-plan-loop.sh`
  - Generic plan-driven Codex loop for executing a repository plan document until a caller-provided completion sentinel appears.
  - Use this for focused long-running feature work.
  - Requires `--plan`, `--sentinel`, and `--name`.
- `./scripts/run-codex-test-fix-loop.sh`
  - Codex loop for working through Go, Python, Vitest, and Playwright test failures in small chunks.
  - Stops only after external full-suite verification passes.
- `./scripts/run-codex-authority-cleanup-loop.sh`
  - Specialized Codex loop for Go-as-source-of-truth cleanup work.
  - Starts a fresh Codex session every iteration, defaults to yolo mode, and stops only after Codex emits an explicit clean-stop sentinel.
  - Enforces that every non-stop iteration leaves a clean worktree and advances `HEAD`, so the loop fails fast if Codex forgets to commit after running `./gcf.sh`.
- `./scripts/run-codex-authority-sequenced-loop.sh`
  - Specialized Codex loop that works in three strict phases: remove unjustified Go/Python/TypeScript duplication, then replace unjustified polling with websocket pushes, then run `./report_quality_hotspots.sh` and fix actionable hotspots.
  - Defaults to `gpt-5.5`, `xhigh`, and yolo mode.
  - Phase 3 runs `./report_quality_hotspots.sh` with the same threshold floor as `./check_quality.sh`: Python `10`, frontend `10`, Go `12`.
  - Seeds a phase checklist plus persistent duplication/polling/hotspot audit notes, requires `./gcf.sh` and `./check_quality.sh` before every non-stop commit, and forces Phase 3 to escalate from contained hotspot slices into broader same-file backlog-burn refactors before it is allowed to stop on plateau.
  - Runs with a 30-minute transcript inactivity watchdog by default and retries cleanly after a timed-out iteration instead of hanging forever.
  - Tells Codex to avoid browser/CDP workflows unless a frontend runtime change genuinely requires an agent-started or developer-started browser session.
- `./scripts/run-codex-deadcode-authority-loop.sh`
  - Specialized Codex loop for auditing and removing confirmed dead code, useless pass-through constant aliases, and unjustified duplicated logic while keeping Go authoritative.
  - Requires each non-stop iteration to leave a clean worktree and either advance `HEAD` or advance the phase checklist.
- `./scripts/run-codex-severe-typecheck-loop.sh`
  - Specialized Codex loop for fixing only actionable runtime bugs that are surfaced by type errors instead of broad repo type backlog cleanup.
  - Starts a fresh Codex session every iteration, seeds a single-phase runtime-bug checklist plus audit, and uses saved `./check_types.sh --frontend` and `./check_types.sh --python` outputs to build a filtered `runtime-break-shortlist.md` rather than handing Codex the full raw checker dump.
  - The shortlist is tiered, and the loop is told to stay on `Tier 1` until it is fixed or explicitly disproven in the audit.
  - Forces Codex to record concrete production evidence plus a one-sentence supported-flow runtime failure before editing code, and deprioritizes `tsc`-only import/export churn, helper-generic noise, request-nullability cleanup, and test-only typing unless they are proven to break a supported flow after a successful build.
  - Requires `./gcf.sh` and `./check_quality.sh` before every non-stop commit, reruns the relevant language type checks for touched code, and stops once a fresh audit finds no remaining actionable runtime bugs under the loop rubric.
- `./scripts/run-codex-frontendbindings-rebuild-loop.sh`
  - Specialized Codex loop for rebuilding `internal/frontendbindings` from scratch to match the main-branch two-converter shape.
  - Starts a fresh Codex session every iteration, seeds a rebuild checklist, requires `./gcf.sh` and `./check_quality.sh` before commit, and forbids compatibility-shim work like handwritten endpoint inventories, mirrored contract ownership, and `map[string]any` default payload tables.
- `./scripts/run-codex-frontendbindings-openapi-loop.sh`
  - Specialized Codex loop for replacing the bespoke HTTP half of `internal/frontendbindings` with an OpenAPI-based pipeline.
  - Defaults to `gpt-5.5`, `xhigh`, and yolo mode.
  - Seeds an HTTP/OpenAPI migration checklist, requires `./gcf.sh` and `./check_quality.sh` before commit, and forbids keeping AST-based HTTP endpoint discovery, handwritten endpoint inventories, compatibility-name shims, or custom per-endpoint wrappers around the generated OpenAPI client.
- `./scripts/run-codex-shared-type-generation-loop.sh`
  - Specialized Codex loop for migrating the remaining non-HTTP Go-owned TS/Python shared model generation onto a schema + semantic-sidecar path.
  - Defaults to `gpt-5.5`, `xhigh`, and yolo mode.
  - Seeds a schema-migration checklist, requires `./gcf.sh` and `./check_quality.sh` before commit, forbids tautological metadata tests and inventory shuffles, and stops after sustained plateau rather than churning tiny cleanups forever.

## Layer 3: Frontend `pnpm` scripts (from `frontend/`)

These are the underlying tasks used by the wrappers above.

- `pnpm start` / `pnpm startr`
  - Vite + backend (reload for backend on `startr`).
- `pnpm reset`
  - Resolves + wipes the active Setta state root, then starts dev server.
- `pnpm test`
  - Vitest (watchable).
- `pnpm -C frontend typecheck`
  - Runs the frontend TypeScript compiler in no-emit mode.
- `pnpm generate`
  - Regenerates templates/types from `frontend/generation/`, then syncs the
    app-subsystem frontend SDK generated inputs from the host-owned artifacts.
- `pnpm -C frontend generate-go-frontend-bindings`
  - Regenerates the Go-owned frontend contract surface, including shared schema/OpenAPI artifacts, generated OpenAPI TypeScript outputs, and `src/utils/generatedTypes.ts`.
- `pnpm -C frontend generate-http-openapi-bindings`
  - Regenerates only the HTTP OpenAPI document plus the generated frontend HTTP client/types.
- `pnpm -C frontend generate-go-python-types`
  - Regenerates the Go-owned Python SDK/shared types, then runs the generated-type prune pass.
- `pnpm gcf`
  - Generate + cleanup + Go/Python/frontend formatting (logs to `gcf.log` via `frontend/scripts/gcf.sh`).
  - Emits lightweight progress output during long-running generation and cleanup steps.
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
  - Template/type generation (used by `pnpm generate`), including the
    app-subsystem frontend SDK generated-input sync.
- `frontend/generation/generate_go_frontend_bindings.sh`
  - Runs the full Go-owned frontend generation pipeline: type/route registries, non-HTTP schema/OpenAPI artifacts, generated non-HTTP TS types, `src/utils/generatedTypes.ts`, and the HTTP OpenAPI client/types.
- `frontend/generation/generate_go_shared_schema.sh`
  - Emits the non-HTTP shared schema, semantic sidecar, and OpenAPI projection under `frontend/generation/non_http_shared/`.
- `frontend/generation/generate_non_http_openapi_bindings.sh`
  - Regenerates the TypeScript output under `frontend/src/openapi/non_http/generated` from the checked-in non-HTTP OpenAPI projection.
- `frontend/generation/generate_http_openapi_bindings.sh`
  - Regenerates `frontend/generation/http_openapi/openapi.json` plus the generated frontend HTTP client/types under `frontend/src/openapi/http/generated`.
- `frontend/generation/sync_app_subsystem_sdk_generated_inputs.sh`
  - Prunes the host-owned shared sidecar and HTTP OpenAPI artifact for the
    app-subsystem frontend SDK, then refreshes the SDK generated HTTP client
    under `frontend/plugin-sdk/app-subsystem/`.
- `frontend/generation/generate_go_python_types.sh`
  - Direct Go-to-Python generation helper (SDK contracts + shared types + generated-type pruning).
- `frontend/scripts/gcf.sh`
  - Implements `pnpm gcf` + logging.
- `scripts/latest-chrome-recording.sh`
  - Resolves the newest Chrome repro recording bundle, its key logs/metadata, and bundled LLM artifact paths.

## Notes

- **Env activation**: the default `start.sh` / `reset.sh` / `ai.sh` loop does not require Python activation. Run `source activate.sh` before Python commands. The activated shell also exposes repo-local tools installed into `.venv/bin`, including `gopls` after `./dev_install.sh`. The `gcf.sh` and `gcft.sh` wrappers already do this. `pnpm generate` still requires it when run directly; `pnpm -C frontend generate-go-frontend-bindings` does not.
- **Supply-chain policy**: `supply_chain_policy.env` is the repo-local minimum release age policy used by `init_env.sh`, `update_dependencies.sh`, and `audit_supply_chain.sh`. The repo uses `--exclude-newer` only during explicit `uv` lock refreshes and enforces the rolling age policy for `uv.lock` during bootstrap with `scripts/check_uv_lock_release_age.py`. Go age enforcement is audit-only. pnpm’s resolver setting is `minimum-release-age` in minutes; the repo also enforces checked-in Go/pnpm metadata checks through the repo `uv` dev environment so those scripts can use managed Python dependencies instead of assuming system-installed packages.
- **Audit remediation policy**: use `docs/guides/dependency-audits.md`.
- **Repo-root logs**: `backend.log`, `chrome_mcp_backend.log`, `tests.log`, `gcf.log` (and sometimes `frontend.log`, depending on runner env).
- **Playwright E2E logs**: `scripts/run-playwright-e2e.sh` writes `backend.log` and `frontend.log` under its `LOG_DIR` (defaults under `/tmp`; override via `SETTA_E2E_LOG_DIR`).
- **Reset**: `reset.sh` and `pnpm reset` delete the resolved active Setta state root (including backups under that root).
