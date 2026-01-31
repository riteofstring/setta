# Browser MCP Quickstart (Chrome DevTools)

This is the shortest path to a headed browser in Codex + Claude for
chrome-devtools-mcp and performance profiling.

## Setup once

1) Install frontend deps:
   `cd frontend && pnpm install`

2) MCP servers are already configured in Codex and Claude.

## Default use (Chrome DevTools MCP)

1) Start your app:
   `pnpm start`

   Or use the combined helpers:
   `pnpm -C frontend ai` (adds CDP Chrome + bootstrap/app open)
   `pnpm -C frontend aicdt` (same + auto-open DevTools)

2) Start the debug Chrome instance (if you are not using `pnpm -C frontend ai`):
   `scripts/start-browser-mcp.sh --devtools`

3) Codex auto-connects chrome-devtools-mcp to the per-worktree CDP port via
   `.codex/config.toml` + `scripts/chrome-devtools-mcp.sh` (no manual port typing).
   If another client needs the port, run:
   `pnpm -C frontend cdp-port` → `http://127.0.0.1:<port>`

4) Open your app in the debug Chrome window.

5) Use Chrome DevTools MCP for traces and visual verification.

## Minimal perf triage flow

1) Define a repeatable action (drag node, pan, load 5k nodes).
2) Record a trace during that action (DevTools MCP).
3) Look for:
   - Long tasks (scripting spikes)
   - Layout/paint bursts
   - Idle gaps between input and visual response
4) Fix the hottest issue, then re-run the same trace window.

## Tips

- Each worktree uses an offset for backend/frontend/CDP ports, so you can run
  multiple Setta instances in parallel without collisions.
- Stop browser MCP processes for this repo with `scripts/stop-browser-mcp.sh --devtools`.
- If the agent struggles to target elements, add stable `data-testid` or
  `aria-label` attributes for key controls and the graph canvas.

## Playwright E2E (reliable path)

1) Start the backend + frontend (`pnpm start` or `pnpm startr`).
2) Run the suite with the helper (auto-mints a bootstrap token):
   `scripts/run-playwright-e2e.sh`

Optional overrides:
- `PLAYWRIGHT_BASE_URL` (frontend URL)
- `SETTA_BACKEND_ORIGIN` (backend origin)
- `SETTA_PROJECT_URL` (project path)
- `SETTA_BOOTSTRAP_TOKEN` (skip auto-mint)

If browser installs fail with permissions under `~/Library/Caches`, install to a
repo-local path:
`PLAYWRIGHT_BROWSERS_PATH=setta_files/runtime/playwright-browsers npx playwright install`
