# Go Rewrite Testing Strategy

## Goal

The Go-owned backend surface should match or exceed the meaningful product
behavior covered by the current Python tests.

Do not do a mechanical file-for-file test port unless that is the clearest
shape. Coverage can move. Behavioral coverage cannot shrink. Implementation
parity is not the goal.

## Core Rule

Treat the current Python tests as the minimum behavior map for the rewrite.

- Python tests tell us what behavior exists and what edge cases already matter.
- Go tests should match or exceed that coverage.
- The clean-break rule still applies: do not preserve legacy implementation
  details just because Python does them.
- If behavior intentionally changes, the new behavior must be explicit in code,
  tests, and docs.
- Before deleting a Python test, classify it:
  - `dead-path coverage`: the test only covered a Python path that no longer
    has a supported caller/runtime owner
  - `replacement coverage`: the behavior still matters and Go tests prove it
- If a test falls into `replacement coverage` and no Go test proves that
  behavior yet, add the Go test first.
- Every Python test on the pinned source baseline must have an explicit
  disposition in the parity ledger:
  - `Proved` with explicit Go or executable proof
  - or a justified omission such as `Retained Python boundary`,
    `Intentional divergence`, or `Dormant / unproven caller`
- A bare matrix citation is not a disposition.

## Default Change Loop

For any subsystem change:

1. Find the matching Python tests, existing Go tests, and current callers.
2. Classify each Python-covered behavior as retained product behavior or dead
   path.
3. Decide which behavior stays the same and which behavior is intentionally
   changing.
4. Add or update the Go tests that prove the intended behavior.
5. Add or update frontend tests too when the change alters frontend contracts,
   caller paths, or user-visible behavior.
6. Implement the code change.
7. Run the narrowest relevant suites first, then widen when the change crosses
   transport or ownership boundaries.

## Reference Inputs

Use these as the current behavior inventory:

- `tests/api`
- `tests/auth`
- `tests/share`
- `tests/start`
- `tests/types`
- `tests/websockets`
- `tests/mcp`
- `tests/llm`
- `tests/plugins`
- `tests/terminals`
- relevant docs under `docs/reference/`

## Test Layers

### Go Unit Tests

Use package-local Go tests for:

- parsing and validation
- pure helpers
- small state transitions
- codecs and serializers
- path and filesystem policy helpers
- converter and DTO shaping logic

### Go Integration Tests

Use integration tests for:

- auth and session flows
- project runtime behavior and persistence
- filesystem watchers
- subprocess supervision
- PTY and LSP session behavior
- plugin lifecycle and runtime refresh

Prefer real temp directories, real subprocesses, and production-like wiring.

### Black-Box Transport Tests

Exercise the running backend over real interfaces:

- HTTP
- websocket
- MCP

These are the highest-value tests for proving that the Go runtime still covers
the product surface.

### Frontend Tests

When the rewrite changes frontend-facing contracts or user-visible behavior,
update the relevant:

- Vitest tests for stores, reducers, hooks, and component behavior
- Playwright coverage for end-to-end contract and UI flows

### Cross-Platform Smoke Tests

Keep explicit coverage for:

- macOS
- Linux
- Windows

Highest-priority cross-platform areas:

- PTY behavior
- process lifecycle
- path normalization
- file locking
- filesystem operations

## Harness Expectations

Maintain and extend harnesses for:

- HTTP:
  - boot the Go server with temp config/state roots
  - issue authenticated and unauthenticated requests
  - assert status codes, envelopes, and payloads
- websocket:
  - cover authenticated connection setup
  - send and receive real messages
  - assert sequencing, replay, and close behavior where relevant
- MCP:
  - support server startup, client connection, tool listing, and invocation
- process/runtime:
  - support temp workspaces, subprocess launch/cleanup, PTY tests, and
    disposable git repos

## Disposable-State Rule

Any test involving:

- git history mutation
- file-backed app state
- workspaces
- subprocess side effects

must run in disposable temporary locations only.

Do not use the real repo state, existing `setta_files`, or developer git
history.

## Practical Rules

- Prefer real behavior over fake stand-ins.
- Prefer temp directories over checked-in mutable fixtures.
- Prefer black-box assertions for external behavior.
- Keep transport tests at the real transport layer.
- Fail loudly when environment assumptions are invalid.
- Add targeted tests around lifecycle, shutdown, queueing, persistence, and
  state-ordering hazards discovered during the port.
- If a structural cleanup is behavior-preserving and lowers rewrite risk, take
  it.
- If a refactor mainly improves elegance or package layout without reducing
  current correctness risk, defer it.

## Coverage Matrix Requirement

Maintain a living mapping between:

- Python test areas and capability groups
- corresponding Go test coverage
- uncovered gaps
- intentional drops or redesigns

A deleted Python test does not require a one-for-one Go test by filename or
shape. It does require either a dead-path justification or Go-side behavioral
proof for the surviving product behavior.

At parity-audit time, every Python source test should therefore be traceable to
an explicit disposition. Tests without one remain active backlog items even if
they are mentioned somewhere in the matrix.

A subsystem is not done just because code exists. It is done when the code
works, the relevant tests exist, and any remaining gap is explicit.

## Avoid

- one-for-one porting of Python tests without reconsidering test shape
- over-mocking runtime boundaries that should be exercised for real
- relying on local developer state
- silently dropping Python-covered behavior because the Go architecture differs

## Success Condition

The rewrite is complete only when the Go-owned backend has a test surface that
is at least as behaviorally comprehensive as the Python backend it replaces,
with stronger black-box coverage around the real runtime boundaries.
