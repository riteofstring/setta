# Spike: PTY

## Purpose

Reduce uncertainty around cross-platform terminal support before Phase 4 depends on it.

## Questions To Answer

- Is `aymanbagabas/go-pty` good enough across macOS, Linux, and Windows?
- What are the real constraints around resize, reconnect, cancellation, and termination?
- Which current terminal behaviors are worth preserving, and which should be simplified?
- What internal service boundary keeps PTY details isolated from websocket/session logic?

## Scope

This spike should cover:

- shell launch
- streamed output
- input writes
- resize handling
- termination
- reconnect or reattach behavior
- basic session history retention strategy

## Out Of Scope

- full frontend xterm integration
- launcher/runtime-control integration
- production-grade terminal UX polish
- shell-specific customization

## Candidate Default

- `github.com/aymanbagabas/go-pty`
- `golang.org/x/term`

## Prototype Requirements

### Core Session

- create a PTY-backed shell
- send input
- read output
- terminate cleanly

### Session Management

- attach one client
- detach
- reattach
- verify output history behavior is acceptable

### Cross-Platform Checks

- macOS
- Linux
- Windows

Windows does not need perfect polish in the spike, but it does need a credible viability signal.

## Evaluation Criteria

- cross-platform behavior
- API ergonomics
- control over lifecycle
- resize behavior
- termination reliability
- reconnection friendliness
- amount of OS-specific branching required

## Deliverable

At the end of the spike we should have:

- a recommendation on PTY library choice
- a list of terminal behaviors to keep
- a list of terminal behaviors to intentionally simplify
- a proposed `internal/terminals` service boundary

## Exit Criteria

- PTY sessions work on macOS and Linux
- Windows viability is understood well enough to proceed or to call it a blocker
- resize and termination behavior are understood
- attach/detach semantics are concrete enough for Phase 4 planning

## Failure Conditions

- Windows behavior is too weak or too opaque
- session lifecycle control is unreliable
- the library leaks too much transport-specific behavior into terminal management

## Follow-Up If Successful

- lock the PTY choice in the master plan
- define terminal session types and websocket attachment semantics for Phase 4
