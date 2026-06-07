# Backend Orchestrator State Machine Plan

- **Date:** June 5, 2026
- **Status:** Phase 1 through Phase 5 implemented; additional action runners deferred as future work
- **Scope:** Add backend-owned workflow/state-machine execution for the graph-based AI agent orchestrator. The frontend may render definitions and execution state later, but backend services own all graph logic, state transitions, persistence, scheduling, and action execution.

## Goal

Build a durable backend orchestration engine that can run graph-shaped AI workflows while keeping the frontend as a read-only projection and control surface.

The engine should support:

- Start and end points.
- Control nodes for fan-out, joins, conditional routing, and loop guards.
- Action nodes that initially run Codex-backed AI agents.
- Future action runners such as Claude, opencode, OpenHands, bash, Python, or other executable integrations.
- Loop iteration state, including optional maximum iteration counts.
- Structured completion signals from action nodes, such as "exit loop" or "actionable findings found".
- Durable recovery after app restart or interrupted executions.

This should be treated as a workflow/orchestration graph with state-machine semantics, not as a frontend statechart. Internally, simple state machines should still be used for node execution lifecycle, action runner lifecycle, approvals, cancellation, and recovery.

## Non-Goals

- Do not put orchestration authority in React, Pixi, Zustand, or renderer-local state.
- Do not require the frontend graph view before backend execution semantics are implemented.
- Do not infer branch decisions from prose assistant output. Use structured tool calls, typed action results, or explicit backend conditions.
- Do not require AI action nodes to call a Setta completion tool for ordinary "agent finished responding" completion.
- Do not build generic untyped `map[string]any` execution behavior as the primary architecture.
- Do not build a managed artifact registry in the initial implementation.
- Do not introduce SQLite, an external database, or a workflow runtime platform in the initial implementation.
- Do not add distributed workflow infrastructure such as Temporal unless local durable execution becomes insufficient.

## Product Model

The backend should separate three concepts:

- **Workflow definition:** The saved graph: nodes, edges, action configs, gateway configs, loop configs, and validation metadata. Definitions are workspace-scoped, and a workspace may contain multiple workflow definitions. Reusable cross-workspace templates are a future layer over workspace definitions.
- **Workflow definition version:** An immutable snapshot of a workflow definition used by executions. Editing a workflow creates a new version instead of changing the graph for already-started executions.
- **Workflow execution:** A single run of a workflow definition version, including current status, active nodes, iteration counters, completed nodes, failed nodes, pending approvals, and queued work.
- **Workflow event log:** Append-only records describing what happened: execution started, node scheduled, action started, stream output received, action completed, gateway resolved, loop advanced, execution failed, execution cancelled, execution completed.

This separation keeps definitions editable without corrupting historical executions and makes restart recovery deterministic.

## Suggested Backend Shape

Use a new backend domain package rather than embedding graph execution into `internal/chat`.

Suggested package names:

- `internal/orchestrator` for workflow definitions, validation, execution state, reducers, and scheduler logic.
- `internal/orchestrator/actions` or package-local action runner files for runner registration and action execution.
- `internal/httpapi` endpoints for workflow CRUD, execution control, and execution reads.

Generated TypeScript surfaces should continue to come from Go-owned contracts and the HTTP endpoint registry. Do not maintain manually mirrored frontend contract lists.

## Dependency Stance

The initial implementation should use a small custom Go workflow engine and the repo's existing JSON-file persistence style. Add third-party libraries only when they are widely used, actively maintained, and solve a clearly bounded problem better than local code.

Do not add a third-party workflow engine, Petri-net engine, BPMN engine, or embedded durable workflow runtime for v1. The core graph/token semantics, gates, loops, action scheduling, event history, and recovery behavior should be Setta-specific.

Expression libraries such as CEL or Expr may be evaluated later for advanced user-authored predicates, but built-in typed predicates should be implemented first.

## Node Categories

### Control Nodes

Control nodes do not execute external work. They transform graph tokens and execution state.

- `start`: entry point for an execution.
- `end`: terminal success point.
- `gateway.and`: releases output when all required inputs are true or completed.
- `gateway.or`: releases output when any required input is true or completed.
- `gateway.xor`: releases output when exactly one required input is true or completed.
- `decision`: selects an outgoing path from typed conditions or structured action results.
- `loop.guard`: owns loop iteration count, optional maximum iterations, and the decision to continue or exit.

The implementation should distinguish logical gates from decision routing:

- Logical gates aggregate input signals, such as "wait for all three reviewers" or "continue when any upstream check succeeds".
- Decision nodes choose downstream paths, such as "if the action result says issues remain, loop; otherwise end".

### Action Nodes

Action nodes run external or provider-backed work through a typed runner interface.

Initial action kind:

- `agent.codex`

Future action kinds:

- `agent.claude`
- `agent.opencode`
- `agent.openhands`
- `exec.bash`
- `exec.python`
- `subworkflow`
- `wait.humanApproval`
- `wait.externalEvent`

Each action kind should have a concrete Go config type and generated TypeScript discriminant. Unknown action kinds should fail validation loudly.

## Action Runner Contract

Every action runner should satisfy the same orchestration-facing contract:

- Validate its typed config.
- Start work for a node execution attempt.
- Stream structured events and text output.
- Return a terminal result: completed, failed, cancelled, or requires approval.
- Support cancellation when the underlying provider/runtime supports it.
- Optionally emit structured output fields and signals for downstream routing.

The orchestrator should not know provider-specific details. It should schedule an action and consume lifecycle events.

Codex-backed action nodes should integrate with the existing Codex harness through production backend paths. A workflow iteration that requires fresh conversations should create fresh Codex conversations or thread references by explicit config, not by clearing context heuristically.

Workflow AI action nodes should reuse the existing backend chat, harness, streaming, approval, transcript, and persistence paths. These chats should be marked as workflow-owned or internal so they can be excluded from normal master chat lists while still being available to workflow UI. A future node details pane can render an active agent's transcript and status by reusing the same chat UI components.

Executable action nodes should be a separate action family from AI agents because they need distinct safety controls:

- Working directory.
- Environment.
- Timeout.
- Command or script source.
- Output limits.
- Declared output path references.
- Cancellation behavior.

## Execution Semantics

Use token-based graph execution rather than a single "current state" pointer.

High-level behavior:

- Starting a workflow creates an execution instance and appends `execution.started`.
- The `start` node emits one or more ready tokens.
- Ready action nodes are scheduled by the backend scheduler.
- Each scheduled node creates a node execution record with an attempt number and loop iteration.
- Action runners append lifecycle events and terminal results.
- Control nodes consume completed incoming tokens and emit outgoing tokens according to their typed semantics.
- End nodes mark the execution complete when the configured terminal condition is satisfied.

Node lifecycle should be explicit:

```text
pending -> ready -> running -> succeeded
                         \-> failed
                         \-> cancelled
                         \-> waiting_approval
```

Execution lifecycle should be explicit:

```text
idle -> running -> completed
              \-> failed
              \-> stopped
              \-> cancelled
```

Use exhaustive typed states in Go and generated TypeScript. Avoid stringly typed status handling in shared contracts.

Loop guards should support optional maximum iteration counts. When a maximum is reached, the workflow should use an explicit terminal reason such as `limit_reached`, with a configurable policy to treat that limit as completed, failed, or stopped.

## Completion And Conditions

Completion detection should have useful defaults:

- AI agent action nodes complete successfully when the backend harness reports that the agent response/run finished successfully.
- AI agent action nodes may optionally call a Setta-owned structured signal tool when the workflow needs explicit routing data, such as "continue", "exit", or "has actionable findings".
- Script action nodes complete or fail from their process exit code by default.

Setta-owned signal tools are for structured decisions and result payloads, not for ordinary sequencing. A simple chain such as `Agent A -> Agent B` should work without the agent calling a special completion tool.

Gate and decision conditions should be represented as typed predicates over execution state, action status, structured action results, and script exit codes. The first implementation should include built-in predicates for common cases. The data model should leave room for a future expression condition, such as a sandboxed CEL-style expression, without requiring arbitrary script execution in v1.

Avoid arbitrary Python, shell, or JavaScript gate scripts in the first implementation. They complicate determinism, replay, security, dependency management, and restart recovery. Executable code should initially live in explicit action nodes, not hidden inside gate predicates.

## Example Workflow

The engine should be general-purpose enough to represent workflows like this multi-agent review loop:

```text
Start
  -> Reviewer A
  -> Reviewer B
  -> Reviewer C
  -> AND join
  -> Consolidator
  -> Loop decision
       actionable findings -> Fix issues -> Loop guard -> Reviewer A/B/C
       no actionable findings -> End
       max iterations reached -> End or Failed, based on workflow config
```

The important general semantics illustrated by this example are:

- Independent action nodes can run concurrently.
- AND joins release downstream work only after all required incoming branches finish successfully.
- Each loop iteration records distinct node execution attempts.
- Fresh agent conversations are explicit action config when a workflow requires them.
- Action nodes can drive routing through structured tool calls or typed action results.
- Maximum iteration enforcement is backend-owned and deterministic.

## Persistence And Recovery

Persistence should be designed before action execution is connected.

Use the repository's existing JSON-file storage approach for the initial implementation. The workflow store should still be event-shaped and recovery-friendly, but it should not require SQLite or another database in v1.

Minimum durable records:

- Workflow definitions.
- Workflow definition versions.
- Workflow executions.
- Node execution attempts.
- Active and completed tokens.
- Action runner references, such as Codex run IDs or thread IDs.
- Event log entries.
- Structured action result payloads and declared file path references when an action reports them.

Recovery rules:

- On app startup, scan running workflow executions.
- Reconcile running node executions with action runner state when possible.
- Mark unrecoverable interrupted node executions failed with a specific diagnostic.
- Never silently resume from incomplete in-memory state.
- Preserve enough event history for the frontend to render what happened after restart.

JSON storage should preserve basic crash-safety invariants:

- Append workflow events as discrete, durable records.
- Persist materialized execution state as derived snapshots when useful.
- Use stable idempotency keys for action scheduling and terminal events.
- Keep workflow store mutations serialized within the backend process.
- Use atomic file writes consistent with the existing store helpers.

## Outputs And Files

Do not build a managed artifact registry in the initial implementation.

Action nodes may write normal workspace files. When a workflow needs downstream nodes or the UI to know about those files, the action should report file path references through structured output, a Setta-owned signal tool, or action config. The backend should persist those reported references on the node execution, but it should not try to own every generated file, assign artifact IDs to all outputs, or enforce comprehensive file provenance in v1.

## HTTP And Eventing

Initial backend APIs should be narrow:

- Create/read/update/delete workflow definitions.
- Validate a workflow definition.
- Start a workflow execution.
- Cancel a workflow execution.
- Read execution summary.
- Read execution event/activity page.

Event streaming should reuse the backend event stream pattern where appropriate. Workflow events should be pushed, not polled.

## Validation Rules

Validate definitions before execution:

- Workflow definitions are workspace-scoped.
- A workspace may contain multiple workflow definitions.
- Exactly one start node for each workflow definition in the initial version.
- At least one end node.
- All edges reference existing nodes.
- Action node configs match their discriminated action kind.
- Gateway configs are complete and deterministic.
- Loop guards have valid optional maximum iteration values.
- Required action runners are registered.
- Cycles are allowed only through explicit loop constructs in the initial version.
- Unreachable nodes are rejected or reported as validation diagnostics.

## Testing Strategy

Start with deterministic backend tests for the orchestration reducer and scheduler:

- Start to end.
- AND fan-out and join.
- XOR branch selection.
- OR multi-branch selection.
- Loop continues until structured exit.
- Loop stops at maximum iterations.
- Action failure fails or routes according to config.
- Built-in completion predicates cover agent success, structured action signals, and script exit codes.
- Cancellation cancels active node executions.
- Restart recovery handles running, completed, and interrupted node executions.

When workflow execution touches Codex harness behavior, chat run lifecycle, approvals, provider protocol handling, or streaming, add deterministic end-to-end app workflow coverage through production Electron/main/preload/renderer/HTTP/store paths per repository verification rules. Use a scripted fake Codex/provider harness first. Run live Codex E2E tests when the local Codex CLI is signed in with ChatGPT auth; skip narrowly and report the skip when ChatGPT auth is unavailable.

## Implementation Phases

### Phase 1: Definition Model And Validation

Status: Implemented.

- Add Go-owned workflow definition types.
- Add node, edge, gateway, loop, and Codex action config types.
- Add validation with precise diagnostics.
- Add narrow HTTP endpoints for definition create/read/update/validate.
- Generate TypeScript contracts from backend-owned definitions.

### Phase 2: Durable Execution Core

Status: Implemented.

- Add execution, node execution, token, and event log records.
- Implement reducer-style execution transitions.
- Implement start, end, basic action placeholder, AND join, XOR, OR, and loop guard behavior.
- Add deterministic backend tests without provider execution.

### Phase 3: Codex Action Runner

Status: Implemented.

- Register `agent.codex`.
- Add workflow-owned/internal chat metadata before creating workflow agent chats.
- Exclude workflow-owned chats from normal master chat lists while keeping them readable by workflow UI, such as a future node details pane.
- Add a narrow backend chat service method for workflow agent turns so workflow execution does not use public master-chat behavior directly.
- Add an action runner/adapter boundary for `agent.codex`.
- Connect Codex action execution through existing production backend chat, harness, streaming, approval, transcript, and persistence paths.
- Persist runner references on workflow node executions, including hidden/internal conversation IDs, chat run IDs, and Codex thread/session/turn IDs when available.
- Reconcile chat/Codex terminal status back into `CompleteAction`.
- Support cancellation propagation from workflow execution to active workflow-owned chat/Codex runs.
- Support structured completion signals when a Setta-owned signal/result tool is used.
- Add deterministic fake-harness workflow tests.

Phase 3 should preserve the reducer/action-runner boundary. The reducer should not call Codex directly. It should produce durable node execution state and consume terminal action results from the runner path.

The action lifecycle should distinguish durable scheduling from actual runner startup. If an action node is marked `workflow.action.started`, the runner should either already have started through a durable backend path or have enough persisted runner references for restart reconciliation.

### Phase 4: First End-To-End Workflow

Status: Implemented.

- Build the first complete workflow definition fixture that exercises parallel Codex action nodes, an AND join, structured routing, a loop guard, and an end state.
- Use the scripted/fake Codex harness first so the workflow is deterministic and runs through production backend chat, harness, HTTP, store, and event-stream paths.
- Verify that configured fresh conversations create distinct workflow-owned/internal chats for repeated agent nodes across loop iterations.
- Verify that structured Setta workflow result signals can drive continue versus exit routing.
- Verify max-iteration enforcement and each configured limit policy: completed, failed, and stopped.
- Verify cancellation of an active workflow cancels active workflow-owned chat/Codex runs and preserves the correct terminal workflow state.
- Verify restart/recovery behavior for active workflow executions. The current initial policy may mark interrupted running executions failed; the test should assert the intended behavior explicitly.
- Add deterministic end-to-end app workflow coverage through production Electron/main/preload/renderer/HTTP/store paths before calling Phase 4 complete.
- Run live Codex E2E tests when the local Codex CLI is signed in with ChatGPT auth; skip narrowly and report the skip when ChatGPT auth is unavailable.

### Phase 5: Frontend Projection

Status: Implemented.

- Expose execution read models for the graph UI.
- Render workflow definitions and execution state from backend data.
- Keep Pixi interactions as controls and projections, not orchestration authority.
- Add frontend workflow smoke coverage only after backend semantics are stable.

### Future Work: Additional Action Runners

Additional action runners are not required for the initial Codex-backed workflow v1. Add them when a specific next runner is selected and its safety, permissions, and lifecycle requirements are clear.

- Add new action kinds behind the existing runner registry.
- Keep each runner config typed.
- Add safety and permission controls for executable nodes before enabling bash or Python.

## Settled Decisions

- Workflow definitions are workspace-scoped, and a workspace may contain multiple workflow definitions.
- Workflow executions reference immutable workflow definition versions.
- Reusable cross-workspace templates are future work.
- Initial persistence uses JSON files, consistent with the existing app data stores.
- SQLite or another database is deferred until JSON persistence becomes a clear bottleneck or correctness limitation.
- Third-party libraries are only added when they are widely used, actively maintained, and solve a bounded problem.
- XNOR is not part of the initial control-node model.
- Maximum iteration handling uses an explicit terminal reason such as `limit_reached`, with workflow or loop config deciding whether that reason is treated as completed, failed, or stopped.
- Initial gate and decision conditions use built-in typed predicates over action completion, structured action signals, script exit codes, and execution state.
- Arbitrary Python, shell, JavaScript, or other scriptable gate predicates are deferred. The condition model should leave room for a future sandboxed expression mode.
- AI action nodes do not need to call a Setta completion tool for ordinary completion. Setta-owned signal tools are only for structured routing data or result payloads.
- Managed artifacts are not part of the initial implementation.
- Workflow outputs are normal workspace files plus persisted structured results or reported file path references when nodes provide them.
- Workflow AI action nodes reuse existing backend chat, harness, streaming, approval, transcript, and persistence paths.
- Workflow-owned chats are hidden from normal master chat lists but can be shown by workflow UI, such as a node details pane.

## Implementation Details To Specify

- Which chat operations are allowed directly from a workflow node details pane and which must route through orchestrator APIs, especially cancellation, steering, editing, and deletion.
