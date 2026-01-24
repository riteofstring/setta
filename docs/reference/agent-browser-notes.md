# Agent-Browser Notes (setta)

- Daemon socket bind can fail under the sandbox (EPERM on `/var/folders/.../agent-browser-<session>.sock`). Workaround: start the daemon manually with a dedicated session, then use the same `AGENT_BROWSER_SESSION` for CLI commands:

  ```bash
  export AGENT_BROWSER_SESSION=setta
  node "$(npm root -g)/agent-browser/dist/daemon.js" &
  sleep 2
  # If you installed via pnpm, swap to: node "$(pnpm root -g)/agent-browser/dist/daemon.js" &
  agent-browser open http://127.0.0.1:3000/mane_ready
  ```
- `http://127.0.0.1:3000/mane_ready` requires a bootstrap token; without it the UI stays on “Preparing setta” and console shows repeated 401s. Provide the token (headers/cookies/storage) before navigating.
