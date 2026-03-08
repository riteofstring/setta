# Phase 4 Terminal Websocket Attach Lifecycle And Resize Regression Hardening

## Purpose

This doc narrows the next bounded Phase 4 follow-on to terminal websocket
regression hardening.

The terminal runtime, transport, run-code ownership, prompt-readiness
stabilization, and Unix PTY backend migration are already landed. What remains
thin is explicit regression coverage for terminal websocket lifecycle behavior
that the Python reference suite covered:

- disconnect and reattach over the websocket terminal route
- resize messages updating both PTY state and stored session dimensions

This is a hardening slice, not a new terminal feature slice.

## Current Status

Completed before this slice:

- Phase 4 realtime and terminal runtime ownership
- terminal websocket and HTTP transport ownership
- IDE and deployment `runCode` ownership for the current bounded scope
- prompt-ready/default-shell command-dispatch stabilization
- bounded Unix PTY backend migration to `github.com/creack/pty`

Current Go regression protection before this slice:

- `internal/terminals/service_test.go` covers:
  - attach/write/history/reattach behavior
  - direct service resize updating both PTY and cached session size
- `internal/wsapi/routes_test.go` covers:
  - terminal websocket connect sending ready/history
  - terminal resize messages changing PTY-visible size
  - invalid resize and deployment-mode rejection

What is still missing explicitly:

- route-level reattach after websocket disconnect with buffered history replay
- route-level proof that resize updates the stored terminal session dimensions,
  not only PTY-visible output

## Scope

This slice covers:

- adding focused websocket-route terminal lifecycle regressions in
  `internal/wsapi/routes_test.go`
- keeping the coverage aligned with the useful product semantics from the
  Python terminal reference tests
- updating the rewrite docs so this stabilization slice is discoverable later

## Non-Goals

- changing terminal runtime behavior
- changing terminal websocket transport semantics
- reopening PTY-library decisions
- adding `cliId` transport
- adding detached-run transport
- broadening Phase 4 into new terminal UX work

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-4-realtime-and-terminal-runtime.md`
- `docs/plans/go-backend-rewrite/phase-4-terminal-transport-migration.md`
- `docs/plans/go-backend-rewrite/phase-4-terminal-run-code-migration.md`
- `docs/plans/go-backend-rewrite/phase-4-terminal-command-dispatch-prompt-readiness-and-echo-stability.md`
- `docs/plans/go-backend-rewrite/phase-4-creack-pty-unix-backend-migration.md`
- `backend/setta/terminals/terminals.py`
- `backend/setta/routers/terminals.py`
- `tests/terminals/test_terminal_connect_race.py`
- `tests/terminals/test_terminal_resize_updates_winsize.py`
- `internal/wsapi/routes.go`
- `internal/wsapi/routes_test.go`
- `internal/terminals/service_test.go`

## Working Decisions

- keep the websocket transport thin; hardening should happen through tests
  unless a concrete bug appears
- translate the Python connect-race reference to the Go architecture we
  actually shipped:
  - Python waited for prompt readiness during websocket connect
  - Go sends the ready marker immediately on route attach and keeps prompt
    readiness inside backend-owned `RunCommand`
  - the closest Go lifecycle regression is disconnect plus later reattach with
    buffered history replay
- treat cached terminal size in `internal/terminals` as source-of-truth state
  that the route-level resize path must update, not just a PTY side effect

## Implementation Notes

1. Add a websocket disconnect/reattach regression.
   - first connection attaches, then disconnects
   - output written while disconnected still appears in buffered history
   - a second connection gets the ready marker plus replayed history

2. Tighten the route-level resize regression.
   - keep the PTY-visible size assertion
   - also assert the terminal session's stored `Columns` and `Rows`

3. Keep acceptance narrow.
   - `./scripts/go.sh test ./internal/wsapi -run 'Terminal' -count=1`
   - `./scripts/go.sh test ./internal/terminals -run 'Attach|History|Resize' -count=1`

## Progress Notes

- 2026-03-09: opened this focused Phase 4 hardening slice after confirming the
  current roadmap no longer points to another automatic terminal feature
  migration and that the remaining leverage is reference-suite expansion.

## Next Recommended Step

- if this slice lands cleanly, treat terminal websocket lifecycle hardening as
  current-scope complete
- only reopen terminal work for explicit Windows PTY follow-up or caller-backed
  features like `cliId` or detached-run transport
