# Manual SSH Tunnel (No Local Setta Install)

Use this flow when Setta is installed only on the remote machine and you want
to access the UI locally without running `setta connect`.

## Overview

- Setta binds to loopback by default, so you must SSH tunnel the port.
- You only need SSH locally; `setta` runs on the remote host.
- Tokens are short-lived. Re-run `setta status --connect-info` to mint a new one.

## Steps

1) SSH into the remote host and start Setta from the project workspace:
```sh
cd /path/to/project
source .venv/bin/activate && setta
```
If your environment uses a different activation command (venv/poetry/uv/conda),
use that instead.

2) In another remote shell, print connection info (this mints a fresh token):
```sh
cd /path/to/project
setta status --connect-info
```
This prints the remote port, a bootstrap URL with token, and a manual tunnel
snippet. Keep that output handy.

3) On your local machine, open the SSH tunnel using the port from step 2:
```sh
LOCAL_PORT=61000
ssh -N -L ${LOCAL_PORT}:127.0.0.1:<REMOTE_PORT> user@host -o ExitOnForwardFailure=yes
```
Keep this terminal open while you use the UI.

4) Open the bootstrap URL locally:
```
http://127.0.0.1:${LOCAL_PORT}/__setta__/bootstrap#token=<TOKEN>
```
If the fragment is stripped, open:
```
http://127.0.0.1:${LOCAL_PORT}/__setta__/bootstrap
```
and paste the token when prompted.

## Notes

- If the token expires, run `setta status --connect-info` again on the remote
  host to mint a new one (no server restart required).
- `setta stop --workspace /path/to/project --latest` runs on the remote host and
  stops the session.
