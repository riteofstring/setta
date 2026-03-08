# Go Rewrite Testing Strategy

## Goal

The Go rewrite needs a serious test strategy from the start.
The minimum bar is:

- Go tests must cover at least the product behavior covered by the current Python tests.
- In practice, the Go test surface should meet or exceed that behavioral coverage.

This does **not** mean we need one Go test per Python test file.
It means no meaningful capability area should lose coverage during the rewrite.
If one Go test subsumes several Python tests cleanly, that is fine. Coverage may be reorganized, but it must not shrink.

## Core Rule

Treat the current Python tests as the minimum behavioral coverage map for the rewrite.

That means:

- the Python suite is a capability inventory
- the Go suite should match or exceed that inventory
- fewer files is acceptable
- less behavioral coverage is not acceptable

The clean-break rule still applies:

- we are not preserving legacy implementation details just because Python does them
- we are preserving or intentionally replacing tested product behavior

## Sources Of Truth

Use these as the reference inputs when deciding what the Go tests must cover:

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
- the capability inventory produced in Phase 0

## Coverage Model

### 1. Package-Level Unit Tests

Use package-local Go tests for:

- parsing and validation
- pure helpers
- small state transitions
- codecs and serializers
- request/response shaping helpers
- path and filesystem policy helpers

These should be fast and numerous.

### 2. Service-Level Integration Tests

Use integration tests for:

- auth/session flows
- project runtime behavior
- persistence rules
- filesystem watchers
- subprocess supervision
- PTY and LSP session behavior
- plugin process lifecycle

These should prefer real temp directories, real subprocesses, and production-like wiring.

### 3. Black-Box Backend Tests

Use black-box tests that exercise the running Go backend over real interfaces:

- HTTP
- websocket
- MCP

These are the most important tests for ensuring the Go rewrite still covers the product surface represented by the Python suite.

### 4. Cross-Platform Smoke Tests

Maintain explicit coverage for:

- macOS
- Linux
- Windows

The highest-priority cross-platform areas are:

- PTY behavior
- process lifecycle
- path normalization
- file locking
- filesystem operations

### 5. Disposable-Repo And Disposable-Workspace Tests

Any test involving:

- git history mutation
- file-backed app state
- workspaces
- subprocess side effects

must run in disposable temporary locations only.

Do not use:

- the real repo state
- existing `setta_files`
- the developer’s actual git history

## Recommended Go Test Layout

Once the Go codebase exists, prefer:

- package-local `*_test.go` files for unit tests
- a dedicated integration test area for process and server tests
- `testdata/` for static fixtures
- temporary directories for mutable state

Do not design the test layout around the current Python package structure.
Design it around the Go runtime boundaries.

## Required Harnesses

### HTTP Harness

Should support:

- booting the Go server with temporary config/state roots
- issuing authenticated and unauthenticated requests
- asserting status codes, envelopes, and payload shape

### Websocket Harness

Should support:

- authenticated connection setup
- mode-aware connection rules
- send/receive of real websocket messages
- sequencing and replay assertions where relevant

### MCP Harness

Should support:

- MCP server startup
- MCP client connection
- tool listing
- tool invocation
- scoped and unscoped call assertions

### Process Harness

Should support:

- temporary workspace creation
- subprocess launch and cleanup
- PTY session tests
- LSP server tests
- disposable git repos where needed

## Coverage Matrix Requirement

Maintain a living coverage matrix for the rewrite.

The matrix should map:

- Python test areas and capability groups
- corresponding Go test coverage
- uncovered gaps
- intentional drops or redesigns

A subsystem is not “done” just because code exists.
It is done when:

- the Go code works
- the relevant Go tests exist
- the coverage matrix shows the Python reference surface is matched or exceeded for that subsystem

## Subsystem Completion Rule

For each major subsystem:

- auth
- project state
- websockets
- terminals
- MCP
- plugins
- LSP
- LLM

do not consider the subsystem complete until the Go tests cover at least the behavior represented by the relevant Python tests and docs.

## Practical Testing Rules

- Prefer real behavior over fake stand-ins.
- Prefer temp directories over checked-in mutable fixtures.
- Prefer black-box assertions for external behavior.
- Prefer direct subprocess execution for process-oriented subsystems.
- Keep transport tests at the real transport layer.
- Fail loudly when environment assumptions are invalid.

## Things To Avoid

- one-for-one mechanical porting of Python tests without reconsidering test shape
- over-mocking runtime boundaries that should be exercised for real
- relying on the developer’s local state
- silently dropping Python-covered behaviors because the Go architecture is different

## Phase Expectations

### Phase 0

- define the first coverage matrix
- define the first black-box harnesses
- identify the minimum reference suites

### Phase 1

- establish package-level and integration-level test structure
- test config, paths, runtime boot, error envelopes, and atomic writes

### Later Phases

- expand the coverage matrix subsystem by subsystem
- add black-box tests as each new transport-facing subsystem lands
- keep cross-platform smoke coverage current

## Success Condition

By the end of the rewrite, the Go backend should have a test suite that is at least as behaviorally comprehensive as the Python suite it replaces, with stronger black-box coverage around the real runtime boundaries.
