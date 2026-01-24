# Agent Browser Usage

Use the agent-browser CLI for visual verification when Playwright/Vitest isn't enough.
For Codex/agents: read this guide before using agent-browser in this repo.

## Setup

```bash
pnpm add -g agent-browser
agent-browser install
```

## Recommended (CDP-only) flow — use this

This is the preferred way to access the browser in this repo. It uses a
CDP-enabled Chrome, applies the bootstrap token, and takes a snapshot.
We do not rely on direct agent-browser launches; always connect via CDP.

```bash
pnpm -C frontend abcdp
```

Quick start (dev server + CDP Chrome + bootstrap/app open):

```bash
pnpm -C frontend ai
pnpm -C frontend aicdt   # auto-open DevTools on new tabs
```

Get the per-worktree CDP port:

```bash
pnpm -C frontend cdp-port
```

Then connect directly:

```bash
agent-browser tab --cdp "$(pnpm -C frontend cdp-port)"
agent-browser snapshot -i --cdp "$(pnpm -C frontend cdp-port)"
```

Or use the helper to auto-inject the port:

```bash
pnpm -C frontend abcdp-run -- tab
pnpm -C frontend abcdp-run -- snapshot -i
```

Important: `agent-browser` expects `--cdp` after the command (e.g. `tab --cdp 9309`).

## Chrome DevTools MCP (CDP-only)

Chrome DevTools MCP connects to the same CDP Chrome started by `pnpm -C frontend ai`.
Use the per-worktree port and point the MCP client at the URL below.

```bash
pnpm -C frontend ai
pnpm -C frontend cdp-port
```

Then connect chrome-devtools-mcp to:

```
http://127.0.0.1:<port>
```

This is the same browser that `agent-browser` uses via `--cdp`.

Apple Silicon note: if you see `mac-x64` Playwright paths, run under ARM64.

```bash
arch -arm64 pnpm -C frontend abcdp
arch -arm64 agent-browser snapshot -i --cdp 9222
```

If it still tries to resolve `mac-x64`, set the host override:

```bash
PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" \
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac-arm64 \
arch -arm64 agent-browser snapshot -i --cdp 9222
```

Options:
```bash
pnpm -C frontend abcdp --port 9223 --url "http://127.0.0.1:3000"
pnpm -C frontend abcdp -- snapshot -i
```

## Open the app (default URL)

Note: use the CDP flow instead (`pnpm -C frontend abcdp`).

<!--
```bash
scripts/ab.sh
```

`scripts/ab.sh` is a thin wrapper around `scripts/run-agent-browser.sh`.
You can also run `pnpm -C frontend ab`, which calls the same wrapper.

The script opens `http://<SETTA_DEV_FRONTEND_HOST or SETTA_HOST>:<port>` and will:
- use `SETTA_DEV_FRONTEND_PORT` when set,
- otherwise detect the running Vite dev server in this worktree,
- otherwise fall back to a port derived from the worktree name (same logic as
  `scripts/run-dev-instance.sh`).

`TMPDIR` is set to `setta_files/run/mcp/agent-browser-tmp` in the worktree to
keep sockets isolated per worktree. Override with `AGENT_BROWSER_TMPDIR` if
needed.

You can also run it via pnpm:
```bash
pnpm -C frontend ab
```

To debug port detection:
```bash
scripts/ab.sh --debug
pnpm -C frontend ab --debug
```
-->

## Override the URL

```bash
AGENT_BROWSER_URL="http://127.0.0.1:3002" scripts/run-agent-browser.sh
```

## Bootstrap token helper

If you see “Preparing setta” or 401s, open the bootstrap URL with a token:

```bash
scripts/bootstrap-url.sh            # prints the URL
agent-browser open "$(scripts/bootstrap-url.sh)"
```

`scripts/start-browser-mcp.sh --playwriter` opens Chrome but does not launch
agent-browser directly. Use `pnpm -C frontend abcdp` / `abcdp-run` (or
`agent-browser ... --cdp`) to connect.

## Reliable flow (Codex checklist)

When the agent runs inside a sandbox, the most reliable path is to connect to a
debug Chrome over CDP and use the bootstrap URL.

1) Start a debug Chrome (outside the sandbox):
   `DEBUG_PORT=9222 scripts/start-browser-mcp.sh --devtools`

2) Confirm it’s live:
   `curl http://127.0.0.1:9222/json/version`

3) Open the bootstrap URL in that browser, then the app:
   ```bash
   agent-browser open "$(scripts/bootstrap-url.sh)" --cdp 9222
   agent-browser open "http://127.0.0.1:3000" --cdp 9222
   agent-browser wait --text "Overview" --cdp 9222
   agent-browser snapshot -i --cdp 9222
   ```

If you see “No page found”, create a tab first:
`curl -X PUT "http://127.0.0.1:9222/json/new?url=about:blank"` and retry.

## Pass through agent-browser commands

```bash
scripts/run-agent-browser.sh snapshot -i
scripts/run-agent-browser.sh click "text=Open"
scripts/run-agent-browser.sh screenshot /tmp/setta.png
```

## Manual daemon start (sandbox workaround)

If the daemon fails to start (EPERM when binding the socket), launch it
manually and reuse the same session name for CLI commands. The default session
name is `setta-<worktree-suffix>`, where the suffix is derived from the repo
path.

```bash
export AGENT_BROWSER_SESSION=setta-<worktree-suffix>
node "$(npm root -g)/agent-browser/dist/daemon.js" &
sleep 2
# If installed via pnpm:
# node "$(pnpm root -g)/agent-browser/dist/daemon.js" &
agent-browser open http://127.0.0.1:3000/mane_ready
```

## Playwright browser install path

If `agent-browser install` fails with EPERM under `~/Library/Caches`, install
the browsers into the repo:

```bash
PLAYWRIGHT_BROWSERS_PATH=setta_files/run/playwright-browsers agent-browser install
```
