# Agent Browser Usage

Use the agent-browser CLI for visual verification when Playwright/Vitest isn't enough.

## Setup

```bash
pnpm add -g agent-browser
agent-browser install
```

## Open the app (default URL)

```bash
scripts/run-agent-browser.sh
```

The script opens `http://<SETTA_HOST>:<SETTA_DEV_FRONTEND_PORT>` and defaults to
`http://127.0.0.1:3000` when those env vars are unset.

## Override the URL

```bash
AGENT_BROWSER_URL="http://127.0.0.1:3002" scripts/run-agent-browser.sh
```

## Pass through agent-browser commands

```bash
scripts/run-agent-browser.sh snapshot -i
scripts/run-agent-browser.sh click "text=Open"
scripts/run-agent-browser.sh screenshot /tmp/setta.png
```

## Manual daemon start (sandbox workaround)

If the daemon fails to start (EPERM when binding the socket), launch it
manually and reuse the same session name for CLI commands:

```bash
export AGENT_BROWSER_SESSION=setta
node "$(npm root -g)/agent-browser/dist/daemon.js" &
sleep 2
# If installed via pnpm:
# node "$(pnpm root -g)/agent-browser/dist/daemon.js" &
agent-browser open http://127.0.0.1:3000/mane_ready
```
