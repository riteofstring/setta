# Spike: PTY

## Purpose

This doc now records the outcome of the PTY spike rather than a pending
pre-Phase-4 research task.

The rewrite no longer needs to decide whether a Go PTY layer is viable. That
decision is already represented by the `internal/terminals` runtime and the
Phase 4 follow-up docs that built on it.

What changed is the library recommendation. The current code landed on
`go-pty`, but the rewrite docs now prefer `creack/pty` for the Unix PTY path
because it is the more conservative and widely used choice.

## Status

Current repo status as of 2026-03-08:

- `github.com/aymanbagabas/go-pty` is still pinned in `go.mod`
- `internal/terminals/service.go` owns PTY-backed terminal session lifecycle
- `internal/wsapi/routes.go` and `internal/httpapi/terminal_routes.go` keep the
  websocket and HTTP layers thin above that service
- the focused Phase 4 terminal/runtime migration docs are complete
- the current rewrite recommendation is to move the Unix PTY path to
  `github.com/creack/pty` before treating the PTY library choice as fully
  settled

## Recommendation

Use `github.com/creack/pty` behind a custom `internal/terminals` service
boundary for the Unix PTY path.

Keep Windows PTY handling as an explicit follow-up instead of relying on a
smaller cross-platform wrapper as the default architecture choice.

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

The updated rewrite recommendation no longer treats Windows PTY handling as a
free consequence of the base PTY wrapper choice. If Windows terminal parity
still matters for the rewrite target, it should land as an explicit follow-up
over the Unix-first `creack/pty` path.

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

Treat PTY viability as proven, but treat the library choice as a small
follow-up rather than fully closed.

Future terminal work should start from the completed Phase 4 docs plus a
bounded `go-pty` to `creack/pty` follow-up inside `internal/terminals`, not
from reopening the broader terminal architecture.
