# Phase 4 Terminal Transport Migration

## Purpose

This doc narrows the current Phase 4 work to terminal transport migration on top
of the new Go-owned `internal/terminals` runtime.

The goal is to move the terminal-facing websocket and HTTP surfaces onto the Go
service boundary without dragging PTY/session logic back into handlers.

## Status

Current repo status as of 2026-03-06:

- `internal/terminals` now owns:
  - PTY-backed session lifecycle
  - share-session-aware terminal ids
  - attach/detach subscriptions
  - buffered history replay
  - input and resize operations
- Go websocket transport now includes:
  - `GET /ws/terminals/{projectID}/{sectionID}` in `internal/wsapi/routes.go`
  - route-level PTY integration tests in `internal/wsapi/routes_test.go`
  - app-level upgrade coverage in `internal/app/websocket_test.go`
- terminal HTTP transport still lives only in Python under:
  - `backend/setta/routers/terminals.py`

## Scope

This focused plan covers:

- terminal websocket attach/read/write/resize transport
- thin route wiring onto `internal/terminals`
- the first terminal-facing app-handler coverage through the real middleware stack
- follow-up route migration planning for terminal delete/kill surfaces

## Non-Goals

- implementing deployment share-policy enforcement in this slice
- recreating Python terminal-manager globals or prompt-ready heuristics
- migrating run-code orchestration in the same slice
- terminal metadata/process-tree broadcast parity
- preserving Python route shapes just because they already exist

## Inputs

- `docs/plans/go-backend-rewrite/phase-4-realtime-and-terminal-runtime.md`
- `docs/plans/go-backend-rewrite/spike-pty.md`
- `backend/setta/routers/terminals.py`
- `backend/setta/terminals/terminals.py`
- `tests/terminals/test_terminal_connect_race.py`
- `tests/terminals/test_terminal_resize_updates_winsize.py`
- `tests/terminals/test_terminals_session_filter.py`
- `docs/reference/sharing-mode-vs-ide-mode.md`
- `docs/reference/share-policy-flags.md`
- `frontend/src/state/hooks/terminals/terminal.ts`

## Working Decisions

- keep terminal transport thin:
  - handlers resolve auth/mode/path params
  - `internal/terminals` owns session lifecycle, history, input, and resize
- keep the terminal websocket payload model intentionally small:
  - outbound PTY output remains raw text frames
  - a ready marker remains a plain text frame
  - resize remains an explicit JSON control message
- use a Go-owned websocket route shape instead of carrying forward the Python
  client-id path segment
- start with IDE-mode websocket transport only
  - deployment/share/app terminal transport is deferred until Go has a real
    share-policy source of truth for `allowRun`
- keep terminal session ids share-session-aware even before deployment transport
  is exposed through routes

## Proposed Route Shape

### Websocket

- `GET /ws/terminals/{projectID}/{sectionID}`

Behavior:

- requires non-launcher mode and, for the first slice, full IDE mode
- opens or reuses the terminal session identified by
  `BuildTerminalID(sectionID, shareSessionID)`
- sends:
  - `SETTA_TERMINAL_READY`
  - buffered history if present
  - subsequent PTY output frames
- accepts:
  - raw text input frames
  - resize control messages:
    - `{"messageType":"terminalResize","rows":24,"cols":80}`

### HTTP

Deferred to follow-up slices:

- terminal delete surface
- terminal kill/interrupt surface

Those should land only after the websocket slice is stable and after we make an
explicit call on process interruption semantics.

## Implementation Slices

### Slice 1: IDE Websocket Transport

Deliver:

- websocket terminal route in `internal/wsapi`
- route wiring from `internal/app`
- route-level tests covering:
  - connect and ready marker delivery
  - history replay on attach
  - input writes reaching the PTY
  - resize control messages reaching the PTY
  - invalid control messages closing with an explicit websocket code

Acceptance:

- terminal websocket upgrades survive the normal app middleware stack
- terminal routes do not own PTY/session state directly
- history replay and resize behavior are covered with real PTY-backed tests

Status:

- complete

Completed:

- added `GET /ws/terminals/{projectID}/{sectionID}` under `internal/wsapi`
- kept the route boundary transport-only:
  - route handlers resolve auth/mode/path params
  - `internal/terminals` owns session reuse, history, input, and resize
- chose a clean-break Go route shape:
  - removed the Python client-id path segment
  - kept raw text output and explicit resize control messages so the frontend transport model stays simple
- kept deployment-mode transport explicitly out of this slice:
  - the route requires full IDE mode
  - share/app transport stays deferred until Go has a real `allowRun` policy source of truth

Tests:

- `internal/wsapi/routes_test.go`
  - ready marker + history replay over the live websocket route
  - PTY-backed input streaming
  - PTY-backed resize control handling
  - invalid resize payload close-code behavior
  - full-IDE gating
- `internal/app/websocket_test.go`
  - terminal websocket upgrade through the real app middleware stack
- full Go suite passes with `./scripts/go.sh test ./...`

### Slice 2: Delete/List HTTP Surface

Deliver:

- Go-owned HTTP route(s) for terminal deletion and enumeration
- route-level runtime resolution by project/share-session scope
- tests covering scoped deletion behavior

Acceptance:

- handlers do not reach into PTY maps directly
- route behavior is explicit for unknown or missing terminal ids

### Slice 3: Interrupt/Kill Surface

Deliver:

- explicit terminal interrupt/kill semantics in `internal/terminals`
- matching HTTP route(s)
- tests proving project-scoped process interruption behavior

Acceptance:

- kill semantics are defined by terminal runtime ownership, not by ad hoc shell
  assumptions
- the implementation has a clear cross-platform story, or is explicitly scoped
  away from unsupported platforms

## Open Questions

- do we want an explicit terminal-created event/message later, or is the ready
  marker enough for the first frontend migration?
- should the kill surface mean interrupt-first, hard-kill, or both?

Resolved In Slice 1:

- the first Go terminal websocket route stays IDE-only until share-policy enforcement exists in Go
- the ready marker is sufficient for the first transport slice; there is no separate terminal-created event

## Next Recommended Step

Implement Slice 2:

- migrate the first Go-owned HTTP terminal delete/list surface
- keep project/share-session scoping explicit in the handlers
- defer kill semantics until we make an explicit interrupt vs hard-kill decision
