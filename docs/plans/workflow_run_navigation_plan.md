# Workflow Run Navigation And History Plan

- **Date:** June 23, 2026
- **Status:** Ready for implementation review.
- **Scope:** Make workflow runs first-class navigable history, enforce one active
  run per workflow definition, and keep active runs reachable from the draft
  editor.

## Goal

Running a workflow should create a durable run that the user can revisit.

The user should be able to:

- start a workflow run from the editable draft;
- switch back to the editable draft without losing the active run;
- return to the active run with a clear `View Active Run` action;
- see prior runs for the selected workflow;
- select a previous run and load the graph in the last state that run reached;
- start another run only after the current active run is terminal or explicitly
  resolved.

This is the navigation foundation for future replay. Replay is not part of this
slice, but the implementation should preserve the model where a run view is an
immutable execution projection at a specific point in the workflow event stream.

## Product Decision

Setta should allow **one active run per workflow definition at a time**.

This is not "run once forever." A workflow can be run repeatedly over time. The
rule is:

- one `running` execution may exist for a given `workspaceId + definitionId`;
- terminal executions (`completed`, `failed`, `stopped`, `cancelled`) are
  history;
- different workflow definitions may run in parallel;
- editing the draft while a run is active is allowed, but the active run remains
  tied to the immutable version snapshot captured when it started.

The backend must enforce this rule. The renderer should make the rule obvious,
but the UI must not be the only guard.

The rule must never permanently strand a workflow. A run that is active or needs
manual recovery stays a non-terminal (`running`) execution, and the existing
`Stop`/cancel control is its escape hatch: the user can always reach the run via
`View Active Run` and stop it, which makes it terminal history and unblocks a new
run. Do not gate `Stop` so that it disappears for a recovery-required run, and do
not add a separate destructive "force terminal" path in this slice.

## Why This Is Needed

A manual recording exposed the current failure mode:

1. User clicked `Run`.
2. User clicked `Stop`; the first execution cancelled correctly.
3. User clicked `Draft`; the app loaded the editable draft projection.
4. User clicked `Run` again.
5. User clicked `Draft`; the second run continued in the backend but became
   visually hidden.
6. User clicked `Run` a third time and then `Stop`.
7. The hidden second run's Codex chat run later failed during app shutdown, but
   the workflow execution row stayed persisted as `running`.

The existing logs were enough to diagnose the issue:

- `Draft` issued `/workflows/graph/read` with empty `executionId` and
  `versionId`;
- it did not cancel or pause the active execution;
- `workflow_runs.status` for the hidden run remained `running`;
- the hidden chat run failed with `event hub is closed`.

There is also a concrete renderer defect behind the "hidden run" behavior. While
the draft is shown, the projection target has an empty `executionId/versionId`,
and `workflowEventMatchesProjectionTarget` treats that as matching any workflow
event for the definition; `loadEventProjection` then re-reads using the event's
`executionId` and adopts that run as the new target. So the draft view both fails
to surface the active run and can be silently pulled into it on the next event.

So the problem is not missing logging. The problem is the product model, the
lifecycle invariant, and a renderer that has no explicit view target.

## Product Model

Use these terms consistently:

- **Draft:** editable authored workflow definition.
- **Version:** immutable snapshot captured at run start.
- **Run / execution:** persisted runtime state for one workflow version.
- **Active run:** a run whose execution status is `running`.
- **Historical run:** a terminal run.
- **Run view:** read-only graph projection for an execution.

The graph surface can show either:

- editable draft projection;
- read-only active run projection;
- read-only historical run projection.

Future replay will add "run projection at event ordinal N" on top of this. This
slice should load the latest projection for a selected run only.

## Graph State Model

The renderer must store the explicit answer to "what am I viewing?" instead of
inferring it from whichever projection was last loaded. Model the graph surface
state as a single discriminated target:

```ts
type WorkflowGraphTarget =
  | { kind: "draft"; workspaceId: string; definitionId: string }
  | {
      kind: "run";
      workspaceId: string;
      definitionId: string;
      executionId: string;
      versionId: string;
    };
// future: | { kind: "replay"; ...; ordinal: number }
```

`WorkflowGraphProjection` is **derived** from the target by backend reads; it is
not the primary state. View switches set the target, and a single effect fetches
the projection for the current target and keeps the existing event-driven
refresh.

This is already latent in the renderer: the projection hook
(`workflow-graph-projection-state.ts`) already holds an internal
`{ workspaceId, definitionId, executionId, versionId }` target and derives the
projection from it. This slice promotes that hidden target to explicit primary
state and routes the view-switch handlers (`runWorkflowDraft`,
`showDraftWorkflow`, `cancelWorkflowRun`) through it. Build only the `draft` and
`run` arms now; leave a clean seam for a future `replay` arm and build none of
it. Do not layer additional draft/run/active booleans onto the projection.

Keep two concepts separate:

- **Target:** what the user is viewing (view intent).
- **Run summaries:** what runs exist, owned by the backend (inventory).

"An active run exists" is summary state, not target state. The toolbar composes
the two: in a `draft` target, if summaries report an active run, show `View
Active Run`, which sets the target to that run. This composition — not booleans
on the projection — is what keeps the toolbar logic flat.

Event handling must respect the selected target:

- a `draft` target ignores workflow execution events for projection refresh;
- workflow execution events may refresh run summaries while the user stays on
  the draft target;
- a `run` target refreshes projection only for the selected execution id;
- a future `replay` target should ignore live execution events for projection
  refresh unless the user explicitly exits replay.

This closes the current hidden bug where an empty `executionId/versionId` draft
target can match any workflow event for the definition and pull the graph back
into a run projection.

The fix belongs in the event handler, not the match predicate.
`loadEventProjection` must re-read the projection for the **current target's**
identity and never adopt the event's `executionId`; a `draft` target refreshes
run summaries only and never switches to a run projection. Do not "fix" this by
making `workflowEventMatchesProjectionTarget` reject draft targets outright —
that would also kill the summary refresh that makes `View Active Run` appear
live.

## UX Contract

### Draft View With No Active Run

Show:

- `Run`
- `Validate`
- normal draft editing controls
- `Runs` selector if history exists

Clicking `Run` starts a new execution, captures a version snapshot, and switches
to that run view.

### Draft View With Active Run

Show:

- `View Active Run` instead of `Run`
- `Validate`
- normal draft editing controls
- `Runs` selector with the active run pinned at the top

Do not show a second `Run` button for the same workflow while an active run
exists.

Clicking `View Active Run` loads the active execution projection. The active run
view then exposes the existing `Stop` button.

Do not make `Edit Draft` imply stop, pause, or clone. Draft editing remains
separate from run control.

### Active Run View

Show:

- `Stop`
- `Edit Draft`
- `Runs` selector
- run status and short run/version identity

If the current draft differs from the active run version, keep the existing
version mismatch messaging.

### Historical Run View

Show:

- terminal run status (`completed`, `failed`, `stopped`, `cancelled`);
- `Edit Draft`;
- `Runs` selector;
- no `Stop`;
- no `Run` unless the user switches back to the draft and no active run exists.

Selecting a historical run loads the graph in that run's latest persisted
projection state. It should not subscribe the graph as though the run is live.

### Run Selector

Use a compact toolbar selector/dropdown for the first implementation. Do not
start with nested left-sidebar accordions under every workflow.

Minimum selector rows:

- status icon/color;
- status label;
- started time or completed time;
- short run id;
- version number or short version id if available.

The active run, if present, should be pinned above historical runs.

Later, the left overview pane can show run badges or expandable history once the
workflow-surface interaction is proven. The first slice should keep history
contextual to the selected workflow.

## Backend Contract

### 1. Enforce One Active Run Per Definition

`Service.StartExecution(workspaceID, definitionID, versionID)` must reject a new
start if any existing execution for the same `workspaceId + definitionId` has
status `running`.

Important details:

- check while holding the service lock;
- check before creating a new immutable version snapshot;
- return a typed/domain-specific error that includes the active execution id;
- map that error to an HTTP conflict response with a stable error code;
- do not rely on renderer state to prevent duplicate starts;
- define the blocking active-run predicate once: `execution.status ===
"running"`. A recovery-required node still blocks because its execution remains
  `running`. Reuse that exact predicate for the start guard and the run
  selector's active pin, so the guard and the summaries can never disagree;
- add a `(workspace_id, definition_id)` index so the active-run check and the
  definition-scoped history query are efficient; do not scan all workspace
  executions in memory. (Today `ListExecutions` is workspace-scoped only and
  there is no such index.)

Expected HTTP error shape should be Go-owned and generated into TypeScript. Do
not hardcode mirrors in the renderer.

Suggested error code:

- `workflow_execution_already_running`

Suggested payload:

- `activeExecution`: run summary for the active execution.

### 2. Add Run History Query

Add a production endpoint to list executions for one workflow definition, newest
first.

Suggested endpoint:

- `POST /workflows/executions/list`

Suggested request:

- `workspaceId`
- `definitionId`
- optional `limit`

Suggested response:

- `executions: WorkflowExecutionSummary[]`

Suggested summary fields:

- `id`
- `workspaceId`
- `definitionId`
- `definitionVersionId`
- `definitionVersionNumber`
- `status`
- `terminalReason`
- `startedAt`
- `updatedAt`
- `completedAt`
- `lastEventOrdinal`
- optional short display metadata already owned by the backend.

Keep summaries small. Do not include full graph projections, full event lists,
runner payloads, chat transcripts, or activity records in the list response.

### 3. Reuse Existing Projection Reads

Selecting a run should call the existing graph projection path with:

- selected `definitionId`;
- selected `definitionVersionId`;
- selected `executionId`.

Do not create a second projection model for run history. The renderer should
continue to consume `WorkflowGraphProjection`.

### 4. Stale Active Run Reconciliation (Build On The Existing Recovery Path)

The one-active-run invariant makes stale active executions more visible and more
dangerous. Do not leave a workflow permanently blocked by an execution that is
only `running` because Setta missed a runner terminal event.

Most of this machinery already exists. This step enforces and surfaces it; it
does not rebuild it:

- `NewService` already runs startup recovery (`recoverInterruptedExecutions`);
- chat recovery already marks interrupted `running` chat runs as `failed` on
  restart;
- `CodexActionRunner.Recover` already loads the chat run, reconciles a terminal
  run to a completed/failed action, or returns manual-recovery-required;
- a live chat-event reconciler already updates running executions while the app
  is up.

So the recording's stuck-`running` row should already reconcile on the next
startup. Do not reimplement this. The remaining work is:

- add a regression test that proves the recorded failure mode reconciles: a
  terminal hidden chat run leaves the workflow execution reconciled (not healthy
  `running`) after restart;
- make the new one-active-run guard treat a `running` execution with manual
  recovery state as still active (blocking and visible), so a stuck run is never
  silently skipped;
- ensure such a run stays reachable via `View Active Run` and the run selector.

Do not introduce an execution-level `recovery_required` status in this slice.
Recovery is already represented by a node status plus the execution's
`RecoveryOutcome`. Keep the execution non-terminal (`running`) and represent the
recovery need through those existing fields. This keeps the slice small, leaves
the `WorkflowExecutionStatus` union (and the `Stop` button visibility that
depends on `executionStatus === "running"`) unchanged, and keeps `Stop`
available as the escape hatch (see Product Decision).

Do not add silent cleanup that marks unknown work completed. Fail loudly or mark
manual recovery when correctness is uncertain.

## Renderer Contract

### 1. Store Run Summaries Per Selected Definition

Add renderer state for run summaries keyed by workflow definition id.

Requirements:

- fetch when a workflow definition is opened;
- refresh on lifecycle transitions only: run start, run terminal, and explicit
  selector interaction;
- do not refresh summaries on every workflow event; the projection hook already
  re-reads per event, and summaries must not piggyback on that firehose;
- prefer push/event-driven refreshes over polling;
- avoid duplicate `graph/read` bursts for the same event sequence.

The latest manual recording showed many repeated `/workflows/graph/read` calls
for one event burst. Do not make run history worse by adding broad refresh loops.

### 2. Derive Active Run From Backend Summaries

The draft toolbar should derive active-run state from backend-owned execution
summaries, not from local guesses.

If summaries say an active run exists:

- hide/replace `Run` with `View Active Run`;
- keep draft editing available;
- make the active run available in the run selector.

If the backend rejects `Run` because an active execution appeared concurrently,
handle the conflict by refreshing run summaries and offering `View Active Run`.

### 3. Add Run Selector UI

Add a compact toolbar selector.

Requirements:

- active run pinned first;
- terminal runs listed newest-first;
- selecting a run loads the run projection;
- selected run remains visibly selected;
- selector is stable at small toolbar widths;
- visual verification screenshots show the selector in its key states: no
  history, active run pinned, historical run selected, and narrow toolbar width;
- no large popover or sidebar redesign in this slice.

### 4. Preserve Existing Graph Surface Invariants

Run selection should not regress the graph renderer work from prior phases.

Assertions should cover:

- selecting a historical run does not recreate the Pixi app;
- marker/chip projection updates stay bounded;
- camera state is not reset by run-list refresh alone;
- content-only graph updates remain content-only.

## Data And Migration Policy

No legacy compatibility, migrations, or transitional dual paths.

This slice should be implementable with existing SQLite workflow runtime tables.
If a new index is needed for efficient active-run or definition-run queries, add
it at the store schema owner. Avoid new persisted columns unless the existing
tables cannot express the product need.

Do not manually edit generated outputs. If Go-owned HTTP contracts or generated
inputs change, regenerate TypeScript surfaces before verification.

## Non-Goals

- replay scrubber;
- replay animation;
- event-ordinal time travel UI;
- left-sidebar run-history accordion;
- run diffing;
- run deletion;
- run renaming;
- bulk run management;
- direct `Stop Active Run` from draft view;
- a new execution-level `recovery_required` status;
- a destructive "force terminal" / force-resolve path for stuck runs;
- chat transcript rendering inside the run selector;
- polling for run status;
- heuristic inference from assistant text, shell output, or button labels.

## Implementation Order

### Step 1: Backend Active-Run Guard

Add the one-active-run invariant to `StartExecution`.

Tests:

- starting the same workflow twice while the first execution is running returns
  a typed conflict;
- no new version snapshot is created for the rejected start;
- starting a different workflow while the first is running still succeeds;
- starting the same workflow after cancellation/completion succeeds.

### Step 2: Run History API

Add the run-summary endpoint and generated TS contract.

Tests:

- summaries are newest-first;
- active run is included;
- terminal history is included;
- response is scoped to the requested workspace and definition;
- response does not include full graph or event payloads.

### Step 3: Renderer Run Navigation

Promote the hidden projection target to an explicit `WorkflowGraphTarget` (see
Graph State Model) with `draft` and `run` arms, then add run-summary state,
`View Active Run`, and the toolbar run selector on top of it.

Tests:

- draft view with no active run shows `Run`;
- draft view with active run shows `View Active Run` and not `Run`;
- clicking `View Active Run` loads the active run projection and shows `Stop`;
- selecting a historical run loads its terminal graph projection;
- returning to draft preserves edit controls and run history.

### Step 4: Stale Active Reconciliation

Build on the existing recovery path (do not rebuild it): enforce and surface the
recovery outcomes the service already produces, so a terminal hidden runner does
not leave the workflow execution stuck as healthy `running`.

Tests:

- a terminal hidden chat/runner ref reconciles the workflow execution on
  recovery;
- uncertain runner state is surfaced as recovery-required/manual state;
- the active/recovery run remains visible through `View Active Run` or the run
  selector;
- the one-active-run guard blocks only genuinely active or recovery-required
  executions, not terminal history.
- `Stop`/cancel works when the selected run contains a recovery-required node,
  because this is the user's escape hatch from a non-terminal manual-recovery
  run.

### Step 5: Deterministic Electron Workflow

Add or extend a production-path Electron workflow that covers the user-visible
flow:

1. open workspace;
2. open a workflow draft;
3. click `Run`;
4. click `Edit Draft`;
5. assert `Run` is gone and `View Active Run` is visible;
6. deliver or wait for a workflow event while still viewing draft;
7. assert the graph stays on the draft target and `View Active Run` remains
   visible;
8. click `View Active Run`;
9. assert the active run projection is loaded and `Stop` is visible;
10. stop the run;
11. return to draft;
12. assert `Run` is available again;
13. start a second run;
14. stop or complete it;
15. open the run selector;
16. select the earlier run;
17. assert the graph shows that run's terminal state.

The test must go through Electron/main/preload/renderer/HTTP/store production
paths with temporary app data.

The workflow must capture visual evidence screenshots for the key states:

- draft with no active run, where `Run` is visible;
- draft with an active run, where `View Active Run` replaces `Run`;
- active run view, where `Stop` is visible;
- open run selector with active and historical runs;
- selected historical run view showing the terminal graph state.

Automated assertions remain required for correctness. Screenshots are required
for visual verification: button labels, selector rows, selected/active states,
and graph/run state must be readable and not clipped, overlapped, or visually
ambiguous.

## Verification

Use focused checks while developing:

- Go service/store/httpapi tests for active-run guard and run list;
- generated contract check after HTTP contract changes;
- focused renderer tests for toolbar/run-selector state;
- focused renderer test for target-scoped event handling: a `draft` target does
  not switch the projection to a run on an execution event (while still allowing
  summary refresh), and a `run` target refreshes only its own `executionId`;
- deterministic Electron workflow for the full user path;
- visual screenshot artifacts from that Electron workflow, with a short manual
  review note in the agent's final response or an append-only report if the
  implementation materially changes workflow graph visuals.

Before commit:

- `./scripts/format.sh`
- `./check_quality.sh --all`

If Codex runner recovery or provider protocol handling changes, run live Codex
E2E when local ChatGPT auth is available. Do not use `OPENAI_API_KEY`. If auth
is unavailable, record the live-provider gap explicitly.

## Done Definition

This slice is done when:

- backend rejects duplicate active runs for the same workflow definition;
- different workflow definitions can still run in parallel;
- the graph surface stores an explicit `WorkflowGraphTarget` and derives the
  projection from it, with no draft/run/active booleans layered onto the
  projection;
- draft targets ignore live workflow execution events for projection refresh, so
  an active run cannot pull the graph out of draft;
- draft view with an active run shows `View Active Run`, not `Run`;
- run history is visible from the workflow graph toolbar;
- selecting a historical run loads the latest graph state for that run;
- stale hidden active runs are reconciled or surfaced as recovery-required on
  startup;
- a stuck active or recovery-required run is never permanently blocking: it stays
  reachable via `View Active Run` and `Stop` makes it terminal history;
- focused coverage proves `Stop` works for a selected run with a
  recovery-required node;
- deterministic Electron coverage proves the full Run -> Edit Draft -> View
  Active Run -> Stop -> history selection path;
- screenshot artifacts prove the workflow toolbar, `View Active Run`, `Stop`,
  run selector, selected run state, and historical run graph are visually
  readable and not clipped, overlapped, or ambiguous;
- generated contracts, formatting, and broad quality gates are clean.

## Handoff Prompt

Implement `docs/plans/workflow_run_navigation_plan.md`.

Keep the first slice disciplined: one active run per workflow definition,
toolbar-level run navigation, backend-owned run summaries, and production-path
verification. Capture and inspect screenshot artifacts for the key toolbar,
selector, active-run, and historical-run states. Do not build replay,
left-sidebar run accordions, run diffing, or polling. If the active-run guard
exposes stale `running` workflow rows, fix the recovery/reconciliation path
rather than routing around it in the renderer.
