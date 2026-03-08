# Spike: PTY

## Purpose

This doc now records the outcome of the PTY spike rather than a pending
pre-Phase-4 research task.

The rewrite no longer needs to decide whether a Go PTY layer is viable. That
decision is already represented by the `internal/terminals` runtime and the
Phase 4 follow-up docs that built on it.

## Status

Current repo status as of 2026-03-08:

- `github.com/aymanbagabas/go-pty` is pinned in `go.mod`
- `internal/terminals/service.go` owns PTY-backed terminal session lifecycle
- `internal/wsapi/routes.go` and `internal/httpapi/terminal_routes.go` keep the
  websocket and HTTP layers thin above that service
- the focused Phase 4 terminal/runtime migration docs are complete

## Recommendation

Use `github.com/aymanbagabas/go-pty` behind a custom `internal/terminals`
service boundary.

Keep PTY details isolated from transport and product policy:

- PTY creation, process lifecycle, resize, history, and attachment stay in
  `internal/terminals`
- websocket attach/detach and HTTP command routes stay outside the PTY owner
- deployment/share input rules stay explicit product policy, not PTY behavior

## Outcome

### Behaviors to keep

The current Go runtime proves that these behaviors are worth keeping:

- PTY-backed shell/process launch
- streamed output fan-out to active attachments
- attach, detach, and reattach with buffered history replay
- explicit resize handling with service-owned stored dimensions
- clean termination and per-session deletion
- share-session-scoped terminal filtering
- explicit input gating for deployment/share restrictions

### Behaviors intentionally simplified

The rewrite does not need to preserve the Python terminal-manager shape.

The current Go direction intentionally keeps:

- transport ownership out of the PTY service
- session IDs and scope boundaries explicit
- server-owned command execution separate from raw user-input allowance
- reusable-terminal behavior bounded to explicit service APIs rather than
  implicit websocket lifetime coupling

### Cross-platform note

macOS and Linux viability are proven by the core terminal service coverage.

Windows support is still handled through the chosen PTY library plus
platform-specific helpers in `internal/terminals`, but Phase 4 did not treat
Windows UX polish as a blocker before the Unix path was stable.

## Exit Criteria Result

The original spike exit criteria are satisfied well enough to proceed:

- shell/process launch works
- streamed output, input writes, resize, and termination are understood
- attach/detach/reattach semantics are concrete in the service API
- the PTY boundary is explicit in `internal/terminals`

## Inputs

- `docs/reference/setta-realtime-behavior.md`
- `backend/setta/terminals/terminals.py`
- `tests/terminals/test_terminal_connect_race.py`
- `tests/terminals/test_terminal_resize_updates_winsize.py`
- `internal/terminals/service.go`
- `internal/terminals/service_test.go`
- `docs/plans/go-backend-rewrite/phase-4-realtime-and-terminal-runtime.md`

## Next Step

Treat this spike as closed.

Future terminal work should start from the completed Phase 4 docs or a new
bounded runtime follow-up, not from reconsidering the PTY library choice.
