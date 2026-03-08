# go-pty

- Module: `github.com/aymanbagabas/go-pty`
- Local status: pinned in `go.mod`
- Local version: `v0.2.2`
- Retrieved: 2026-03-07
- Official package docs: https://pkg.go.dev/github.com/aymanbagabas/go-pty
- Official repo: https://github.com/aymanbagabas/go-pty

## Why It Exists In This Rewrite

- PTY abstraction for Unix PTYs and Windows ConPTY
- avoids baking platform-specific PTY setup into repo-owned terminal logic
- keeps `internal/terminals` focused on session ownership and policy

Current planning note:

- this file describes the PTY dependency currently used by the codebase
- the rewrite docs now recommend a follow-up move to `github.com/creack/pty`
  for the Unix PTY path because it is the more conservative ecosystem choice
- keep this note until the code and `go.mod` actually change

## APIs We Use Now

- `pty.New`
- `Pty.Command`
- `Cmd.Start`
- `Cmd.Wait`
- `Pty.Read`
- `Pty.Write`
- `Pty.Resize`
- `Pty.Close`
- `UnixPty` type assertion in Unix-only interrupt handling

Current repo call sites:

- `internal/terminals/service.go`
- `internal/terminals/interrupt_unix.go`

## Usage Rules For This Repo

- PTY lifecycle is owned only by `internal/terminals`
- higher-level run planning and policy stay outside the library
- keep terminal-session cleanup explicit; always close PTY resources on session
  shutdown
- prefer repo-owned abstractions around session metadata and websocket attach
  behavior

## Relevant Upstream Guidance

- upstream README explicitly calls out Unix PTY support plus Windows ConPTY
- upstream notes that plain `os/exec` is not sufficient for Windows ConPTY
- on Unix, `pty.Cmd` is effectively a wrapper around `os/exec.Cmd` with PTY
  setup

## Gotchas

- keep platform-specific foreground-process-group logic behind Unix-only files
- do not spread `go-pty` types across unrelated packages
- terminal reuse decisions must come from repo-owned runtime state, not PTY
  heuristics
