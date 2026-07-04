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

## Phase 3.5 - Readable Activity Chips

Phase 3.5 is a corrective visual-communication follow-up to Phase 3.

Phase 3 proved the typed activity feed, retained marker materialization, visual
state resolver, and production-path assertions. It did not make live activity
self-explanatory enough on the canvas. Small circles, squares, and diamonds are
truthful but too cryptic as the primary representation. A user should not need
to hover every marker to understand what happened.

The branch 2 behavior to preserve is the readable activity badge idea, not the
entire branch 2 trajectory runtime, animation stack, or aggressive LOD system.

Reference branch 2 files at cutoff
`7a67cf453a006fa4cfd9a9b7e9ef6298984364e4`:

- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-trajectory-sprites.js`
- `desktop/src/renderer/src/features/workspace-graph/workspace-trajectory-display-labels.ts`
- `desktop/src/renderer/src/features/workspace-graph/workspace-trajectory-display-items.ts`
- `desktop/src/renderer/src/features/workspace-graph/workflow-activity-sprite-popover.tsx`
- `desktop/src/renderer/src/features/workspace-graph/workflow-trajectory-runtime-details.tsx`

Use those as design and behavior evidence. Do not port them wholesale.

### Phase 3.5 Goal

Make the current mystery-marker presentation readable by adding bounded,
text-bearing activity chips on the workflow graph.

The user should be able to glance at the graph and understand recent activity
without interaction:

- `Command npm test`;
- `File package.json`;
- `Approval waiting`;
- `Workflow running`;
- `Workflow failed`;
- `+3` when activity is collapsed.

Hover, focus, and click details are useful secondary affordances. They are not
allowed to be the primary way to understand what a marker means.

This phase may use level of detail only for activity chips. It must not bring
back branch 2 behavior where important graph information disappears during
normal pan/zoom. Workflow nodes, workflow edges, and workflow node labels should
remain visible as the default behavior.

### Phase 3.5 Preconditions

Phase 3.5 depends on the Phase 2 and Phase 3 foundations:

- typed workspace activity records already stream through production app paths;
- `WorkspaceActivityMarker.label` already contains bounded text derived from
  typed records;
- marker materialization is retained and counted;
- marker updates do not replace the graph scene;
- visual state resolution is single-sourced and debug-visible;
- deterministic Electron workflow coverage already exercises command,
  file-change, approval, workflow-status, waiting, completed, failed, and
  cancelled states.

If any of these are broken, fix the foundation before changing the visual
presentation.

### Phase 3.5 Product Principle

The canvas should communicate activity directly.

Activity chips should be compact, readable labels attached to workflow nodes or
the workflow node's immediate activity area. They should make typed liveness
feel like a legible work log beside the workflow, not like unexplained
decoration.

Activity that cannot be anchored to a visible workflow node should not render as
a floating far-left marker or fallback lane by default. Treat unanchored
activity as suspicious: either fix the projection/filtering bug, suppress it
from the graph and count it in debug telemetry, or defer a deliberately designed
workspace-level activity surface to a later phase.

### Phase 3.5 Split

Split this work into two reviewable slices.

**Phase 3.5A - Canvas Activity Chips**

Primary goal: make activity readable on the workflow graph without interaction.

Scope:

- readable chip LOD on the Pixi canvas;
- typed chip labels from existing activity marker data;
- per-node cap, global cap, collapse, and low-zoom compact representation;
- unanchored activity investigation and suppression/fix;
- Phase 1-3 renderer and pan/zoom invariants.

Phase 3.5A is allowed to ship without click-through details.

**Phase 3.5B - Chip Details And Shared Activity Rows**

Primary goal: connect readable chips to the canonical details surface.

Scope:

- chip click/focus routing into the existing workflow node details Niri pane;
- deep-link/highlight for run item, approval, or workflow event refs when
  typed detail refs support it;
- workflow node details reuse of the chat run-activity rendering path, or the
  smallest narrowly extracted shared component needed for that reuse.

Phase 3.5B must start after Phase 3.5A is committed and green. Do not block the
canvas legibility fix on this secondary interaction/details work.

### Phase 3.5 Implementation Contract

#### 1. Add Readable Chip LOD

Render visible workflow-node activity as fixed-size chips when the graph is
zoomed in enough for text to be readable. Keep compact Phase 3 glyph/count
representations only as the low-zoom or over-cap activity representation.

This is not permission to hide workflow nodes, workflow edges, node labels, or
base graph structure during normal pan/zoom. LOD in this phase applies to
activity-chip density and text readability only.

Minimum chip anatomy:

- stable rectangular or pill-like background;
- small icon or kind glyph on the left;
- visible text label from the existing typed marker label;
- status rail, border, or accent using the Phase 3 resolved visual state;
- stable width and height;
- retained Pixi object reused across updates.

Suggested baseline dimensions from branch 2:

- height around `22px`;
- width around `140-160px`;
- compact collapsed width around `48-64px`;
- small gap between chips.

These are starting points, not a requirement to copy exact branch 2 values.

Required chip LOD controls:

- a readable-text zoom threshold;
- a compact activity representation below that threshold;
- a per-node visible chip cap, defaulting to `4`;
- a global visible chip/text-object cap for large graphs;
- collapsed `+N` chips for overflow.

Keep these as obvious local constants or config values so they can be tuned
after manual review.

#### 2. Use Existing Typed Labels First

Use the existing marker projection data before adding new contracts.

Current branch already computes bounded labels in
`workspace-activity-markers.ts`:

- command activity can show command preview;
- file-change activity can show path/count and patch status;
- approval activity can show approval title or target;
- workflow-status activity can show status/event/message.

Phase 3.5 may refine label formatting, truncation, and kind prefixes in the
renderer/projection layer. It must not add command-output parsing, assistant
text heuristics, file-read inference, diff-stat inference, or new backend
metadata extraction.

#### 3. Keep Layout Bounded And Readable

Chips must not create unbounded clutter.

Required behavior:

- show up to `maxVisibleChipsPerNode` chips per workflow node, defaulting to 4;
- preserve stable ordering by priority and recency;
- collapse overflow into a readable `+N` chip;
- avoid placing chips where they obscure node labels, ports, or primary edges;
- maintain stable chip positions across status updates;
- suppress unanchored activity from the workflow graph by default.

The far-left recent-lane marker seen in manual review must be investigated
before chip layout is implemented. For this phase, do not design around a
floating recent-lane fallback. If a record is unanchored because of a projection
or filtering bug, fix the bug. If a record is truly workspace-level activity,
omit it from the workflow graph and count it as suppressed/unanchored in debug
state. A workspace-level activity lane needs its own product design and is not
part of Phase 3.5.

#### 4. Make Status Legible Without Hover

The chip label and visual state should make status understandable at a glance.

Examples:

- running command: active accent plus readable command text;
- waiting approval: approval chip with waiting status clearly visible;
- completed file change: quieter file chip with path/count text;
- failed workflow: failure accent and failure text;
- cancelled workflow: cancelled accent and cancelled text.

The status visual state should still come from the single Phase 3 resolver or a
direct extension of that resolver. Do not introduce a parallel chip-only state
mapping that can drift from the debug snapshot.

#### 5. Details Are Secondary - Phase 3.5B

Phase 3.5B may add basic click/focus behavior only after readable chips exist.
Do not include this work in Phase 3.5A unless it is limited to debug-visible hit
targets needed to prove chip materialization.

The canonical detail surface is the existing workflow node details Niri pane,
the same surface opened by selecting a workflow node and using the details/eye
action. Chip click behavior should route into that pane rather than inventing a
separate activity-details system.

Allowed secondary affordances:

- click a chip to open or focus the owning workflow node details pane when the
  activity is anchored;
- deep-link the pane to the clicked activity record when the chip has a
  `runItemId`, approval id, or workflow event id;
- highlight and, when practical, scroll to the matching activity row, approval
  row, or workflow event row;
- use the existing chat run-activity row components for agent/tool activity in
  workflow node details instead of maintaining a bespoke workflow-only run-item
  renderer;
- open a small preview popover only as an optional later affordance, and only
  when it reuses typed detail refs and links back to the node details pane;
- expose chip hit targets in debug snapshots for tests.

Not allowed:

- hiding essential meaning behind hover-only tooltip behavior;
- requiring click or hover to learn the activity kind/status;
- creating a parallel activity-details UI that disagrees with workflow node
  details;
- embedding the entire chat transcript in workflow node details;
- fabricating chat turns from flat workflow or activity data;
- implementing broad shared activity UI extraction before the chip canvas and
  node-details activity path are readable;
- porting the full branch 2 trajectory runtime details stack as part of this
  visual pass.

#### 6. Preserve Performance Invariants

Readable chips must keep the Phase 1-3 invariants:

- no Pixi app, renderer, canvas, or layer recreation;
- no graph scene replacement for activity-only updates;
- no backend reads during camera movement;
- no cancelled camera pan/zoom;
- no unbounded chip graphics or text objects;
- no graph-wide text or edge hiding as a pan/zoom shortcut;
- no full edge or label rematerialization caused by chip updates;
- no polling.

Text rendering should be retained and pooled. If chip labels require BitmapText
or Text objects, their object counts must be bounded and exposed through debug
counters.

### Phase 3.5 Non-Goals

Do not implement:

- new backend workspace activity contracts;
- file-read, diff-stat, test-result, or generic tool activity kinds;
- shell-command parsing or assistant-output parsing;
- semantic memory visuals, semantic-cell behavior, mitosis/fusion, or
  cartographer UI;
- neon/glow visual parity work;
- graph LOD that hides workflow nodes, workflow edges, or workflow node labels
  during normal pan/zoom;
- animated trails, edge particles, or decorative motion;
- broad graph-surface refactors;
- a separate chip-only details system that bypasses workflow node details;
- a full chat transcript surface inside workflow node details;
- an unanchored recent-lane/far-left activity surface;
- compatibility shims, migrations, legacy readers, or transitional modes.

### Phase 3.5 Suggested File Areas

Likely Phase 3.5A owners:

- `desktop/src/renderer/src/features/workspace-graph/workspace-activity-markers.ts`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-activity-markers.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-visual-state.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-debug-snapshot.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer.d.ts`
- `desktop/tests/electron/workflow-activity-feed.test.mjs`

Likely Phase 3.5B owners:

- `desktop/src/renderer/src/features/workspace-graph/workspace-activity-markers.ts`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-activity-markers.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer.d.ts`
- `desktop/src/renderer/src/features/workspace-graph/workflow-node-details-surface.tsx`
- `desktop/src/renderer/src/features/workspace-graph/workflow-node-details-components.tsx`
- `desktop/src/renderer/src/components/chat-run-activity.tsx`
- `desktop/tests/electron/workflow-activity-feed.test.mjs`

Branch 2 files are reference material only. Prefer a clean implementation that
fits this branch's Phase 2 activity records and Phase 3 visual resolver.

### Phase 3.5 Verification

Start narrow for Phase 3.5A:

- projection tests for chip labels, ordering, per-node limits, suppression of
  unanchored activity, and collapse;
- Pixi tests proving chip views/text objects are retained, updated, removed,
  and bounded;
- Pixi tests proving text chips switch to compact activity representation below
  the readable-text zoom threshold without hiding workflow nodes, workflow
  edges, or workflow node labels;
- visual-state tests proving chip styling uses the same resolver path as the
  debug snapshot;
- debug-snapshot tests for chip counts, text object counts, labels, status, and
  anchor state.

Then Phase 3.5A production path:

- deterministic Electron `workflow-activity-feed` workflow;
- capture screenshots for idle, running, waiting approval, completed, failed,
  and cancelled states;
- assert visible chip labels for command, file-change, approval, and
  workflow-status activity;
- assert no unanchored/recent-lane floating chips render in the default workflow
  graph;
- assert overflow collapse with a deterministic crowded node case, using the
  default cap of 4 visible chips per node plus `+N`;
- assert low-zoom activity LOD uses compact activity representation without
  hiding workflow nodes, workflow edges, or workflow node labels;
- pan while activity arrives;
- assert camera movement continues;
- assert renderer identity and layer/canvas counters remain stable;
- assert chip graphics/text counts equal expected visible chip counts;
- assert graph replacement, backend-read-during-camera, revision-gap, edge
  redraw, and edge-label rematerialization counters stay within Phase 3 limits.

Start narrow for Phase 3.5B:

- focused component/helper tests proving workflow node details can render
  node-scoped chat run activity through the shared chat run-activity component
  or narrowly extracted equivalent;
- focused tests proving a targeted run item, approval, or workflow event can be
  highlighted from a typed activity detail ref;
- focused Pixi/debug tests for chip hit targets and activity detail refs when
  click behavior is included.

Then Phase 3.5B production path:

- deterministic Electron `workflow-activity-feed` workflow;
- click a command or file-change chip and assert the existing workflow node
  details Niri pane opens for the owning node and highlights the matching run
  activity item;
- click an approval or workflow-status chip and assert the existing node details
  pane focuses the matching approval or workflow event detail when the typed
  reference is available;
- assert the chip details path does not create a separate chip-only details
  surface or embed a full chat transcript in workflow node details.

Record visual/performance evidence as an append-only report under
`docs/reports/performance/`.

### Phase 3.5 Definition Of Done

Phase 3.5A is done when:

- activity at readable zoom is represented by readable chips, while low zoom
  and overflow keep compact glyph/count representation;
- the user can identify command, file-change, approval, workflow status, and
  failure/cancellation states without hover or click;
- chip labels are derived from typed activity records and bounded;
- per-node chip layout is stable and capped, defaulting to 4 visible chips plus
  `+N`;
- chip text LOD is limited to activity readability/density and does not hide
  core graph structure;
- overflow collapses into a readable count;
- unanchored activity is fixed at the projection/filtering source or suppressed
  from the workflow graph with debug accounting;
- chip styling remains tied to the Phase 3 visual resolver;
- deterministic Electron evidence proves chips remain responsive during
  pan/zoom and activity deltas;
- no new backend contracts, inferred activity kinds, semantic-memory UI,
  decorative motion, or broad renderer refactor landed.

Phase 3.5B is done when:

- chip clicks route into the existing workflow node details pane instead of a
  separate activity-details surface;
- chip clicks highlight the matching run item, approval, or workflow event when
  the typed detail ref supports it;
- workflow node details render node-scoped agent/tool activity through the
  shared chat run-activity component or a narrowly extracted equivalent, not a
  bespoke lower-fidelity workflow-only run-item renderer;
- workflow node details do not embed a full chat transcript or fabricate chat
  turns from activity data;
- deterministic Electron evidence proves chip click-through works through the
  production workflow graph and Niri details paths.

### Phase 3.5A Handoff Prompt

Use this for an implementation agent:

```text
Implement Phase 3.5A in docs/plans/branch2_phase3_visual_grammar_plan.md.

Add readable, bounded activity chips to the workflow graph at readable zoom.
Keep the compact Phase 3 glyph/count representation for low zoom and over-cap
states. Use branch 2's trajectory sprite badges as design evidence, but do not
port the full trajectory runtime or animation stack.

Keep the work grounded in the current Phase 2/3 system:
- use existing WorkspaceActivityMarker records and labels;
- keep chip layout bounded per node with a default cap of 4 visible chips plus
  collapse;
- use activity-chip LOD only for text readability/density; do not hide workflow
  nodes, workflow edges, or workflow node labels during normal pan/zoom;
- investigate unanchored activity before chip layout work, and do not render a
  floating recent-lane/far-left activity surface by default;
- make command, file-change, approval, workflow-status, failed, and cancelled
  activity readable without hover or click;
- preserve retained Pixi object behavior and all graph/pan invariants;
- keep the visual state single-sourced through the Phase 3 resolver path.

Details/tooltip/click behavior is secondary and must not be required to
understand the canvas. Do not create a separate chip-only details system, embed
the full chat transcript in workflow details, fabricate chat turns from
activity data, add backend contracts, inferred marker kinds, semantic-memory
UI, neon/glow effects, graph-wide disappearing-label LOD, polling,
compatibility paths, or broad renderer refactors.

Run focused renderer/projection tests, the deterministic workflow-activity-feed
Electron workflow, ./scripts/format.sh, and ./check_quality.sh --all before
committing executable changes.
```

### Phase 3.5B Handoff Prompt

Use this for an implementation agent after Phase 3.5A is committed and green:

```text
Implement Phase 3.5B in docs/plans/branch2_phase3_visual_grammar_plan.md.

Connect readable activity chips to the existing workflow node details Niri pane.
Do not change the Phase 3.5A chip LOD or canvas layout except where hit targets
or typed detail refs are required for click-through.

Keep the work narrow:
- chip clicks open or focus the existing workflow node details pane for the
  owning node;
- highlight the clicked run item, approval, or workflow event when the typed
  detail ref supports it;
- reuse the existing chat run-activity rendering path for agent/tool activity in
  workflow node details, or extract the smallest shared component needed to do
  that without building a generic activity abstraction.

Do not create a separate chip-only details system, embed the full chat
transcript in workflow details, fabricate chat turns from activity data, add
backend contracts, add inferred marker kinds, or port the full branch 2
trajectory runtime details stack.

Run focused component/renderer tests, the deterministic workflow-activity-feed
Electron workflow, ./scripts/format.sh, and ./check_quality.sh --all before
committing executable changes.
```

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
