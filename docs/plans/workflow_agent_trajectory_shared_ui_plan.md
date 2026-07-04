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

Progress 2026-07-03: component-boundary slice completed. The initial slices
added `AgentTrajectoryViewModel`, capability flags, `AgentTrajectoryActions`,
and `AgentTrajectorySurface` in renderer source. Normal chat now uses a
selected-conversation adapter to render the existing `ChatTranscript` through
that explicit surface, and the shared transcript/trajectory boundary enforces
capability-owned actions for queue editing/removal, immediate steering, output
loading, older-history loading, approval submission, stop, and retry behavior.
This final boundary slice extracted explicit `ComposerViewModel` and
`ComposerActions` contracts plus a selected-chat composer adapter. `Composer`
now receives command, attachment, prompt-history, model, permission, queue,
steering, stop, retry, and send actions explicitly instead of reading the whole
selected chat view. Unsupported action groups do not render selected-chat
controls, queue capture is disabled when no queue action exists, and enabled
run-control presentation without the matching action fails loudly during render.
Normal selected chat still supplies the selected-conversation actions and
preserves transcript rendering, current-plan handling, composer prompt history,
attachments, slash commands, permission/model controls, queued-message controls,
output loading, immediate steering, and approval submission behavior. This
slice did not wire workflow node details yet and did not remove the old workflow
activity preview.

Audit follow-up fixed residual selected-conversation coupling in the composer
boundary. `ComposerViewModel` now exposes an explicit composer session with the
derived command-cache key, model/permission labels, image support, and scope ID;
the selected-chat composer adapter is the only composer path that reads
`Conversation` state. Steering-only composer sessions no longer need a fake
`sendMessage` action, and send/steering controls are enabled only when the
current run mode has the matching action.

Verification: focused renderer coverage passed with
`pnpm -C desktop exec vitest run src/renderer/src/components/chat-panel.test.tsx src/renderer/src/components/agent-trajectory.test.tsx`;
desktop typecheck and production build passed with `pnpm -C desktop typecheck`
and `pnpm -C desktop build`; dead-code analysis passed with
`pnpm -C desktop deadcode`. The final repository gate for changed files was
`./scripts/format.sh` plus `./check_quality.sh --git-changes`. Required
deterministic Electron coverage was attempted with
`node desktop/tests/electron/chat-workflows.test.mjs --deterministic-only`; it
passed codex account, happy path, image attachments, composer prompt history,
activity projection, command-start failure, chronological transcript, background
terminal, queued controls, cancel/fail queue, approvals, slash commands,
permission modes, conversation switch, defaults, lifecycle hardening,
workflow-node trajectory contract, Codex approval-policy removal, Codex
app-server lifecycle, and transcript search before failing in transcript-scroll
with a bottom-tolerance timing assertion. A focused direct rerun of the
transcript-scroll launch helper passed both `transcript-scroll` and
`transcript-scroll-reload`. Live Codex Electron coverage was attempted with
`OPENAI_API_KEY` unset, but local Codex `config/read` still returned unsupported
`approval_policy = "on-failure"`, so Setta rejected conversation creation before
live-provider execution.

Audit follow-up focused verification passed
`pnpm -C desktop exec vitest run src/renderer/src/components/chat-composer.test.tsx src/renderer/src/components/chat-panel.test.tsx src/renderer/src/components/agent-trajectory.test.tsx`
and `pnpm -C desktop typecheck`. `./scripts/format.sh` and
`./check_quality.sh --git-changes` passed after the follow-up. A deterministic
Electron rerun with
`node desktop/tests/electron/chat-workflows.test.mjs --deterministic-only`
passed through happy path, image attachments, composer prompt history, activity
projection, command-start failure, chronological transcript, background
terminal, queued controls, cancel/fail queue, approvals, slash commands,
permission modes, conversation switch, defaults, lifecycle hardening,
workflow-node trajectory contract, Codex approval-policy removal, Codex
app-server lifecycle, transcript search/scroll/reload, sidebar,
cross-workspace sidebar, and unread-conversation scenarios before failing in the
existing later Codex-protocol workflow wait with `rows: []`. Live Codex
Electron coverage was attempted with `OPENAI_API_KEY` unset, but local Codex
`config/read` still returned unsupported `approval_policy = "on-failure"`, so
Setta rejected conversation creation before live-provider execution.

Remaining: Slice 3 must add the renderer workflow-node adapter and replace the
current workflow details activity preview. Slice 5 must remove the old preview
caller and fake complete output-page adaptation after that replacement is wired.

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

Progress 2026-07-03: completed. Workflow run node details now load the
Go-owned `workflow.readNodeTrajectory` page for `agent.codex` node executions
and render it through `AgentTrajectorySurface` with an explicit
`workflowNodeExecution` scope. The workflow adapter maps generated trajectory
pages into the shared view model, preserves per-run-item output cursors and
`hasMore`, merges older node-scoped transcript pages, loads additional output
through the explicit run-item output endpoint, and submits pending approvals
through `workflow.submitApproval`. Unsupported workflow-node steering,
stop-run, retry-liveness, and queue affordances remain disabled and fail loudly
if the backend starts advertising those capabilities before renderer actions
exist. Workflow metadata, result, branch state, token flow, and event sections
remain in the node details pane around the shared trajectory section.

The old workflow details `RunActivityPage` preview caller,
`noopLoadRunActivityOutput`, fake complete output-page adaptation, and obsolete
non-transcript `RunItemActivityList` helper were removed. Focused renderer
tests cover workflow adapter cursor preservation, older-page merge behavior,
workflow-node scope mapping, details rendering/focus, and the existing details
helpers. Electron browser-driver assertions now verify node details render a
workflow-node-scoped trajectory instead of selected-chat scope.

Verification:

- `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/workflow-node-agent-trajectory-adapter.test.ts src/renderer/src/features/workspace-graph/workflow-node-details-components.test.tsx src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts src/renderer/src/components/agent-trajectory.test.tsx src/renderer/src/components/chat-transcript-activity.test.tsx`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop deadcode`
- `pnpm -C desktop build`
- `node --check desktop/tests/electron/browser-driver.js`
- `node --check desktop/tests/electron/workflow-activity-feed-chip-clicks.mjs`
- `node --check desktop/tests/electron/workflow-blank-canvas.test.mjs`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`
- `node desktop/tests/electron/workflow-blank-canvas.test.mjs --skip-build`
- `node desktop/tests/electron/workflow-activity-feed.test.mjs --skip-build`
  was attempted and exercised the updated chip-click path, but failed at the
  final renderer-console gate because the existing workflow event listener leak
  warning was recorded:
  `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 workflow:event listeners added`.
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`
  was attempted with ChatGPT auth available, but local Codex `config/read`
  still returned unsupported `approval_policy = "on-failure"`, so Setta
  rejected conversation creation before live-provider execution.

Remaining: Slice 4 still owns workflow-node retry-liveness. Queue affordances
and pending-steering replay remain hidden until a node-scoped queue/replay
contract exists end to end.

### Slice 4: Node Composer, Liveness, And Approvals

- Wire workflow-node-scoped approval submission through the workflow approval
  endpoint.
- Wire liveness display and supported actions for workflow-owned runs.
- Add node-scoped immediate steering where the backend can attach the message to
  the active workflow-owned run.
- Do not render queue affordances until node-scoped queueing exists end to end.

Progress 2026-07-03: stop-run controls completed. Added the Go-owned
`StopWorkflowNodeRun` request and `/workflows/nodes/runs/stop` endpoint, then
regenerated TypeScript and exposed the generated client through Electron
main/preload/shared IPC as `workflow.stopNodeRun`. Workflow node trajectory
capabilities now advertise `canStopRun` only when the selected workflow-owned
active run is cancellable. The renderer adapter maps that capability into the
shared trajectory action contract and into a node-scoped composer stop action.
The composer is shown for a running workflow node, but its text input remains
disabled until node-scoped steering exists.

Audit follow-up fixed exact-run cancellation for reused workflow conversations.
Node stop and Codex runner cancellation now pass the committed `chat.run`
runner ref into a chat service exact-run cancellation boundary. If the
conversation's active run no longer matches that ref, the request fails before
any provider cancel request is issued.

Verification:

- `./scripts/go.sh run ./cmd/generate-contracts`
- `./scripts/go.sh test ./internal/orchestrator -run 'TestService(ReadWorkflowNodeTrajectory|StopWorkflowNodeRun)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestWorkflow(NodeTrajectoryEndpoint|EndpointStopsNodeScopedRun)' -count=1`
- `./scripts/go.sh test ./cmd/generate-contracts -count=1`
- `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/workflow-node-agent-trajectory-adapter.test.ts --reporter=dot`
- `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/workflow-node-details-components.test.tsx --reporter=dot`
- `pnpm -C desktop exec vitest run src/preload/index.test.ts --reporter=dot`
- `pnpm -C desktop exec vitest run src/renderer/src/stores/chat-store-navigation.test.ts src/renderer/src/stores/workspace-store.test.ts --reporter=dot`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop build`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`
  was attempted with ChatGPT auth available, but local Codex `config/read`
  still returned unsupported `approval_policy = "on-failure"`, so Setta
  rejected conversation creation before live-provider execution.
- `./scripts/format.sh`
- `./check_quality.sh --git-changes`
- Audit follow-up reruns passed
  `./scripts/go.sh test ./internal/chat -run 'TestServiceCancelActiveRunByIDRejectsDifferentActiveRunBeforeProviderCancel|TestServiceCancelFakeGoalOperationUnblocksWait|TestServiceCancelsActiveRunThroughHarness' -count=1` and
  `./scripts/go.sh test ./internal/orchestrator -run 'TestService(ReadWorkflowNodeTrajectory|StopWorkflowNodeRun)|TestCodex|TestServiceCancel' -count=1`,
  `./scripts/go.sh test ./internal/httpapi -run 'TestWorkflow(NodeTrajectoryEndpoint|EndpointStopsNodeScopedRun)' -count=1`,
  and
  `node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`.
  `env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`
  passed, while
  `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`
  remained blocked by local Codex `config/read` returning unsupported
  `approval_policy = "on-failure"` before live-provider execution.

Progress 2026-07-03: workflow-node steering controls completed. Added the
Go-owned `SteerWorkflowNodeRun` request and `/workflows/nodes/runs/steer`
endpoint, regenerated TypeScript, and exposed the generated client through
Electron main/preload/shared IPC as `workflow.steerNodeRun`. Workflow node
trajectory capabilities now advertise `canSteer` only for attached, running,
non-approval-blocked workflow-owned runs. The renderer maps that capability into
the node-scoped composer `steerMessage` action and reloads the node trajectory
after steering. The chat service exact-run steering boundary rejects active-run
mismatches before any provider steering request or steering-message persistence,
so reused workflow conversations cannot steer the wrong run.

The shared transcript `sendSteering` capability remains disabled for workflow
nodes because it also exposes the selected-chat pending-steering replay
affordance. The workflow node composer can steer through the node-scoped
endpoint, but selected-chat queue controls and pending-steering replay remain
hidden until a node-scoped queue/replay contract exists.

Verification:

- `./scripts/go.sh run ./cmd/generate-contracts`
- `./scripts/go.sh test ./cmd/generate-contracts -count=1`
- `./scripts/go.sh test ./internal/chat -run 'TestService(SteeringPersistsMessageAndCallsHarness|SteerActiveRunByIDRejectsDifferentActiveRunBeforeProviderSteer)' -count=1`
- `./scripts/go.sh test ./internal/orchestrator -run 'TestService(ReadWorkflowNodeTrajectory|StopWorkflowNodeRun|SteerWorkflowNodeRun)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestWorkflow(NodeTrajectoryEndpoint|Endpoint(Steers|Stops)NodeScopedRun)' -count=1`
- `pnpm -C desktop exec vitest run src/renderer/src/components/chat-composer.test.tsx src/renderer/src/features/workspace-graph/workflow-node-agent-trajectory-adapter.test.ts src/renderer/src/features/workspace-graph/workflow-node-details-components.test.tsx src/preload/index.test.ts --reporter=dot`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop deadcode`
- `pnpm -C desktop build`
- `node --check desktop/tests/electron/workflow-node-trajectory-contract-cases.mjs`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`
  was attempted with ChatGPT auth available, but local Codex `config/read`
  still returned unsupported `approval_policy = "on-failure"`, so Setta
  rejected conversation creation before live-provider execution. This failed
  live-provider attempt is not provider-integration proof.
- `./scripts/format.sh`
- `./check_quality.sh --git-changes`

Progress 2026-07-03: workflow-node retry-liveness completed. Added the
Go-owned `RetryWorkflowNodeRunLiveness` request and
`/workflows/nodes/runs/retry-liveness` endpoint, regenerated TypeScript
contracts, and exposed the generated client through Electron main/preload/shared
IPC as `workflow.retryNodeRunLiveness`. The chat service now has an exact-run
reconciliation boundary so a workflow node can retry liveness only for the
committed `chat.run` runner ref; mismatched active runs are rejected before
provider reconciliation. Workflow node trajectory capabilities now expose
`canRetryLiveness` only for attached, running, retryable workflow-owned runs,
and the renderer maps that capability into the shared trajectory/composer retry
control through the node-scoped endpoint.

Verification:

- `./scripts/go.sh run ./cmd/generate-contracts`
- `./scripts/go.sh test ./cmd/generate-contracts -count=1`
- `./scripts/go.sh test ./internal/chat -run 'TestServiceReconcile(ActiveRunByIDRejectsDifferentActiveRunBeforeProviderReconcile|ProviderUnavailableMarksLost)' -count=1`
- `./scripts/go.sh test ./internal/orchestrator -run 'TestService(ReadWorkflowNodeTrajectory|StopWorkflowNodeRun|SteerWorkflowNodeRun|RetryWorkflowNodeRunLiveness)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestWorkflow(NodeTrajectoryEndpoint|Endpoint(Steers|Stops)NodeScopedRun|EndpointRetriesNodeRunLiveness)' -count=1`
- `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/workflow-node-agent-trajectory-adapter.test.ts src/renderer/src/features/workspace-graph/workflow-node-details-components.test.tsx src/preload/index.test.ts src/renderer/src/stores/chat-store-navigation.test.ts src/renderer/src/stores/workspace-store.test.ts --reporter=dot`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop deadcode`
- `pnpm -C desktop build`
- `node --check desktop/tests/electron/workflow-node-trajectory-contract-cases.mjs`
- `node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`
- `env -u OPENAI_API_KEY node desktop/tests/electron/chat-workflows.test.mjs --live-only`
  was attempted with ChatGPT auth available, but local Codex `config/read`
  still returned unsupported `approval_policy = "on-failure"`, so Setta
  rejected conversation creation before live-provider execution. This failed
  live-provider attempt is not provider-integration proof.
- `./scripts/format.sh`
- `./check_quality.sh --git-changes`

Remaining: queue affordances and pending-steering replay remain hidden until a
node-scoped queue/replay contract exists end to end.

### Slice 5: Cleanup

- Remove old workflow-only activity viewer helpers that duplicate shared
  trajectory behavior.
- Remove obsolete tests that assert fake complete pages or no-op loaders.
- Keep generated outputs in sync with Go-owned contracts.

Progress 2026-07-03: completed for the preview-removal cleanup owned by Slice
3. No generated contracts changed in this renderer-only slice.

Progress 2026-07-04: Phase 8 verification added rendered workflow-node output
pagination coverage to the deterministic Electron
`--workflow-node-trajectory-contract-only` workflow. The test now starts the
long-output workflow through the real graph toolbar, opens canonical node
details, expands the shared workflow-node trajectory activity, verifies the
initial page stops at `projection output chunk 040` with a real `Load more`
control, clicks it, and verifies `projection output chunk 041` renders through
the `chat:run-item-output` / `/chat/runs/item-output` path. The
workflow-node-details browser driver now exposes scoped trajectory state,
activity expansion, and load-more helpers. Remaining deterministic coverage
gaps are approval submission from node details, steering through the rendered
node composer, reload/restart while already viewing node details, and
historical-attempt paging.
Verification 2026-07-04: `node --check` covered the touched Electron helper
files, the Electron template guard covered the changed browser-program files,
`node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`
passed, and the final repository gates were `./scripts/format.sh` plus
`./check_quality.sh --git-changes`.

Audit follow-up 2026-07-04: moved the rendered-pagination reload readiness
check behind the shared browser driver and waited for the CDP page load event
before reinstalling driver extensions, fixing a reload race found by the focused
Electron workflow rerun. The rendered pagination path still verifies chunk 041
arrives only through `chat:run-item-output` / `/chat/runs/item-output`, and the
remaining deterministic coverage gaps are unchanged.

Progress 2026-07-04: deterministic Electron coverage now exercises rendered
workflow-node approval submission end to end in
`--workflow-node-trajectory-contract-only`. The test starts a
`command approval workflow` agent node through the real graph toolbar, waits for
the workflow-owned pending approval, opens canonical node details, verifies the
shared workflow-node trajectory approval card exposes an enabled decision
control, clicks Approve from that node-scoped card, and waits for the same
details trajectory to remove the approval card and render `Command approval
resolved.` The workflow-node-details browser driver now exposes scoped approval
state and decision-click helpers, and the graph-node details helper waits for
visible canvas coordinates plus typed graph selection before using the toolbar
details button.
Verification 2026-07-04: `node --check` covered the touched Electron helper
files, the Electron template guard covered the changed browser-program files,
and
`node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`
passed. Remaining deterministic coverage gaps after this approval slice were
steering through the rendered node composer, reload/restart while already viewing
node details, and historical-attempt paging.

Progress 2026-07-04: deterministic Electron coverage now exercises rendered
workflow-node composer steering end to end in
`--workflow-node-trajectory-contract-only`. The test starts a steerable workflow
agent node through the real graph toolbar, uses production run-navigation
controls when the graph remains on the draft, opens canonical node details,
verifies the scoped workflow-node composer textarea is enabled with the send
button disabled until text is entered, sends `finish node trajectory steering`
from that composer, and waits for the same node-scoped trajectory to render both
the steering prompt and `Steered with finish node trajectory steering.` The
workflow-node details driver now exposes scoped composer state, text entry,
send helpers, and production sidebar/run navigation helpers. A small renderer
projection-state guard preserves an
explicitly selected run when selected-definition auto-loading catches up for the
same definition, and the workflow graph surface registers a typed
surface-scoped node-details debug opener that opens the same node-details target
path as a graph node open. Verification 2026-07-04: `node --check` covered the
touched Electron helper files,
`pnpm vitest run src/features/workspace-graph/workflow-graph-projection-state.test.ts`
covered the projection-state race guard, `pnpm build` covered renderer
typechecking and the production bundle, and
`node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`
passed. Live Codex verification was attempted with ChatGPT auth available and
`OPENAI_API_KEY` unset, but the local Codex config blocked startup because
`config.approval_policy` is the deprecated unsupported value `"on-failure"`.
Remaining deterministic coverage gaps are reload/restart while already viewing
node details and historical-attempt paging.

Audit follow-up 2026-07-04: no steering behavior gaps were found, but the
typed node-details debug opener was initially registered outside graph debug
mode. It is now gated by the existing `debugEnabled` graph flag so the focused
Electron workflow keeps its deterministic opener only in debug-mode launches.
Focused reruns passed projection-state Vitest, desktop typecheck/build, touched
Electron syntax checks, the Electron template-literal guard, and
`node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`.

Progress 2026-07-04: deterministic Electron coverage now exercises renderer
reload while workflow-node details are already open. Workflow node details
targets are persisted on the Go-owned `WorkspaceUIPane` contract as
`WorkflowNodeDetailsPaneConfig`, regenerated into TypeScript, passed through
workspace layout open/reconfigure requests, and used by the details surface when
the selected-node store is empty after reload. Reconfiguring an existing limited
pane now excludes the pane being reconfigured, so the one workflow-node-details
pane can be reused for a different node while updating its persisted target.
The focused Electron workflow waits for the details pane target to be durably
saved, reloads the renderer while viewing details, and verifies recovery for
output pagination, pending approval state, and steerable/liveness composer
state before continuing through the node-scoped load-more, approval, and
steering actions. Verification passed
`./scripts/go.sh test ./internal/workspaceui -count=1`,
`./scripts/go.sh test ./cmd/generate-contracts -count=1`,
`./scripts/go.sh test ./internal/httpapi -run 'TestWorkspaceUILayout' -count=1`,
focused renderer/layout/preload Vitest coverage, touched Electron syntax
checks, the Electron template-literal guard, `pnpm -C desktop build`, and
`node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`.
Live Codex auth was available, but live E2E remains blocked by local Codex
`config/read` returning unsupported `approval_policy = "on-failure"`. Remaining
deterministic coverage gap: historical-attempt paging. A full Electron app
relaunch while details are open is not separately exercised by this
renderer-reload slice.

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

Progress 2026-07-04: deterministic Electron coverage now explicitly covers
rendered workflow-node trajectory pagination through node details and the real
run-item output endpoint, plus workflow-node approval submission from the shared
node-scoped trajectory card, plus rendered workflow-node composer steering from
the same node-scoped trajectory. It now also covers renderer reload while node
details are already open for output pagination, pending approval state, and
steerable/liveness composer state, backed by a persisted Go-owned
workflow-node-details pane target. Historical-attempt paging remains to be
added; full app relaunch while details are open is not separately exercised.
