# Phase 4 creack/pty Unix Backend Migration

## Purpose

This doc records the bounded PTY-library follow-on already called out by the
roadmap and PTY spike outcome.

The terminal runtime is functionally landed. What remains open is the library
choice for the Unix PTY path. The current code still uses
`github.com/aymanbagabas/go-pty`, while the rewrite docs now recommend a move
to `github.com/creack/pty` as the more conservative Unix choice.

The goal of this slice is to make that library change without reopening
terminal transport, run-code policy, or share-mode product semantics.

## Current Status

Completed before this slice:

- Phase 4 terminal runtime ownership
- terminal websocket and HTTP transport ownership
- terminal run-code ownership for IDE and deployment
- prompt-ready/default-shell command-dispatch stabilization
- PTY spike closeout recommending a bounded Unix `go-pty` to `creack/pty`
  follow-up

Current Go state before this slice:

- `internal/terminals/service.go` still imports and depends directly on
  `github.com/aymanbagabas/go-pty`
- Unix-only foreground-process-group helpers in:
  - `internal/terminals/interrupt_unix.go`
  - `internal/terminals/reusable_unix.go`
  still depend on the `go-pty` type surface
- `github.com/creack/pty` is already present in `go.mod`, but only as an
  indirect dependency

## Scope

This slice covers:

- introducing a small repo-owned PTY session interface inside
  `internal/terminals`
- moving the Unix PTY backend implementation to `github.com/creack/pty`
- keeping Windows PTY handling explicit instead of pretending the Unix backend
  solves it
- updating focused docs and dependency notes so the repo state matches the code

## Non-Goals

- changing terminal transport behavior
- changing `runCode` route semantics
- broad terminal UX changes
- finishing Windows PTY redesign in the same slice
- changing reusable-session or interrupt product rules

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/spike-pty.md`
- `docs/plans/go-backend-rewrite/phase-4-realtime-and-terminal-runtime.md`
- `docs/plans/go-backend-rewrite/phase-4-terminal-command-dispatch-prompt-readiness-and-echo-stability.md`
- `docs/reference/dependencies/go-pty.md`
- `docs/reference/dependencies/creack-pty.md`
- `backend/setta/terminals/terminals.py`
- `tests/terminals/test_terminal_connect_race.py`
- `tests/terminals/test_terminal_resize_updates_winsize.py`
- `internal/terminals/service.go`
- `internal/terminals/interrupt_unix.go`
- `internal/terminals/reusable_unix.go`
- `internal/terminals/service_test.go`

## Working Decisions

- keep PTY details behind `internal/terminals`; transport remains thin
- introduce a repo-owned PTY session interface first so service logic does not
  depend on a vendor type surface
- switch only the Unix PTY backend in this slice
- keep Windows compilation explicit:
  - either keep a Windows-specific backend implementation or keep the current
    explicit unsupported behavior where appropriate
  - do not imply Windows parity comes “for free” from the Unix library move
- preserve current terminal behavior and tests; this is a backend swap, not a
  product redesign

## Implementation Notes

1. Introduce a small PTY backend interface.
   - cover read, write, resize, close, wait, pid, and fd-control needs

2. Land a Unix backend using `creack/pty`.
   - pair it with `os/exec.Cmd`
   - keep resize and process-group control explicit

3. Keep Windows separate.
   - do not force the Unix backend abstraction into a fake cross-platform story
   - compile cleanly on Windows with an explicit backend file

4. Keep acceptance at the existing terminal-runtime behavior level.
   - focused `internal/terminals` PTY integration tests
   - route-level `internal/httpapi` verification for `runCode`

## Verification

- `./scripts/go.sh test ./internal/terminals -count=1`
- `./scripts/go.sh test ./internal/httpapi -count=1`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Progress Notes

- 2026-03-09: opened the focused Unix PTY backend migration slice after the
  earlier terminal-runtime and stabilization work was complete.

## Next Recommended Step

- land the internal PTY interface plus Unix `creack/pty` backend
- update the PTY spike and dependency docs so the library recommendation no
  longer lags the code
