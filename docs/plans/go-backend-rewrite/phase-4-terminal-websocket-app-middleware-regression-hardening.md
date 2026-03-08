# Phase 4 Terminal Websocket App Middleware Regression Hardening

## Purpose

This doc records the bounded Phase 4 app-level terminal websocket
regression-hardening follow-on that landed after the completed runtime, route,
and PTY backend slices.

The terminal runtime, websocket route coverage, run-code ownership,
prompt-readiness stabilization, Unix PTY backend migration, and route-level
terminal websocket reconnect/resize hardening were already landed. What
remained thin was proving those same terminal websocket lifecycle semantics
through the real app middleware stack.

This is a regression-hardening slice, not a new terminal feature slice.

## Current Status

Completed before this slice:

- Phase 4 realtime and terminal runtime ownership
- terminal websocket and HTTP transport ownership
- IDE and deployment `runCode` ownership for the current bounded scope
- prompt-ready/default-shell command-dispatch stabilization
- bounded Unix PTY backend migration to `github.com/creack/pty`
- route-level websocket regressions for reconnect/history replay and resize
  session state in `internal/wsapi/routes_test.go`

Current Go app-level terminal coverage after this slice:

- `internal/app/websocket_test.go` proves:
  - terminal websocket upgrade through the real middleware stack
  - ready-marker delivery through the app-owned route wiring

What this slice added:

- app-level reconnect after websocket disconnect with buffered history replay
- app-level proof that resize updates stored terminal session dimensions

## Scope

This slice covered:

- focused app-level websocket regressions in `internal/app/websocket_test.go`
- reuse of the existing Go terminal runtime as the source of truth
- rewrite-doc updates so the middleware-stack hardening is discoverable later

## Non-Goals

- changing app websocket transport semantics
- changing terminal runtime behavior
- reopening PTY-library decisions
- adding deployment/share terminal websocket transport
- adding `cliId` or detached-run transport

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-4-realtime-and-terminal-runtime.md`
- `docs/plans/go-backend-rewrite/phase-4-terminal-transport-migration.md`
- `docs/plans/go-backend-rewrite/phase-4-terminal-websocket-attach-lifecycle-and-resize-regression-hardening.md`
- `backend/setta/routers/terminals.py`
- `tests/terminals/test_terminal_connect_race.py`
- `tests/terminals/test_terminal_resize_updates_winsize.py`
- `internal/app/websocket_test.go`
- `internal/wsapi/routes.go`
- `internal/wsapi/routes_test.go`

## Working Decisions

- keep terminal websocket transport thin; add coverage before changing code
- treat `internal/wsapi` route tests as behavior-level coverage and
  `internal/app/websocket_test.go` as middleware-stack coverage
- translate Python's connect-race intent to the Go shape already shipped:
  reconnect/history replay through app wiring matters more than reproducing
  Python's prompt-ready wait during websocket connect

## Implementation Notes

1. Added an app-level reconnect/history replay regression in
   `internal/app/websocket_test.go`.
   - first websocket attaches and receives the ready marker
   - the socket disconnects
   - output written while disconnected remains buffered
   - a second websocket receives ready plus replayed buffered history

2. Added an app-level resize-state regression.
   - sent a resize control message through the real app websocket route
   - verified the stored terminal session `Columns` and `Rows`

3. Kept acceptance narrow and middleware-focused.
   - `./scripts/go.sh test ./internal/app -run 'TerminalWebsocket' -count=1`
   - `./scripts/go.sh test ./internal/app -run 'Websocket' -count=1`
   - `./scripts/go.sh test ./internal/wsapi -run 'Terminal' -count=1`

## Verification

- `./scripts/go.sh test ./internal/app -run 'TerminalWebsocket' -count=1`
- `./scripts/go.sh test ./internal/app -run 'Websocket' -count=1`
- `./scripts/go.sh test ./internal/wsapi -run 'Terminal' -count=1`

## Progress Notes

- 2026-03-09: opened this focused app-level follow-on after confirming the
  route-level terminal websocket regressions were landed but the real app
  middleware stack still only had basic terminal upgrade coverage.
- 2026-03-09: landed app-level reconnect/history replay and resize-state
  regressions over the real websocket middleware stack without changing
  terminal runtime behavior.

## Next Recommended Step

- treat the current-scope terminal websocket regression suite as complete
  across both route and app levels
- only reopen terminal work for explicit Windows PTY follow-up or caller-backed
  features like `cliId` or detached-run transport
