# Agent Browser Usage

Use the agent-browser CLI for visual verification when Playwright/Vitest isn't enough.

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
