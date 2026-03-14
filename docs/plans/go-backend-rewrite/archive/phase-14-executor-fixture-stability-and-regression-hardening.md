# Phase 14 Executor Fixture Stability And Regression Hardening

## Purpose

This doc records the first bounded stabilization slice after the landed Phase
14 runtime closeout.

The goal of this slice is not to reopen runtime ownership. It is to make the
completed external-agent executor regression suite deterministic under normal
package-level load while keeping those tests real:

- real temp directories
- real nested subprocess-backed fixtures
- real persisted run/runtime assertions

## Current Status

Completed before this slice:

- Phase 12 external-agent runtime, executor, and parity ownership
- Phase 13 non-runtime agentic transport ownership
- Phase 14 managed and run-chain runtime ownership
- Phase 14 caller/progress closeout confirming no remaining route/runtime gap

Current Go state after this slice:

- `internal/externalagents`
  - still keeps real subprocess-backed executor coverage for Codex, OpenCode,
    and Claude
  - now runs only the subprocess-backed executor lifecycle tests serially while
    leaving pure helper/parser coverage parallel
- shared executor-fixture wait constants now make terminal-state, cleanup, and
  approval/question waits explicit instead of scattering short ad hoc timeouts

## Scope

This slice delivered:

- bounded stabilization of the real executor regression tests in:
  - `internal/externalagents/codex_executor_test.go`
  - `internal/externalagents/opencode_executor_test.go`
  - `internal/externalagents/claude_executor_test.go`
- focused comments or shared constants where needed so the serial/timeout
  choice is explicit
- verification that the affected package passes reliably under repeated runs

## Non-Goals

- changing production executor behavior just to satisfy tests
- replacing real subprocess-backed coverage with mocks/fakes
- broad test-suite timing inflation outside the affected executor fixtures
- reopening Phase 12 or Phase 14 feature scope

## Inputs

- `docs/plans/go-backend-rewrite/testing-strategy.md`
- `docs/plans/go-backend-rewrite/archive/phase-12-codex-app-server-executor-runtime.md`
- `docs/plans/go-backend-rewrite/archive/phase-12-codex-rich-item-tool-result-and-mcp-status-parity.md`
- `docs/plans/go-backend-rewrite/archive/phase-14-run-chain-caller-and-progress-closeout.md`
- `tests/agentic/test_codex_app_server_adapter.py`
- `tests/agentic/test_codex_app_server_adapter_integration.py`
- `internal/externalagents/codex_executor_test.go`
- `internal/externalagents/opencode_executor_test.go`
- `internal/externalagents/claude_executor_test.go`

## Implementation Notes

1. Keep the subprocess-backed executor tests real.
   - These tests are the Go-side replacement for Python capability coverage
     around real adapter execution and persisted run ownership.

2. Treat fixture-process parallelism as the unstable boundary.
   - If a test launches nested test binaries or sidecar processes, prefer
     serial execution over broad timeout inflation.

3. Keep pure helper/parser tests parallel.
   - Only the subprocess-backed executor lifecycle tests should lose
     `t.Parallel()`.

4. Verify stability with repeated package runs.
   - This slice now has both repeated executor-only verification and a full
     package rerun after the test changes landed.

## Verification

- `./scripts/go.sh test ./internal/externalagents -run 'CodexExecutor|OpenCodeExecutor|ClaudeExecutor' -count=3`
- `./scripts/go.sh test ./internal/externalagents -count=1`

## Decisions Made

- prioritize deterministic real-process coverage over maximizing test
  parallelism
- keep this as a test-only stabilization slice instead of broadening into
  runtime code changes

## Progress Notes

- 2026-03-09: opened the focused stabilization slice for the real
  subprocess-backed external-agent executor tests.
- 2026-03-09: landed serial execution for the subprocess-backed Codex,
  OpenCode, and Claude executor lifecycle tests plus shared wait constants for
  the affected fixtures.

## Next Recommended Step

- treat the executor regression suite as the current stabilization baseline
- only reopen the agentic runtime area for a concrete new caller or feature
  request, not for speculative parity work
