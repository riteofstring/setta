# go-pty

- Module: `github.com/aymanbagabas/go-pty`
- Local status: pinned in `go.mod` for the Windows-specific PTY backend only
- Local version: `v0.2.2`
- Retrieved: 2026-03-07
- Official package docs: https://pkg.go.dev/github.com/aymanbagabas/go-pty
- Official repo: https://github.com/aymanbagabas/go-pty

## Why It Exists In This Rewrite

- current Windows-specific PTY backend path
- keeps Windows compilation explicit while the Unix runtime uses `creack/pty`
- keeps `internal/terminals` focused on session ownership and policy

Current planning note:

- the bounded Unix `creack/pty` migration is now landed
- this file remains relevant because Windows compilation still uses `go-pty`
- any future removal now depends on an explicit Windows PTY follow-up, not the
  Unix backend choice

## APIs We Use Now

- `pty.New`
- `Pty.Command`
- `Cmd.Start`
- `Cmd.Wait`
- `Pty.Read`
- `Pty.Write`
- `Pty.Resize`
- `Pty.Close`
Current repo call sites:

- `internal/terminals/pty_backend_windows.go`

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

- keep Windows-specific PTY handling isolated from the Unix backend
- do not spread `go-pty` types across unrelated packages
- terminal reuse decisions must come from repo-owned runtime state, not PTY
  heuristics
