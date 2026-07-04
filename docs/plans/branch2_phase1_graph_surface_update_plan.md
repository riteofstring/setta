# Branch 2 Phase 1 Graph Surface Update Plan

- **Date:** June 22, 2026
- **Source plan:** `docs/plans/branch2_essential_port_plan.md`
- **Phase 0 manifest:** `docs/plans/branch2_slice_manifest.md`
- **Status:** Ready for implementation planning review.
- **Scope:** Fix the verified current-branch graph surface update problems
  before adding branch 2 trajectory runtime or trajectory sprites.

## Goal

Make current graph updates safe enough for future live trajectory rendering by
fixing the verified renderer surface problems:

- unchanged edges and edge labels are fully rematerialized on graph updates;
- graph updates cancel active camera panning even when the update is unrelated
  to the camera gesture;
- debug snapshots expose renderer counters, but not enough ingress/source
  attribution to prove which graph update path caused materialization or
  interaction cancellation.

This is an architecture-first slice. It prepares the target branch's current
renderer boundary so later branch 2 ideas can be rebuilt cleanly.

## Non-Goals

Do not implement:

- workspace trajectory runtime;
- trajectory sprites, badges, popovers, or details;
- semantic-memory usefulness;
- semantic cartographer settings or audit UI;
- visual redesign, neon/cell effects, glow changes, or animation work;
- a broad branch 2 surface-controller port;
- future trajectory update lanes;
- migrations, compatibility shims, dual paths, old-field aliases, or
  transitional renderer modes.

The implementation should solve the verified failures only. Add abstraction
only where it is needed to make edge/label updates, camera preservation, and
debug attribution correct and testable.

## Current Evidence

Phase 0 found:

- `pixi-renderer-scene-graph.js` retains node display objects by id and patches
  simple node changes in place.
- `pixi-renderer-edge-rendering.js` clears edge graphics, destroys all edge
  labels, and redraws every edge.
- `pixi-renderer.js` `replaceSceneGraph` calls
  `cancelActiveInteractionsForGraphUpdate`, which clears `panningCamera`, then
  rebuilds spatial queries, syncs all labels, redraws glow, and redraws all
  edges.
- Workflow and semantic graph ingress both pass through React graph state and
  call `workflowRenderer.updateGraph(graph)`.
- The static production smoke confirms current debug counters are observable,
  but does not exercise live graph updates during camera movement.

## Implementation Contract

### 1. Attribute Graph Update Sources

Add explicit source metadata to graph update calls so debug snapshots and tests
can distinguish at least:

- initial graph mount;
- workflow projection update;
- semantic graph update;
- semantic activity-only update if it reaches renderer graph state;
- draft/validation/local graph update;
- layout update;
- unknown or legacy caller.

Counters should answer:

- how many graph updates ran by source;
- whether the camera was moving during the update;
- whether the update cancelled an interaction;
- how many edges were added, removed, updated, retained, or rematerialized;
- how many edge labels were added, removed, updated, retained, or
  rematerialized;
- whether the Pixi app/renderer/layers were recreated.

Extend the existing scene-graph updater/debug snapshot counters where possible
instead of creating parallel accounting. The current updater already tracks
node/edge add/remove/update counts; the genuinely new evidence is update
source, camera-moving state, interaction-cancel state, and edge-label
materialization counts.

Use the current debug snapshot surface where possible. Do not introduce a new
recording subsystem in this slice.

### 2. Pool Edge Labels

Edge labels are independent display objects today, and `redrawWorkspaceEdges`
destroys all of them on each edge redraw. Replace that with label retention by
edge id, mirroring the existing node-label acquire/release pattern where it
fits the current renderer.

Minimum expected behavior:

- unchanged edge labels are retained instead of destroyed and recreated;
- changed edge labels update only when label inputs, font inputs, or geometry
  inputs that affect label placement change;
- removed edge labels are destroyed explicitly;
- added edge labels are created explicitly;
- for a content-only safe update, edge-label rematerialization must be zero.

Do not allow the old destroy-all label path to survive behind permissive
counter wording. Counting a nonzero label rematerialization cost is diagnostic
evidence, not a passing result for safe content-only updates.

### 3. Keep Edge Graphics Batched But Skip Unneeded Redraws

Edge graphics are currently drawn into a single shared Pixi `Graphics` object.
Do not replace that with one retained `Graphics` object per edge as a default
implementation; that would trade one problem for a likely large-graph
regression.

Keep the batched graphics path, but gate redraws on actual edge geometry or
style invalidation:

- redraw when topology changes;
- redraw when an edge endpoint moves;
- redraw when an edge diagnostic/style changes;
- skip the edge graphics redraw for content-only graph updates that do not
  affect edge geometry or style;
- count every skipped redraw and every actual redraw with the update source.

The existing node-drag path still needs edge redraws while endpoints move. The
new gate should preserve that behavior.

### 4. Preserve Camera Panning Across Graph Updates

Graph updates must not clear `panningCamera`. A camera pan is screen-space
state (`lastX`, `lastY`) and has no graph target for a data update to remove.

Allowed interaction cancellation:

- the target of an active node drag, edge draw, or selection interaction is
  removed;
- a structural graph replacement invalidates the interaction target;
- the renderer is being destroyed or frozen.

Not allowed:

- cancelling camera pan/zoom solely because workflow or semantic data refreshed;
- clearing temporary camera state for content-only updates;
- using camera cancellation as a substitute for update-lane correctness.

The camera path must continue to avoid backend reads and layout persistence
during movement.

Implementation must still verify that graph replacement does not re-anchor
world coordinates under an active screen-space camera gesture.

### 5. Keep The Slice Narrow

Split update handling only as far as the verified failures require:

- structural graph replacement;
- content-only edge-label-safe updates;
- batched edge-graphics redraw skipping;
- camera-safe update handling;
- debug attribution.

Do not build general future lanes for trajectory, semantic runtime, cartographer
audit, or visual animation in this phase.

## Suggested File Areas

Likely renderer files:

- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-scene-graph.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-edge-rendering.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-edge-labels.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-debug-snapshot.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer.d.ts`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-surface.tsx`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-runtime-registry.ts`

Likely tests/harnesses:

- focused renderer tests under
  `desktop/src/renderer/src/features/workspace-graph/`;
- `desktop/tests/electron/workflow-graph-smoke.test.mjs` or a narrowly scoped
  new workflow that injects an update while panning;
- `scripts/test_workflow_graph_visual.sh` if the existing smoke remains the
  right production-path entrypoint.

This list is not permission to edit all files. Prefer the smallest owner set
that satisfies the contract.

## Verification

Start narrow:

- renderer/unit coverage for edge-label retention;
- renderer/unit coverage proving batched edge graphics redraw is skipped when
  topology, endpoints, diagnostics, and style are unchanged;
- renderer/unit coverage for graph updates that preserve camera panning when
  the update is content-only or otherwise unrelated to the screen-space camera
  gesture;
- debug snapshot/counter coverage proving update source attribution and
  edge/label materialization counts.

Then production path:

- deterministic Electron workflow with temporary app data;
- open a workspace and render the workflow graph;
- start camera pan/zoom;
- deliver a workflow or semantic graph update through production
  main/preload/renderer/store paths;
- assert the Pixi app is not recreated;
- assert camera pan/zoom is not cancelled for a safe update;
- assert unchanged edge labels are retained and label rematerialization is zero
  for the safe update;
- assert batched edge graphics redraw is skipped for a safe update that does
  not change topology, endpoints, diagnostics, or style;
- assert debug snapshots identify the update source and materialization cost.

Because this is performance-relevant UI work, record before/after evidence as
an append-only report under `docs/reports/performance/`. This report is part of
the slice, not optional. It can be counter-based if timing metrics are not
stable on the local machine, but it must show the before/after materialization
behavior for the safe update.

Final checks before committing executable changes:

- focused renderer tests for the changed behavior;
- relevant deterministic Electron workflow;
- `./scripts/format.sh`;
- `./check_quality.sh --all`.

## Definition Of Done

Phase 1 is done when:

- graph updates have source attribution in debug snapshots;
- unchanged edge labels are not destroyed/recreated on safe graph updates;
- safe updates have zero edge-label rematerialization;
- safe updates skip batched edge graphics redraw when edge geometry/style did
  not change;
- camera pan/zoom survives safe workflow/semantic graph updates;
- Pixi app/renderer/layers are not recreated by normal graph updates; this is a
  regression guard, not the main refactor;
- production Electron coverage proves the behavior through real app paths;
- append-only before/after evidence is recorded under
  `docs/reports/performance/`;
- no trajectory runtime or trajectory rendering has been added.

## Handoff Prompt

Use this for an implementation agent:

```text
Implement docs/plans/branch2_phase1_graph_surface_update_plan.md.

Keep the slice narrow:
- add graph update source/materialization counters;
- pool/retain unchanged edge labels;
- keep edge graphics batched, but skip redraws when edge geometry/style did not change;
- preserve camera panning across graph updates;
- add focused renderer tests and one production Electron workflow proving the behavior.

Do not add trajectory runtime, trajectory sprites, semantic usefulness,
visual redesign, broad branch 2 controller code, migrations, compatibility
paths, or future trajectory lanes.

Use current branch owners. Treat branch 2 as design evidence only.
Run focused checks first, then the relevant Electron workflow, then
./scripts/format.sh and ./check_quality.sh --all before committing code.
```
