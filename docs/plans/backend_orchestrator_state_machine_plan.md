# Backend Orchestrator State Machine Plan

- **Date:** June 5, 2026
- **Status:** Proposed
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
- Do not add distributed workflow infrastructure such as Temporal unless local durable execution becomes insufficient.

## Product Model

The backend should separate three concepts:

- **Workflow definition:** The saved graph: nodes, edges, action configs, gateway configs, loop configs, and validation metadata. Definitions are workspace-scoped, and a workspace may contain multiple workflow definitions. Reusable cross-workspace templates are a future layer over workspace definitions.
- **Workflow execution:** A single run of a workflow definition, including current status, active nodes, iteration counters, completed nodes, failed nodes, pending approvals, and queued work.
- **Workflow event log:** Append-only records describing what happened: execution started, node scheduled, action started, stream output received, action completed, gateway resolved, loop advanced, execution failed, execution cancelled, execution completed.

This separation keeps definitions editable without corrupting historical executions and makes restart recovery deterministic.

## Suggested Backend Shape

Use a new backend domain package rather than embedding graph execution into `internal/chat`.

Suggested package names:

- `internal/orchestrator` for workflow definitions, validation, execution state, reducers, and scheduler logic.
- `internal/orchestrator/actions` or package-local action runner files for runner registration and action execution.
- `internal/httpapi` endpoints for workflow CRUD, execution control, and execution reads.

Generated TypeScript surfaces should continue to come from Go-owned contracts and the HTTP endpoint registry. Do not maintain manually mirrored frontend contract lists.

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
- Artifact paths.
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

Minimum durable records:

- Workflow definitions.
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

When workflow execution touches Codex harness behavior, chat run lifecycle, approvals, provider protocol handling, or streaming, add deterministic end-to-end app workflow coverage through production Electron/main/preload/renderer/HTTP/store paths per repository verification rules. Use a scripted fake Codex/provider harness first. Run live Codex E2E tests when `OPENAI_API_KEY` is present in `.env`; skip narrowly and report the skip when it is absent.

## Implementation Phases

### Phase 1: Definition Model And Validation

- Add Go-owned workflow definition types.
- Add node, edge, gateway, loop, and Codex action config types.
- Add validation with precise diagnostics.
- Add narrow HTTP endpoints for definition create/read/update/validate.
- Generate TypeScript contracts from backend-owned definitions.

### Phase 2: Durable Execution Core

- Add execution, node execution, token, and event log records.
- Implement reducer-style execution transitions.
- Implement start, end, basic action placeholder, AND join, XOR, OR, and loop guard behavior.
- Add deterministic backend tests without provider execution.

### Phase 3: Codex Action Runner

- Register `agent.codex`.
- Connect Codex action execution through existing production backend paths.
- Persist runner references and stream output into workflow activity.
- Support cancellation and structured completion signals.
- Add deterministic fake-harness workflow tests.

### Phase 4: First End-To-End Workflow

- Build the first complete workflow definition that exercises parallel actions, joins, structured routing, and loops.
- Support fresh Codex conversations per iteration when configured.
- Add structured tool/result handling for continue versus exit decisions.
- Add max-iteration enforcement.
- Add restart/recovery tests for active workflow executions.

### Phase 5: Frontend Projection

- Expose execution read models for the graph UI.
- Render workflow definitions and execution state from backend data.
- Keep Pixi interactions as controls and projections, not orchestration authority.
- Add frontend workflow smoke coverage only after backend semantics are stable.

### Phase 6: Additional Action Runners

- Add new action kinds behind the existing runner registry.
- Keep each runner config typed.
- Add safety and permission controls for executable nodes before enabling bash or Python.

## Settled Decisions

- Workflow definitions are workspace-scoped, and a workspace may contain multiple workflow definitions.
- Reusable cross-workspace templates are future work.
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

- The exact enum names and metadata fields for workflow-owned internal chats, including workflow definition ID, workflow execution ID, node ID, node execution ID, and visibility.
- Which chat operations are allowed directly from a workflow node details pane and which must route through orchestrator APIs, especially cancellation, steering, editing, and deletion.
- The first set of built-in condition predicates and how they are represented in generated TypeScript contracts.
