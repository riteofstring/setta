# Workspace Trajectory Command Previews And Cartographer Aggregation Plan

- **Date:** June 19, 2026
- **Status:** Phase 4 complete; Phase 5 verification passed for Phase 4
  changes.
- **Scope:** Make workspace trajectory sprites more legible by showing raw
  command previews for command run items, aggregating cartographer lifecycle
  noise before it reaches the visible graph lanes, and replacing confusing
  top-left unanchored sprite placement with an explicit placement rule.
- **Related Plans:**
  [Workspace Trajectory Liveness and Semantic Memory Plan](workspace_trajectory_liveness_and_semantic_memory_plan.md)
  and
  [Workspace Graph Pan/Zoom Surface Runtime Refactor Plan](workspace_graph_pan_zoom_surface_runtime_refactor_plan.md).

## Implementation Status

- Phase 1 is complete in commit `89512fcb9` (`Show command previews in
  trajectory sprites`).
- The renderer now has `workspace-trajectory-display-labels.ts`, Pixi sprite
  labels use `trajectorySpriteCanvasLabel`, and workflow node details use the
  same display-label helpers for command rows.
- Phase 2 is complete in commit `d16c12111` (`Aggregate cartographer trajectory
  display items`).
- The renderer now projects `WorkspaceTrajectoryDisplayItem` values, aggregates
  cartographer lifecycle sprites before visible caps, routes pending
  cartographer patches to memory suggestions in details, and leaves backend
  trajectory payloads exact.
- Phase 3 is complete in commit `a116edff8` (`Clean up trajectory anchorless
  placement`).
- The renderer now preserves runner-ref bindings during anchor refresh, uses a
  single-active-node fallback only for same-workflow agent activity, suppresses
  unanchored cartographer/workflow lifecycle sprites from the canvas, and keeps
  `recentLane` empty for normal workflow activity.
- Phase 4 is complete in the current worktree.
- Workflow node trajectory details now hide the ordinary `Revision` row, use
  display-count labels, render aggregate source counts with bounded newest
  source previews, and keep memory-suggestion summaries on user-facing copy.
- Focused Phase 1 verification passed on June 20, 2026:

```sh
pnpm -C desktop exec vitest run \
  src/renderer/src/features/workspace-graph/workspace-trajectory-display-labels.test.ts \
  src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts
```

Focused Phase 2 verification passed on June 20, 2026:

```sh
pnpm -C desktop exec vitest run \
  src/renderer/src/features/workspace-graph/workspace-trajectory-store.test.ts \
  src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts \
  src/renderer/src/features/workspace-graph/workspace-trajectory-display-labels.test.ts
```

Focused Phase 3 verification passed on June 20, 2026:

```sh
pnpm -C desktop exec vitest run \
  src/renderer/src/features/workspace-graph/workspace-trajectory-store.test.ts \
  src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts \
  src/renderer/src/features/workspace-graph/workspace-trajectory-display-labels.test.ts
pnpm -C desktop exec tsc --noEmit --pretty false
pnpm -C desktop build
node desktop/tests/electron/workspace-trajectory-file-fidelity.test.mjs --skip-build
```

Focused Phase 4 verification passed on June 20, 2026:

```sh
pnpm -C desktop exec vitest run \
  src/renderer/src/features/workspace-graph/workspace-trajectory-store.test.ts \
  src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts
pnpm -C desktop exec tsc --noEmit --pretty false
./scripts/format.sh
./check_quality.sh --all
```

Phase 4 details cleanup is now implemented. The remaining planned work is any
future follow-up that extends details inspection beyond these Phase 4
acceptance criteria.

## Position

The graph should not ask the user to decode implementation event names.

For command run items, `command_execution` and `Command` are not useful primary
labels. They describe the transport shape, not the thing the user needs to
recognize. The right product label is a bounded preview of the raw command that
actually ran:

```text
rg "workspace trajectory" desktop/src
sed -n '1,160p' internal/workspacetrajectory/mapper.go
./scripts/go.sh test -count=1 ./internal/workspacetrajectory
```

This does not require command intent inference. It also does not require
steering Codex agents toward redundant first-class tools. Native shell usage
should remain first-class because that is how Codex agents work well. The graph
can be honest by showing the command text as command text.

Cartographer lifecycle state has the opposite problem. It is useful operational
background, but it is lower priority than agent trajectory facts and durable
semantic results. Ten queued cartographer runs should not produce ten adjacent
sprites. The default graph should show one compact aggregate such as:

```text
10 cartographers queued
2 cartographers running
```

The individual cartographer runs, windows, and internal cartographer patches
should remain available through details/audit surfaces. Pending cartographer
patches are memory suggestions, not ordinary workflow trajectory. They should
not crowd the canvas or require users to understand the term "semantic patch."
Details and memory-review surfaces can summarize them separately as
`3 memory suggestions`.

## Current Behavior

The latest recording showed three product mismatches. Phase 1 addressed command
labels, Phase 2 addressed cartographer aggregation and memory-review routing,
and Phase 3 addressed anchorless placement. The remaining work is details-panel
copy and inspection quality.

- Command activity was visible as generic command sprites, while the meaningful
  command text was only secondary data. This is now fixed for renderer labels
  and command details.
- Cartographer runtime updates previously produced multiple
  `cartographer_status` sprites, including repeated queued/window/running states
  around the same workflow node. Phase 2 now aggregates these in the renderer
  display projection.
- Sprites with no resolved workflow-node anchor were placed in a fixed recent
  lane near the top-left of the viewport. Phase 3 now suppresses that lane for
  normal workflow activity.

The current implementation already has most of the needed data:

- `internal/workspacetrajectory.SpriteFromRunItem` stores raw command text in
  `WorkspaceTrajectorySprite.Command.Command`.
- Command sprites use `Kind: "command"` and currently default to title
  `"Command"` with the raw command in `Subtitle`.
- `pixi-renderer-trajectory-sprites.js` now renders pill labels through
  `trajectorySpriteCanvasLabel`.
- `workspace-trajectory-store.ts` owns the renderer-side projection that sorts
  sprites, anchors them to workflow nodes, caps visible sprites per node, and
  builds node details.
- `pixi-renderer-trajectory-sprites.js` places anchorless recent-lane sprites at
  fixed screen coordinates near the top-left of the graph.
- The semantic runtime already emits cartographer runs, windows, patch previews,
  and status counts. The trajectory runtime maps these into individual
  `cartographer_status` sprites.

## Product Rules

### Command Sprites

- The visible pill label for `kind === "command"` is a normalized preview of
  `sprite.command.command`.
- If `sprite.command.command` is empty, fall back to `sprite.subtitle`, then
  `sprite.title`, then `Command`.
- The preview collapses whitespace and strips control characters. It does not
  parse shell syntax and does not classify intent.
- Long previews are truncated for the canvas label. The bounded command string
  remains visible in node details.
- Status remains separate from the command preview. Failure, running state, and
  approval state are conveyed by icon/color/status suffix, not by rewriting the
  command into an inferred label.
- A command like `sed -n '1,120p' file.ts` remains a command sprite. It is not
  transformed into a file-read sprite without typed file operation metadata.

### Cartographer Sprites

- Cartographer lifecycle is visible but low priority.
- Queued, pending, running, and observing cartographer states aggregate by
  workflow node and status before canvas display.
- Aggregates use a count-bearing label:
  - Single queued cartographer items stay in details and do not render as
    canvas sprites.
  - `10 cartographers queued` for multiple queued items.
  - `Cartographer running` for one running item.
  - `2 cartographers running` for multiple running items.
- Severe/actionable cartographer states can remain more prominent:
  - failed cartographer runs,
  - rejected or failed patch application,
  - memory review states only in an explicit review/details surface.
- Even actionable states should aggregate when there are several equivalent
  items for the same node/status. Details should provide the individual records.
- Cartographer aggregates must not displace higher-priority agent trajectory
  facts such as command, file, diff, approval, reasoning, plan, or assistant
  message sprites.

### Memory Suggestions

- Internal `cartographer_patch` records with `status === "pending_review"` are
  user-facing memory suggestions.
- In the workspace trajectory sprite stream, pending-review cartographer
  patches currently arrive as `kind === "cartographer_status"` sprites with
  `cartographerPatchId !== ""` and `status === "approval_required"`. Classify
  these deterministically from typed fields before applying the ordinary
  blocking-sprite canvas priority.
- Default graph copy should use labels such as `Memory suggestion`,
  `3 memory suggestions`, or `Memory review`, not `semantic patch`.
- Pending memory suggestions should not render as ordinary workflow trajectory
  sprites on the canvas.
- Show pending memory suggestions in node details, audit/details panels, or a
  dedicated memory-review surface.
- Only make pending memory suggestions visually prominent when the user has
  explicitly opened or enabled memory review, or when the backend classifies the
  change as high-impact and requiring manual review.
- After a memory change is accepted/applied, the graph may show a low-priority
  `Memory updated` indication when it can be deterministically anchored to the
  relevant workflow node.

### Anchorless Activity

- Normal workflow activity should be anchored to a workflow node whenever the
  runtime has a deterministic binding.
- If a sprite cannot be anchored, the renderer should not silently display it as
  a normal node-adjacent pill in the top-left corner.
- If the active workflow has exactly one active node, the renderer may use that
  node as a conservative fallback anchor for unanchored run-item activity tied
  to the same workflow execution.
- Unanchored low-priority cartographer lifecycle activity should become a
  global cartographer aggregate or stay out of the canvas rather than appearing
  as a detached top-left pill.
- If global recent activity remains visible on the canvas, it must have a
  distinct visual treatment from node-anchored sprites so it does not look like
  misplaced node activity.

## Non-Goals

- Do not infer command intent from shell text.
- Do not add command classifiers such as "this `rg` means search" in this plan.
- Do not require Codex agents to use redundant first-class read/search/test
  tools instead of shell commands.
- Do not add OS-level shell tracing, file access tracing, or process
  instrumentation.
- Do not remove cartographer audit data from backend/runtime details.
- Do not expand generated backend contracts unless implementation proves the
  renderer cannot represent the needed display state locally.
- Do not make trajectory sprites clickable in this plan. The display labels and
  aggregation rules should work independently from a later inspection affordance.

## Design

### 1. Renderer Display Labels

Add a small renderer-owned display helper, for example:

```ts
trajectorySpritePrimaryLabel(sprite: WorkspaceTrajectorySprite): string
trajectorySpriteSecondaryLabel(sprite: WorkspaceTrajectorySprite): string
trajectorySpriteFullDetailLabel(sprite: WorkspaceTrajectorySprite): string
```

The helper should be used by:

- Pixi trajectory pill labels.
- Workflow node trajectory details.
- Any future timeline/list presentation of the same runtime sprites.

For command sprites, the primary label comes from raw command text. For other
sprite kinds, existing title/subtitle behavior can remain, with small copy
cleanup where needed.

Keep the helper purely presentational. It should not mutate the runtime sprite
or change backend `Title`, `Subtitle`, `Kind`, or `Command` fields.

### 2. Frontend-Only Display Aggregates

Introduce a local display item type in the renderer trajectory store:

```ts
type WorkspaceTrajectoryDisplayItem =
  | {
      type: "sprite";
      id: string;
      anchorNodeId: string;
      lane: "recent" | "workflow_node";
      sprite: WorkspaceTrajectorySprite;
    }
  | {
      type: "aggregate";
      id: string;
      anchorNodeId: string;
      lane: "recent" | "workflow_node";
      aggregate: WorkspaceTrajectoryDisplayAggregate;
    };

interface WorkspaceTrajectoryDisplayAggregate {
  id: string;
  anchorNodeId: string;
  lane: "recent" | "workflow_node";
  kind: "cartographer_status" | "memory_suggestion";
  status: WorkspaceTrajectorySpriteStatus;
  severity: WorkspaceTrajectorySpriteSeverity;
  count: number;
  label: string;
  updatedAt: string;
  sourceSpriteIds: string[];
}
```

This keeps backend trajectory events exact while letting the canvas display a
more useful projection.

Aggregation should happen before `maxVisibleSpritesPerNode` is applied. That
way ten queued cartographer runs consume one visible slot, not all four visible
slots plus a hidden-count pill.

Phase 2 should migrate the renderer store display surface consistently:

- `WorkspaceTrajectoryDisplayGroup.sprites` should become display items, not
  raw sprite wrappers only.
- `WorkspaceTrajectoryFrameSnapshot.recentLane` should also contain display
  items if any recent/global display remains during the transition.
- `WorkspaceTrajectoryNodeDetails.sprites` should either become display items
  or gain a parallel `items` field before the details renderer starts showing
  aggregate rows. Prefer replacing the field during this pre-release plan; do
  not add compatibility aliases unless explicitly needed.
- `totalSpriteCount` remains the raw runtime sprite count for diagnostics.
- `group.totalCount`, `group.hiddenCount`, and collapsed `+N` pills count
  display items after aggregation, not raw source sprites.
- Aggregate `count` is the source-record count represented by that one display
  item, for example `20 cartographers queued`.
- Pixi rendering should render aggregate labels from `aggregate.label` and use
  aggregate severity/status for icon and color. It should not create synthetic
  backend `WorkspaceTrajectorySprite` objects just to satisfy the old renderer
  shape.
- Cartographer display classification must use typed fields:
  - `sprite.kind === "cartographer_status"`,
  - `sprite.cartographerPatchId !== ""` for memory suggestion/patch previews,
  - `sprite.cartographerRunId !== ""` for cartographer run lifecycle,
  - `sprite.cartographerWindowId !== ""` for cartographer window lifecycle,
  - `sprite.status` for display state.
  Do not classify cartographer display behavior by parsing `title` or
  `subtitle` text.

### 3. Priority And Sorting

Update the display sort to use an explicit priority table:

1. Blocking approvals and failures.
2. Active workflow and active agent run items.
3. Recent command/file/diff/tool/reasoning/plan/assistant message sprites.
4. Cartographer running aggregates.
5. Multi-item cartographer queued/pending aggregates.
6. Completed/no-op cartographer lifecycle summaries.

Do not rely only on timestamp sorting. Background cartographer churn should not
push useful command previews out of view.

Pending memory suggestions are excluded from the ordinary canvas sort. If a
memory-review/details surface reuses this display sort, pending memory
suggestions should rank below active agent trajectory and failures, but above
queued cartographer lifecycle summaries.

### 4. Placement And Recent-Lane Policy

Replace the current implicit recent-lane fallback with an explicit display
policy:

- First choice: anchor by `workflowNodeId`, workflow-node source refs,
  workflow-node execution refs, or chat-run bindings.
- Second choice: for unanchored agent run-item activity, use an active-node
  fallback only when there is exactly one active workflow node and the activity
  belongs to the same workflow execution.
- Third choice: route remaining unanchored activity to a separate global
  activity display item, not to ordinary node-adjacent sprite styling.
- Default for unanchored queued cartographer lifecycle: aggregate or suppress on
  the canvas, with details/audit still available elsewhere.

The old top-left recent lane can remain as a debug or fallback mechanism during
implementation, but it should not be the normal product presentation for
workflow-run activity.

Phase 3 starts from the Phase 2 implementation:

- `WorkspaceTrajectoryFrameSnapshot.recentLane` still feeds fixed top-left
  canvas sprites through `pixi-renderer-trajectory-sprites.js`.
- `workflow-trajectory-runtime.ts` currently calls
  `trajectoryStore.updateAnchors({ bindings: [], workflowNodeIds })` before the
  async `workflow.readExecution` response arrives. During active workflow
  updates, this can temporarily remove chat-run/node-execution bindings and
  make otherwise-anchorable live sprites look anchorless.
- `WorkflowGraphProjection.nodes` already exposes `active`,
  `latestNodeExecutionId`, and `status`, so Phase 3 does not need a new backend
  contract just to know whether there is exactly one active workflow node.

Phase 3 implementation rules:

- Extend the renderer anchor state with active workflow node ids or a
  precomputed single active workflow node id derived from
  `workflowProjection.nodes.filter((node) => node.active)`.
- Do not clear existing runner bindings while refreshing the same workflow
  execution's bindings. Preserve the last known bindings until replacement
  bindings arrive. It is fine to clear bindings when the workflow execution id
  changes.
- Apply the single-active-node fallback only to unanchored agent activity tied
  to the same workflow execution. Candidate sprites must have a deterministic
  run/chat source, such as `runItemId`, `chatRunId`, or a `run_item`/`chat_run`
  source ref, and must not be `cartographer_status`.
- Do not use the active-node fallback for execution-level workflow events such
  as `workflow.execution.started`, or for cartographer lifecycle/window sprites
  that only have a workflow-execution source ref.
- For normal product UI, `recentLane` should be empty for active workflow-run
  activity. Any remaining unanchored items should be omitted from the canvas or
  routed to a visually distinct debug/global surface in a later phase.
- Unanchored queued/pending cartographer lifecycle should be suppressed from the
  canvas. Details/audit data remains available through semantic/cartographer
  audit surfaces; node details remain node-scoped and should not invent a node
  association.

### 5. Node Details

Update workflow node trajectory details so command entries read naturally:

- Primary row: command preview.
- Secondary row: status and kind.
- Monospace full command line when available.
- Cwd, exit code, and duration when present.

For cartographer and memory-review details, show aggregate summaries first:

- `10 cartographers queued`
- `2 cartographers running`
- `3 memory suggestions`

Then show a bounded list of the newest individual cartographer records and
memory suggestions under those summaries if details are expanded or if the
current panel already has room.

Move `Revision` out of the ordinary product details view or gate it behind a
debug presentation. It is an internal runtime stream revision, not a user-facing
workflow concept.

## Implementation Phases

### Phase 1: Command Preview Labels (Complete)

- Add the renderer display-label helper and focused tests.
- Change Pixi trajectory labels to use the helper instead of `sprite.title`
  directly.
- Change workflow node trajectory details to use the same helper for command
  entries.
- Preserve existing backend command fields and payload bounds.

Acceptance criteria:

- A command run item with `command.command = "rg \"foo\" src/"` renders a pill
  whose primary text starts with `rg "foo" src/`.
- The same item does not render `Command`, `command`, or `command_execution` as
  its primary visible label.
- Failed commands keep the command preview and show failure via status styling.
- A `sed` or `rg` command is not reclassified as file read/search intent.
- Completed in commit `89512fcb9`.

### Phase 2: Cartographer Display Aggregation And Memory Review Routing (Complete)

- Add a renderer-side cartographer aggregation pass in
  `workspace-trajectory-store.ts`.
- Classify cartographer display items by typed sprite fields before sorting or
  visible caps.
- Aggregate cartographer display items by lane, workflow node, status, and
  cartographer display class.
- Apply aggregation before visible sprite caps and recent-lane caps.
- Keep source sprite ids for details/debugging.
- Update Pixi trajectory rendering to accept either individual sprites or local
  aggregate display items.
- Route pending-review `cartographer_patch` records to memory suggestion
  summaries in details/review surfaces, not to ordinary canvas sprites.

Acceptance criteria:

- A single queued cartographer anchored to one workflow node is visible in
  details but does not render as a canvas sprite.
- Ten queued cartographer sprites anchored to one workflow node render as one
  low-priority visible aggregate item, not ten visible or hidden individual
  queued sprites.
- Non-cartographer command/file/diff/assistant/reasoning sprites remain visible
  ahead of queued cartographer aggregates.
- Failed cartographer activity remains visible, but equivalent repeated items
  aggregate.
- Pending-review cartographer patches appear as memory suggestions in
  details/review surfaces and do not appear as ordinary canvas sprites.
- Pending-review cartographer patches are identified by `cartographerPatchId`
  and sprite status, not by parsing title/subtitle text.
- `group.hiddenCount`, `group.totalCount`, and collapsed `+N` pills count
  display items after aggregation.
- Backend trajectory snapshots and deltas still contain exact cartographer
  source records unless a later measured payload problem justifies backend
  aggregation.
- Completed in commit `d16c12111`.

### Phase 3: Anchorless Placement Cleanup (Complete)

- Replace the fixed top-left recent-lane behavior for normal workflow activity.
- Preserve existing anchor bindings while refreshing runner refs for the same
  workflow execution.
- Add deterministic active-node fallback only for unanchored agent activity in
  the single-active-node case.
- Aggregate or suppress unanchored low-priority cartographer lifecycle activity
  on the canvas.
- Preserve exact runtime records for details/audit.

Acceptance criteria:

- Sprites associated with the active workflow do not appear as ordinary detached
  pills in the top-left of the graph.
- Live run-item or assistant-message deltas do not flicker into `recentLane`
  while `workflow.readExecution` is in flight for the same workflow execution.
- A command, tool, assistant, plan, reasoning, file, diff, test, or approval
  sprite with same-workflow run/chat refs and exactly one active workflow node
  anchors to that node when no stronger binding exists.
- The single-active-node fallback is not applied when there are zero or multiple
  active workflow nodes.
- The single-active-node fallback is not applied to cartographer lifecycle,
  memory suggestion, or execution-level workflow-status sprites.
- If an item cannot be anchored, it is visually distinct from node-adjacent
  trajectory sprites or omitted from canvas display according to priority.
- Unanchored queued cartographer activity does not create top-left clutter.
- Completed in commit `a116edff8`.

### Phase 4: Details Cleanup (Complete)

- Render command details with full bounded command text in monospace.
- Render cartographer aggregate details before individual cartographer records.
- Render pending-review cartographer patches as memory suggestions with bounded
  public summaries.
- Hide or debug-gate trajectory runtime `Revision`.
- Keep `Recent` and `Hidden` counts understandable. If aggregate display makes
  the old names misleading, rename them to activity/count labels that match the
  final UI.

Phase 4 started from the then-current `workflow-trajectory-runtime-details.tsx`
presentation:

- The details header showed `Recent`, `Hidden`, and `Revision`.
- Aggregate rows showed `Count`, `Sources`, and a short list of source sprite
  ids.
- Memory suggestions already used user-facing copy and avoided the phrase
  `semantic patch`, but did not yet show bounded public summaries.

Phase 4 implementation rules:

- Remove `Revision` from the ordinary details row. If it remains available, gate
  it behind an explicit debug-only surface or debug snapshot, not the normal
  node details panel.
- Rename count rows so they describe display items after aggregation. Prefer
  labels such as `Activity` and `Hidden groups` over `Recent` and `Hidden` if
  the old labels read as raw-event counts.
- Preserve the command detail layout from Phase 1: primary command preview,
  status/kind secondary text, full bounded command in monospace, plus cwd/exit
  code/duration when present.
- For aggregate details, show `aggregate.label` first, then the represented
  source count. Source ids can remain available as compact debug/audit chips,
  but they should not be the only human-readable detail.
- Add a renderer-local bounded source preview for aggregates. Prefer deriving
  it from source sprite fields already present in the trajectory runtime, such
  as `resultSummary`, `subtitle`, `title`, and `errorSummary`. Keep this
  frontend-only unless implementation proves backend data is insufficient.
- For memory suggestions, source previews should use user-facing copy such as
  `Memory suggestion` and bounded public summaries. They should not expose
  `cartographer_patch`, `pending_review`, or `semantic patch` as normal product
  labels.
- Keep source preview lists bounded, for example the newest 3-6 source previews,
  with a compact hidden-source count when the aggregate represents more records.

Acceptance criteria:

- The node details panel explains what the visible command pill represents.
- A cartographer aggregate can be traced to bounded individual source records.
- A memory suggestion can be inspected without using the term `semantic patch`
  in normal product copy.
- Ordinary users are not shown the internal runtime revision as a primary row.
- Aggregate detail counts match display-item semantics after aggregation, not
  raw hidden sprite counts.

### Phase 5: Verification

Run focused deterministic checks first:

```sh
pnpm -C desktop exec vitest run \
  src/renderer/src/features/workspace-graph/workspace-trajectory-store.test.ts \
  src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts
```

Add or update tests for:

- command preview normalization and truncation,
- command preview rendering in Pixi display data,
- cartographer aggregation before visible caps,
- memory suggestion routing and user-facing copy,
- `+N` and details counts based on display items after aggregation,
- priority sorting so queued cartographer aggregates do not crowd out commands,
- anchor refresh without binding-clearing flicker,
- anchorless activity placement and single-active-node fallback,
- suppression of unanchored cartographer lifecycle from the canvas,
- details rendering for command and cartographer aggregate cases.
- hiding/debug-gating `Revision` in normal node details,
- bounded source previews for cartographer and memory-suggestion aggregates,
- details copy that avoids `semantic patch`, `pending_review`, and raw
  cartographer patch terminology in normal product labels.

Run the backend trajectory mapper tests when backend behavior is touched:

```sh
./scripts/go.sh test -count=1 ./internal/workspacetrajectory
```

Run a deterministic Electron workflow graph test or recording replay through
production main/preload/renderer paths before treating the UI behavior as done.
The fake/scripted Codex harness is sufficient because this plan does not change
provider protocol integration.

Before committing implementation changes, run:

```sh
./scripts/format.sh
./check_quality.sh --all
```

## Resolved Decisions

- A single queued cartographer is details-only. Multiple queued cartographers
  anchored to the same workflow node render as one low-priority aggregate such
  as `10 cartographers queued`.
- Pending-review internal cartographer patches are memory suggestions. They are
  shown in details, audit, or explicit memory-review surfaces, not as ordinary
  workflow trajectory sprites.
- User-facing graph copy says `Memory suggestion`, `3 memory suggestions`, or
  `Memory review`; it does not ask users to understand `semantic patch`.
- Collapsed `+N` pills count hidden display groups after aggregation, not raw
  source records. Details should expand the count into aggregate-aware wording
  such as `1 group hidden: 20 cartographers queued`.
- Global recent activity is not visible as ordinary canvas sprites for normal
  workflow runs. Activity should anchor deterministically, route to an explicit
  lower-priority surface, or stay in debug/audit details.
