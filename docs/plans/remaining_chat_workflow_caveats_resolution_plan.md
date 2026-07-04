# Remaining Chat Workflow Caveats Resolution Plan

Date: 2026-07-04

## Goal

Resolve the remaining caveats from
`docs/plans/review_and_workflow_trajectory_implementation_order_plan.md`
without reopening completed workflow trajectory work.

The live Codex caveat is resolved: `env -u OPENAI_API_KEY
./scripts/test_chat_workflows.sh --live-only` passed after the local Codex
approval policy was changed from deprecated `on-failure` to `never`.

This plan covers the remaining items:

- clean broad deterministic Electron chat/workflow gates;
- deepen post-commit startup failure injection coverage;
- add workflow trajectory page-size hardening without limiting total chat or
  trajectory length.

## Non-Goals

- Do not cap the total number of transcript blocks, run items, or run item
  output chunks that a user can view.
- Do not replace pagination with a larger one-shot response.
- Do not add compatibility shims, old-field aliases, dual paths, silent
  fallbacks, broad catch-all error handling, or heuristic provider parsing.
- Do not treat a focused pass as proof that the broad deterministic gate is
  healthy.

## Ordering Principles

- Reproduce broad-suite failures in focused targets before changing code.
- Fix the narrow failing contract first, then rerun the focused target, then
  rerun the broad gate.
- Keep tests on production main/preload/renderer/HTTP/store paths for Electron
  workflows.
- Keep Go-owned contracts and values in Go. If the renderer needs a new shared
  value, generate the TypeScript surface instead of hardcoding a mirror.

## Phase 0: Baseline And Reproduction

Start by confirming the working tree and current focused health.

Suggested commands:

- `git status --short --branch`
- `pnpm -C desktop build`
- `env -u OPENAI_API_KEY ./scripts/test_chat_workflows.sh --live-only`

Then reproduce each remaining broad-suite issue independently:

- Codex protocol row wait:
  `node desktop/tests/electron/chat-workflows.test.mjs --codex-protocol-only --keep-artifacts`
- Workflow activity listener warning:
  `node desktop/tests/electron/workflow-activity-feed.test.mjs --skip-build --keep-artifacts`
- Transcript scroll timing: add a focused `--transcript-scroll-only` selector
  first if the issue is still relevant, then use that focused selector instead
  of relying on the long deterministic suite.

Do not start with
`node desktop/tests/electron/chat-workflows.test.mjs --deterministic-only` as
the primary debugging tool. Use it only after focused failures are fixed.

## Phase 1: Broad Deterministic Gate Cleanup

### 1. Codex Protocol `rows: []` Failure

Problem statement: prior broad deterministic runs reached a Codex protocol
workflow and failed while waiting for rows, with captured state showing
`rows: []`.

Implementation approach:

- Reproduce with `--codex-protocol-only --keep-artifacts`.
- Inspect the recorded artifact directory, renderer logs, backend probe output,
  and screenshots for the exact missing readiness edge.
- Determine whether rows are absent because protocol events were not emitted,
  not forwarded, not rendered, or the test asserted before the pane was ready.
- Fix the actual contract. Prefer deterministic readiness from production state
  or explicit UI state over sleeps.
- Keep fake Codex protocol behavior typed and explicit.

Focused verification:

- `node --check` for touched Electron `.mjs` files.
- `node desktop/tests/electron/chat-workflows.test.mjs --codex-protocol-only`

### 2. Transcript Scroll Timing

Problem statement: one broad deterministic run failed in transcript-scroll with
a bottom-tolerance timing assertion; a focused direct rerun later passed
`transcript-scroll` and `transcript-scroll-reload`.

Implementation approach:

- Add `--transcript-scroll-only` to
  `desktop/tests/electron/chat-workflows.test.mjs` if this area needs more
  work.
- Reproduce with artifacts before changing scroll behavior.
- If the bug is in the test, make the assertion wait on stable scroll metrics
  from the rendered transcript instead of a transient post-scroll measurement.
- If the bug is in the UI, fix transcript virtualization or scroll anchoring so
  the bottom state is stable after streamed content, reload, and pagination.

Focused verification:

- `node desktop/tests/electron/chat-workflows.test.mjs --transcript-scroll-only`
- The existing focused renderer tests for transcript components if touched.

### 3. Workflow Event Listener Warning

Problem statement: `workflow-activity-feed.test.mjs` reached the updated
coverage, then failed the final renderer-console gate because
`MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11
workflow:event listeners added` was recorded.

Implementation approach:

- Reproduce with
  `node desktop/tests/electron/workflow-activity-feed.test.mjs --skip-build --keep-artifacts`.
- Trace each `workflow:event` subscription from main, preload, and renderer
  setup.
- Ensure each subscription has one owner and is disposed when the page,
  workspace, pane, or test context is closed.
- Avoid increasing max listener limits unless the listener count is proven to be
  intentional and bounded. The expected fix is usually ownership/cleanup.

Focused verification:

- `node --check` for touched Electron `.mjs` files.
- Relevant Vitest tests for touched renderer or IPC code.
- `node desktop/tests/electron/workflow-activity-feed.test.mjs --skip-build`

### 4. Broad Gate Rerun

After the focused targets pass, run:

- `node desktop/tests/electron/chat-workflows.test.mjs --deterministic-only`

If it fails in a new unrelated scenario, record that scenario with artifacts and
return to focused reproduction. Do not claim the broad gate is clean until this
command passes.

## Phase 2: Post-Commit Startup Failure Injection Coverage

Current coverage injects transcript-ingest startup failures for normal sends,
workflow-agent sends, and queued promotion. Add coverage for later synchronous
startup failures inside `startPostCommitHarnessTurnLocked`.

The invariant for every case:

- the committed run becomes failed with the specific injected error;
- the assistant message becomes error;
- no active run or liveness record remains;
- the harness is not started when the failure occurs before launch;
- a later normal send works;
- queued promotion uses the committed promoted run, not a stale queued copy.

### 1. Publish Failure

Add focused tests where `postCommitHarnessTurnStart.Publish` returns an error
after the active turn is registered and transcript ingest has been created.

Suggested coverage:

- normal chat send publish failure;
- workflow-agent send publish failure;
- queued promotion publish failure.

Expected result: `abortPostCommitHarnessTurnStartLocked` cancels the context,
fails the run, clears active state, marks the assistant message as error, and
returns the original publish error.

### 2. Delivery Input Failure

Add focused tests where `postCommitHarnessTurnStart.DeliveryInput` returns an
error after publish succeeds.

Suggested coverage:

- normal chat delivery rebuild failure;
- workflow-agent delivery rebuild failure;
- queued promotion delivery rebuild failure if the setup is not excessively
  duplicative.

Expected result: the same cleanup invariant as publish failure, and no harness
turn request is recorded.

### 3. Harness Launch Failure

Add a harness implementation whose `StartTurn` returns a synchronous error that
represents reservation/setup failure before the provider turn is usable.

Suggested coverage:

- normal chat launch failure;
- workflow-agent launch failure;
- queued promotion launch failure.

Expected result: the run is failed, active state and liveness are clear, and a
later send can start a new run.

Focused verification:

- `./scripts/go.sh test ./internal/chat -run 'TestServicePostCommitStartupFailure'`
- `./scripts/go.sh test ./internal/runtime -run 'Test(Start|InvalidStartupConfiguration|GracefulShutdown|ShutdownDrainsActiveChatTurnBeforeClosingEvents)'`
- `node desktop/tests/electron/chat-workflows.test.mjs --post-commit-startup-failure-only`

## Phase 3: Workflow Trajectory Page-Size Hardening

This phase adds per-request page-size limits. It must not restrict total access
to long chats, long workflow agent trajectories, or long command output.

Desired behavior:

- zero `transcriptLimit` and `outputLimit` still use existing defaults;
- negative limits are rejected as they are today;
- positive limits above the maximum page size are rejected with clear errors;
- trajectories longer than the maximum page size remain fully viewable through
  repeated paginated requests.

Suggested owner constants in `internal/orchestrator/service_trajectory.go`:

```go
const (
	defaultWorkflowTrajectoryTranscriptLimit = 80
	defaultWorkflowTrajectoryOutputLimit     = 200
	maxWorkflowTrajectoryTranscriptPageSize  = 200
	maxWorkflowTrajectoryOutputPageSize      = 500
)
```

Add validation to `validateWorkflowNodeTrajectoryRequest`:

- reject `transcriptLimit > maxWorkflowTrajectoryTranscriptPageSize`;
- reject `outputLimit > maxWorkflowTrajectoryOutputPageSize`;
- keep `beforeBlockOrdinal` validation unchanged.

Test requirements:

- service-level test rejects oversized transcript page size;
- service-level test rejects oversized output page size;
- service-level test proves a trajectory longer than the max transcript page
  size is still accessible by requesting multiple transcript pages;
- service-level or HTTP test proves run-item output longer than the max output
  page size remains accessible through `nextOrdinal` pagination;
- HTTP endpoint test verifies oversized requests return a clear failure through
  `/workflows/nodes/trajectory`.

Renderer guidance:

- The current renderer should continue using safe page sizes below the maximum.
- If the renderer ever needs to know the maximum values, expose them from the
  Go-owned contract generator rather than duplicating constants in TypeScript.

Focused verification:

- `./scripts/go.sh test ./internal/orchestrator -run 'TestServiceReadWorkflowNodeTrajectory'`
- `./scripts/go.sh test ./internal/httpapi -run 'TestWorkflowNodeTrajectoryEndpoint'`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`

## Phase 4: Final Gate

After code changes are complete:

- `./scripts/format.sh`
- `./check_quality.sh --git-changes`
- `node desktop/tests/electron/chat-workflows.test.mjs --deterministic-only`
- `env -u OPENAI_API_KEY ./scripts/test_chat_workflows.sh --live-only`

Run `./scripts/check_supply_chain.sh` only if dependency manifests, lockfiles,
package manager configuration, Go module configuration, or supply-chain tooling
changed. That is not expected for this plan.

## Done Criteria

- Focused Codex protocol, transcript-scroll if applicable, and workflow
  activity-feed targets pass.
- The broad deterministic Electron chat workflow passes.
- Post-commit startup tests cover publish, delivery-input, and synchronous
  harness-launch failures for the relevant normal, workflow-agent, and queued
  paths.
- Workflow trajectory requests reject unsafe page sizes while preserving full
  access through pagination.
- Live Codex E2E remains passing with `OPENAI_API_KEY` unset and ChatGPT auth.
- The plan's final gate passes, or any remaining blocker is recorded with the
  exact command, failure, artifact path, and next owner.
