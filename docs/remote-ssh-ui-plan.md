# Plan: Lightweight SSH Remote UI

## Summary
This plan keeps the current workflow (install Setta in the project’s Python environment and start it from the project folder) while making SSH-based access secure and easy. The server binds only to loopback (or UDS), uses a per-session token for all HTTP and websocket access, and provides a simple manual tunnel flow plus an optional `setta connect` helper that wraps SSH + browser open.

## Goals
- Preserve the existing workflow: install Setta in the project’s Python env, run from the project folder.
- Make remote UI access safe by default (no public bind, token-gated routes).
- Keep SSH optional and manual-friendly, but also offer a one-command helper.
- Avoid a large refactor or new transport layer.
- Allow viewing the UI locally even without a local Setta install.

## Non-goals
- Replacing SSH with a new transport.
- Introducing a new global install requirement.
- Multi-tenant isolation on a shared machine with root users.
- Backward compatibility with prior insecure binding defaults.

## Best-Case UX
1. User boots laptop and opens a terminal.
2. SSH into the remote host and start Setta from the project env:
   ```bash
   ssh dev@buildbox
   cd ~/work/my-project
   source .venv/bin/activate
   setta
   ```
3. Setta prints a connection hint:
   ```text
   Setta running (session 9f2c4b)
   Listening on 127.0.0.1:61234 (remote)
   Connect from laptop:
     setta connect dev@buildbox --session 9f2c4b
   ```
4. On the laptop, the user runs the helper command. It opens the tunnel and browser automatically. The UI loads locally with auth already established.

## Manual Flow (Two SSH Sessions)
- SSH in and start Setta (as above).
- In a second terminal on the laptop, open a tunnel:
  ```bash
  ssh -L 127.0.0.1:61000:127.0.0.1:61234 dev@buildbox
  ```
- Open the browser using a one-time bootstrap URL:
  ```text
  http://127.0.0.1:61000/__setta__/bootstrap?token=<token>
  ```
The bootstrap endpoint sets an auth cookie and redirects to `/` so the token does not remain in the URL.

## Single SSH Session (Optional)
Users can do it in one command if they prefer:
```bash
ssh -L 127.0.0.1:61000:127.0.0.1:61234 dev@buildbox \
  "cd ~/work/my-project && source .venv/bin/activate && setta"
```
Note: this requires a known remote port so the `-L` forward can be set in advance. If Setta chooses a random port, use the two-session flow or pass `--port`:
```bash
ssh -L 127.0.0.1:61000:127.0.0.1:61234 dev@buildbox \
  "cd ~/work/my-project && source .venv/bin/activate && setta --port 61234"
```

## Helper Command UX (`setta connect`)
Example:
```bash
setta connect dev@buildbox \
  --workspace ~/work/my-project \
  --python ~/work/my-project/.venv/bin/python
```
Behavior:
- SSHes to the remote host.
- Starts Setta in the specified environment and folder if it is not already running (detached so it keeps running after the SSH command exits).
- Reads the remote port + session token.
- Opens a local tunnel and launches the browser to the bootstrap URL.
- Keeps the tunnel alive in the foreground so a single local terminal can drive the entire flow.
  - Runs in the foreground; `Ctrl+C` closes the tunnel.

Single-terminal local UX (primary):
- Users with a local Setta install can run `setta connect ...` from their laptop and never open a second terminal.
- The helper handles remote start, tunnel setup, and browser launch in one go.

## Security Model
- Bind only to loopback by default (`127.0.0.1` + random port). Optionally support UDS.
- Generate a per-session token stored with `0600` permissions.
- Require `Authorization: Bearer <token>` for all HTTP endpoints and websocket upgrades.
- Provide a bootstrap endpoint that sets an auth cookie and redirects to `/`.
- Never bind to public interfaces unless explicitly requested.

## Implementation Outline
### Server changes (minimal)
- Default bind to `127.0.0.1` and random port when `--port` is not provided.
- Generate a session token on startup and store it in `~/.setta/run/<session>/token`.
- Create or extend session metadata file with port, bind address, and token path.
- Add auth middleware for HTTP and websocket routes.
- Add `__setta__/bootstrap?token=...` endpoint to set a cookie and redirect.
- Print a concise connection hint on startup (includes session id and a `setta connect` line).

### CLI helper
- Add `setta connect` to orchestrate remote start + tunnel + browser open.
- Inputs: `ssh_target`, `workspace`, `python` (or `--venv`).
- Uses SSH to start Setta if not already running, then forwards a local port.
- Opens the browser to the bootstrap URL and keeps the tunnel alive.

## No Local Setta Install
Users can still access the UI with only SSH installed by using manual tunnel + bootstrap URL. The helper command remains optional.

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
- What cookie name/path/expiry should the bootstrap endpoint set?
- How should `setta connect` detect an existing server vs starting a new one?
- How should the remote process be detached (nohup, setsid, tmux, or a small wrapper)?
- How should the local tunnel port be chosen (fixed, random, or user-provided)?
- Should UDS be the preferred path on platforms that support it?
- How should multiple concurrent sessions per user be surfaced and managed?
