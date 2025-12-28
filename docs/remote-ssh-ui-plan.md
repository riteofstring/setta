# Plan: Lightweight SSH Remote UI

## Summary
This plan keeps the current workflow (install Setta in the project’s Python environment and start it from the project folder) while making SSH-based access secure and easy. The server binds only to loopback (or UDS), uses a per-session token for all HTTP and websocket access, and provides a single-command `setta connect host:/path` helper plus a fully copy/pasteable manual tunnel flow.

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
3. `setta connect` uses SSH to start Setta (if not already running), opens a local tunnel, and launches the browser. The UI loads locally with auth already established.
4. If the user prefers to start Setta manually on the host, the remote output prints a fully ready-to-copy snippet:
   ```text
   Setta running (session 9f2c4b)
   Bind: 127.0.0.1:61234 (remote only)
   From your laptop (recommended):
     setta connect dev@buildbox:/work/my-project --session 9f2c4b
   No local Setta? Copy/paste:
     ssh -L 61000:127.0.0.1:61234 dev@buildbox
     Open this URL in your browser:
       http://127.0.0.1:61000/__setta__/bootstrap
     Then paste this token when prompted:
       <token>
     (macOS: open URL, Linux: xdg-open URL, Windows: start URL)
   ```

## Manual Flow (Two SSH Sessions)
Requires two terminals:
- Terminal A: SSH into the remote host and keep Setta running.
- Terminal B (local): create the SSH tunnel and keep it running.

- SSH in and start Setta (as above).
- Copy the snippet printed by Setta (or `setta status --connect-info`) and paste it locally:
  ```text
  ssh -L 61000:127.0.0.1:61234 dev@buildbox
  Open this URL in your browser:
    http://127.0.0.1:61000/__setta__/bootstrap
  Then paste this token when prompted:
    <token>
  ```
Leave the SSH session running in Terminal B; close it with Ctrl+C when done.
Optional commands: macOS `open URL`, Linux `xdg-open URL`, Windows `start URL`.
The bootstrap page sets an auth cookie and redirects to `/` so the token does not remain in the URL.
(Recommended: make this token single-use and short-lived.)
If you prefer a one-shot URL, you can append `?token=<token>` manually, but that will land in shell history.

Note: if `61000` is already in use, choose a different local port and replace it in both lines.

Optional: one-command tunnel that auto-opens the URL (foreground, no background PID):
```bash
ssh -N -L 61000:127.0.0.1:61234 dev@buildbox \
  -o ExitOnForwardFailure=yes \
  -o PermitLocalCommand=yes \
  -o LocalCommand='open http://127.0.0.1:61000/__setta__/bootstrap'
```
Replace `open` with `xdg-open` (Linux) or `start` (Windows).

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
- Auto-detects the Python environment (prefers `./.venv/bin/python`, falls back to `python`). Only require `--python` if auto-detect fails.
- Reads the remote port + session token.
- Matches sessions only within the specified workspace (canonicalized path; resolve `~`, env vars, and symlinks to avoid `~/proj` vs `/home/user/proj` mismatches).
- If no session matches, start a new one in that workspace.
- If exactly one session matches, use it.
- If multiple sessions match, prompt interactively:
  - Show a short numbered list (session id, started time, port).
  - User enters a number to connect, `d<number>` to delete a session, or `q` to quit.
  - Deletion prompts for confirmation and stops the server before removing session metadata.
- Chooses a free local port automatically (prints it), or uses `--local-port` if provided.
- Opens a local tunnel and launches the browser to the bootstrap URL. For `setta connect`,
  pass the token via query or fragment so the UI loads immediately; the bootstrap page scrubs the URL.
- Keeps the tunnel alive in the foreground so a single local terminal can drive the entire flow.
  - Runs in the foreground; `Ctrl+C` closes the tunnel.
- `--print-only` prints the exact `ssh -L` command, bootstrap URL, and token on
  separate lines, then exits without opening a browser or keeping a tunnel alive.

Single-terminal local UX (primary):
- Users with a local Setta install can run `setta connect ...` from their laptop and never open a second terminal.
- The helper handles remote start, tunnel setup, and browser launch in one go.

## Security Model
- Bind only to loopback by default (`127.0.0.1` + random port). Optionally support UDS.
- Generate a per-session token stored with `0600` permissions.
- Require `Authorization: Bearer <token>` for all HTTP endpoints and websocket upgrades.
- Provide a bootstrap page that accepts a token input, sets an auth cookie, and redirects to `/`.
- Tokens protect access even when traffic is tunneled over SSH; the tunnel is transport security, not auth.
- Never bind to public interfaces unless explicitly requested.

## Implementation Outline
### Server changes (minimal)
- Default bind to `127.0.0.1` and random port when `--port` is not provided.
- Generate a session token on startup and store it in `~/.setta/run/<session>/token`.
- Create or extend session metadata file with port, bind address, and token path.
- Add auth middleware for HTTP and websocket routes.
- Add `__setta__/bootstrap` page that prompts for a token, sets a cookie, and redirects.
  - Optionally accept `?token=` for one-shot flows; immediately scrub the URL via `history.replaceState`.
- Print a concise connection hint on startup (includes session id and a `setta connect` line).

### CLI helper
- Add `setta connect` to orchestrate remote start + tunnel + browser open.
- Inputs: `ssh_target`, `workspace`, `python` (or `--venv`).
- Uses SSH to start Setta if not already running, then forwards a local port.
- Opens the browser to the bootstrap URL and keeps the tunnel alive.
- Add `setta status --connect-info` to list sessions and print the manual connect snippet.
- Add `--print-only` to `setta connect` for scripts or users who prefer manual tunnel control.

## No Local Setta Install
Users can still access the UI with only SSH installed by using manual tunnel + bootstrap URL.
The helper command remains optional. On the remote host, run `setta status --connect-info`
to print a ready-to-copy snippet that you paste locally. Include a plain URL plus optional
commands for macOS (`open URL`), Linux (`xdg-open URL`), Windows (`start URL`), or
`python -m webbrowser URL`.

## Testing and Verification
- Start Setta on a remote host, verify bind is loopback only.
- Attempt direct access to remote loopback port from another host, verify it is unreachable.
- Hit HTTP and websocket endpoints without a token, expect 401/close.
- Use bootstrap URL, verify cookie set and UI loads without token in the URL.
- Use `setta connect`, verify it starts the server and opens the UI locally.

## Open Questions
- Where should session metadata live and what fields are required for `setta connect`?
- What is the exact session metadata format for `setta connect` to read (schema + versioning)?
- Should tokens be short-lived or rotated on reconnect?
- What cookie name/path/expiry should the bootstrap page set?
- Should `setta connect` support a non-interactive mode for multi-session selection (e.g., `--latest`)?
- How should the remote process be detached (nohup, setsid, tmux, or a small wrapper)?
- How should the local tunnel port be chosen (fixed, random, or user-provided)?
- Should UDS be the preferred path on platforms that support it?
- What fields should appear in the multi-session list (id, started time, port, workspace)?
