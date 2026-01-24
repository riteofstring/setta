# Agent Browser Usage

Use the agent-browser CLI for visual verification when Playwright/Vitest isn't enough.
For Codex/agents: read this guide before using agent-browser in this repo.

## Setup

```bash
pnpm add -g agent-browser
agent-browser install
```

## Open the app (default URL)

```bash
scripts/ab
```

`scripts/ab` is a thin wrapper around `scripts/run-agent-browser.sh`.
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
scripts/ab --debug
pnpm -C frontend ab --debug
```

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

`scripts/start-browser-mcp.sh --playwriter` also auto-opens the bootstrap URL
when available (set `PLAYWRITER_BOOTSTRAP=0` to disable).

## Reliable flow (Codex checklist)

When the agent runs inside a sandbox, the most reliable path is to connect to a
debug Chrome over CDP and use the bootstrap URL.

1) Start a debug Chrome (outside the sandbox):
   `DEBUG_PORT=9222 scripts/start-browser-mcp.sh --devtools`

2) Confirm it’s live:
   `curl http://127.0.0.1:9222/json/version`

3) Open the bootstrap URL in that browser, then the app:
   ```bash
   agent-browser --cdp 9222 open "$(scripts/bootstrap-url.sh)"
   agent-browser --cdp 9222 open "http://127.0.0.1:3000"
   agent-browser --cdp 9222 wait --text "Overview"
   agent-browser --cdp 9222 snapshot -i
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
