# Phase 4 Terminal Command Dispatch Prompt Readiness And Echo Stability

## Purpose

This doc records a bounded terminal-runtime hardening slice reopened after the
landed Phase 4 run-code work.

The trigger is concrete: repeated full-package `internal/httpapi` verification
still fails intermittently in the generated-entry temporary-terminal and
deployment run-code tests even though those routes pass in isolation. The
common boundary is backend-owned command dispatch into a freshly opened default
shell session.

The goal of this slice is to port the product semantics Python already relied
on for that boundary:

- prompt-readiness gating before backend-owned command dispatch
- line-clear dispatch so stale prompt input does not corrupt a launched command
- temporary width expansion for long echoed commands in narrow terminals

## Current Status

Completed before this slice:

- Phase 4 terminal transport, interrupt, delete, resize, and attach ownership
- Phase 4 IDE and deployment `runCode` ownership
- generated-entry temporary-terminal creation and idle top-level reuse

Current Go state after this slice:

- `internal/terminals.Service` now treats backend-owned `RunCommand(...)` as a
  prompt-aware dispatch path instead of writing into fresh default shells
  immediately after `Open(...)`
- auto-opened default-shell sessions now:
  - use a prompt-ready probe plus bounded fallback before backend-owned command
    dispatch
  - prepend `Ctrl+U` before backend-owned command dispatch so stale prompt
    input does not corrupt the launched command line
  - widen narrow terminal widths temporarily for long echoed commands
- default auto-opened shell resolution is now deterministic and rc-less for the
  built-in fallback shell path:
  - `bash --noprofile --norc -i`
  - `zsh -f -i`
  - `sh -i`
- explicit custom/open-command sessions remain immediately ready and unchanged
- repeated full-package verification now passes:
  - `./scripts/go.sh test ./internal/httpapi -count=3`

Relevant Python reference already covers this product behavior in
`backend/setta/terminals/terminals.py`:

- `terminalPromptIsReady`
- prompt-ready fallback
- `run_command_in_terminal(...)` waiting for readiness
- `Ctrl+U` line clear before dispatch
- temporary `RUN_COMMAND_ECHO_COLS` width expansion for long commands

## Scope

This slice covers:

- a Go-owned prompt-ready signal for auto-opened default-shell sessions
- a bounded readiness fallback so backend dispatch does not hang forever
- backend-owned command dispatch hardening in `internal/terminals`
- focused Go tests that prove the route/runtime behavior under repeated package
  load

## Non-Goals

- changing `runCode` route transport shape
- broad shell customization or settings-surface expansion
- replacing real PTY coverage with mocks/fakes
- reopening detached-run or `cliId` scope

## Inputs

- `docs/plans/go-backend-rewrite/testing-strategy.md`
- `docs/plans/go-backend-rewrite/archive/phase-4-terminal-run-code-migration.md`
- `docs/plans/go-backend-rewrite/archive/phase-4-generated-entry-runs-and-temp-terminals.md`
- `backend/setta/terminals/terminals.py`
- `backend/setta/terminals/run_code.py`
- `tests/terminals/test_run_code_attached_terminal.py`
- `internal/terminals/service.go`
- `internal/terminals/service_test.go`
- `internal/runs/service.go`
- `internal/httpapi/terminal_routes_test.go`

## Working Decisions

- keep explicit custom shell commands untouched, but make the built-in
  auto-opened default shell deterministic and rc-less after the ambient user
  shell startup path proved unstable under repeated package load
- treat prompt readiness as explicit terminal runtime state, not a sleep-based
  heuristic in `runs.Service`
- keep the route layer thin
  - `internal/httpapi`
  - `internal/runs`
  should continue delegating to terminal runtime behavior instead of open-coding
  dispatch waits
- port the Python long-command echo behavior only where it affects
  backend-owned command dispatch

## Implementation Notes

1. Add a prompt-ready barrier to Go terminal sessions that use the service's
   default shell.
   - explicit custom commands like `sh -c ...` or the interactive bash test
     fixture should stay immediately ready

2. Detect readiness from terminal output, not timer guesses.
   - use a Go-owned clear/ready marker written into the PTY
   - keep a bounded fallback so attaches and backend command dispatch do not
     block forever if the marker never appears

3. Make `RunCommand(...)` wait for prompt readiness.
   - this is the backend-owned dispatch boundary shared by IDE and deployment
     run-code routes

4. Clear stale prompt input and widen narrow terminals before long command
   dispatch.
   - follow the Python product behavior rather than inventing new heuristics

## Verification

- `./scripts/go.sh test ./internal/terminals -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'GeneratedEntry|DeploymentCodeAgainstSessionOverlay|RunCode' -count=1`
- `./scripts/go.sh test ./internal/httpapi -count=3`

## Progress Notes

- 2026-03-09: opened the focused stabilization slice after repeated package
  verification exposed flaky backend-owned command dispatch into fresh default
  shell sessions.
- 2026-03-09: landed prompt-ready backend dispatch, line-clear command writes,
  temporary long-command echo widening, and deterministic rc-less built-in
  default shell resolution in `internal/terminals`.

## Next Recommended Step

- treat this as the new Phase 4 terminal-runtime stabilization baseline
- keep future terminal follow-on work bounded to concrete caller needs like
  `cliId`, detached-run transport, or a separately chosen PTY-library follow-up
