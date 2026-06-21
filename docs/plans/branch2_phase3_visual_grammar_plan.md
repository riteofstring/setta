# Branch 2 Phase 3 Visual Grammar Plan

- **Date:** June 22, 2026
- **Source plan:** `docs/plans/branch2_essential_port_plan.md`
- **Phase 1 prerequisite:** `docs/plans/branch2_phase1_graph_surface_update_plan.md`
- **Phase 2 prerequisite:** `docs/plans/branch2_phase2_typed_liveness_plan.md`
- **Status:** Ready for implementation planning review.
- **Scope:** Make the existing workflow graph and typed activity markers visually
  readable and coherent without adding new runtime data, semantic memory, or
  branch 2 visual effects.

## Goal

Phase 3 should make the graph understandable at a glance while a workflow runs.

The user should be able to look at the workflow graph and quickly distinguish:

- which workflow node is currently active;
- which edge or route is in progress;
- which node needs approval;
- which node ran a command;
- which node changed a file;
- which node or workflow step completed or failed.

This phase is visual grammar, not a new activity system. Phase 2 already added
the typed liveness feed and minimal markers. Phase 3 should make those existing
signals feel deliberate, legible, and stable.

## Product Principle

Visual grammar is a language, not decoration.

Every new visual treatment must map to a typed runtime or graph state that
already exists. Do not add motion, glow, biological metaphors, or decorative
states unless they communicate a specific typed state and are proven not to
damage pan/zoom performance.

## Preconditions

Phase 2B must be committed and green before this starts:

- typed activity records stream through production app paths;
- minimal activity markers render for workflow status, command, approval, and
  path/status-level file-change activity;
- marker materialization is bounded and counted;
- marker updates do not replace the graph scene;
- camera panning continues while activity deltas arrive;
- no backend reads are requested during camera movement.

If any of those regress, stop and fix Phase 2B before continuing visual work.

## Current Starting Point

The current graph already has:

- workflow nodes and edges rendered by the Pixi graph surface;
- typed activity markers with distinct marker shapes for workflow status,
  command, file change, and approval;
- debug counters for graph replacement, marker creation/update/removal,
  activity deltas during camera movement, and backend reads during camera
  movement;
- a deterministic Electron workflow that exercises command, file-change,
  approval, workflow-status, pan continuity, and marker completion.

Phase 3 should refine that surface. It should not replace it.

## Decisions Before Coding

Before editing renderer code, write down the current visual roles in the PR or
commit notes:

- what the node body communicates;
- what the edge stroke communicates;
- what an activity marker communicates;
- what selected, active, waiting, completed, failed, and idle states look like;
- which states are intentionally absent because the typed source does not exist.

The inventory must also identify which visual channels are already occupied.
For example, if node fill already communicates node type, runtime status should
use a free channel such as outline, accent, or marker emphasis rather than
double-booking fill color. If marker shape already communicates activity kind,
Phase 3 should add status emphasis without changing the kind vocabulary that
Phase 2B established.

This should be a short implementation note, not a broad audit. If the visual
roles cannot be stated clearly in one page, stop and split the work into a
smaller visual-inventory commit before styling.

## Implementation Contract

### 1. Define State Priority

Define a deterministic priority order for visual states so overlapping signals
do not fight each other.

Minimum expected priority:

1. failed or cancelled;
2. waiting for approval;
3. running;
4. completed;
5. pending or scheduled;
6. idle or unknown;
7. selected or hovered as an interaction overlay, not as runtime status.

The implementation should make priority explicit in a typed helper or focused
renderer helper, not scattered through ad hoc conditionals.

Resolved visual state must be observable. Expose the resolved visual state for
nodes, edges, and activity markers in the debug snapshot so tests can assert the
runtime state-to-visual-token mapping. Screenshots are required for aesthetics,
but correctness must not depend on human screenshot inspection alone.

The resolved visual state must be single-sourced. The same resolver that drives
Pixi styling should also feed the debug snapshot. Do not let the snapshot
re-derive intended visual state through a parallel code path; that can make
tests pass while the rendered pixels use different logic.

### 2. Clarify Workflow Node State

Make active workflow nodes obvious without changing graph layout.

Allowed changes:

- node outline, stroke, fill, or small status accent;
- typed status color or compact status marker;
- restrained emphasis for active and waiting states;
- failed state that is immediately distinct from running and approval states.

Not allowed:

- resizing nodes based on runtime status;
- adding text that can overflow compact nodes;
- hidden layout shifts;
- full node rematerialization for content-only status changes.

### 3. Clarify Workflow Edge Direction And Progress

Active workflow edges should communicate direction or route progress using
existing graph data. The preferred source is deterministic workflow state that
already exists, such as the edge from a just-completed node to a now-running,
waiting, failed, or completed downstream node.

If a clean typed or deterministic derived signal is not available, defer edge
progress styling and ship node/marker legibility first. Do not infer edge
progress from timing, animation state, shell output, assistant text, or visual
position alone.

Allowed changes:

- edge color/style for active, completed, failed, or pending routes;
- subtle arrow/direction affordance if it fits the existing renderer shape;
- deterministic styling derived from workflow event/status data or existing
  projection state.

Not allowed:

- animated edge particles or continuous motion in this phase;
- per-edge retained graphics rewrites unless a measured renderer need proves
  the current batched path cannot support the grammar;
- redrawing unchanged edge graphics.

A status-driven edge color/style transition is a real style change and may
redraw the shared batched edge graphics. That is acceptable when the edge visual
state actually changes and is counted. The Phase 1 invariant is that unchanged
edges are not redrawn as a side effect of unrelated activity or marker updates.

### 4. Refine Activity Marker Grammar

Activity markers should remain small, stable, and typed.

Minimum expected behavior:

- marker kind is distinguishable without reading a label;
- active markers are visually stronger than completed markers;
- approval markers are easy to spot while waiting;
- file-change markers remain distinct from command markers;
- completed markers quiet down without disappearing prematurely;
- marker dimensions and positions stay stable across updates.

Phase 2B already made marker kinds distinct. Phase 3 should not redesign the
kind vocabulary unless a specific collision is proven. The main marker work is
status-driven emphasis layered onto the existing kind shapes.

Do not add popovers, details panels, hover cards, tooltips, trails, or sprite
animation in Phase 3. Those belong to a later interaction/details phase.

### 5. Make Semantic Nodes Explicit, Not Ambient

If semantic nodes are touched, use explicit kind/status markers rather than
ambient biology or decorative cell language.

Allowed changes:

- clear marker or badge for semantic node kind/status;
- restrained styling that distinguishes semantic memory from workflow runtime
  activity;
- no background/foundation change merely because semantic nodes exist.

Not allowed:

- semantic-cell mitosis/fusion;
- organelle motion;
- neon/cell/glow visual parity with branch 2 mockups;
- semantic usefulness scoring or cartographer UI.

### 6. Preserve Renderer And Activity Invariants

Visual grammar changes must not:

- replace the Pixi app, renderer, canvas, or layers;
- replace the graph scene for marker-only or status-only updates;
- request backend reads during camera movement;
- cancel camera pan/zoom;
- redraw unchanged edge graphics unnecessarily;
- rematerialize unchanged edge labels;
- create unbounded marker graphics;
- add polling.

Use the existing Phase 1 and Phase 2 counters as hard assertions in tests.

Add debug fields only where they make the visual grammar machine-checkable:

- resolved visual state by workflow node id;
- resolved visual state by edge id if edge styling is included;
- resolved visual state by activity marker id;
- the visual channel used for each runtime/status signal when useful for tests.

These debug fields should describe resolved renderer state. They should not
become a second source of truth for workflow or activity state.

Do not implement snapshot-only visual assertions. If a visual token appears in
the debug snapshot, it must come from the same resolved token object or helper
that the renderer used to style the node, edge, or marker.

## Non-Goals

Do not implement:

- new backend activity contracts or source metadata;
- file-read, diff-stat, test-result, or generic tool markers;
- command-output parsing or assistant-text heuristics;
- trajectory sprites, trails, popovers, details panels, or shared activity UI;
- semantic-memory promotion, usefulness scoring, or cartographer controls;
- neon/cell/glow redesign work;
- broad renderer architecture changes;
- graph-surface runtime refactors unless a measured regression blocks this
  phase;
- migrations, compatibility paths, transitional modes, or old-field aliases.

## Suggested File Areas

Likely renderer owners:

- `desktop/src/renderer/src/features/workspace-graph/workspace-activity-markers.ts`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-activity-markers.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-node-container.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-edge-rendering.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-debug-snapshot.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer.d.ts`

Likely tests:

- focused marker projection tests;
- focused Pixi marker/node/edge visual helper tests;
- deterministic Electron `workflow-activity-feed` coverage extended with visual
  state assertions and screenshots.

This list is not permission to touch every file. Prefer the smallest owner set
that makes the visual grammar clear and measurable.

## Verification

Start narrow:

- unit tests for status-priority mapping;
- unit tests for marker visual state mapping;
- focused Pixi tests proving retained marker graphics are reused and removed;
- focused renderer helper tests for node/edge style decisions, if those helpers
  are added.

Then production path:

- deterministic Electron workflow with temporary app data;
- open a workspace and workflow graph;
- start the scripted activity workflow;
- assert debug-resolved visual states for representative nodes, edges if in
  scope, and markers;
- capture visual evidence for idle, running, waiting approval, approved or
  completed, and failed or cancelled states;
- pan while activity arrives;
- assert camera movement continues;
- assert renderer identity and layer/canvas counters remain stable;
- assert marker graphics are bounded and equal to the expected marker count;
- assert graph replacement, backend-read-during-camera, and revision-gap
  counters stay within Phase 2 limits;
- assert no `file_read`, `diff`, or inferred marker kind appears.

Because this is performance-relevant UI work, record before/after evidence as
an append-only report under `docs/reports/performance/`.

Final checks before committing executable changes:

- focused renderer tests for changed behavior;
- relevant deterministic Electron workflow;
- `./scripts/format.sh`;
- `./check_quality.sh --all`;
- `./scripts/check_supply_chain.sh` only if dependency, package, module, or
  supply-chain files changed.

## Definition Of Done

Phase 3 is done when:

- the visual-state priority is explicit and tested;
- resolved visual state is exposed in debug snapshots and asserted through the
  deterministic Electron workflow;
- workflow nodes clearly communicate running, waiting approval, completed, and
  failed/cancelled states without layout shifts;
- workflow edges communicate active/progress state where current typed data
  supports it, or edge-progress styling is explicitly deferred because the
  current signal is not clean enough;
- activity markers remain typed, bounded, retained, and visually distinct;
- semantic nodes, if touched, use explicit markers rather than ambient visual
  metaphors;
- deterministic Electron evidence shows the graph remains usable while activity
  arrives and while panning;
- renderer/materialization counters prove no graph scene replacement, Pixi
  recreation, unbounded marker work, backend reads during camera movement, or
  avoidable edge/label rematerialization;
- append-only performance/visual evidence is recorded;
- no new runtime contracts, visual parity harness, trajectory sprite system, or
  semantic-memory features have been added.

## Handoff Prompt

Use this for an implementation agent:

```text
Implement docs/plans/branch2_phase3_visual_grammar_plan.md.

Keep the slice narrow:
- make the existing typed workflow activity visually readable;
- define and test state priority before styling;
- clarify workflow node, edge, and marker visual roles;
- preserve Phase 1 graph-update invariants and Phase 2 activity-marker
  invariants;
- prove the result through focused renderer tests and the deterministic
  workflow-activity-feed Electron workflow.

Do not add new activity contracts, new inferred marker kinds, trajectory
sprites, popovers, semantic-memory features, neon/cell/glow redesign work,
polling, compatibility paths, or broad renderer refactors.

Run focused checks first, then the relevant Electron workflow, then
./scripts/format.sh and ./check_quality.sh --all before committing code.
```
