# Backend Workflow Kernel Architecture Plan

- **Date:** June 7, 2026
- **Status:** Proposed
- **Scope:** Evolve Setta's backend workflow orchestration into a durable local-first workflow kernel with replaceable action runners.

## Executive Summary

Setta should own the workflow product contract: saved graph definitions, immutable versions, run state, approvals, event history, transcripts, structured routing outputs, cancellation, and recovery semantics.

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

The next implementation target is a Codex-only workflow kernel with a runner boundary that does not bake in Codex-only assumptions. The biggest architectural upgrades are transactional persistence, restart recovery from committed boundaries, and a richer runner contract. Existing workflow persistence and contracts can be replaced directly; no compatibility layers are required.

## Product Position

Setta is not only a chat UI, a workflow engine, or an agent SDK wrapper. It is a local-first visual AI workflow product.

That means the stable product artifact is the Setta workflow graph and its run history, not LangGraph internals, LangFlow flows, Temporal histories, n8n workflows, OpenAI Agents SDK traces, or Codex chat records.

The core rule:

> Setta owns the outer workflow. Runners own how individual nodes do work.

## Long-Term Product Direction

The current implementation plan is only for the executable workflow kernel. Long term, Setta's graph/canvas may also include non-executable product nodes, such as high-level concepts, workspace-object mappings, artifacts, and structured agent mindmaps.

Those future graph layers are a reason to keep the saved Setta graph model app-owned and extensible. They are not part of this implementation plan. Concept graphs, workspace-object mapping, and agent-mindmap visualization should be treated as separate future projects built on top of the same Setta-owned product graph, not as requirements for the first workflow-kernel rewrite.

## Goals

- Keep workflow definitions portable and Setta-owned.
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

The main gaps are:

- Persistence is JSON-file based, with event append and execution snapshot writes as separate operations.
- Restart recovery currently marks running executions interrupted instead of resuming or reconciling from committed boundaries.
- The runner interface is minimal and does not express capabilities, streaming events, resume, side-effect policy, or structured output schemas.
- Workflow events are lifecycle-oriented; detailed transcript/tool streams mostly live in chat-specific state.
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
  - Append-only run events
  - Materialized run state
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

The saved workflow graph should stay Setta-native.

Minimum definition concepts:

- Nodes.
- Edges.
- Node configs.
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

### Codex Agent Runner

User-facing node:

```text
Agent Task: Review implementation
```

Implementation:

- Starts a workflow-owned internal chat conversation.
- Streams assistant text and tool activity through existing chat production paths.
- Emits approval requests when Codex asks for permission.
- Extracts structured workflow result data from Setta-owned tool calls.
- Returns final status, signals, output, and file references to the workflow kernel.

UX benefit:

- The user sees a normal workflow node with expandable chat transcript and approvals.
- The workflow can route from `signals` or structured output instead of prose.

### Sandboxed Process Runner

User-facing node:

```text
Run Tests
```

Implementation:

- Runs a configured command in a configured working directory through an enforced sandbox boundary.
- Uses Anthropic Sandbox Runtime (`srt`) as the first sandbox provider to spike for macOS, Linux, and WSL2.
- Supports Docker or Podman as an optional stricter isolation provider when a container runtime is available.
- Treats unsandboxed local command execution as an explicit trusted mode that requires user approval and must not be presented as secure sandboxing.
- Streams stdout/stderr.
- Enforces timeout and output caps.
- Returns exit code and declared file references.

Minimum default policy:

- Network disabled.
- Read access limited to the workspace plus explicit allowlist.
- Write access limited to the workspace.
- Protected paths such as `.git`, `.codex`, app configuration, and credential locations are read-only or inaccessible.
- Environment starts empty or minimal, with explicit allowlist for required variables.
- Secrets are never inherited automatically.
- Timeout is required.
- Output cap is required.
- Approval is required for network access, writes outside the workspace, destructive commands, and unsandboxed fallback mode.

Example routing:

```text
exitCode == 0 -> Summarize Success
exitCode != 0 -> Ask Agent To Fix
```

UX benefit:

- Test output appears in the same node activity model as agent output.
- Failures are deterministic and routeable.
- The user gets a real enforcement boundary instead of relying on command naming conventions or prompt instructions.

### MCP Tool Runner

User-facing node:

```text
Create GitHub Issue
```

Implementation:

- Calls a configured MCP server/tool.
- Validates arguments.
- Requests approval before side-effecting operations when policy requires it.
- Returns structured result and external references.

UX benefit:

- External actions use the same approval UI as agent/tool approvals.
- Workflow history shows what external side effect was requested and approved.

### Python Structured Extraction Runner

User-facing node:

```text
Extract Invoice Data
```

Implementation:

- Starts a Python sidecar with a typed extraction implementation.
- Validates output against a schema.
- Returns structured JSON or a specific validation error.

UX benefit:

- Users get strict data extraction without seeing Python process details.
- Downstream routing can use typed fields like `invoice.total` or `requires_review`.

### Agent Subgraph Runner

User-facing node:

```text
Triage Customer Report
```

Possible implementation:

- LangGraph.
- OpenAI Agents SDK.
- LangFlow.
- Mastra.
- Pydantic AI.
- Custom TypeScript or Python sidecar.

Internal behavior might include:

```text
classify report
retrieve similar issues
ask specialist agent
check confidence
retry extraction
maybe request clarification
produce structured triage result
```

Setta still sees one node attempt with stream events and final output:

```json
{
  "severity": "high",
  "route": "human_review",
  "confidence": 0.78,
  "summary": "..."
}
```

UX benefit:

- The top-level graph remains understandable:

```text
Receive Report -> Triage Customer Report -> Route
```

- Advanced details can be shown inside the node activity panel instead of cluttering the main graph.

## Persistence Architecture

The serious durable runtime should use transactional local persistence.

Preferred target:

- SQLite.
- WAL mode.
- Append-only event log.
- Materialized run state.
- Transactional updates for events and state.

Core tables or logical stores:

- `workflow_definitions`
- `workflow_versions`
- `workflow_runs`
- `workflow_run_events`
- `workflow_node_attempts`
- `workflow_tokens`
- `workflow_loop_counters`
- `workflow_approvals`
- `workflow_runner_state`
- `workflow_transcript_refs`
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
7. If the runner cannot recover safely, mark the attempt as `manual_recovery` or failed according to side-effect policy.
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

## Implementation Phases

### Core Codex Workflow Kernel

Build the Codex-backed kernel first. Non-Codex runners are later extensions and should not be implemented until the kernel, persistence, and recovery contracts are stable.

#### Phase 0: Kernel Contract Decisions

Deliverables:

- Finalize workflow kernel responsibilities.
- Define runner capability model.
- Define normalized runner event model.
- Define runner-specific policy extension points without implementing non-Codex policy schemas yet.
- Define side-effect policies.
- Define recovery outcomes.
- Define the target SQLite schema and direct replacement plan for JSON workflow storage.

Acceptance criteria:

- The architecture can describe Codex now and future runners later without special-casing the outer workflow lifecycle.
- Product-facing node names remain task-oriented rather than framework-oriented.
- No compatibility layer, state-preservation path, or dual-read/write path is included in the design.

#### Phase 1: Runner Contract

Deliverables:

- Replace the minimal `Start`/`Cancel` action runner contract with a capability-based contract.
- Add normalized runner events.
- Add explicit runner state records.
- Add typed extension points for future runner-specific policy.
- Keep `agent.codex` working through the new contract.
- Preserve current workflow graph semantics.
- Do not add sandboxed process, MCP, sidecar, or agent-framework runners in this phase.

Acceptance criteria:

- Codex action nodes still run through production chat paths.
- Workflow approvals still surface in graph projection.
- Cancellation still cancels active Codex runs.
- Runner refs and terminal results remain durable.
- The new contract does not bake in Codex-only assumptions.

#### Phase 2: Transactional Persistence

Deliverables:

- Introduce a workflow persistence interface with transaction semantics.
- Implement SQLite-backed workflow persistence.
- Store event log and materialized state in the same transaction.
- Replace JSON workflow persistence for the target kernel path.

Acceptance criteria:

- A committed event cannot be missing from materialized state after restart.
- A materialized transition cannot exist without its corresponding event records.
- Event stream replay uses durable event cursors.
- The implementation does not maintain JSON and SQLite as parallel compatibility paths.

#### Phase 3: Recovery And Reconciliation

Deliverables:

- Add startup recovery for non-terminal Codex-backed runs.
- Add runner recovery hooks.
- Add recovery outcomes to workflow events and node state.
- Add manual recovery state for uncertain side effects.

Acceptance criteria:

- Restart during approval preserves the approval.
- Restart during a recoverable Codex runner attempt reattaches or reconciles.
- Restart after runner completion but before Setta terminal commit is reconciled when runner state proves completion.
- Unrecoverable side-effecting attempts fail loudly or require manual recovery.

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

Required deterministic workflow tests should cover:

- Start workspace.
- Create workflow.
- Start execution.
- Stream node events.
- Fan-out.
- Join.
- Conditional routing.
- Loop guard.
- Approval request and resolution.
- Cancellation.
- Runner failure.
- Restart recovery.
- Event replay.

When the sandboxed process runner is implemented, its tests must also cover:

- Child-process cleanup.
- Timeout kills the process tree.
- Cancellation kills the process tree.
- Output cap enforcement and truncation metadata.
- Denied network access.
- Denied writes outside the workspace.
- Denied writes to protected paths such as `.git`, `.codex`, app configuration, and credential locations.
- Restart during command execution produces an explicit recovery, failure, or manual-recovery state.

For changes touching chat-backed Codex runners, harness behavior, approvals, streaming, queueing, or transcript paths, production Electron/main/preload/renderer/HTTP/store end-to-end workflow tests are required.

Live Codex E2E tests should run when local ChatGPT auth is available. They must not use `OPENAI_API_KEY`. If ChatGPT auth is unavailable, record the skip as a live-provider skip, not as proof of provider integration.

## Resolved Architecture Decisions

- Build the Codex-only workflow kernel before implementing non-Codex runners.
- Move workflow persistence to SQLite before serious runner expansion.
- Defer a `go-workflows` spike until after Setta has a SQLite-backed kernel and explicit recovery/reconciliation semantics.
- Store semantic workflow milestones in workflow events and store high-volume runner activity as referenced transcript, log, trace, or artifact data.
- Keep the Setta graph model app-owned and extensible for future non-executable graph layers, but do not implement concept, workspace-object, or mindmap nodes in this plan.
- Introduce advanced agent subgraphs as opaque but inspectable runner-backed nodes first. Do not build visual editing for imported framework subgraphs initially.
- Treat sandboxed process execution as the first non-Codex runner when runner expansion starts, then MCP, then sidecar/agent subgraph runners such as LangGraph, OpenAI Agents SDK, or LangFlow.
- Do not add raw local command execution as a shortcut while sandboxed process execution is deferred.
- Do not implement OS sandboxing from scratch in Go. Use a sandbox provider such as `srt`, with Docker/Podman as optional strict mode and explicit trusted-command fallback when no sandbox provider is available.
- Do not preserve existing workflow data or maintain compatibility paths. Replace the implementation directly when the target design is clearer.

## Remaining Design Details

- Exact SQLite schema.
- Exact normalized runner event payload shapes.
- How workflow activity references map to existing chat transcripts, future process logs, and future sidecar traces.
- Exact `srt` integration shape: CLI invocation, TypeScript sidecar bridge, or Go wrapper around the CLI.
- Native Windows sandbox strategy remains unsupported until proven by implementation and tests.
- Whether sidecar-backed agent subgraphs are configured by local file path, registered runner package, imported manifest, or LangFlow server/flow reference in the first spike.

## Recommended Next Step

Implement Phase 0 as a design stabilization pass around the Codex-only kernel, then Phase 1 with Codex as the proving runner. Do not add sandboxed process, MCP, LangGraph, OpenAI Agents SDK, LangFlow, or Python sidecars until the Codex-backed kernel, persistence, and recovery model are stable.
