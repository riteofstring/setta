# Backend Workflow Kernel Architecture Plan

- **Date:** June 8, 2026
- **Status:** Phase 4 in progress; workspace-file storage/null-workflow, basic editor UX, diagnostic marker, selected-run node details, and explicit draft/run/version state slices complete; later runner extensions deferred
- **Scope:** Evolve Setta's backend workflow orchestration into a durable local-first workflow kernel with replaceable action runners.

## Executive Summary

Setta should own the workflow product contract: workspace-saved graph definitions, immutable execution snapshots, run state, approvals, event history, transcripts, structured routing outputs, cancellation, and recovery semantics.

External workflow engines and AI-agent frameworks should not become the saved graph format or the source of truth for run lifecycle. They should be optional execution substrates or node-level runners behind Setta-owned contracts.

The recommended architecture is:

```text
Setta visual workflow graph
  -> Setta workflow kernel
      -> Setta event log and materialized run state
          -> Capability-based action runners
              -> Codex now
              -> sandboxed processes, MCP, sidecars, agent SDKs, or workflow backends later
```

The Codex-only workflow kernel, runner boundary, transactional runtime persistence, and recovery/reconciliation work are complete. The current implementation target is finishing the functional workflow graph editor polish on top of workspace JSON definitions: workflow-level configuration and deeper node-detail refinements where real use exposes gaps. Existing workflow persistence and contracts can still be replaced directly where the target design is clearer; no compatibility layers are required.

## Product Position

Setta is not only a chat UI, a workflow engine, or an agent SDK wrapper. It is a local-first visual AI workflow product.

That means the stable product artifact is the Setta workflow graph file and its run history, not LangGraph internals, LangFlow flows, Temporal histories, n8n workflows, OpenAI Agents SDK traces, or Codex chat records.

The core rule:

> Setta owns the outer workflow. Runners own how individual nodes do work.

## Long-Term Product Direction

The current implementation plan is only for the executable workflow kernel. Long term, Setta's graph/canvas may also include non-executable product nodes, such as high-level concepts, workspace-object mappings, artifacts, and structured agent mindmaps.

Those future graph layers are a reason to keep the saved Setta graph model app-owned and extensible. They are not part of this implementation plan. Concept graphs, workspace-object mapping, and agent-mindmap visualization should be treated as separate future projects built on top of the same Setta-owned product graph, not as requirements for the first workflow-kernel rewrite.

## Goals

- Keep workflow definitions portable, Setta-owned, workspace-local, and git-trackable.
- Preserve immutable workflow versions for every execution.
- Keep the workflow lifecycle capable of supporting heterogeneous node execution later.
- Provide deterministic routing from structured outputs, signals, status, and exit codes.
- Support fan-out, joins, bounded loops, approvals, cancellation, and restart recovery.
- Persist meaningful state transitions before external side effects where possible.
- Expose consistent UI state for Codex now and preserve the same model for sandboxed processes, MCP, Python, LangGraph, LangFlow, and other runners later.
- Allow advanced users to bring existing agent implementations without making those frameworks the product architecture.

## Non-Goals

- Do not make LangGraph, Temporal, n8n, LangFlow, or any other external graph model the saved workflow format.
- Do not expose framework names as the primary user-facing node taxonomy.
- Do not implement many runners before the kernel contract is stable.
- Do not build a general-purpose distributed workflow platform in the local desktop runtime.
- Do not infer routing decisions from prose assistant output.
- Do not add arbitrary JavaScript, Python, or executable-code expressions inside routing predicates.
- Do not add backward-compatibility shims, legacy support paths, data migrations, transitional adapters, dual-read/write persistence, or old-field aliases. There are no users or existing workflow data to preserve.
- Do not add non-Codex runners as a shortcut before the Codex-only workflow kernel is correct.
- Do not implement concept nodes, workspace-object mapping, or agent mindmap visualization as part of this workflow-kernel plan.

## Current Baseline

The existing architecture already has several correct foundations:

- `internal/orchestrator` owns workflow definitions, versions, executions, reducer logic, graph projection, and workflow events.
- The reducer implements token-based execution for start, end, action, AND, OR, XOR, and loop guard nodes.
- Node executions persist attempts, iterations, idempotency keys, runner refs, results, and pending approvals.
- Codex-backed agent work is integrated as an action runner through production chat paths.
- Workflow-owned conversations are marked internal so normal chat lists can hide them while workflow UI can still inspect them.
- Authored workflow definitions are workspace-local JSON files under `.setta/workflows/`.
- The current kernel runtime persistence is SQLite-backed for immutable definition versions, executions, events, materialized run state, and recovery state.
- The renderer can show a blank null-workflow canvas, materialize a workspace JSON definition on first graph edit, list and select workspace workflows, persist node, edge, and layout edits through backend workflow definition APIs, expose toolbar add/validate/run/draft/details controls, attach validation diagnostics to affected draft nodes and edges, make draft/run/version state explicit, and open type-aware node details in Niri for drafts and selected run projections.

The main gaps are:

- Node details now cover basic draft details for Route, Merge, Barrier Join, Start, and End, plus selected-run node execution, result, activity, branch, token, and event inspection. Deeper route history, transcript presentation, and type-specific editing controls can still be refined.
- Workflow-level naming and configuration controls are still thin.
- `agent.codex` is the only concrete action kind today.

## Target Architecture

### Layers

```text
Renderer
  - Visual graph editor
  - Run graph projection
  - Node activity/transcript panels
  - Approval controls

HTTP/API boundary
  - Workflow CRUD
  - Run start/cancel/signal/approve
  - Event stream
  - Run/activity reads

Workflow kernel
  - Graph validation
  - Scheduler
  - Reducer/state machine
  - Routing evaluator
  - Join/loop coordinator
  - Cancellation manager
  - Approval manager
  - Recovery reconciler

Persistence
  - Workspace JSON definition files
  - SQLite immutable execution snapshots
  - SQLite append-only run events
  - SQLite materialized run state
  - Node attempts
  - Runner state
  - Approval state
  - Transcript/activity references

Runners
  - Core: Codex agent runner
  - Later: sandboxed process runner
  - Later: MCP tool runner
  - Later: direct provider runner
  - Later: Python/TypeScript sidecar runner
  - Later: LangGraph/OpenAI Agents SDK/LangFlow runner
  - Later: external workflow backend runner
```

### Source Of Truth

Authored workflow definitions are workspace-local JSON files under `.setta/workflows/`. They are deterministic, reviewable, and diffable project artifacts. The current file shape stores `schemaVersion`, `id`, `name`, `description`, and `WorkflowDefinition.graph`; workspace identity and timestamps are derived from the containing workspace and file metadata rather than persisted in the authored artifact.

SQLite remains the source of truth for runtime state: immutable snapshots used by runs, event history, node attempts, tokens, approvals, recovery state, runner refs, and materialized projections. When a run starts, the kernel captures the workspace definition file into an immutable version snapshot so later edits do not change that run.

The workflow kernel owns:

- Workflow graph schema.
- Workflow definition versioning.
- Execution lifecycle.
- Node attempt lifecycle.
- Token, edge, join, and loop state.
- Structured routing inputs.
- Approval lifecycle.
- Cancellation lifecycle.
- Event stream contract.
- Recovery rules.

Runners own:

- Provider-specific execution details.
- Framework-specific internal state.
- Tool loop implementation.
- Sub-agent or subgraph internals.
- Streaming raw provider events before normalization.

The renderer owns:

- Editing interactions.
- Layout.
- Visual projection.
- User controls.

The renderer must not own graph execution authority.

## Product Workflow Model

The saved workflow graph should stay Setta-native and live as a workspace file rather than being trapped in global app state.

Minimum definition concepts:

- Nodes.
- Edges.
- Node configs.
- Editor layout metadata.
- Input and output schemas.
- Routing conditions.
- Approval policies.
- Runner requirements.
- Version metadata.

Minimum execution concepts:

- Run ID.
- Workflow version ID.
- Node attempts.
- Attempt status.
- Idempotency key.
- Input snapshot.
- Output snapshot.
- Runner refs.
- Tokens.
- Loop counters.
- Pending approvals.
- Terminal reason.
- Event cursor.

The graph should distinguish product node intent from implementation runtime.

Good user-facing node examples:

- `Agent Task`
- `Run Command`
- `Call MCP Tool`
- `Extract Structured Data`
- `Human Approval`
- `Route`
- `Join`
- `Loop Guard`
- `Subworkflow`

Avoid making the normal graph palette primarily framework-branded:

- `LangGraph Node`
- `OpenAI Agents SDK Node`
- `Pydantic AI Node`

Those can exist as advanced runner choices under a task-oriented node when they are useful.

## Functional Graph Editor Direction

Now that the Codex-backed workflow kernel, SQLite runtime persistence, and recovery/reconciliation phases are complete, the next product surface should be the functional workflow graph editor.

The editor should author workspace-saved workflow definition files. It must not treat a runtime projection, Pixi-local mutable graph, or global SQLite row as the durable product artifact. The detailed editor UX, edge semantics, virtual-port model, workspace-file storage direction, and Phase 4 deliverables live in [Functional Workflow Graph Editor Plan](functional_workflow_graph_editor_plan.md).

Core direction:

- Author workspace JSON files containing `WorkflowDefinition.graph`; render `WorkflowGraphProjection` as a read-only runtime overlay.
- Treat an empty graph as a valid draft/null workflow; opening the graph editor should show an editable blank canvas, and the first graph edit should materialize the workspace JSON file automatically.
- Persist editor layout through a Go-owned workflow contract and regenerate TypeScript.
- Keep node type, validation state, runtime state, and editor affordance visually distinct.
- Treat initial edges as typed control transitions, not data flow, artifact references, or knowledge links.
- Keep routing conditions typed and backend-owned; do not route from arbitrary expression strings or prose output.
- Treat virtual ports as editor affordances that compile to real `WorkflowEdge` and `WorkflowCondition` data.
- Defer executable-code, concept, mindmap, and true wait-state `State` nodes until their backend semantics are explicit.

## Runner Contract

The runner contract should model what the workflow kernel needs, not what any one provider exposes.

Conceptual interface:

```text
Runner.Kind() -> action kind
Runner.Capabilities(config) -> capabilities
Runner.ValidateConfig(config) -> diagnostics
Runner.Start(ctx, request, eventSink) -> start result
Runner.Cancel(ctx, request) -> result
Runner.Signal(ctx, request) -> result
Runner.Recover(ctx, request, eventSink) -> recovery result
```

Capabilities should include:

- Supports streaming text.
- Supports structured output.
- Supports cancellation.
- Supports resume/recovery.
- Supports human approval.
- Supports tool calls.
- Requires network.
- Requires sidecar process.
- Can run offline.
- Can safely retry.
- Side-effect policy.

Runner events should be normalized into Setta-level events:

```text
attempt.started
text.delta
tool_call.started
tool_call.output
approval.requested
approval.resolved
artifact.reported
structured_output.received
attempt.completed
attempt.failed
attempt.cancelled
attempt.recovery_required
```

The kernel should not route from raw transcript text. Routing should use explicit structured outputs, signals, status, exit code, or validated schema fields.

## Concrete Runner Examples

Detailed examples for Codex, sandboxed process, MCP tool, Python extraction, and agent subgraph runners live in [Backend Workflow Kernel Runner Examples](../reference/backend_workflow_kernel_runner_examples.md).

## Persistence Architecture

The serious durable runtime should use transactional local persistence.

Preferred target:

- SQLite.
- WAL mode.
- Append-only event log.
- Materialized run state.
- Transactional updates for events and state.

Core tables or logical stores:

- `workflow_versions`
- `workflow_runs`
- `workflow_run_events`
- `workflow_node_attempts`
- `workflow_tokens`
- `workflow_loop_counters`
- `workflow_approvals`
- `workflow_runner_state`
- `workflow_runner_refs`
- `workflow_activity_refs`
- `workflow_artifact_refs`

Each transition should commit:

- The event records.
- The materialized state changes.
- The updated event cursor/ordinal.

Important transition boundaries:

- Run started.
- Token consumed/emitted.
- Node scheduled.
- Attempt started.
- Runner refs attached.
- Approval requested.
- Approval resolved.
- Action completed/failed/cancelled.
- Cancellation requested.
- Run completed/failed/cancelled.

## Recovery Semantics

Recovery should be explicit, not inferred from missing in-memory state.

On startup:

1. Open persistence.
2. Scan non-terminal workflow runs.
3. Load materialized state and last committed event position.
4. For active node attempts, call the owning runner's recovery hook if supported.
5. If the runner can prove the attempt is still active, reattach event streaming.
6. If the runner completed while Setta was down, reconcile the terminal result.
7. If the runner cannot recover safely, mark the attempt as `recovery_required` or failed according to side-effect policy.
8. Resume scheduling from committed workflow state.

Recovery outcomes should be typed:

- `recovered_running`
- `recovered_completed`
- `recovered_failed`
- `retry_scheduled`
- `manual_recovery_required`
- `failed_interrupted`

The current behavior of failing interrupted runs is acceptable for a first implementation, but it should not be the long-term architecture for workflows that are expected to survive restart.

## Side Effects And Retry Policy

Every action node should declare a side-effect policy:

- `pure`: safe to recompute.
- `idempotent`: safe when using idempotency key.
- `at_least_once`: may repeat; user accepts duplicates.
- `requires_approval`: must pause before side effect.
- `manual_recovery`: cannot be retried automatically after uncertain failure.
- `compensatable`: has a configured compensating action.

Every node attempt should have:

- `run_id`
- `node_id`
- `attempt_id`
- `idempotency_key`
- `input_hash`
- `workflow_version_id`

The kernel should assume exactly-once side effects are not available unless the external system provides idempotency.

## Transcript And Activity Model

Do not overload final node output with transcript content.

Separate:

- Final node output: routing and downstream input.
- Transcript/activity: user-visible details.
- Tool events: audit and debugging.
- Artifacts: file or external references.
- Metrics: cost, token use, latency, provider metadata.

The workflow node inspector should be able to show:

- Current status.
- Runner type.
- Streamed text.
- Tool calls.
- Approval history.
- Final structured output.
- Route explanation.
- Errors and recovery status.

## UX Benefits

The user sees one coherent workflow experience:

- Same run button.
- Same node statuses.
- Same event stream.
- Same approval UI.
- Same cancel behavior.
- Same route explanation.
- Same restart behavior.
- Same history model.

This lets advanced implementations stay hidden unless the user wants details.

Example top-level workflow:

```text
Start
  -> Review PR
  -> Run Tests
  -> Route On Test Result
      success -> Summarize
      failure -> Fix Issues -> Run Tests
```

Possible implementations:

- `Review PR`: Codex agent runner.
- `Run Tests`: sandboxed process runner.
- `Fix Issues`: Codex agent runner.
- `Summarize`: direct model runner.

The user does not need to learn four execution systems. Setta provides one workflow surface.

## Framework Stance

### Process Sandboxing

Use a sandbox runtime instead of building process safety from scratch.

The first candidate is Anthropic Sandbox Runtime (`srt`) because it targets the exact shape Setta needs: arbitrary local processes, command execution, local MCP servers, filesystem restrictions, and network restrictions without requiring containers.

Setta's default process policy should follow the same broad security shape as Codex local execution:

- Network off by default.
- Workspace-scoped reads and writes by default.
- Protected repository and app configuration paths.
- Explicit approvals for boundary crossings.
- Narrow allowlists instead of broad access.

Docker or Podman can be an optional strict mode for users who already have a container runtime and want a stronger isolation boundary.

`wazero` is a future option for safe custom action plugins compiled to WebAssembly. It is not a replacement for package managers, build tools, or normal local command execution.

Do not silently fall back from sandboxed execution to raw local process execution. If no sandbox provider is available, the node should fail with a clear capability error or require an explicit trusted-command approval mode.

### LangGraph

Use as an advanced agent subgraph runner when a node needs internal agent loops, conditional routing, interrupts, or checkpoints.

Do not make LangGraph the saved Setta workflow format.

### OpenAI Agents SDK

Use for OpenAI-first agent nodes when handoffs, guardrails, tracing, or SDK-native tool orchestration are valuable.

Do not make it the workflow run lifecycle.

### LangFlow

Use as an advanced import/run option when a user already has a LangFlow flow they want to reuse inside Setta.

LangFlow's headless API, SDK/client surfaces, MCP support, custom components, traces, and flow tooling are useful integration points. The fact that LangFlow has a visual frontend is not the reason to keep it out of Setta's core.

The Setta node should be task-oriented, such as `Triage Customer Report` or `Answer From Knowledge Base`, with LangFlow selected as the runner implementation. LangFlow may run the internal RAG or agent composition through a local or external LangFlow server.

Setta should provide the node input schema, output schema, approval handling, cancellation, transcript/activity capture, final routing output, and outer run history.

Do not make LangFlow the saved Setta workflow format, graph editor, durable execution source of truth, security boundary, workspace journal, or default local runtime.

The reason is authority, not product differentiation. LangFlow's strongest extension mechanism is arbitrary Python/custom component execution in a Python server. That is powerful for AI app composition, but Setta's kernel needs enforceable local workspace guarantees across every runner:

- Per-node filesystem, network, environment, secret, and protected-path policy.
- Approvals tied to concrete side effects such as network access, writes outside the workspace, `.git` changes, commits, or destructive commands.
- Durable side-effect history, including which runner changed which files and which artifacts were produced.
- Restart recovery after an interrupted local command, agent run, or partial file edit.
- Process supervision for timeouts, output caps, cancellation, and child-process cleanup.
- A normalized event log that can feed one UI timeline across Codex, sandboxed processes, MCP, sidecars, and LangFlow.

LangFlow traces and flow/job state can enrich Setta's activity timeline, but they should not be treated as the authoritative policy ledger or side-effect log. A LangFlow-backed node should run in a constrained sidecar or external service; any real workspace access should be mediated by Setta's runner, sandbox, policy, approval, and journaling layers.

### Temporal Or Conductor

Reserve for future cloud/team/enterprise backends where distributed workers, service-side durability, and operational dashboards are worth the complexity.

Do not require them for default local desktop execution.

### go-workflows

Spike as a possible local durability helper if custom recovery becomes too complex.

It should still sit below Setta's product graph contract.

## Phase 0 Contract Decisions

These decisions close Phase 0. They are the target contracts for Phase 1 through Phase 3 and intentionally do not implement or require sandboxed process, MCP, sidecar, LangGraph, OpenAI Agents SDK, LangFlow, or Python runners.

### Kernel Responsibility Boundary

The workflow kernel is the only authority for these responsibilities:

- Workflow definition validation, version creation, version lookup, and immutable version snapshots.
- Run lifecycle status, terminal reason, cancellation state, and recovery state.
- Node attempt lifecycle, attempt numbering, iteration numbering, input snapshots, output snapshots, idempotency keys, and attempt status.
- Token movement, edge activation, joins, loop counters, loop limits, route explanation, and scheduler decisions.
- Workflow event ordering, global event stream cursor assignment, event replay, and graph projection.
- Approval lifecycle records, approval resolution, and the mapping from approvals back to node attempts.
- Runner state attachment, runner reference persistence, and recovery dispatch.
- Side-effect policy evaluation, retry eligibility, and manual recovery requirements.

Runners are the authority for provider-specific or framework-specific work only:

- Raw provider protocol events before normalization.
- Provider conversations, threads, sessions, turns, process handles, MCP request IDs, sidecar traces, or framework checkpoints.
- Internal tool loops, sub-agent routing, prompt construction, and provider-specific validation.
- Runner-local recovery proof, such as whether a Codex chat run is still active or terminal.

The kernel may call runners and consume normalized runner events. Runners must not mutate workflow runs, tokens, node attempts, approvals, event ordinals, or route decisions directly.

### Product Node Taxonomy

The saved graph continues to model task-oriented nodes. `WorkflowNode.Kind` remains a product shape such as `start`, `end`, `action`, `gateway.and`, `gateway.or`, `gateway.xor`, or `loop.guard`. For action nodes, `WorkflowActionConfig.Kind` is the runner selection key, not the user-facing palette taxonomy.

Codex remains the first concrete runner kind:

```text
agent.codex
```

Future runner kinds may be added under task-oriented nodes, but framework names must live in advanced implementation settings rather than becoming the normal graph vocabulary. For example, the user-facing node is `Agent Task` or `Triage Customer Report`; `LangGraph`, `OpenAI Agents SDK`, or `LangFlow` is a runner implementation detail.

### Runner Capability Model

Every runner exposes capabilities for a concrete node config before execution. The capability response is deterministic for the provided config and is stored with the workflow version or validated again from the immutable version at run start.

Target capability envelope:

```text
RunnerCapabilities
  schemaVersion: 1
  runnerKind: WorkflowActionKind
  displayName: string
  operations: RunnerOperation[]
  emittedEvents: RunnerEventType[]
  outputModes: RunnerOutputMode[]
  approvalKinds: RunnerApprovalKind[]
  requirements: RunnerRequirements
  sideEffectPolicy: SideEffectPolicy
  recovery: RunnerRecoveryCapability
  policyExtension: RunnerPolicyExtensionDescriptor
```

Target value sets:

- `RunnerOperation`: `start`, `cancel`, `signal`, `recover`.
- `RunnerOutputMode`: `signals`, `structured_json`, `file_refs`, `exit_code`, `metrics`, `none`.
- `RunnerApprovalKind`: `command`, `file_change`, `permission`, `structured_input`, `user_input`, `external_action`.
- `RunnerRequirement.network`: `forbidden`, `optional`, `required`.
- `RunnerRequirement.sidecarProcess`: `not_used`, `required`.
- `RunnerRequirement.workspaceAccess`: `none`, `read`, `write`, `runner_defined`.
- `RunnerRecoveryCapability`: `none`, `fail_interrupted`, `reconcile_refs`, `reattach_stream`.

`agent.codex` target capabilities:

- `operations`: `start`, `cancel`, `recover`.
- `emittedEvents`: `runner.attempt.started`, `runner.text.delta`, `runner.tool_call.started`, `runner.tool_call.output`, `runner.approval.requested`, `runner.approval.resolved`, `runner.artifact.reported`, `runner.structured_output.received`, `runner.attempt.completed`, `runner.attempt.failed`, `runner.attempt.cancelled`, `runner.attempt.recovery_required`.
- `outputModes`: `signals`, `structured_json`, `file_refs`, `metrics`.
- `approvalKinds`: `command`, `file_change`, `permission`, `structured_input`, `user_input`.
- `requirements.network`: `required`.
- `requirements.sidecarProcess`: `not_used`.
- `requirements.workspaceAccess`: `runner_defined`, because Codex workspace access is mediated through the existing chat/Codex harness approval model.
- `recovery`: `reconcile_refs` now, with `reattach_stream` allowed only when the chat harness can prove an active recoverable run.

Unsupported operations are explicit. If a graph, route, approval policy, cancellation policy, or recovery policy requires an unsupported runner operation, validation fails before a run starts.

### Runner Policy Extension Points

Action node configuration has a shared policy section owned by the kernel and an extension section owned by the selected runner. The kernel persists both in immutable workflow versions and node attempt input snapshots.

Target policy envelope:

```text
WorkflowActionPolicy
  schemaVersion: 1
  runnerKind: WorkflowActionKind
  sideEffectPolicy: SideEffectPolicy
  inputSchema: JSON schema or null
  outputSchema: JSON schema or null
  extensionKind: string
  extensionVersion: integer
  extensionJSON: object
```

Kernel-owned fields are `runnerKind`, `sideEffectPolicy`, `inputSchema`, and `outputSchema`. Runner-owned fields are `extensionKind`, `extensionVersion`, and `extensionJSON`.

Phase 1 implements the extension point only for `agent.codex` through the existing Codex node config shape: prompt, model, reasoning effort, and conversation reuse. Non-Codex extension schemas are reserved for later runner phases and must not be added during Phase 1.

### Side-Effect Policy

Every action node attempt stores the side-effect policy that was validated from the immutable workflow version.

Target policy shape:

```text
SideEffectPolicy
  kind: SideEffectPolicyKind
  scope: SideEffectScope
  approvalTriggers: ApprovalTrigger[]
  idempotencyRequired: bool
  compensationActionRef: string or null
  manualRecoveryInstructions: string
```

Target value sets:

- `SideEffectPolicyKind`: `pure`, `idempotent`, `at_least_once`, `requires_approval`, `manual_recovery`, `compensatable`.
- `SideEffectScope`: `none`, `workspace`, `external_service`, `provider_account`, `runner_defined`.
- `ApprovalTrigger`: `network_access`, `workspace_write`, `out_of_workspace_write`, `protected_path_write`, `credential_access`, `external_write`, `destructive_action`, `unsandboxed_execution`.

Policy semantics:

- `pure`: no external or workspace mutation; retry and recompute are allowed.
- `idempotent`: side effects are allowed only with the attempt idempotency key; retry is allowed with the same key.
- `at_least_once`: duplicate side effects are possible; automatic retry is disabled unless the node explicitly opts into duplicate-tolerant retry.
- `requires_approval`: the runner must pause and emit `runner.approval.requested` before the declared side effect.
- `manual_recovery`: uncertain interruption cannot be retried automatically; the run enters manual recovery.
- `compensatable`: retry after an uncertain interruption is allowed only after the configured compensation action has completed and recorded an event.

The kernel assumes exactly-once side effects are unavailable unless the runner proves idempotency through the stored idempotency key and runner state.

### Normalized Runner Event Model

Runners emit normalized events through a kernel-owned sink. The kernel assigns workflow event ordinals and decides which events are durable workflow milestones versus high-volume activity references.

Common runner event envelope:

```text
RunnerEvent
  schemaVersion: 1
  id: string
  workspaceId: string
  executionId: string
  nodeId: string
  nodeExecutionId: string
  runnerKind: WorkflowActionKind
  runnerEventOrdinal: integer
  occurredAt: timestamp
  type: RunnerEventType
  payload: object
```

Target runner event types and payload fields:

| Type                                | Payload fields                                                                    | Persistence                                              |
| ----------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `runner.attempt.started`            | `runnerRefs`, `capabilities`, `inputHash`, `idempotencyKey`, `sideEffectPolicy`   | Durable workflow event and node attempt state            |
| `runner.text.delta`                 | `streamId`, `sequence`, `format`, `text`                                          | Activity reference or runner activity store              |
| `runner.tool_call.started`          | `toolCallId`, `toolName`, `toolKind`, `arguments`, `requiresApproval`             | Activity reference; durable only when policy-relevant    |
| `runner.tool_call.output`           | `toolCallId`, `sequence`, `output`, `truncated`, `metadata`                       | Activity reference or runner activity store              |
| `runner.approval.requested`         | `approvalId`, `approvalKind`, `title`, `request`, `operation`, `sideEffectPolicy` | Durable workflow event, approval row, node attempt state |
| `runner.approval.resolved`          | `approvalId`, `status`, `approved`, `response`, `answers`, `resolvedAt`           | Durable workflow event and approval row                  |
| `runner.artifact.reported`          | `artifactId`, `kind`, `uri`, `title`, `metadata`                                  | Durable artifact ref and workflow event                  |
| `runner.structured_output.received` | `schemaName`, `schemaVersion`, `output`, `signals`, `filePaths`, `exitCode`       | Durable workflow event and node attempt output snapshot  |
| `runner.attempt.completed`          | `status`, `output`, `signals`, `filePaths`, `exitCode`, `metrics`                 | Durable workflow event and node attempt terminal state   |
| `runner.attempt.failed`             | `errorCode`, `message`, `retryable`, `metrics`                                    | Durable workflow event and node attempt terminal state   |
| `runner.attempt.cancelled`          | `reason`, `message`, `metrics`                                                    | Durable workflow event and node attempt terminal state   |
| `runner.attempt.recovery_required`  | `recoveryOutcome`, `message`, `manualRecoveryInstructions`, `runnerRefs`          | Durable workflow event and recovery state                |

Kernel lifecycle events remain Setta workflow events such as `workflow.action.started`, `workflow.action.completed`, and `workflow.execution.completed`. Normalized runner terminal events are inputs to the reducer; they are not a second lifecycle authority.

Routing must use only explicit structured output, signals, node status, exit code, validated schema fields, or user signals. `runner.text.delta`, `runner.tool_call.output`, and raw transcript text are never routing inputs.

### Recovery Outcomes

Recovery runs at startup and after a runner reports `runner.attempt.recovery_required`. The kernel loads non-terminal runs, active node attempts, runner state, runner refs, side-effect policy, and the last committed event cursor before calling the runner recovery hook.

Target recovery outcomes:

| Outcome                    | Meaning                                                                        | Kernel action                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `recovered_running`        | Runner proves the same attempt is still active.                                | Keep attempt active, refresh runner state, resume event intake.                                                                    |
| `recovered_completed`      | Runner proves the attempt completed while Setta was down.                      | Commit terminal output and continue scheduling from the committed graph state.                                                     |
| `recovered_failed`         | Runner proves the attempt failed while Setta was down.                         | Commit failure and apply normal failure routing or terminal handling.                                                              |
| `retry_scheduled`          | Existing attempt cannot continue, but side-effect policy proves retry is safe. | Mark old attempt failed with recovery details, create the next attempt with a new attempt id and the same workflow input snapshot. |
| `manual_recovery_required` | The outcome or side effect is uncertain and automatic retry is unsafe.         | Keep the run non-terminal, mark the node attempt and runner state `recovery_required`, and require explicit user action.           |
| `failed_interrupted`       | Recovery is unsupported or impossible and policy permits failing loudly.       | Mark active attempts failed and fail the run with terminal reason `interrupted`.                                                   |

The implemented manual-recovery status model keeps `workflow.execution.status = running` so the run remains non-terminal, and marks `workflow.node.status = recovery_required` plus `workflow.runner_state.status = recovery_required`. Those states must be visible in graph projection and event replay.

### Activity Reference Mapping

Final node output is never used as a transcript container. High-volume or runner-native activity is stored in the owning subsystem and referenced from workflow tables.

Reference kinds:

- `chat.conversation`: existing internal workflow conversation ID.
- `chat.run`: existing chat run ID for Codex node activity.
- `codex.thread`: Codex thread ID when the chat harness exposes it.
- `codex.session`: Codex session ID when available.
- `codex.turn`: Codex turn ID when available.
- `process.log`: future sandboxed process stdout/stderr log reference.
- `mcp.call`: future MCP request/tool-call reference.
- `sidecar.trace`: future sidecar or framework trace reference.
- `artifact`: file, URL, provider object, or external object reference.

Codex mapping is concrete for Phase 1:

- `workflow_runner_refs` stores `chat.conversation`, `chat.run`, and available Codex refs.
- `workflow_activity_refs` stores a `chat.run` reference for the node attempt.
- The node inspector reads streamed text, tool calls, approvals, and metrics through the existing chat activity API by `workspaceId` and `chat.run`.
- Workflow event replay remains driven by workflow events; chat activity is loaded only for node detail panels.

Future process logs, MCP calls, and sidecar traces use the same reference table shape without changing the outer workflow lifecycle.

### Runtime SQLite Schema

The implemented schema and transaction boundary are documented in [Backend Workflow Kernel SQLite Schema](../reference/backend_workflow_kernel_sqlite_schema.md).

### Workspace Definition Files

Phase 2 replaced the old JSON workflow runtime path with SQLite so run events and materialized state commit transactionally. That remains the right storage model for executions.

Phase 4 has moved authored workflow definitions out of global SQLite and into deterministic workspace JSON files. SQLite keeps immutable version snapshots captured at run start, plus run/event/recovery state, but it is not the authority for editable definitions.

The current implementation replaces authored-definition storage directly. Do not add migration, import, scan, dual-write, fallback, old-field aliases, or compatibility behavior for old SQLite-authored definitions.

## Implementation Phases

### Core Codex Workflow Kernel

Build the Codex-backed kernel first. Non-Codex runners are later extensions and should not be implemented until the kernel, persistence, and recovery contracts are stable.

#### Phase 0: Kernel Contract Decisions

Status: Complete. The decisions are captured in [Phase 0 Contract Decisions](#phase-0-contract-decisions).

Deliverables:

- Completed: finalize workflow kernel responsibilities.
- Completed: define runner capability model.
- Completed: define normalized runner event model.
- Completed: define runner-specific policy extension points without implementing non-Codex policy schemas yet.
- Completed: define side-effect policies.
- Completed: define recovery outcomes.
- Completed: define the runtime SQLite schema and direct replacement plan for the old JSON workflow runtime store.

Acceptance criteria:

- The architecture can describe Codex now and future runners later without special-casing the outer workflow lifecycle.
- Product-facing node names remain task-oriented rather than framework-oriented.
- No compatibility layer, state-preservation path, or dual-read/write path is included in the design.

#### Phase 1: Runner Contract

Status: Complete. The current Codex-backed kernel has the capability-based runner contract, normalized runner events, explicit runner state records, and typed future runner policy extension points needed before replacing persistence.

Deliverables:

- Completed: replace the minimal `Start`/`Cancel` action runner contract with a capability-based contract.
- Completed: add normalized runner events.
- Completed: add explicit runner state records.
- Completed: add typed extension points for future runner-specific policy.
- Completed: keep `agent.codex` working through the new contract.
- Completed: preserve current workflow graph semantics.
- Completed: do not add sandboxed process, MCP, sidecar, or agent-framework runners in this phase.

Acceptance criteria:

- Codex action nodes still run through production chat paths.
- Workflow approvals still surface in graph projection.
- Cancellation still cancels active Codex runs.
- Runner refs and terminal results remain durable.
- The new contract does not bake in Codex-only assumptions.

#### Phase 2: Transactional Persistence

Status: Complete for runtime persistence. The Codex-backed kernel production path now uses SQLite-backed workflow persistence with transactional event-log and materialized-state commits. The earlier file-backed workflow runtime store has been removed from the production workflow path. Authored workflow definitions have since moved to deterministic workspace JSON files in Phase 4; SQLite remains runtime state and immutable snapshot storage.

Deliverables:

- Completed: introduce a workflow persistence interface with transaction semantics.
- Completed: implement SQLite-backed workflow persistence.
- Completed: store event log and materialized state in the same transaction.
- Completed: replace JSON workflow persistence for the target kernel path.

Implementation guardrails:

- Make the workflow service depend on the transaction-oriented persistence interface rather than the concrete JSON store.
- Commit `workflow_run_events` rows, materialized workflow state, and the updated durable event cursor in one SQLite transaction before publishing in-memory event notifications.
- Remove the JSON workflow store from the production workflow path in the same phase; do not leave JSON and SQLite as parallel runtime stores.
- Do not add migration, import, scan, dual-write, fallback, or compatibility behavior for existing workflow JSON files.

Acceptance criteria:

- A committed event cannot be missing from materialized state after restart.
- A materialized transition cannot exist without its corresponding event records.
- Event stream replay uses durable event cursors.
- The implementation does not maintain JSON and SQLite as parallel compatibility paths.

#### Phase 3: Recovery And Reconciliation

Status: Complete. Startup recovery now reconciles non-terminal Codex-backed workflow executions through runner recovery hooks, records typed recovery outcomes, preserves approval waits, and moves uncertain side-effecting attempts into manual recovery state.

Deliverables:

- Completed: add startup recovery for non-terminal Codex-backed runs.
- Completed: add runner recovery hooks.
- Completed: add recovery outcomes to workflow events and node state.
- Completed: add manual recovery state for uncertain side effects.

Acceptance criteria:

- Restart during approval preserves the approval.
- Restart during a recoverable Codex runner attempt reattaches or reconciles.
- Restart after runner completion but before Setta terminal commit is reconciled when runner state proves completion.
- Unrecoverable side-effecting attempts fail loudly or require manual recovery.

#### Phase 4: Functional Workflow Graph Editor

Status: In progress. The layout metadata slice, workspace-file/null-workflow authoring slice, basic editor UX slice, diagnostic marker slice, selected-run node details slice, and explicit draft/run/version state slice are complete. The remaining work is editor polish on top of workspace-saved workflow definition files, the `WorkflowDefinition.graph` contract, and the existing Codex-backed workflow kernel. See [Functional Workflow Graph Editor Plan](functional_workflow_graph_editor_plan.md) for detailed deliverables, guardrails, and acceptance criteria.

Completed first slice:

- Add required backend-owned editor layout metadata to `WorkflowGraph`.
- Regenerate generated TypeScript contracts.
- Include layout in `WorkflowGraphProjection`.
- Render projection nodes from persisted layout positions before falling back to automatic layout.
- Persist node moves through `updateDefinition` when the graph is showing a definition without a selected execution overlay.
- Prove the slice through focused backend, renderer, and deterministic Electron workflow tests.

Completed storage and null-workflow authoring slice:

- Store authored workflow definitions as deterministic JSON files in the workspace.
- List workspace workflow files in the left pane and open a selected definition explicitly.
- Show an editable blank canvas when no workflow file exists, and materialize the workspace JSON file on first graph edit.
- Allow draft workflow files to save before they are executable; run/start remains gated by executable validation.
- Capture immutable SQLite version snapshots when a workflow is run.
- Replace current global-SQLite authored-definition storage directly, without compatibility or migration paths.

Completed basic editor UX slice:

- Add a workflow toolbar with discoverable Add, Validate, Run, Draft, and Details controls.
- Add nodes from both the toolbar add menu and the canvas context menu.
- Validate saved draft graphs through the backend workflow definition API and show validation results in the editor.
- Start workflow runs from the editor, capture immutable version snapshots, and render the execution projection for the started run.
- Open workflow node details in an adjacent Niri pane.
- Support basic Agent Task configuration in the details pane: title, prompt, model, reasoning effort, and fresh-conversation setting.
- Prove the slice through deterministic Electron/main/preload/renderer/HTTP/store coverage for toolbar add, node details, run start, and runtime projection updates.

Completed diagnostic marker slice:

- Map backend validation diagnostics onto affected draft projection nodes and edges.
- Draw distinct Pixi node and edge diagnostic markers without reusing runtime failure styling.
- Suppress draft validation markers on run projections so validation and runtime state remain visually separate.
- Prove the slice through focused renderer projection tests and deterministic Electron workflow coverage for node and edge diagnostics.

Completed selected-run node details slice:

- Open details from a selected run projection without reading mutable draft definitions.
- Carry projection node identity, status, version, and adjacent edge state into the details target.
- Show run context, node execution attempts, action results, emitted signals, file paths, JSON output, linked chat run activity, branch state, tokens, and filtered workflow events.
- Add basic type-specific draft details for Route, Merge, Barrier Join, Start, and End.
- Prove the slice through focused renderer helper tests and deterministic Electron workflow coverage that opens a completed run node and inspects its emitted signals, output, file paths, and activity.

Completed explicit draft/run/version state slice: Go-owned projection metadata now carries view mode, immutable version number, editability, draft updated timestamp, draft/version match state, and version mismatch state; generated TypeScript contracts are regenerated; toolbar and details surfaces label draft, run, version, and mismatch state; edits, validation, and run start are gated on projection editability; event updates stay pinned to selected runs; and focused backend, renderer, and Electron workflow metadata coverage proves the slice.

Remaining editor slice:

- Add first-class workflow-level naming and configuration controls.
- Refine node details beyond the first inspection slice where needed, including deeper route history, transcript presentation, and type-specific editing controls.

### Later Runner Extensions

These extensions are strategically useful, but they are not required for the first serious workflow kernel. They should use the same runner contract and must not reshape the saved Setta workflow graph.

#### Future Extension: Sandboxed Process Runner

Deliverables:

- Implement executable-code nodes through a sandboxed process runner, not raw local process execution.
- Define sandbox policy schema for executable-code nodes: read roots, write roots, protected paths, network policy, environment allowlist, secret inheritance policy, timeout, output cap, and approval triggers.
- Spike Anthropic Sandbox Runtime (`srt`) as the first sandbox provider for macOS, Linux, and WSL2.
- Treat native Windows sandboxing as unsupported until a real enforcement boundary is implemented and tested. Supported Windows paths are WSL2 plus `srt` or Docker/Podman strict mode.
- Add an explicit trusted local command fallback only behind user approval, and label it as unsandboxed.
- Add typed config, validation, event streaming, cancellation, and side-effect policy.

Acceptance criteria:

- A workflow can run an agent node, a command node, route from structured result or exit code, and continue.
- The UI event stream and graph projection treat Codex and process nodes consistently.
- The default command path enforces filesystem, network, environment, timeout, and output boundaries.
- Unsandboxed fallback cannot run silently and cannot be represented as secure sandboxing.
- Tests cover child-process cleanup, timeout kill behavior, cancellation kill behavior, output-cap enforcement, denied network access, denied out-of-workspace writes, protected-path write denial, and restart during command execution.

#### Future Extension: MCP Tool Runner

Deliverables:

- Add MCP tool nodes after the sandboxed process runner or when product requirements justify tool nodes independently.
- Validate tool arguments.
- Normalize tool progress, approval, completion, and failure events.
- Require approval for side-effecting or destructive tools.

Acceptance criteria:

- A workflow can call a configured MCP tool and route from its structured result.
- External side effects are visible in workflow history and approval state.
- MCP tool execution does not bypass Setta-owned approvals, cancellation, or recovery rules.

#### Future Extension: Agent Subgraph Runner

Deliverables:

- Spike one advanced agent-flow or sidecar runner, such as LangGraph, OpenAI Agents SDK, or LangFlow.
- Treat it as an implementation of a task-oriented `Agent Subgraph` or `Custom Agent` node.
- Normalize its internal events into Setta runner events.
- Keep credentials, approvals, and outer run state controlled by Setta.

Acceptance criteria:

- A sidecar-backed node can stream activity, request approval or interruption if supported, and return validated structured output.
- A LangFlow-backed node can execute an existing flow by configured flow reference without making the LangFlow flow the Setta workflow definition.
- LangFlow traces are imported only as non-authoritative activity spans; Setta-owned events remain the source of truth for policy, approvals, side effects, and recovery.
- LangFlow-backed execution cannot directly mutate the real workspace unless routed through Setta-owned sandbox, policy, approval, and journaling layers.
- Sidecar crash is represented as a node failure or recovery-required state.
- The saved Setta workflow graph does not embed framework internals as the source of truth.

#### Future Extension: Backend Adapter Proof

Deliverables:

- Sketch a backend adapter for a distributed workflow engine such as Temporal.
- Do not implement production cloud execution unless product requirements justify it.

Acceptance criteria:
- The Setta graph can compile to or be interpreted by another backend without changing the saved graph contract.
- Approvals, cancellation, event projection, and structured outputs still map back to Setta concepts.

## Verification Strategy

For each phase, run the narrowest checks first, then broaden after behavior is stable.
Required deterministic workflow tests should cover opening a workspace, blank/null workflow canvas materialization, execution start, streamed node events, fan-out, joins, conditional routing, loop guards, approvals, cancellation, runner failure, restart recovery, and event replay.

When the sandboxed process runner is implemented, its tests must also cover child-process cleanup, timeout and cancellation killing the process tree, output cap enforcement and truncation metadata, denied network access, denied writes outside the workspace or protected paths such as `.git`, `.codex`, app configuration, and credential locations, and restart during command execution producing an explicit recovery, failure, or manual-recovery state.

For changes touching chat-backed Codex runners, harness behavior, approvals, streaming, queueing, or transcript paths, production Electron/main/preload/renderer/HTTP/store end-to-end workflow tests are required.

For changes touching the functional graph editor, deterministic Electron/main/preload/renderer/HTTP/store workflow tests are required. The tests should use temporary app data and cover creating or opening a workspace, authoring a workflow definition, listing and selecting workspace workflow files, adding nodes, drawing edges, validating diagnostics, saving through the backend API to workspace JSON, starting a saved version snapshot, receiving runtime projection updates, and opening node details. Renderer-only or Pixi-only tests are not sufficient for editor workflows that save or run definitions.

Live Codex E2E tests should run when local ChatGPT auth is available. They must not use `OPENAI_API_KEY`. If ChatGPT auth is unavailable, record the skip as a live-provider skip, not as proof of provider integration.

## Resolved Architecture Decisions

- Build the Codex-only workflow kernel before implementing non-Codex runners.
- Move runtime workflow persistence to SQLite before serious runner expansion.
- Defer a `go-workflows` spike until after Setta has a SQLite-backed kernel and explicit recovery/reconciliation semantics.
- Store semantic workflow milestones in workflow events and store high-volume runner activity as referenced transcript, log, trace, or artifact data.
- Keep the Setta graph model app-owned and extensible for future non-executable graph layers, but do not implement concept, workspace-object, or mindmap nodes in this plan.
- Introduce advanced agent subgraphs as opaque but inspectable runner-backed nodes first. Do not build visual editing for imported framework subgraphs initially.
- Treat sandboxed process execution as the first non-Codex runner when runner expansion starts, then MCP, then sidecar/agent subgraph runners such as LangGraph, OpenAI Agents SDK, or LangFlow.
- Do not add raw local command execution as a shortcut while sandboxed process execution is deferred.
- Do not implement OS sandboxing from scratch in Go. Use a sandbox provider such as `srt`, with Docker/Podman as optional strict mode and explicit trusted-command fallback when no sandbox provider is available.
- Do not preserve existing workflow data or maintain compatibility paths. Replace the implementation directly when the target design is clearer.
- Make the functional graph editor the next implementation target before later runner expansion.
- Treat the workspace JSON file containing `WorkflowDefinition.graph` as the authored workflow artifact; treat `WorkflowGraphProjection` as a read-only runtime display overlay.
- Treat the blank canvas as a valid draft/null workflow instead of a separate create-workflow state; first graph edit creates the backing workspace file.
- Treat initial editor edges as directed control transitions. Do not use one edge layer for control flow, data flow, artifact references, and knowledge links.
- Keep routing conditions typed and backend-owned. Do not route from arbitrary expression strings or prose assistant output.
- Treat virtual ports as deterministic editor affordances that compile to real workflow edges and conditions, not as a separate durable contract.
- Keep validation diagnostics visually separate from runtime failures.
- Defer executable code, concept, mindmap, and true wait-state `State` nodes until their backend semantics are designed.

## Remaining Design Details

- Exact `srt` integration shape, and any native Windows sandbox strategy once proven by implementation and tests.
- Sidecar-backed agent subgraph configuration and external-edit conflict handling for workspace workflow files.
- Additional typed condition shapes for approval outcome routing, structured output field comparisons, signal schema references, and final `Merge` semantics.
- Backend semantics for a true state-machine wait-state `State` node, plus the full node-details pane contract for deeper transcript presentation, route history, and type-specific controls across every initial node type.

## Recommended Next Step

Finish the functional workflow graph editor before later runner expansion. The storage, blank-canvas authoring, and basic editor UX foundation is in place: workspace files contain `WorkflowDefinition.graph`, support `Agent Task`, `Route`, `Merge`, `Barrier Join`, `Start`, and `End`; edges are typed control transitions; layout persists through the Go-owned graph contract; toolbar controls can add, validate, run, return to draft, and open node details; run start captures immutable SQLite snapshots; runtime projection state overlays saved versions; diagnostics attach to draft nodes and edges; draft/run/version state is explicit; and selected-run node details expose execution, result, activity, branch, token, and event state. The next work is workflow-level configuration and deeper node-detail refinements that emerge from real use. Proceed to sandboxed process, MCP, sidecar, LangGraph, OpenAI Agents SDK, LangFlow, or Python runner work only after the editor proves the graph authoring model under real use.
