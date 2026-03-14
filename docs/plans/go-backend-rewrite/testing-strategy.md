# Go Rewrite Testing Strategy

## Goal

The Go test surface must match or exceed the meaningful product behavior
covered by the current Python tests.

This does not require a one-for-one port of Python test files.
Coverage can be reorganized, but it must not shrink.

## Core Rule

Treat the current Python tests as the minimum behavioral coverage map for the
rewrite.

That means:

- the Python suite is a capability inventory
- the Go suite should match or exceed that inventory
- fewer Go test files is fine
- less behavioral coverage is not fine

The clean-break rule still applies:

- do not preserve legacy implementation details just because Python does them
- do preserve or intentionally replace tested product behavior

## Testing Discipline During The Port

- The default question is "does the Go runtime preserve the intended
  behavior?", not "is this the final architecture?"
- If a structural cleanup is behavior-preserving and reduces rewrite risk, it
  is acceptable during the port.
- If a correctness hazard is discovered, add or update tests that expose it,
  then fix it in the smallest behavior-preserving way available.
- If a proposed refactor mostly improves elegance or package layout without
  reducing current correctness risk, defer it until after the Go runtime is
  proven.

## Reference Inputs

Use these when deciding what the Go tests must cover:

- `tests/auth`
- `tests/routers`
- `tests/websockets`
- `tests/project_state`
- `tests/mcp`
- `tests/llm`
- `tests/plugins`
- `tests/terminals`
- `tests/server_state`
- relevant backend reference docs under `docs/reference/`

## Coverage Model

### Unit Tests

Use package-local Go tests for:

- parsing and validation
- pure helpers
- small state transitions
- codecs and serializers
- request/response shaping helpers
- path and filesystem policy helpers

### Integration Tests

Use integration tests for:

- auth and session flows
- project runtime behavior
- persistence rules
- filesystem watchers
- subprocess supervision
- PTY and LSP session behavior
- plugin process lifecycle

Prefer real temp directories, real subprocesses, and production-like wiring.

### Black-Box Backend Tests

Exercise the running Go backend over real interfaces:

- HTTP
- websocket
- MCP

These are the highest-value tests for proving that the Go runtime still covers
the product surface represented by the Python suite.

### Cross-Platform Smoke Tests

Maintain explicit coverage for:

- macOS
- Linux
- Windows

Highest-priority cross-platform areas:

- PTY behavior
- process lifecycle
- path normalization
- file locking
- filesystem operations

### Disposable-State Tests

Any test involving:

- git history mutation
- file-backed app state
- workspaces
- subprocess side effects

must run in disposable temporary locations only.

Do not use the real repo state, existing `setta_files`, or the developer's git
history.

## Required Harnesses

- HTTP harness
  - boot the Go server with temporary config and state roots
  - issue authenticated and unauthenticated requests
  - assert status codes, envelopes, and payload shape
- WebSocket harness
  - support authenticated connection setup
  - cover mode-aware connection rules
  - send and receive real messages
  - assert sequencing and replay where relevant
- MCP harness
  - support server startup, client connection, tool listing, and invocation
- Process harness
  - support temporary workspaces, subprocess launch and cleanup, PTY tests, LSP
    tests, and disposable git repos

## Coverage Matrix Requirement

Maintain a living coverage matrix that maps:

- Python test areas and capability groups
- corresponding Go test coverage
- uncovered gaps
- intentional drops or redesigns

A subsystem is not done just because code exists.
It is done when the code works, the relevant Go tests exist, and the coverage
matrix shows the Python reference surface is matched or exceeded.

## Practical Rules

- Prefer real behavior over fake stand-ins.
- Prefer temp directories over checked-in mutable fixtures.
- Prefer black-box assertions for external behavior.
- Prefer direct subprocess execution for process-oriented subsystems.
- Keep transport tests at the real transport layer.
- Fail loudly when environment assumptions are invalid.
- Add targeted tests around lifecycle and persistence hazards discovered during
  the port, especially shutdown behavior, queueing, and state ordering.

## Avoid

- mechanical one-for-one porting of Python tests without reconsidering test
  shape
- over-mocking runtime boundaries that should be exercised for real
- relying on local developer state
- silently dropping Python-covered behaviors because the Go architecture is
  different

## Success Condition

The rewrite is only complete when the Go backend has a test suite that is at
least as behaviorally comprehensive as the Python suite it replaces, with
stronger black-box coverage around the real runtime boundaries.
