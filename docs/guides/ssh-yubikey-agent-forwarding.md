# SSH, YubiKeys, and Agent Forwarding

Setta treats SSH setup as an install-only path. Runtime transport moves to
Tailscale after setup, so touch-required keys should only be needed during the
interactive install session.

## Doctor Behavior

`setta doctor --json` should distinguish the common SSH agent states before
it recommends a source-control fix:

- `ssh-add -l` exit code 1 means an agent is reachable but has no identities.
- `ssh-add -l` exit code 2 means no agent is reachable from the Setta process.
- FIDO2/YubiKey identities show up as `sk-ssh-ed25519@openssh.com`,
  `sk-ecdsa-sha2-*`, `ED25519-SK`, or `ECDSA-SK`.

When doctor detects a security-key identity, its GitHub SSH probe must be
bounded and touch-aware. A failed probe should tell the user that a
security-key touch may be required and that touch-required keys cannot serve
unattended background pulls.

## SSH Installer Shape

If the SSH installer ever needs multiple SSH invocations, it should use a
two-phase connection:

1. Establish one interactive ControlMaster connection first. Do not use
   `BatchMode=yes` for this master connection. Make security-key touch or PIN
   prompts visible and allow a generous timeout.
2. Run subsequent probes and install commands with `BatchMode=yes` over the
   control socket.

Control sockets should live under `XDG_RUNTIME_DIR` or `~/.ssh`, not a shared
`/tmp` path. Preserve a manual terminal command fallback for cases where a GUI
process cannot see the user's `SSH_AUTH_SOCK`.

## Source-Control Mode

Forwarded YubiKey identities are for interactive work. A systemd service or
phone-only session cannot touch a key later, so unattended runtime pulls need
a repo-scoped deploy key instead of forwarded personal credentials.
