# Browser MCP Quickstart (Chrome DevTools)

This is the shortest path to a headed browser in Codex + Claude for
chrome-devtools-mcp and performance profiling.

## Setup once

1. Install frontend deps:
   `cd frontend && pnpm install`

2. MCP servers are already configured in Codex and Claude.

## Default use (Chrome DevTools MCP)

1. Start your app:
   `pnpm start`

   Or use the combined helpers:
   `./ai.sh` (adds CDP Chrome + bootstrap/app open)
   Tip: set `CHROME_EXTRA_ARGS=--auto-open-devtools-for-tabs` to auto-open DevTools.

2. Start the debug Chrome instance (if you are not using `./ai.sh`):
   `./scripts/start-browser-mcp.sh --devtools`

   Override MCP state location:
   `MCP_RUN_DIR="${TMPDIR:-/tmp}/setta-mcp/<worktree>-<hash>" ./scripts/start-browser-mcp.sh --devtools`

3. Codex auto-connects chrome-devtools-mcp to the per-worktree CDP port via
   `.codex/config.toml` + `scripts/chrome-devtools-mcp.sh` (no manual port typing).
   If another client needs the port, run:
   `pnpm -C frontend cdp-port` → `http://127.0.0.1:<port>`

4. Open your app in the debug Chrome window.

5. Use Chrome DevTools MCP for traces and visual verification.

## Minimal perf triage flow

1. Define a repeatable action (drag node, pan, load 5k nodes).
2. Record a trace during that action (DevTools MCP).
3. Look for:
   - Long tasks (scripting spikes)
   - Layout/paint bursts
   - Idle gaps between input and visual response
4. Fix the hottest issue, then re-run the same trace window.

## Tips

- Each worktree uses an offset for backend/frontend/CDP ports, so you can run
  multiple Setta instances in parallel without collisions.
- The debug Chrome profile lives under `${TMPDIR:-/tmp}/setta-mcp/<worktree>-<hash>` by default.
  Override with `MCP_RUN_DIR` (base dir) or `PROFILE_DIR` (exact profile path).
- Stop browser MCP processes for this repo with `./scripts/stop-browser-mcp.sh --devtools`.
- `scripts/chrome-devtools-mcp.sh` writes MCP stderr logs to `${TMPDIR:-/tmp}/setta-mcp-logs/` so MCP transport stdout remains clean.
- If the agent struggles to target elements, add stable `data-testid` or
  `aria-label` attributes for key controls and the graph canvas.

## Playwright E2E (reliable path)

1. Start the backend + frontend (`pnpm start` or `pnpm startr`).
2. Run the suite with the helper (auto-mints a bootstrap token):
   `./scripts/run-playwright-e2e.sh`

Optional overrides:

- `PLAYWRIGHT_BASE_URL` (frontend URL)
- `SETTA_BACKEND_ORIGIN` (backend origin)
- `SETTA_PROJECT_URL` (project path)
- `SETTA_PROJECT_PATH` (project path appended to `PLAYWRIGHT_BASE_URL`)
- `SETTA_BOOTSTRAP_TOKEN` (skip auto-mint)
- `SETTA_AUTH_COOKIE_NAME` (auth cookie override)

If browser installs fail with permissions under `~/Library/Caches`, install to a
repo-local path:
`PLAYWRIGHT_BROWSERS_PATH=setta_files/runtime/playwright-browsers npx playwright install`

## Playwright recording (manual repro capture)

Use the recorder helper when you want a saved Playwright codegen output while
starting Setta the normal dev way:

- `SETTA_HOME=~/.setta-development`
- `SETTA_FILES_ROOT=<worktree>/setta_files_dev`
- initial route `/home`

`./scripts/record-playwright-e2e.sh`

Artifacts are written under `${TMPDIR:-/tmp}/setta-playwright-recordings/<repo>/recording-<timestamp>/` by default.
Use `--artifact-dir <dir>` or `SETTA_E2E_RECORD_ROOT_DIR=<dir>` to override.
Use `--reset` to clear the active dev `setta_files_dev` state first, matching the
same reset step used by the normal `reset.sh` flow.

Bundle contents:

- `recording.spec.ts`: generated Playwright script
- `network.har`: captured network activity
- `bootstrap-storage-state.json`: auth/bootstrap state loaded into the recorder
- `final-storage-state.json`: storage state after you finish the recording
- `session.json`: metadata describing the recording bundle
- `logs/`: backend/frontend/bootstrap logs for the disposable session

Pass extra `playwright codegen` flags directly, for example:
`./scripts/record-playwright-e2e.sh --browser chromium`

## Chrome Repro Recording

The capture-first Chrome repro workflow now lives in
[chrome-repro-recording.md](/Users/kevin/Documents/AppDevelopment/setta.go-rewrite/docs/guides/chrome-repro-recording.md).

Use that guide for:

- `./scripts/record-chrome-repro.sh`
- `./scripts/latest-chrome-recording.sh`
- the `see the latest Chrome recording` handoff flow
