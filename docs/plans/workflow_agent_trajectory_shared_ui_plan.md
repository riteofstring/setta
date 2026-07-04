# Workflow Agent Trajectory Shared UI Plan

Date: 2026-07-03

## Goal

Workflow agent node details should reuse the same agent trajectory UI machinery
as normal chat: transcript rendering, activity rows, output pagination, approval
cards, liveness presentation, and steering/composer behavior where the workflow
contract supports it.

The workflow details pane should remain the place for workflow-specific context:
node status, attempt and iteration, runner refs, workflow result, emitted
signals, routing output, token flow, and workflow events. The agent trajectory
inside that pane should not be a separate workflow-only implementation.

Do not add backward compatibility, legacy support, migrations, transitional
adapters, dual-read/write paths, old-field aliases, or silent fallback behavior.
Cut directly to the new owner-defined contracts and remove the old incomplete
preview path.

## Problem

Workflow node details currently reuse the chat activity row renderer but not the
chat trajectory state and loading contract.

Representative current shape:

- `WorkflowRunActivityPageDetails` renders `RunItemActivityList`, so the visual
  activity rows are shared.
- Workflow details loads a `RunActivityPage` preview with a small limit.
- `RunActivityPage` exposes a flat `output` list and loses per-run-item
  pagination metadata such as `hasMore` and `nextOrdinal`.
- The renderer adapts that preview into output page state with `hasMore: false`.
- Workflow details passes a no-op `loadRunItemOutput` callback.

The result is a forked and weaker agent trajectory surface. Long output can look
complete when it is only a preview, approvals are not first-class in the shared
agent trajectory surface for workflow nodes, and running agent-node steering or
liveness controls cannot be cleanly reused from chat.

The issue is not that agent nodes need a fundamentally different UI. The issue is
that current chat components and store actions are still too coupled to "the
selected conversation" and are not parameterized as a reusable agent trajectory
surface.

## Product Contract

- A workflow agent node shows workflow metadata plus an embedded agent
  trajectory.
- The embedded trajectory uses the same rendering behavior as normal chat for
  assistant text, run activity, approvals, output blocks, search, paging, and
  virtualization.
- The trajectory is scoped explicitly. It must never infer scope from the global
  selected conversation.
- Historical node execution views show exactly the selected node execution or
  selected attempt scope. Loading older history must not silently pull in other
  attempts or unrelated workflow conversation turns.
- Running workflow agent nodes expose liveness state for the workflow-owned run:
  attached, reconciling, lost, terminal, retryability, cancellability, and
  provider error state.
- A workflow node composer can send steering to a running workflow-owned agent
  run only when the backend contract says steering is supported for that node
  execution.
- Queue controls appear only when there is a node-scoped queue contract. Do not
  show queued-message affordances backed by selected-conversation behavior.
- Approval cards in a workflow node use the same approval UI, but submit through
  the workflow/node-execution approval contract when the approval belongs to a
  workflow action.
- Output pagination is a durable contract. If output is partial, the UI must
  know it is partial and must have a real load-more path.
- No UI control may look actionable unless the workflow-node-scoped backend path
  exists and is wired.

## Architecture

### 1. Extract A Parameterized Agent Trajectory Surface

Create a shared renderer/controller boundary for agent trajectories. The shared
surface should be prop-driven and must not read selected conversation state
directly.

The shape can evolve during implementation, but the boundary should contain the
same concepts normal chat already needs:

```ts
interface AgentTrajectoryViewModel {
  scope: AgentTrajectoryScope;
  activeRun: Run | null;
  activeRunLiveness: RunLiveness | null;
  blocks: TranscriptBlock[];
  messages: ChatMessage[];
  outputIdsByRunItemId: Record<string, string[]>;
  outputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  outputsById: Record<string, RunItemOutput>;
  hasMoreOlder: boolean;
  operation: string | null;
  capabilities: AgentTrajectoryCapabilities;
}
```

and actions:

```ts
interface AgentTrajectoryActions {
  loadOlder(): Promise<void>;
  loadRunItemOutput(runId: string, runItemId: string, afterOrdinal: number): Promise<void>;
  submitApproval(
    approvalId: string,
    approved: boolean,
    response: string,
    answers: ApprovalAnswer[],
    cancelled: boolean,
  ): Promise<void>;
  sendSteering?(input: ChatInput): Promise<void>;
  stopRun?(): Promise<void>;
  retryLiveness?(): Promise<void>;
}
```

Normal chat and workflow agent nodes then become adapters into this boundary:

- selected chat conversation adapter;
- workflow agent node execution adapter.

Do not keep selected-conversation reads inside the shared surface. The selected
conversation is one possible source, not the trajectory identity.

### 2. Split Chat Components Along The Boundary

Refactor existing chat UI in place so the reusable pieces are not tied to
`ChatView` or the global chat store:

- keep `ChatTranscript` or extract `AgentTrajectoryTranscript` as the shared
  transcript/activity renderer;
- keep `RunItemActivityList` as the canonical activity-row renderer;
- keep `ApprovalCard` as shared presentation, with submit behavior supplied by
  the adapter;
- split composer presentation from selected-conversation command/model/permission
  plumbing;
- make liveness presentation consume an explicit `RunLiveness` and explicit
  action callbacks.

The normal chat panel should still behave the same, but it should do so through
the selected-conversation adapter, not through special component internals.

### 3. Define Go-Owned Trajectory Contracts

The backend should own the trajectory contracts. Generate TypeScript from those
Go surfaces. Do not manually edit generated TypeScript.

Define a workflow-node-scoped trajectory page contract that can answer:

- workspace ID;
- workflow execution ID;
- node execution ID;
- selected attempt or attempt scope;
- conversation ID and run ID when the node is backed by chat;
- transcript blocks for the selected scope;
- run activity projections;
- per-run-item output page metadata;
- active run and liveness state when the node is running;
- pending approval state;
- older-page cursor for the same scope.

The output portion must preserve store pagination:

```ts
interface RunItemOutputPageState {
  outputIds: string[];
  hasMore: boolean;
  loadedThroughOrdinal: number;
  nextOrdinal: number;
}
```

The exact generated type names can differ, but the contract must not flatten
output in a way that loses `hasMore` or cursor metadata.

### 4. Replace Workflow Details Activity Preview

Remove the workflow-node-details path that adapts `RunActivityPage.output` into
fake complete pages.

Replace it with the shared trajectory surface:

- workflow metadata sections remain in the node details pane;
- the agent trajectory section is rendered by the shared component;
- output loading calls the real run-item output endpoint or a workflow-scoped
  equivalent;
- loading older history calls the workflow-node trajectory endpoint with the
  current node execution scope;
- approval submission calls the workflow approval endpoint for workflow-owned
  approvals;
- steering calls a workflow-node-scoped steering endpoint, not the selected chat
  conversation action.

Delete the no-op loader and any adapter that fabricates `hasMore: false`.

### 5. Composer And Steering Semantics

For running workflow agent nodes, support composer behavior only where the
backend lifecycle can make it deterministic.

Initial contract:

- terminal historical node: composer hidden or disabled with no fake action;
- running node with steerable active run: composer sends immediate steering to
  that node execution;
- running node without steering support: composer disabled with a specific
  reason;
- waiting-for-approval node: approval card is the primary input surface; ordinary
  steering remains separate unless the backend explicitly supports it;
- queued node messages are not shown until a node-scoped queue contract exists.

If node-scoped queueing is added, it must persist and promote through workflow
run lifecycle rules, not through selected-conversation queue state.

### 6. Remove The Old Preview Contract

After workflow node details no longer depends on the old preview shape, remove or
reshape `RunActivityPage` usage that exists only for workflow node details. If a
run-activity endpoint remains useful for other surfaces, it must return explicit
per-run-item output page metadata.

Do not keep a compatibility shim that supports both old flat output and new
paginated output. Update callers in one cut and regenerate contracts.

## Implementation Slices

### Slice 1: Component Boundary

- Identify selected-conversation dependencies in `ChatTranscript`, composer,
  liveness controls, and approval submission.
- Introduce the shared trajectory view model and actions in renderer source.
- Convert normal chat to use the new boundary without changing behavior.
- Keep the component rename/refactor mechanical and covered by existing chat
  tests first.

Progress 2026-07-03: second renderer-boundary slice completed. The initial
slice added `AgentTrajectoryViewModel`, capability flags,
`AgentTrajectoryActions`, and `AgentTrajectorySurface` in renderer source.
Normal chat now uses a selected-conversation adapter to render the existing
`ChatTranscript` through that explicit surface. This follow-up made the shared
transcript and trajectory surface enforce explicit capabilities: unsupported
queue editing/removal, immediate steering, output loading, older-history
loading, approval submission, stop, and retry actions can be omitted without
installing no-op callbacks, while enabled capabilities without actions fail
loudly during render. Run liveness presentation now accepts trajectory-owned
stop/steer/retry capability flags, and partial output without a loader remains
visibly partial instead of rendering a fake load control. Normal selected chat
still supplies the selected-conversation actions and preserves transcript
rendering, current-plan handling, queued-message controls, output loading,
immediate steering, and approval submission behavior. This slice did not wire
workflow node details yet and did not remove the old workflow activity preview.

Verification: focused renderer coverage passed with
`pnpm -C desktop exec vitest run src/renderer/src/components/agent-trajectory.test.tsx src/renderer/src/components/chat-panel.test.tsx`
and
`pnpm -C desktop exec vitest run src/renderer/src/App.test.tsx src/renderer/src/components/chat-transcript-activity.test.tsx src/renderer/src/components/agent-trajectory.test.tsx src/renderer/src/components/chat-panel.test.tsx`;
desktop typecheck and production build passed with `pnpm -C desktop typecheck`
and `pnpm -C desktop build`; desktop dead-code passed with
`pnpm -C desktop deadcode`; formatting and changed-file quality passed with
`./scripts/format.sh` and `./check_quality.sh --git-changes`.
Required deterministic Electron coverage was attempted with
`node desktop/tests/electron/chat-workflows.test.mjs --deterministic-only`; it
passed the relevant normal chat transcript, queue, approval, lifecycle,
workflow-node trajectory contract, search, scroll/reload, sidebar, and unread
conversation scenarios before failing later in the existing Codex protocol
workflow wait with `rows: []`. Live Codex Electron coverage was attempted with
`OPENAI_API_KEY` unset, but local Codex `config/read` still returned unsupported
`approval_policy = "on-failure"`, so Setta rejected conversation creation before
live-provider execution.

Remaining: finish the Phase 5 boundary by extracting composer
presentation/action props from the selected-conversation command, model, and
permission plumbing so workflow-node trajectories can avoid selected-chat queue,
attachment, command, permission, and prompt-history assumptions. Slice 3 still
owns the workflow-node adapter and deletion of the fake complete output-page
preview path.

### Slice 2: Backend Trajectory Contract

- Add Go-owned workflow agent trajectory page types and endpoint registry
  entries.
- Preserve output page metadata from the store.
- Scope older-page loading to the requested workflow node execution or explicit
  attempt.
- Include run liveness and pending approval state where applicable.
- Regenerate TypeScript contracts.

Progress 2026-07-03: completed. Added the Go-owned
`WorkflowAgentTrajectoryPage` contract and `/workflows/nodes/trajectory`
endpoint, regenerated `desktop/src/generated/backend.ts`, and exposed the
generated request/response through Electron IPC/preload as
`workflow.readNodeTrajectory`. The backend page is scoped by workspace,
execution, node execution, attempt, iteration, conversation, and run. It returns
run-scoped transcript blocks, run activity projections, initial per-run-item
output page state with durable pagination cursors, flattened outputs keyed by
page output IDs, active run/liveness for the selected active workflow-owned run,
pending workflow approval, older-history cursor state, and capability flags.

Verification covered focused chat/orchestrator/httpapi Go tests for run-scoped
history, output pagination, pending approval, and endpoint decoding; generator
tests; desktop typecheck/build; preload IPC coverage; and a deterministic
Electron production-path workflow
(`--workflow-node-trajectory-contract-only`) that reads the node trajectory
through renderer preload, main IPC, generated HTTP client, backend service, and
store. Live Codex E2E was attempted with `OPENAI_API_KEY` unset but remains
blocked by local Codex `config/read` returning unsupported
`approval_policy = "on-failure"`. Final formatting and changed-file quality
gates passed with `./scripts/format.sh` and `./check_quality.sh --git-changes`.

Remaining: Slice 3 must add the renderer workflow-node adapter and replace the
current workflow details activity preview. Slice 5 must remove the old preview
caller and fake complete output-page adaptation after that replacement is wired.

### Slice 3: Workflow Adapter

- Add a workflow-node trajectory adapter in the renderer.
- Use the shared trajectory surface in workflow node details.
- Keep workflow metadata, result, token flow, and workflow event sections around
  the shared trajectory section.
- Delete `noopLoadRunActivityOutput` and fake complete output-page adaptation.

### Slice 4: Node Composer, Liveness, And Approvals

- Wire workflow-node-scoped approval submission through the workflow approval
  endpoint.
- Wire liveness display and supported actions for workflow-owned runs.
- Add node-scoped immediate steering where the backend can attach the message to
  the active workflow-owned run.
- Do not render queue affordances until node-scoped queueing exists end to end.

### Slice 5: Cleanup

- Remove old workflow-only activity viewer helpers that duplicate shared
  trajectory behavior.
- Remove obsolete tests that assert fake complete pages or no-op loaders.
- Keep generated outputs in sync with Go-owned contracts.

## Verification Plan

Start narrow, then broaden.

### Focused Unit And Go Tests

- Renderer tests for the shared trajectory component with a normal chat adapter.
- Renderer tests for a workflow node adapter with:
  - terminal historical node;
  - running steerable node;
  - running non-steerable node;
  - pending approval;
  - output page with `hasMore: true`.
- Go tests for workflow-node trajectory paging:
  - long output preserves `hasMore` and `nextOrdinal`;
  - loading older history stays within the selected node execution or attempt;
  - wrong workspace/execution/node IDs fail specifically;
  - pending approval is associated with the workflow node execution.

### Deterministic Electron E2E

Because this touches chat behavior, workflow agent behavior, run lifecycle,
steering, approvals, event streaming, generated backend contracts, renderer chat
state, and transcript UI, deterministic Electron workflow coverage through the
production main/preload/renderer/HTTP/store paths is required.

Required scenarios:

- open a workspace, create a workflow with an agent node, run it, open node
  details, and verify the shared trajectory renders activity;
- produce output longer than the initial preview, verify "Load more" appears,
  click it, and verify later output renders;
- run a workflow agent node that requests approval, submit approval from node
  details, and verify the workflow continues;
- steer a running workflow agent node from node details and verify the steering
  appears in the same node-scoped trajectory;
- reload/restart while viewing workflow node details and verify trajectory state,
  liveness, output pagination, and approval state recover from durable store;
- verify a historical attempt does not load unrelated attempts when paging older
  trajectory history.

### Live Provider E2E

Run live Codex E2E coverage when the local Codex CLI is signed in with ChatGPT
auth. Do not use `OPENAI_API_KEY` for the live-provider test. If ChatGPT auth is
not available, report the skip explicitly and do not treat it as proof of
provider integration.

### Final Gates

Before committing source, generated contracts, tests, or scripts:

- run `./scripts/format.sh`;
- run `./check_quality.sh --git-changes`;
- run broader gates only if contract generation or broad workflow behavior
  changes require them.

## Non-Goals

- Do not preserve the old workflow activity preview behavior.
- Do not add old-field aliases, compatibility decoders, migrations, or dual
  support for old and new trajectory contracts.
- Do not keep fake load-more, fake queue, fake composer, or fake approval
  controls.
- Do not infer workflow-node scope from the selected chat conversation.
- Do not implement heuristic filtering of transcript rows by text or labels.
  Scope must come from typed workflow/chat/run metadata.
- Do not weaken existing chat behavior to make workflow reuse easier.

## Done Criteria

- Normal chat uses the shared trajectory surface through a selected-conversation
  adapter.
- Workflow agent node details uses the same trajectory surface through a
  workflow-node adapter.
- Workflow node details no longer fabricates complete output pages from preview
  data.
- Long workflow-agent output can be loaded incrementally from node details.
- Workflow-node approvals, liveness, and steering use workflow-node-scoped
  contracts.
- Historical workflow attempts page only within the selected scope.
- Generated TypeScript contracts are regenerated from Go-owned types.
- Required deterministic Electron workflow tests cover trajectory rendering,
  pagination, approval, steering, and restart/reload behavior.
