# Agent-Browser Notes (setta)

- Preferred entrypoint: `pnpm -C frontend abcdp` (or `scripts/ab-cdp`). This uses a CDP-enabled Chrome, applies the bootstrap token, and takes a snapshot.

- Daemon socket bind can fail under the sandbox (EPERM on `/var/folders/.../agent-browser-<session>.sock`). Workaround: start the daemon manually with a dedicated session, then use the same `AGENT_BROWSER_SESSION` for CLI commands. The scripts now default to `setta-<worktree-suffix>` and keep sockets under `setta_files/run/mcp/agent-browser-tmp`. If the daemon still fails to start, check `setta_files/run/mcp/agent-browser-daemon.log`.

  ```bash
  export AGENT_BROWSER_SESSION=setta-<worktree-suffix>
  node "$(npm root -g)/agent-browser/dist/daemon.js" &
  sleep 2
  # If you installed via pnpm, swap to: node "$(pnpm root -g)/agent-browser/dist/daemon.js" &
  agent-browser open http://127.0.0.1:3000/mane_ready
  ```
- `http://127.0.0.1:3000/mane_ready` requires a bootstrap token; without it the UI stays on “Preparing setta” and console shows repeated 401s. Provide the token (headers/cookies/storage) before navigating.
- If `agent-browser install` fails with EPERM under `~/Library/Caches`, install to a writable path:

  ```bash
  PLAYWRIGHT_BROWSERS_PATH=setta_files/run/playwright-browsers agent-browser install
  ```

- If the sandbox blocks launching Playwright locally, connect to a debug Chrome:

  ```bash
  DEBUG_PORT=9222 scripts/start-browser-mcp.sh --devtools
  agent-browser --cdp 9222 open "$(scripts/bootstrap-url.sh)"
  agent-browser --cdp 9222 open "http://127.0.0.1:3000"
  ```
