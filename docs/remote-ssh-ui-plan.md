# Plan: Lightweight SSH Remote UI

## Summary
This plan keeps the current workflow (install Setta in the project’s Python environment and start it from the project folder) while making SSH-based access secure and easy. The server binds only to loopback (or UDS), uses a per-session secret to mint short-lived bootstrap tokens and an auth cookie for normal access, and provides a single-command `setta connect host:/path` helper plus a fully copy/pasteable manual tunnel flow.

## Goals
- Preserve the existing workflow: install Setta in the project’s Python env, run from the project folder.
- Make remote UI access safe by default (no public bind, token-gated routes).
- Keep SSH optional and manual-friendly, but also offer a one-command helper.
- Avoid a large refactor or new transport layer.
- Allow viewing the UI locally even without a local Setta install.
- Make copy/paste connection instructions easy to obtain.
- Make multi-session handling explicit (list alternatives; require a session choice when multiple are running).

## Non-goals
- Replacing SSH with a new transport.
- Introducing a new global install requirement.
- Multi-tenant isolation on a shared machine with root users.
- Backward compatibility with prior insecure binding defaults.

## Best-Case UX
1. User boots laptop and opens a terminal.
2. From the laptop, run:
   ```bash
   setta connect dev@buildbox:/work/my-project
   ```
3. `setta connect` uses SSH to start Setta (if not already running), opens a local tunnel, and launches the browser. The UI loads locally with auth already established. The browser opens `/__setta__/bootstrap#token=...`; the bootstrap page auto-consumes the fragment, sets the auth cookie, uses `history.replaceState` to scrub the URL, and redirects to `/` without prompting the user. Because the token is in the fragment and the URL is rewritten before redirect, it should not appear in browser history. If the fragment is stripped, the page will prompt for a token; query-string tokens can appear in history.
4. If the user prefers to start Setta manually on the host, the remote output prints a fully ready-to-copy snippet:
   ```text
   Setta running (session 9f2c4b)
   Bind: 127.0.0.1:61234 (remote only)
   Remote start (copy/paste on host, if needed):
     cd /work/my-project && source .venv/bin/activate && setta
   From your laptop (recommended if Setta is installed locally):
     setta connect dev@buildbox:/work/my-project --session 9f2c4b
   If your laptop prints "setta: command not found", use the manual tunnel steps instead:
     LOCAL_PORT=61000
     ssh -N -L ${LOCAL_PORT}:127.0.0.1:61234 dev@buildbox -o ExitOnForwardFailure=yes
     Open this URL in your browser (recommended):
       http://127.0.0.1:${LOCAL_PORT}/__setta__/bootstrap#token=<token>
     If the page prompts for a token (fragment stripped or you prefer manual entry), open:
       http://127.0.0.1:${LOCAL_PORT}/__setta__/bootstrap
       and paste:
         <token>
   (macOS: open URL, Linux: xdg-open URL, Windows: start URL)
   ```

## Manual Flow (Two SSH Sessions)
Requires two terminals:
- Terminal A: SSH into the remote host and keep Setta running.
- Terminal B (local): create the SSH tunnel and keep it running.

- SSH in and start Setta (as above).
- Copy the snippet printed by Setta (or `setta status --connect-info`); it includes the remote start command and local tunnel steps:
  ```text
  Remote start (copy/paste on host, if needed):
    cd /work/my-project && source .venv/bin/activate && setta
  LOCAL_PORT=61000
  ssh -N -L ${LOCAL_PORT}:127.0.0.1:61234 dev@buildbox -o ExitOnForwardFailure=yes
  Open this URL in your browser (recommended):
    http://127.0.0.1:${LOCAL_PORT}/__setta__/bootstrap#token=<token>
  If the page prompts for a token (fragment stripped or you prefer manual entry), open:
    http://127.0.0.1:${LOCAL_PORT}/__setta__/bootstrap
    and paste:
      <token>
  ```
Keep the tunnel command running; Ctrl+C stops it. If you see a remote prompt like `dev@buildbox:~$`, you probably omitted `-N`. The tunnel still works, but it is easy to forget it is running; prefer `-N` and keep this terminal open.
Pick any free LOCAL_PORT on your laptop; if you see “Address already in use,” change it (for example, 61001) and rerun the tunnel command (example: `LOCAL_PORT=61001`).
Leave the SSH session running in Terminal B; close it with Ctrl+C when done.
Optional commands: macOS `open URL`, Linux `xdg-open URL`, Windows `start URL`.
The bootstrap page sets an auth cookie and redirects to `/` so the token does not remain in the URL.
(Recommended: make this token single-use and short-lived.)
Prefer the fragment form (`#token=<token>`). The fragment is not sent in the initial request; the bootstrap script
reads it client-side, POSTs it to consume, and calls `history.replaceState` before redirecting, so the token should
not appear in browser history.
The token can still end up in history if a query-string token is used or if tooling converts the fragment into a query string.
Query tokens may also land in shell history or logs.
If the token expires, run `setta status --connect-info` again to mint a fresh one (no server restart needed).

Note: if `61000` is already in use, choose a different local port and update `LOCAL_PORT`.

## Single SSH Session (Optional)
This only works if you already know the remote port. If Setta is using a random port,
use the two-session flow or start Setta with `--port`.
Users can do it in one command if they prefer:
```bash
ssh -L 127.0.0.1:61000:127.0.0.1:61234 dev@buildbox \
  "bash -lc 'cd ~/work/my-project && source .venv/bin/activate && setta'"
```
Note: this requires a known remote port so the `-L` forward can be set in advance. If Setta chooses a random port, use the two-session flow or pass `--port`:
```bash
ssh -L 127.0.0.1:61000:127.0.0.1:61234 dev@buildbox \
  "bash -lc 'cd ~/work/my-project && source .venv/bin/activate && setta --port 61234'"
```

## Helper Command UX (`setta connect`)
Example:
```bash
setta connect dev@buildbox:/work/my-project
```
Behavior:
- SSHes to the remote host.
- Starts Setta in the specified workspace if it is not already running (detached so it keeps running after the SSH command exits).
- Remote env resolution order (first match wins):
  - If `--remote-cmd` is provided, use it verbatim.
  - If `./.venv/bin/activate`, `./venv/bin/activate`, or `./env/bin/activate` exists, run `source <activate> && setta`.
  - If `pyproject.toml` exists and `poetry` is available, run `poetry run setta`.
  - If `pyproject.toml` exists and `uv` is available, run `uv run setta`.
  - If `CONDA_PREFIX` is set, run `setta`.
  - If `setta` is on PATH, run `setta`.
  - If none match, print a clear error and suggest a `--remote-cmd` example.
- Ensure activation runs under a shell that supports `source` (use `bash -lc`), or use the POSIX `.` form when the shell is unknown.
  Example:
  ```bash
  ssh dev@buildbox "bash -lc 'cd /work/my-project && source .venv/bin/activate && setta'"
  ```
- Reads the remote port and requests a fresh bootstrap token for the selected session.
- Matches sessions only within the specified workspace (canonicalized path; resolve `~`, env vars, and symlinks to avoid `~/proj` vs `/home/user/proj` mismatches).
- If no session matches, start a new one in that workspace.
- If exactly one session matches, use it.
- If multiple sessions match and no non-interactive option is provided, prompt interactively:
  - Show a short numbered list (session id, started time, port).
  - Show an inline hint line like: `Select [1-3], dN delete, q quit` (example: `d3`).
  - User enters a number to connect, `d<number>` to delete a session, or `q` to quit.
  - Deletion prompts for confirmation and stops the server before removing session metadata.
- If `stdin` is not a TTY and multiple sessions match, exit non-zero with a clear message to use `--session <id>` or `--latest` (do not prompt or hang).
- Support non-interactive selection with `--session <id>` or `--latest`.
- Define `--latest` ordering (for example, "most recently started"). Example: session A started at 09:00, session B started at 10:05; `--latest` selects B.
- Chooses a free local port automatically (prints it), or uses `--local-port` if provided.
- Print progress lines so the CLI does not appear hung during remote startup or SSH handshake. Example output:
  ```text
  Starting Setta on dev@buildbox:/work/my-project...
  Using session 9f2c4b (port 61234).
  Opening local tunnel on 61037 (keep this terminal open).
  Opening browser...
  Tunnel active (Ctrl+C to stop).
  Tip: use --detach to background the tunnel or --print-only to copy commands.
  ```
- Opens a local tunnel and launches the browser to the bootstrap URL. For `setta connect`,
  pass the token via fragment by default (`#token=...`) so the UI loads immediately; allow
  `?token=` as a fallback and scrub via `history.replaceState`. The bootstrap page should
  auto-consume the fragment, set the auth cookie via a POST, replace the URL before any
  navigation, and redirect to `/` so the user never sees a token prompt and the token is
  not stored in browser history.
- Keeps the tunnel alive in the foreground so a single local terminal can drive the entire flow.
- Runs in the foreground; `Ctrl+C` closes the tunnel and leaves the remote server running.
  - Print a clear warning that this terminal must stay open; closing it disconnects the UI. Include a quick reconnect hint (`setta connect ...`).
  - After the tunnel is active, print a short tip about `--detach` and `--print-only`.
- `--detach` runs the tunnel in the background and returns control of the terminal; print the tunnel PID and a single, foolproof stop command.
  Example:
  ```text
  Tunnel running in background (pid 48219, local port 61037).
  To stop: kill 48219
  ```
- `--print-only` prints the exact `ssh -N -L` command, bootstrap URL, and token on
  separate lines, then exits without opening a browser or keeping a tunnel alive.
- `--no-open` skips launching a browser (useful for headless shells).

Single-terminal local UX (primary):
- Users with a local Setta install can run `setta connect ...` from their laptop and never open a second terminal.
- The helper handles remote start, tunnel setup, and browser launch in one go.

Concrete example (helper flow, no token in history):
```text
User runs:
  setta connect dev@buildbox:/work/my-project
CLI output:
  Starting Setta on dev@buildbox:/work/my-project...
  Using session 9f2c4b (port 61234).
  Opening local tunnel on 61037 (keep this terminal open).
  Opening browser...
  Tunnel active (Ctrl+C to stop).
  Tip: use --detach to background the tunnel or --print-only to copy commands.
CLI opens:
  http://127.0.0.1:61037/__setta__/bootstrap#token=7f3b2c9e
Browser requests:
  GET /__setta__/bootstrap
Bootstrap script:
  - reads token from fragment
  - POSTs token to /__setta__/bootstrap/consume
  - receives Set-Cookie: setta_auth=...
  - history.replaceState(..., "/__setta__/bootstrap")
  - redirects to /
Final URL:
  http://127.0.0.1:61037/
```

## Security Model
- Bind only to loopback by default (`127.0.0.1` + random port). Optionally support UDS.
- Generate a per-session secret stored with `0600` permissions and never expose it to users.
- Mint short-lived, single-use bootstrap tokens on demand (via `setta connect` or `setta status --connect-info`).
- Require auth for all HTTP endpoints and websocket upgrades (except the bootstrap page). Accept `Authorization: Bearer <bootstrap token>` for first use or an auth cookie for normal use.
- Provide a bootstrap page that accepts a bootstrap token, sets an auth cookie, and redirects to `/`.
- Bootstrap tokens are single-use and short-lived (for example, 5-10 minutes).
- Auth cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, with a longer max-age (for example, 8-24 hours) to avoid repeated prompts.
- Auth credentials (bootstrap tokens and auth cookies) protect access even when traffic is tunneled over SSH; the tunnel is transport security, not auth.
- Never bind to public interfaces unless explicitly requested.
- For `setta connect`, token delivery uses a URL fragment plus `history.replaceState` so the token does not end up in browser history. It can still appear if a query-string token is used or the fragment is rewritten into a query string.

## Token Lifecycle (User-Friendly)
- Session secret: created once per server session and stored on disk; never shown to users.
- Bootstrap token: minted on demand, single-use, short-lived; used only to set the auth cookie.
- Auth cookie: primary credential; lasts longer so users rarely need to fetch a new token manually.
- Manual fallback: rerun `setta status --connect-info` to mint a fresh bootstrap token without restarting the server.

Concrete example:
```text
1) User runs: setta connect dev@buildbox:/work/my-project
2) Server already has a session secret on disk and mints a bootstrap token that expires in 10 minutes.
3) Browser opens /__setta__/bootstrap#token=...; bootstrap consumes the token, sets a 12-hour cookie, and redirects to /.
4) Later that day, the user reconnects and the cookie is still valid, so the UI loads without a prompt.
5) Next day the cookie expires; setta connect mints a new bootstrap token and the flow repeats. No server restart needed.
6) Manual flow: if a printed token expires, run setta status --connect-info to print a new one.
```

## Implementation Outline
### Server changes (minimal)
- Default bind to `127.0.0.1` and random port when `--port` is not provided.
- Generate a per-session secret on startup and store it in `~/.setta/run/<session>/secret`.
- Create or extend session metadata file with port, bind address, and secret path.
- Add a bootstrap token minting path used by `setta connect` and `setta status --connect-info` to fetch a fresh token.
- Add auth middleware for HTTP and websocket routes (accept bootstrap token via `Authorization` or auth cookie; allow bootstrap without auth).
- Add `__setta__/bootstrap` page that prompts for a token, sets a cookie, and redirects.
  - Default to fragment (`#token=`) for one-shot flows; accept `?token=` as a fallback and scrub via `history.replaceState`.
- Print a concise connection hint on startup (includes session id and a `setta connect` line).

### CLI helper
- Add `setta connect` to orchestrate remote start + tunnel + browser open.
- Inputs: `ssh_target`, `workspace`, optional `--remote-cmd`, optional `--session` / `--latest`.
- Uses SSH to start Setta if not already running, then forwards a local port.
- Opens the browser to the bootstrap URL and keeps the tunnel alive.
- Add `setta status --connect-info` to list sessions and print the manual connect snippet with a freshly minted token.
- Add `--print-only` to `setta connect` for scripts or users who prefer manual tunnel control.

## No Local Setta Install
Users can still access the UI with only SSH installed by using manual tunnel + bootstrap URL.
The helper command remains optional. On the remote host, run `setta status --connect-info`
to print a ready-to-copy snippet that includes the remote start command plus the local
SSH tunnel and browser instructions. Include a fragment URL with the token for the no-prompt
flow, plus a plain `/__setta__/bootstrap` URL for manual paste if the fragment is stripped or the user prefers manual entry. Provide
optional commands for macOS (`open URL`), Linux (`xdg-open URL`), Windows (`start URL`), or
`python -m webbrowser URL`.
Example: if your laptop prints `setta: command not found`, use the printed `ssh -N -L ...` snippet instead of `setta connect`.

### Single-Terminal Suggestions (No Local Setta)
These are optional ideas when you want to avoid keeping two terminals open at the same time.
Each has tradeoffs (especially around stopping background processes), so list them as alternatives.

Option A: Detach Setta remotely, then run only the local tunnel in the foreground.
```bash
ssh dev@buildbox "bash -lc 'cd /work/my-project && source .venv/bin/activate && nohup setta >/tmp/setta.log 2>&1 &'"
LOCAL_PORT=61000
ssh -N -L ${LOCAL_PORT}:127.0.0.1:61234 dev@buildbox -o ExitOnForwardFailure=yes
open "http://127.0.0.1:${LOCAL_PORT}/__setta__/bootstrap#token=<token>"
```
Notes: you must manually stop the remote Setta process later (for example, by session id or PID).

Option B: Background the local tunnel and keep your terminal free.
```bash
LOCAL_PORT=61000
ssh -N -L ${LOCAL_PORT}:127.0.0.1:61234 dev@buildbox -o ExitOnForwardFailure=yes &
open "http://127.0.0.1:${LOCAL_PORT}/__setta__/bootstrap#token=<token>"
wait
```
Notes: use `jobs`/`fg`/`kill` to manage the background tunnel; closing the terminal will end it.

## Testing and Verification
- Start Setta on a remote host, verify bind is loopback only.
- Attempt direct access to remote loopback port from another host, verify it is unreachable.
- Hit HTTP and websocket endpoints without a token, expect 401/close.
- Use bootstrap URL, verify cookie set and UI loads without token in the URL.
- Use `setta connect`, verify it starts the server and opens the UI locally.

## Open Questions
- Where should session metadata live and what fields are required for `setta connect`?
- What is the exact session metadata format for `setta connect` to read (schema + versioning)?
- What are the exact TTLs for bootstrap tokens and auth cookies?
- What cookie name/path/expiry should the bootstrap page set?
- How should the remote process be detached (nohup, setsid, tmux, or a small wrapper)?
- How should the local tunnel port be chosen (fixed, random, or user-provided)?
- Should UDS be the preferred path on platforms that support it?
- What fields should appear in the multi-session list (id, started time, port, workspace)?
