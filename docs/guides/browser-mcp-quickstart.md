# Browser MCP Quickstart (Agent Browser + Playwriter + Chrome DevTools)

This is the shortest path to a headed browser in Codex + Claude, with optional
performance profiling.

## Setup once

1) Install frontend deps (includes agent-browser-mcp):
   `cd frontend && pnpm install`

2) Install the Playwriter Chrome extension:
   https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe

3) MCP servers are already configured in Codex and Claude.

## Default use (Agent Browser)

1) Start your app:
   `pnpm start`

2) Start the agent-browser MCP server:
   `scripts/start-browser-mcp.sh`

3) Use the agent-browser MCP tools in Codex or Claude.

## Daily use (low context, Playwriter)

1) Start your app:
   `pnpm start`

2) Open Chrome normally and load your app (or run `scripts/start-browser-mcp.sh --playwriter`
   for a dedicated profile; install the extension once in that profile).

3) Click the Playwriter extension icon on the tab you want to control.

4) In Codex or Claude, use the Playwriter tool for actions.

## Performance runs (Chrome DevTools MCP)

1) Start the debug Chrome instance:
   `scripts/start-browser-mcp.sh --devtools`

2) In that Chrome window, install the Playwriter extension once (so both tools
   use the same browser profile).

3) Open your app in the debug Chrome window.

4) Use Chrome DevTools MCP for traces, and Playwriter for scripted actions.

## Minimal perf triage flow

1) Define a repeatable action (drag node, pan, load 5k nodes).
2) Record a trace during that action (DevTools MCP).
3) Look for:
   - Long tasks (scripting spikes)
   - Layout/paint bursts
   - Idle gaps between input and visual response
4) Fix the hottest issue, then re-run the same trace window.

## Tips

- If you want lowest context overhead, only enable Playwriter and turn on
  Chrome DevTools MCP when profiling.
- Stop browser MCP processes for this repo with `scripts/stop-browser-mcp.sh`
  (use `--agentbrowser`, `--playwriter`, or `--devtools` to target one).
- If the agent struggles to target elements, add stable `data-testid` or
  `aria-label` attributes for key controls and the graph canvas.
