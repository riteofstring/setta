# creack/pty

- Module: `github.com/creack/pty`
- Local status: planned follow-up candidate, not yet pinned directly in `go.mod`
- Official package page observed on 2026-03-08: `v1.1.24`
- Official package docs: https://pkg.go.dev/github.com/creack/pty
- Official repo: https://github.com/creack/pty

## Why It Is A Candidate

- conservative Unix PTY lifecycle package for the rewrite terminal runtime
- better ecosystem-confidence fit for the Unix path than a smaller
  cross-platform wrapper
- keeps the PTY dependency narrow while leaving Windows handling as an explicit
  later decision

## API Surface To Use If Adopted

- `pty.Start`
- `pty.StartWithSize`
- `pty.Setsize`
- `pty.InheritSize`

Likely paired with:

- `os/exec.Cmd`
- `*os.File` as the PTY handle

## Usage Rules For This Repo

- keep PTY lifecycle ownership inside `internal/terminals`
- do not spread `creack/pty` types across unrelated packages
- keep transport, session metadata, share-session scoping, and buffered
  history as repo-owned logic above the PTY handle
- treat Windows support as a separate explicit concern; do not imply it comes
  from this library

## Relevant Upstream Guidance

- package is a standard low-level Unix PTY helper in Go
- it is intentionally small and pairs naturally with `os/exec`
- the package is Unix-focused rather than a full cross-platform terminal
  abstraction

## Gotchas

- not a Windows PTY answer by itself
- examples are low-level; repo-owned runtime rules still need to sit above it
- resize, foreground-process-group handling, and session cleanup remain our
  responsibility
