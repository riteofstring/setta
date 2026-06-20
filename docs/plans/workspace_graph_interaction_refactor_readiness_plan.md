# Workspace Graph Interaction Refactor Readiness Plan

- **Date:** June 20, 2026
- **Status:** Draft.
- **Scope:** Stabilize the workspace graph interaction contract before the next
  graph refactor, then refactor graph interaction ownership around durable
  projection state, explicit editability, behavior-first tests, and recordings
  that can diagnose user-visible graph bugs.
- **Related Plans:**
  [Workspace Graph Pan/Zoom Surface Runtime Refactor Plan](workspace_graph_pan_zoom_surface_runtime_refactor_plan.md),
  [Workspace Trajectory Liveness And Semantic Memory Plan](workspace_trajectory_liveness_and_semantic_memory_plan.md),
  and [Functional Workflow Graph Editor Plan](functional_workflow_graph_editor_plan.md).

## Position

The next graph refactor should not start by rewriting the renderer. It should
start by making the current product invariants explicit and testable.

The current graph bugs are not isolated wheel-handler or Pixi issues. They come
from interaction ownership being split across:

- Pixi mutable scene state,
- React projection state,
- backend-persisted workflow and semantic layout,
- optimistic local layout overlays,
- semantic runtime projection,
- trajectory sprite projection,
- and diagnostic recordings that do not capture graph state.

This split lets the UI show impossible or unproven states:

- read-only workflow nodes can move only through an unowned local Pixi path and
  then snap back, while read-only ports can look connectable even though edge
  creation will reject the edit;
- failed layout saves can leave optimistic positions visible;
- projection/materialization refreshes can overwrite Pixi-local node positions
  while a drag or just-saved move is still being reconciled;
- tests can pass because renderer counters advance while durable behavior is
  broken;
- trajectory sprites look like interactive objects while the layer is inert;
- trajectory sprites can be dropped or placed with inconsistent coordinate
  assumptions when they have no workflow-node anchor or when the camera changes;
- recordings capture chat layout and screenshots but not graph camera,
  selection, node positions, pending writes, trajectory anchors, or isolated
  app data by default.

The pre-refactor work is therefore not optional cleanup. It is the guardrail
work that makes the refactor measurable and prevents it from preserving broken
behavior.

## Non-Goals

- Do not run a broad cleanup campaign before the refactor.
- Do not reshuffle folders or rename modules unless the current organization
  blocks the graph interaction contract.
- Do not add backward compatibility, legacy support paths, migrations,
  transitional adapters, transitional readers/writers, old-field aliases,
  dual-read/write paths, compatibility shims, or silent fallback behavior.
- Do not preserve old read-only drag behavior where Pixi accepts movement and
  persistence silently no-ops. Read-only/run node rearrangement should get an
  explicit non-editing layout owner rather than being disabled by default.
- Do not keep misleading UI just because it is visually pleasant.
- Do not replace behavior assertions with renderer counter assertions.
- Do not tune cartographer prompts or semantic memory quality in this plan.
- Do not introduce synthetic-only debug paths as proof of production behavior.

## No Backward Compatibility Policy

There is no backward-compatibility requirement for the current pre-release graph
interaction behavior. This plan should not create compatibility code of any
kind.

Banned approaches:

- legacy support paths;
- migrations;
- transitional adapters;
- transitional readers or writers;
- dual-read/write paths;
- old-field aliases;
- compatibility shims;
- fallback parsing for old shapes;
- silent compatibility fallbacks;
- feature flags whose only purpose is to keep old graph behavior working during
  the refactor.

If renderer graph state, debug snapshots, workspace recordings, selected-node
targets, or local layout overlay behavior need incompatible changes, change them
directly. If persistent state becomes incompatible, bump the relevant store or
schema version and fail loudly with reset guidance. Tests should assert the new
behavior and rejection/reset path. Stale local runtime state may be reset.

## Current Failure Inventory

### 1. Graph Objects Advertise Actions Without An Owner

Pixi starts node dragging and mutates node coordinates before persistence knows
whether the projection is editable. Later, workflow layout persistence no-ops
when `workflowProjection.editable` is false.

Read-only/run workflow nodes should still be rearrangeable as a UX affordance.
The bug is that this movement currently has no explicit non-editing layout
owner. It should not use draft workflow definition layout persistence, and it
should not be a local Pixi-only mutation that can vanish on refresh.
This is a contract gap, not only a renderer bug: the current backend contract
only persists draft workflow definition layout and semantic graph layout.

The same editability mismatch can apply to ports. The workflow projection
provides ports for read-only/run projections, Pixi exposes interactive port hit
targets unless `node.connectable === false`, and React rejects the edge only
after the UI has advertised a valid connection.

Semantic preview/runtime-only nodes have the same shape of bug. They are
rendered as graph nodes and can enter the generic Pixi drag path, but semantic
layout persistence ignores preview ids because there is no durable layout owner
for them.

Primary files:

- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-input-handlers.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-node-container.js`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-projection.ts`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-helpers.js`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-renderer-handlers.ts`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-layout-persistence.ts`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-surface.tsx`
- `desktop/src/renderer/src/features/workspace-graph/semantic-graph-projection.ts`

Required outcome:

- Every node drag has an explicit movement owner before Pixi mutates local
  state: draft workflow definition layout, read-only/run view layout, semantic
  layout, or another named owner.
- Read-only/run/version workflow nodes may be movable, but their movement must
  go through an explicit non-editing view-layout owner and must not write
  through draft workflow definition persistence.
- Cursor state must advertise grab/grabbing only for nodes with a movement
  owner.
- Runtime-only and preview semantic nodes must not expose drag/cursor
  affordances unless a durable layout owner is explicitly defined.
- Read-only workflow ports must not expose connectable hit targets, connection
  cursors, or temporary edge drawing.
- Edge creation tests must prove the UI does not advertise a connection that
  React/backend will reject.

### 2. Failed Layout Saves Can Leave Optimistic Positions Visible

Workflow layout overlays are prepared before backend persistence completes. On
save failure, `persistGraphNodePositions` reports an error and returns `null`,
but the pending workflow overlay is not explicitly reverted for that save
sequence.

Primary files:

- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-surface.tsx`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-layout-overlay.ts`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-layout-persistence.ts`

Required outcome:

- Layout persistence returns an explicit outcome: persisted, skipped, failed.
- Failed workflow and semantic layout saves clear or revert the affected pending
  overlay generation.
- The renderer resyncs to authoritative projection/layout after a failed save.

### 3. Graph Replacement And Live Reprojection Can Clobber Direct Manipulation

Scene graph updates currently merge incoming node objects into existing Pixi
scene nodes with a broad assignment. If the incoming graph is built from a
projection that does not yet include a just-dragged position, the update can
overwrite local `x`/`y` while the user is dragging or immediately after the
pending overlay is cleared.

Graph replacement also cancels active interactions. Graph updates are deferred
while the camera is moving, but not while node drag, edge draw, or marquee
selection is active. A backend/projection/semantic refresh during direct
manipulation can therefore cancel the interaction and drop the uncommitted move
before pointerup.

There is also a stale-handoff risk between React graph materialization,
`pendingWorkflowGraphRef`, and scene-store frame materialization. A surface
update can prefer the pending graph over the freshly rendered graph, while the
scene runtime later writes a different frame into the renderer.

Primary files:

- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-frame-runtime.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-scene-graph.js`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-surface.tsx`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-layout-overlay.ts`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-scene-runtime.ts`

Required outcome:

- Reprojection is position-preserving for any node with an admitted drag,
  pending layout save, or newer local layout generation.
- Runtime overlays for trajectory, semantic activity, liveness, and command
  preview state are structurally unable to mutate node `x`/`y` or camera state.
- Scene graph updates merge visual/content changes separately from layout
  coordinates.
- A live update that arrives during or immediately after a drag cannot snap a
  moved node back to the older projection position.
- Graph replacement is queued while node drag, edge draw, marquee, or another
  direct manipulation is active.
- Pointerup, pointercancel, or explicit cancel commits/reverts the interaction
  deterministically before the latest queued graph is applied.
- The React materialized graph, pending graph ref, scene-store frame, and Pixi
  update path have one clear handoff order, with no stale pending frame allowed
  to override a newer rendered scene.

### 4. Workflow Drag Tests Do Not Prove Durable Persistence

Existing workflow graph tests cover renderer movement, hit testing, spatial
index updates, and some draft validation paths. They do not provide a narrow
regression that proves a real workflow node drag survives backend persistence,
projection refresh, live runtime update churn, and reload.

Primary files:

- `desktop/tests/electron/workflow-graph-smoke.test.mjs`
- `desktop/tests/electron/workflow-blank-canvas.test.mjs`
- `desktop/tests/electron/semantic-graph-workflow.test.mjs`

Required outcome:

- A required deterministic Electron workflow proves editable workflow node drag
  persistence through production main/preload/renderer/backend/store paths.
- The same coverage proves read-only/run workflow node rearrangement uses the
  non-editing view-layout owner, does not issue draft workflow layout writes,
  and survives projection refresh/reload according to that owner contract.
- A live-condition workflow proves a trajectory, semantic runtime, liveness, or
  command-preview update during or immediately after drag cannot reset the moved
  node.
- Counter assertions remain supplemental only.

### 5. Workflow Node Details Use Execution ID As Read-Only State

`WorkflowNodeDetailsTarget` currently carries view-mode and version fields but
not `editable`. Node details infer read-only state from `executionId !== ""`,
which misses read-only version targets that do not have an execution id.

Primary files:

- `desktop/src/renderer/src/stores/workflow-editor-store.ts`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-targets.ts`
- `desktop/src/renderer/src/features/workspace-graph/workflow-node-details-surface.tsx`

Required outcome:

- `WorkflowNodeDetailsTarget` includes `editable`.
- Details save/read-only state derives from `!target.editable`.
- Details surfaces do not expose editable draft controls for non-editable
  version or run projections.

### 6. Trajectory Sprites Look Interactive But Are Inert

Trajectory sprite containers and the trajectory layer disable Pixi interaction,
but the badges look like labeled chips that users naturally try to click.

Primary files:

- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-layer-setup.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-trajectory-sprites.js`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-surface.tsx`

Required outcome:

- Choose one behavior:
  - make sprites clickable and open the owning workflow node details with the
    relevant trajectory section visible; or
  - restyle them as passive status badges with no hover/click affordance.
- Add deterministic E2E coverage for the chosen behavior.

### 7. Trajectory Sprite Placement Is Not A Clear Contract

Anchorless trajectory items are currently not rendered into the recent lane,
and recent-lane placement mixes screen-derived and world-coordinate offsets.
This makes activity sprites either disappear or appear in surprising locations
as the camera changes.

Primary files:

- `desktop/src/renderer/src/features/workspace-graph/workspace-trajectory-store.ts`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-trajectory-sprites.js`

Required outcome:

- Define whether anchorless trajectory items are hidden, shown in a recent lane,
  or attached to an explicit fallback owner.
- If a recent lane exists, its coordinates are consistently screen-space or
  consistently world-space, and pan/zoom behavior is tested.
- Sprite placement tests prove anchored sprites stay attached to their workflow
  node and anchorless sprites follow the chosen contract.

### 8. Desktop Recordings Do Not Capture Graph State

`scripts/record_desktop_session.sh` enables session recording, but graph bugs
cannot be diagnosed from the default artifacts because recordings lack graph
debug snapshots and interaction state.

The same script defaults to the normal app data directory unless the caller
sets `SETTA_APP_DATA_DIR`. That makes recordings depend on stale local state and
can mutate the developer's real Setta data.

Primary files:

- `scripts/record_desktop_session.sh`
- `desktop/src/main/session-recorder.ts`
- `desktop/src/preload/renderer-recorder.ts`
- `desktop/src/shared/recording.ts`
- `desktop/src/main/index.ts`
- `README.md`

Required outcome:

- Recording artifacts include graph snapshots on pointerup, pointercancel,
  debounced wheel bursts, and manual snapshot requests.
- Captured graph state includes camera, zoom, selected node/edge ids, node
  positions, focused graph surface id, pending layout writes, latest layout save
  outcome, trajectory display counts, trajectory anchors, and renderer timing
  summary when available.
- The recording script advertises these graph artifacts and enables graph debug
  recording by default, including `SETTA_WORKFLOW_GRAPH_DEBUG=1`.
- The recording script prints the effective graph debug value.
- Graph recording payloads use a compact graph-specific schema with counts plus
  touched, visible, selected, and moved nodes rather than relying on generic
  array truncation.
- If truncation or chunking is still necessary, graph events include explicit
  truncation metadata so scale bugs are not silently hidden.
- Manual recording sessions use a temporary `SETTA_APP_DATA_DIR` by default.
- Existing app data is used only through an explicit opt-in environment flag.

### 9. Counter-Heavy Tests Can Pass While Behavior Is Broken

Renderer counters are useful diagnostics, but they are not product behavior.
They should not be the primary proof for interaction correctness.

The interaction scheduler currently records lanes and timings around immediate
callback execution. That is useful instrumentation, but it is not proof of
preemption, coalescing, or reduced input-path work.

Primary files:

- `desktop/tests/electron/workflow-graph-smoke.test.mjs`
- `desktop/tests/electron/workflow-graph-smoke-assertions.mjs`
- `desktop/tests/electron/workflow-graph-pan-zoom-snapshot-assertions.mjs`
- `desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs`
- `desktop/tests/electron/workflow-graph-performance-recording.mjs`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-interaction-scheduler.js`

Required outcome:

- Behavior assertions lead.
- Counter assertions remain as supplemental diagnostics after behavior has been
  proven.
- New tests fail on durable layout loss, unowned or wrong-owner node movement,
  or misleading trajectory interaction even if renderer counters advance.
- Pan/zoom tests prove user-visible camera deltas, dragged-node-only movement,
  stable node positions after refresh, and absence of unintended layout writes
  before asserting scheduler lanes or renderer counters.
- Scheduler lane assertions are labeled as telemetry unless the scheduler
  actually defers, coalesces, preempts, or removes work from the input path.

### 10. Large Embedded Browser Scripts Make Graph Tests Brittle

Some graph tests embed multi-dozen-line browser scripts inside `client.evaluate`
strings. That bypasses normal parsing, formatting, linting, and helper
boundaries, so contract breakage is harder to catch before runtime.

Primary files:

- `desktop/tests/electron/semantic-graph-workflow.test.mjs`
- `desktop/tests/electron/workflow-graph-performance-recording.mjs`

Required outcome:

- This is not a pre-refactor blocker.
- If semantic graph workflow tests or performance recording instrumentation are
  touched as part of the graph refactor, move large embedded browser scripts
  into normal browser-driver/helper modules or browser-side fixtures.
- Keep `client.evaluate` calls limited to small parameterized invocations.

## Target Interaction Contract

### Durable Ownership

The backend projection is the durable source for workflow graph layout and
editability. Semantic graph layout persistence owns semantic node positions.
Pixi may show transient drag movement only for nodes whose movement can be
committed through the owning durable path.

The renderer contract should answer these questions before drag starts:

- Is this node movable?
- Is this port connectable?
- Which durable owner will accept the move?
- Which durable owner will accept the connection?
- What happens if the save fails?
- What projection/layout should be shown after failure?

### Interaction Product Policy

The graph should be interactive by default. "Read-only" means the user cannot
mutate the workflow definition from that view; it does not mean workflow nodes,
run nodes, version nodes, or semantic nodes are inert.

Allowed non-workflow-editing interactions include:

- clicking/selecting workflow and semantic nodes;
- opening details, evidence, source links, run context, and trajectory context;
- rearranging workflow/run/version nodes through an explicit non-editing
  view-layout owner;
- rearranging committed semantic nodes through semantic layout persistence;
- using semantic nodes for steering, pinning, review, inclusion/exclusion, or
  other semantic-context actions when those actions write through semantic or
  steering owners rather than workflow definition persistence.

Blocked interactions are the ones that would mutate the workflow definition
from a non-editable projection, such as connecting ports, deleting workflow
nodes, changing workflow node configuration, or writing run/version layout back
to the draft workflow definition owner.

Preview/runtime-only semantic nodes may still be clickable/selectable when they
have details or steering value. They are non-movable only until a durable layout
owner is defined for them.

### Non-Editing Workflow View Layout Owner

Read-only/run/version workflow node rearrangement needs a Go-owned
non-editing view-layout owner before the renderer treats those moves as
durable.

Owner contract:

- The view-layout owner stores node positions for graph views where movement is
  a user layout preference, not a workflow definition edit.
- It lives in backend-owned app data, not in the workflow definition graph.
- It is local to the current app data profile unless a later product plan
  explicitly makes view layout synced or shared.
- It is keyed by `workspaceId` plus a graph target:
  - `definition_version`: `definitionId` and `versionId`;
  - `workflow_execution`: `definitionId`, `versionId`, and `executionId`.
- Editable draft workflow nodes continue to use workflow definition layout.
- If a target kind is added later, it must be added to this owner as an
  explicit discriminated case, not inferred from partial ids.

Required backend/API work:

- Add Go-owned request/response contracts for reading and updating workflow
  graph view layout through the `internal/httpapi` endpoint registry.
- Regenerate TypeScript with `./scripts/go.sh run ./cmd/generate-contracts`
  after changing contracts or owner types.
- Add main/preload IPC exposure that consumes generated contracts instead of a
  hand-maintained mirror.
- Decide and implement the backing store/schema version in the owning Go
  package before adding renderer persistence.
- Do not add migrations or legacy readers. If existing local view-layout state
  is incompatible, bump/reset loudly.

Persistence expectations:

- A run/version node drag writes only to the view-layout owner.
- It never calls `UpdateWorkflowDefinitionLayout`.
- It survives projection refresh, app reload, and reopening the same target.
- It does not affect editable draft definition layout or any other
  run/version target.

Composition rule:

- Do not fold non-editing view-layout positions into
  `WorkflowGraphProjection`. The projection remains the backend truth for
  workflow graph structure, workflow status, and draft definition layout.
- Read view-layout state through a separate generated contract keyed to the
  selected graph target.
- Compose view-layout positions in the renderer scene-store layer before Pixi
  graph update, after the workflow projection has been converted into renderer
  graph data.
- Editable draft projections continue to use workflow definition layout from
  the projection. Read-only/run/version projections use view-layout positions
  when available and fall back to projection layout only as the initial/default
  view.
- The scene store records which owner supplied each node position so drag
  persistence and debug/recording events can say whether a move targeted draft
  definition layout, view layout, semantic layout, or no owner.

### Scene Store Boundary

The refactor target is one mutation-respecting scene store that owns the current
renderer view of node positions, camera state, and scene contents. Direct
manipulation writes through that store. Backend projections reconcile through
explicit layout outcomes. Runtime layers such as trajectory sprites, semantic
activity, liveness, and command previews are overlays over the scene, not
writers of durable node coordinates or camera state.

Scene graph materialization must preserve position fields for nodes with an
admitted drag, pending layout generation, or newer local move. Content updates
can change labels, status, edges, sprites, and runtime decorations without
replacing user-owned layout state.

Graph replacement is not allowed to cancel direct manipulation implicitly. If a
backend projection, semantic graph, trajectory, validation, or scene-store frame
arrives while node drag, edge draw, marquee selection, or another direct
manipulation is active, the renderer queues the latest graph replacement. The
active interaction then commits or cancels on pointerup, pointercancel, escape,
or explicit teardown, and only then does the latest queued graph apply.

Pointer settlement semantics:

- Node drag:
  - `pointerup` commits the move through the node movement owner.
  - `pointercancel`, escape, or graph teardown reverts the local drag to the
    pre-drag position and must not persist.
- Edge draw:
  - `pointerup` on a valid connectable target commits edge creation.
  - `pointerup` outside a valid target, `pointercancel`, escape, or graph
    teardown cancels the temporary edge and must not persist.
- Marquee:
  - `pointerup` applies the final selection.
  - `pointercancel`, escape, or graph teardown restores the pre-marquee
    selection.

### Node Movability

Node movability should be explicit in renderer graph data or renderer options.
The policy should not be inferred inside low-level Pixi pointer handlers.

Initial rule:

- editable draft workflow node: movable through the workflow definition layout
  owner;
- read-only/run/version workflow node: movable through a separate non-editing
  view-layout owner, not through draft workflow definition persistence;
- semantic committed node: movable only when semantic layout persistence is
  available for the current workspace;
- semantic preview/source pulse node: not movable unless a later plan defines a
  durable owner;
- synthetic graph node: movable only inside synthetic/performance scenarios and
  never treated as proof of production persistence.

Port connectability follows the same rule. Workflow ports are connectable only
when the current workflow projection is editable and edge creation is a valid
draft operation. Read-only/run/version projections should not expose port hit
targets, connection cursors, or temporary edge drawing.

### Layout Save Outcomes

Layout saves should produce explicit outcomes:

```text
persisted: authoritative layout/projection accepted the move
skipped: no durable owner or no moved positions
failed: durable owner rejected the move
```

Failed saves must clear the pending overlay generation that came from that
drag. If a newer drag superseded it, only the failed generation is cleared.

### Recording Contract

Recordings must be useful without rerunning the app.

Recording ownership should be explicit:

- renderer creates compact graph recording events from graph/Pixi debug state;
- preload forwards those graph events through the supported bridge;
- shared recording types define the event shape;
- main `SessionRecorder` writes the event without needing to infer graph state
  from screenshots, DOM snapshots, or console output.

Graph recording should use typed event kinds, not only snapshots:

- `graph_snapshot`: compact state sample on pointerup, pointercancel, wheel
  burst end, manual snapshot, and selected debug milestones.
- `graph_interaction`: start/update/commit/cancel for node drag, edge draw,
  marquee, selection, and camera gestures.
- `graph_layout_save`: started/succeeded/failed/skipped with owner, generation,
  target, affected node ids, and error summary when present.
- `graph_replacement`: queued/applied/dropped with graph version, reason, and
  active interaction at queue time.

Graph recordings should include enough state to answer:

- what graph surface was focused;
- what pointer/wheel interaction occurred;
- what node/edge was selected;
- what node was dragged;
- what local position was shown before and after pointerup;
- whether a backend/IPC layout save started and finished;
- whether it succeeded, failed, or was skipped;
- what projection/layout was authoritative afterward;
- what camera/zoom state was active during pan/zoom;
- what trajectory sprites were visible and how they were anchored.

## Phase 0: Refactor Readiness Baseline

Goal: freeze the failure inventory and prevent new cleanup churn from
polluting the refactor.

Tasks:

- Record the findings above as the active pre-refactor backlog.
- Identify the smallest focused files for each fix.
- Do not start broad file organization, dependency, or style cleanup.
- Run only focused checks needed to prove the baseline tests compile before
  adding regressions.

Acceptance criteria:

- This plan is the source of truth for pre-refactor work.
- Any additional findings are classified as blocker, high, medium, or low and
  assigned to before-refactor, during-refactor, or later.

## Phase 1: Non-Editing View Layout Owner Contract

Goal: define the durable owner for read-only/run/version workflow node
rearrangement before renderer or E2E work depends on it.

Tasks:

- Add Go-owned contracts for workflow graph view layout reads and updates.
- Register the endpoints in `internal/httpapi`; do not maintain a separate
  generated-type list.
- Define the target key as an explicit discriminated contract for
  `definition_version` and `workflow_execution`.
- Implement the backing store/schema under backend-owned app data.
- Expose the generated contracts through main/preload IPC.
- Regenerate `desktop/src/generated/backend.ts`.
- Add focused backend coverage for key validation, unknown node rejection,
  target isolation, read-after-write, and no draft definition mutation.
- Add focused preload/main IPC coverage that the renderer can read/update view
  layout through production IPC paths.

Focused verification:

```sh
./scripts/go.sh test ./internal/httpapi ./internal/orchestrator ./internal/workspaceui ./cmd/generate-contracts
./scripts/go.sh run ./cmd/generate-contracts
pnpm -C desktop exec vitest run \
  src/preload/index-workflow.test.ts \
  src/preload/index.test.ts
pnpm -C desktop exec tsc --noEmit --pretty false
```

Acceptance criteria:

- Read-only/run/version view layout has a named Go-owned persistence contract.
- Generated TypeScript is updated from Go-owned contracts.
- Renderer work can distinguish draft workflow definition layout writes from
  non-editing view-layout writes.
- No read-only/run/version node movement test relies on undefined renderer-only
  persistence.

## Phase 2: Tests First For Durable Drag Behavior

Goal: add behavior-first regression coverage before changing the interaction
implementation.

Tasks:

Current-contract tests:

- Add required deterministic Electron coverage for editable workflow node drag:
  - open temporary workspace;
  - create or select a real editable draft workflow;
  - drag a workflow node through the production graph surface;
  - wait for `workflow:update-definition-layout` and refreshed projection;
  - assert the node remains moved in the graph debug snapshot;
  - reload or relaunch with temporary app data;
  - assert the node remains moved from persisted backend definition layout.
- Add coverage for read-only workflow ports:
  - open a run or version projection;
  - hover and drag from a port;
  - assert no connectable cursor or temporary edge appears;
  - assert no edge creation save is issued.
- Add live-condition drag coverage:
  - start or synthesize trajectory, semantic runtime, liveness, or command
    preview updates through the production scene runtime;
  - drag an editable workflow node while those updates are flowing;
  - assert only the dragged node moves;
  - assert projection/materialization refreshes do not reset that node before
    persistence completes;
  - reload or relaunch and assert the persisted position remains.
- Add active-interaction replacement coverage:
  - trigger a graph/projection refresh during node drag before pointerup;
  - trigger a graph/projection refresh during edge draw or marquee if those
    modes remain available;
  - assert the active interaction is not canceled by replacement;
  - assert node-drag pointerup commits through the movement owner;
  - assert node-drag pointercancel reverts and does not persist;
  - assert edge-draw pointercancel cancels the temporary edge and does not
    persist;
  - assert marquee pointercancel restores the previous selection;
  - assert settlement happens before the latest queued graph applies.

Tests after Phase 1 view-layout owner exists:

- Add coverage for read-only workflow nodes:
  - open a run or version projection;
  - drag a workflow node through the production graph surface;
  - assert the node moves through the read-only/run view-layout owner;
  - assert no draft workflow definition layout save is issued;
  - force graph/projection refresh;
  - reload or relaunch with temporary app data;
  - assert the node remains moved according to the view-layout contract.
- Keep renderer counters as diagnostics only after behavior passes.

Focused verification:

```sh
pnpm -C desktop build
node desktop/tests/electron/run-workflows.mjs \
  --workflow workflow-graph-smoke \
  --workflow workflow-blank-canvas \
  --skip-build
```

Acceptance criteria:

- The new tests fail against the known broken interaction contract before the
  fix.
- The tests exercise production Electron/main/preload/renderer/HTTP/store
  paths with temporary app data.
- At least one test exercises direct manipulation and live graph updates at the
  same time.
- Read-only/run/version node persistence tests are added only after the
  Go-owned view-layout owner contract exists.

## Phase 3: Editability And Movement Ownership Contract

Goal: make editability and movement ownership explicit contracts used by graph
interaction, details surfaces, and toolbar state.

Tasks:

- Add `editable` to `WorkflowNodeDetailsTarget`.
- Populate it from `WorkflowGraphProjection.editable`.
- Replace node-details read-only checks based on `executionId !== ""` with
  `!target.editable`.
- Add production-path coverage for a version projection with no execution id:
  node details must be read-only and must not expose enabled save controls.
- Pass graph editability or per-node movability into Pixi through a typed
  renderer graph/options contract.
- Include the node movement owner in that contract so Pixi knows whether a drag
  writes to draft definition layout, read-only/run view layout, semantic layout,
  or no owner.
- Pass graph editability or per-port connectability into Pixi through the same
  contract.
- Block node drag before mutation when a node has no movement owner.
- Mark semantic preview/runtime-only nodes as non-movable unless a durable
  layout owner is added.
- Preserve click/select/details/steering affordances for semantic nodes,
  including preview/runtime-only semantic nodes when they have useful semantic
  context.
- Suppress port hit targets and temporary edge drawing when ports are not
  connectable.
- Set cursor state from movability rather than assuming every body can be
  grabbed.
- Ensure delete, connect, save, and details editing all use the same projection
  editability semantics.

Focused verification:

```sh
pnpm -C desktop exec vitest run \
  src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts \
  src/renderer/src/features/workspace-graph/workflow-graph-surface-controller.test.ts
pnpm -C desktop exec tsc --noEmit --pretty false
```

Acceptance criteria:

- Read-only/run workflow node drags use the non-editing view-layout owner and
  never write to draft workflow definition layout.
- Semantic preview/runtime-only nodes never enter drag state without a durable
  owner.
- Semantic nodes remain clickable/selectable and available for semantic
  steering interactions when those actions have semantic or steering owners.
- A version projection with no execution id still renders node details as
  read-only.
- Read-only details surfaces do not expose enabled save controls.
- Editable draft behavior remains unchanged except for stronger persistence
  proof.

## Phase 4: Layout Save Outcome And Overlay Rollback

Goal: make optimistic layout state honest after success, skip, or failure.

Tasks:

- Replace `WorkflowGraphProjection | null` layout persistence return values with
  an explicit outcome type.
- Distinguish workflow layout save failure from skipped persistence.
- Clear persisted overlay inputs after successful save.
- Revert or clear failed overlay inputs after failed save.
- Resync the renderer from authoritative projection or semantic layout after a
  failed save.
- Apply the same outcome shape to semantic layout persistence where the current
  overlay can outlive a failed save.
- Surface layout save errors without leaving the graph in a false durable state.

Focused verification:

```sh
pnpm -C desktop exec vitest run \
  src/renderer/src/features/workspace-graph/workflow-graph-layout-persistence.test.ts \
  src/renderer/src/features/workspace-graph/workflow-graph-layout-overlay.test.ts
```

Acceptance criteria:

- A failed workflow layout save cannot leave a moved workflow node visible as
  if it persisted.
- A failed semantic layout save cannot leave a semantic node visible as if it
  persisted.
- A newer drag generation is not cleared by an older failed save.
- If semantic overlay behavior changes, add focused coverage for
  `workflow-graph-semantic-layout-overlay.ts` rather than relying only on
  workflow overlay tests.

## Phase 5: Graph Recording Evidence

Goal: make `scripts/record_desktop_session.sh` recordings sufficient for graph
bug diagnosis.

Tasks:

- Define a graph-specific recording event shape in
  `desktop/src/shared/recording.ts`.
- Emit compact graph-specific recording payloads from the renderer using the
  existing Pixi debug snapshot data as source material.
- Forward graph recording events through preload instead of scraping renderer
  console output or DOM snapshots.
- Have main/session recording write those graph events to `renderer-events.jsonl`
  with the shared event shape.
- Add typed event kinds for `graph_snapshot`, `graph_interaction`,
  `graph_layout_save`, and `graph_replacement`.
- Add renderer recording events for graph pointerup, pointercancel, debounced
  wheel bursts, and manual snapshot requests.
- Default `scripts/record_desktop_session.sh` to a temporary
  `SETTA_APP_DATA_DIR` under the recording directory.
- Add an explicit opt-in flag or environment variable for recording against the
  developer's existing app data.
- Enable graph debug recording in the recording script by default with
  `SETTA_WORKFLOW_GRAPH_DEBUG=1`.
- Include graph debug snapshot data in renderer recording events:
  - surface id;
  - camera and zoom;
  - selected ids;
  - node positions;
  - pending layout write count or generation;
  - last layout save outcome;
  - trajectory display counts;
  - trajectory anchor summaries;
  - renderer timing summary when available.
- Update `SessionRecorder` to keep graph payloads compact with counts and
  touched/visible/selected/moved node subsets.
- Include explicit truncation or chunking metadata for any omitted graph nodes,
  edges, sprites, anchors, or timing samples.
- Update `scripts/record_desktop_session.sh` output text to tell developers
  which graph artifacts are captured, which app data directory is in use, and
  the effective `SETTA_WORKFLOW_GRAPH_DEBUG` value.
- Update README recording guidance to describe the isolated default and opt-in
  behavior for real app data.
- Add a focused test or parser assertion that a graph recording includes graph
  state after a scripted drag and pan/zoom interaction.

Focused verification:

```sh
pnpm -C desktop exec vitest run \
  src/preload/index.test.ts \
  src/shared/ipc.test.ts
pnpm -C desktop build
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs \
  --scenario small-trackpad \
  --skip-build \
  --keep-artifacts
```

Acceptance criteria:

- Renderer emits, preload forwards, and main records graph events using the
  shared graph recording event shape.
- Recordings include chronological interaction, layout-save, and graph
  replacement events rather than requiring those transitions to be inferred from
  snapshots alone.
- A recording can diagnose whether a node drag was blocked, saved, failed, or
  reverted.
- A recording can diagnose pointerup versus pointercancel and whether a queued
  graph replacement was applied after the interaction settled.
- A recording can diagnose camera state and frame timing around pan/zoom.
- Recording payloads remain bounded, sanitized, and explicit about truncation.
- Recording a desktop session does not mutate the normal `~/.setta` app data
  unless the caller explicitly opts in.

## Phase 6: Trajectory Sprite Interaction Decision

Goal: remove misleading trajectory sprite UI and make sprite placement
predictable.

Tasks:

- Decide whether trajectory sprites are interactive or passive for this
  refactor.
- If interactive:
  - enable hit testing for trajectory sprites or route pointer hits through the
    graph input layer;
  - open the owning workflow node details;
  - make the trajectory section visible and include the selected sprite context
    when feasible;
  - add hover/cursor affordance.
- If passive:
  - keep the layer inert;
  - remove interactive-looking hover/click affordances;
  - style badges as status marks attached to nodes rather than controls.
- Add deterministic E2E coverage for the chosen behavior.
- Define the anchorless sprite contract:
  - hide anchorless items intentionally; or
  - render them in a recent lane with consistent coordinate-space math; or
  - attach them to an explicit fallback owner.
- Add coverage that anchored sprites stay attached to workflow nodes through
  pan/zoom.
- If a recent lane is kept, add coverage that it does not drift under pan/zoom.

Focused verification:

```sh
pnpm -C desktop exec vitest run \
  src/renderer/src/features/workspace-graph/workspace-trajectory-store.test.ts \
  src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts
pnpm -C desktop build
node desktop/tests/electron/workspace-trajectory-file-fidelity.test.mjs --skip-build
```

Acceptance criteria:

- Users no longer see click-looking objects that do nothing.
- Tests pin either click-to-details behavior or passive badge behavior.
- Anchorless sprite behavior is intentional and tested.
- Sprite placement uses one coordinate-space model per lane.

## Phase 7: Interaction Refactor

Goal: refactor graph interaction ownership after the contract and tests are in
place.

Tasks:

- Move drag, pan, selection, and trajectory hit behavior behind a small
  interaction controller owned by the graph surface controller.
- Keep React responsible for commands and details state, not pointer-time scene
  mutation.
- Keep Pixi responsible for immediate visual feedback only when the action is
  admitted by the durable contract.
- Remove the stale graph handoff between React materialization,
  `pendingWorkflowGraphRef`, scene-store frames, and Pixi updates.
- Queue graph replacement while node drag, edge draw, marquee selection, or
  other direct manipulation is active; apply only the latest queued graph after
  the interaction commits or cancels.
- Make scene graph updates position-preserving for admitted drags and pending
  layout generations.
- Keep runtime overlays structurally read-only for node `x`/`y` and camera
  state.
- Separate camera interaction from layout persistence.
- Ensure scene updates from projection refresh cannot erase an admitted pending
  move without an explicit save outcome.
- Ensure run/version projection refreshes cannot enter edit affordance states.
- Keep semantic runtime and trajectory updates off the camera hot path.
- Replace ambiguous `null`/no-op persistence paths with explicit outcomes.

Acceptance criteria:

- Graph interaction code has one obvious place to answer whether a node can be
  moved and which owner receives the move.
- Graph interaction code has one obvious place to answer whether a port can be
  connected.
- Graph interaction code distinguishes workflow-definition edits from
  non-workflow interactions such as selection, details, view layout, semantic
  layout, and semantic steering.
- Durable layout state and visual state cannot disagree silently.
- React graph materialization, scene-store materialization, and Pixi updates no
  longer race through stale pending frames.
- Backend/projection/semantic refreshes cannot cancel active direct
  manipulation before pointerup or pointercancel.
- Projection refreshes, validation refreshes, reloads, and failed saves are
  covered by behavior tests.
- Runtime updates cannot mutate durable node positions or camera state.
- If semantic graph workflow tests become part of the refactor safety net, large
  embedded `client.evaluate` scripts have been moved into normal helper modules
  instead of expanded further.

## Phase 8: Pan/Zoom Performance Follow-Up

Goal: keep pan/zoom smoothness measurable without blocking the refactor on an
undefined performance gate.

Tasks:

- Keep structural hard gates from the existing pan/zoom performance workflow.
- Add behavior assertions for camera deltas, dragged-node-only movement, stable
  positions after refresh, and absence of unintended layout writes before
  scheduler/counter assertions.
- Treat interaction scheduler lane counts as instrumentation unless the
  scheduler is changed to actually coalesce, defer, preempt, or remove work from
  the input path.
- Keep timing thresholds report-only until a reference runner and failure
  thresholds are explicitly agreed.
- After a reference runner and thresholds exist, promote one normal-size
  pan/zoom timing scenario to a hard gate.
- Keep non-reference timing noisy and report-only, but record enough data to
  diagnose regressions.
- Separate profiler overhead from normal recording overhead.
- Keep input-to-presented-frame blocked until a real compositor presentation
  trace source is wired.

Acceptance criteria:

- Refactor readiness does not depend on a timing hard gate unless the reference
  runner and failure thresholds are already agreed.
- A normal pan/zoom workload can fail hard for obvious event delivery, long
  task, or frame cadence regressions only after that reference runner exists.
- Report-only timing is clearly labeled as non-proof on other machines.
- Scheduler assertions do not claim performance improvement unless they measure
  reduced input-path work or user-visible latency.

## Verification Strategy

During implementation, run focused checks first:

```sh
pnpm -C desktop exec vitest run \
  src/renderer/src/features/workspace-graph/workflow-graph-layout-persistence.test.ts \
  src/renderer/src/features/workspace-graph/workflow-graph-layout-overlay.test.ts \
  src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts
pnpm -C desktop exec tsc --noEmit --pretty false
pnpm -C desktop build
node desktop/tests/electron/run-workflows.mjs \
  --workflow workflow-graph-smoke \
  --workflow workflow-blank-canvas \
  --workflow semantic-graph \
  --workflow workspace-trajectory-file-fidelity \
  --skip-build
```

If Go-owned contracts, backend persistence, generated TypeScript, IPC, or
preload surfaces change, also run the focused contract path:

```sh
./scripts/go.sh test ./internal/httpapi ./internal/orchestrator ./internal/workspaceui ./cmd/generate-contracts
./scripts/go.sh run ./cmd/generate-contracts
pnpm -C desktop exec vitest run \
  src/preload/index-workflow.test.ts \
  src/preload/index.test.ts \
  src/shared/ipc.test.ts
pnpm -C desktop exec tsc --noEmit --pretty false
```

If the view-layout owner lands in a different Go package, include that package
in the focused `./scripts/go.sh test` command. Generated outputs must be
regenerated before cleanup and before finishing the implementation.

Before committing implementation changes, run:

```sh
./scripts/format.sh
./check_quality.sh --all
```

If performance gates or recording changes are touched, also run the focused
performance workflow that exercises the changed behavior:

```sh
pnpm -C desktop build
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs \
  --scenario small-trackpad \
  --skip-build \
  --keep-artifacts \
  --write-report
```

## Completion Criteria

This plan is complete when:

- read-only/run/version workflow node movement has a Go-owned non-editing
  view-layout contract, generated TypeScript, IPC/preload exposure, and focused
  backend coverage;
- view-layout positions are read separately and composed in the renderer
  scene-store layer, not folded into `WorkflowGraphProjection`;
- read-only workflow nodes can be rearranged through an explicit non-editing
  layout owner without using draft persistence or snapping back;
- read-only workflow ports cannot advertise connectable actions;
- semantic preview/runtime-only nodes cannot be dragged without a durable owner;
- workflow and semantic nodes remain clickable/selectable/interactable for
  non-workflow-editing actions, including semantic steering where supported;
- editable workflow node moves persist through backend refresh and reload;
- graph/projection refreshes cannot cancel active node drag, edge draw, or
  marquee before pointerup/pointercancel settles the interaction;
- pointercancel reverts node drag, cancels edge draw, restores marquee
  selection, and does not persist those canceled interactions;
- failed layout saves cannot leave false optimistic positions visible;
- workflow node details use projection editability, not execution id, for
  read-only state;
- trajectory sprites have an explicit tested interaction model;
- desktop recordings include enough graph state to diagnose drag and camera
  bugs, including pointerup/pointercancel and queued graph replacement state;
- recordings include chronological `graph_interaction`, `graph_layout_save`,
  and `graph_replacement` events, not only graph snapshots;
- recording payload bounds are explicit and do not silently hide graph scale
  evidence;
- behavior assertions lead graph tests, with renderer counters as supplemental
  diagnostics;
- pan/zoom timing hard gates are either backed by an agreed reference runner and
  thresholds or kept separate as report-only follow-up work;
- and the main graph interaction refactor can proceed without preserving the
  current broken edge cases.
