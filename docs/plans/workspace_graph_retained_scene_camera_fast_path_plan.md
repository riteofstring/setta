# Workspace Graph Retained Scene Camera Fast Path Plan

- **Date:** June 20, 2026
- **Status:** Active plan.
- **Replaces:** `workspace_graph_interaction_refactor_readiness_plan.md`.
- **Scope:** Rebuild the workspace graph interaction and rendering contract
  around a retained Pixi scene, a camera-only pan/zoom path, useful diagnostic
  evidence, clickable activity sprites, and shared agent activity UI.

## Implementation Status

- Phase 5 was implemented by `0d63c5ae1`:
  concrete run-item activity sprites now expose retained Pixi hit targets,
  record hover/click/details-link interactions, open an inline React popover
  anchored near the sprite, render the clicked item through
  `AgentRunActivityRows`, dismiss on click-away/escape, and link into the
  owning workflow node details with the run item focused.
- Focused verification for Phase 5 passed with
  `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/pixi-renderer-input-handlers.test.js src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts`.
- Production-path verification for Phase 5 passed with
  `node desktop/tests/electron/run-workflows.mjs --workflow workspace-trajectory-file-fidelity --skip-build`
  after `pnpm -C desktop build`.
- Phase 6 is complete across `2a0ad20fe` and `0d63c5ae1`:
  `AgentRunActivityRows` now owns shared run-item/activity presentation,
  `ChatTranscript` renders chat run activity through it, workflow node details
  render `RunActivityPage` through it, the sprite popover renders the clicked
  item through it, and the bespoke `WorkflowRunActivityItem` representation was
  removed.
- Focused verification for that implementation passed with
  `pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts src/renderer/src/components/chat-panel.test.tsx`.
- Phase 7 is complete in this change:
  graph recording schema v2 now carries compact visibility reason summaries
  for labels, nodes, edges, and sprites; node summaries include label
  visibility reasons; node-drag interactions carry moved node ids, owners,
  old positions, and new positions; selection changes are recorded as graph
  interactions; and the Electron recording tooling now includes a compact
  incident-report parser for pan/zoom, node drag, sprite click, selection, and
  graph replacement.
- The Phase 7 parser writes human-readable incident reports from pan/zoom and
  sprite-click workflows and fails when required evidence is missing.
- Focused Phase 7 verification passed with
  `node --test desktop/tests/electron/workflow-graph-recording-incident-report.test.mjs`,
  `pnpm -C desktop exec tsc --noEmit --pretty false`, and
  `pnpm -C desktop exec vitest run src/main/session-recorder.test.ts src/renderer/src/features/workspace-graph/pixi-renderer-input-handlers.test.js src/renderer/src/features/workspace-graph/pixi-renderer-camera-sync.test.js`.
- Phase 8 broad verification is the next implementable phase.

## Position

The workspace graph should not need to hide labels, hide edges, degrade visible
content, or pause meaningful graph affordances just because the user is panning
or zooming. If pan/zoom over ordinary workflow, semantic, label, edge, and
activity content is not snappy, the architecture is wrong.

The target is a retained scene where pan/zoom updates only camera transform and
camera state. Graph geometry, labels, base edges, semantic nodes, workflow
nodes, and activity sprites remain stable Pixi objects that naturally move with
the viewport. Expensive geometry creation, layout composition, label shaping,
edge path generation, sprite grouping, semantic projection, React commits, and
backend refresh reconciliation are data/update work, not camera-input work.

This is a principled refactor plan. It is not a plan to add more visual hacks,
motion-time LOD, or counter-only gates.

## Non-Negotiable UX Contract

- Pan and zoom must feel immediate on a MacBook trackpad.
- Node labels must not disappear because the camera is moving.
- Base workflow and semantic connections must not disappear because the camera
  is moving.
- LOD may exist only as a product rule based on zoom, density, readability, or
  explicit overview mode. LOD must not be triggered merely by pan/zoom motion.
- Motion-time visual degradation is not an acceptable performance strategy.
- Workflow node drag must not move semantic nodes unless the product explicitly
  exposes a grouped cross-owner move with a named owner.
- Semantic node placement must not shift as an incidental consequence of moving
  workflow nodes.
- Activity sprites must be interactive when they look interactive. Clicking a
  sprite opens an inline floating popover focused on that activity item, with a
  link to open the owning workflow node's full details.
- Workflow node details for agent work must reuse the same agent/chat activity
  presentation primitives used by chat, rather than maintaining a separate
  lower-quality representation.
- Reuse is by extracting shared leaf components (assistant message, run item,
  tool call, output, approval) and composing them in both the sprite popover and
  the node details panel. The full chat transcript component is not embedded, and
  `TranscriptTurn`/`ChatMessage` structure is not fabricated from run items (see
  the Activity And Details UI decision record for why).

## No Hacks Policy

Do not introduce any of these as product fixes:

- hide labels while panning or zooming;
- hide base edges while panning or zooming;
- freeze visible content as the user-facing answer to ordinary graph scale;
- add report-only performance findings and call the phase done;
- add counters that pass while the graph feels bad;
- add heuristic fallbacks for interaction ownership or layout ownership;
- add polling to paper over missed renderer state transitions;
- add compatibility shims or dual behavior paths for old graph behavior;
- start broad cleanup before the camera/input contract is fixed.

Short-lived experiments are allowed only when they produce diagnostic evidence
and are removed or converted into principled architecture before the phase is
marked complete.

## Current Failure Diagnosis

The problem is not that Pixi cannot render this graph. The problem is that the
current graph treats camera movement as a reason to run or schedule unrelated
work.

Known issues to fix:

- The interaction scheduler is currently telemetry around immediate callback
  execution, not a scheduler that protects input.
- The frame loop still runs semantic visual and trajectory visual lanes while
  the camera is moving.
- Some decorative visuals are `Graphics.clear()` and redraw loops instead of
  retained geometry, cached textures, or GPU-friendly time uniforms.
- Trajectory sprite positions and motion are updated on every runtime tick even
  when they could live in the same transformed world coordinate space.
- Camera motion currently hides labels and restores fidelity later, producing
  obvious flashing and a lower-quality graph during the exact gesture where the
  user needs spatial continuity.
- Recording artifacts contain graph events, but they still require too much
  manual spelunking to answer why input was late, why something flashed, or why
  a node moved.
- Performance gates can pass with report-only findings that still describe
  unacceptable UX.

## Target Architecture

### Camera-Only Fast Path

During active pan/zoom, the allowed work is:

- read input;
- update viewport transform/camera state;
- apply bounded transform-tier updates required for zoom readability;
- render the retained scene.

The disallowed work is:

- React commits caused by camera movement;
- graph projection refresh or replacement caused by camera movement;
- label visibility or label content recomputation caused by camera movement;
- edge path rebuilds caused only by camera movement;
- sprite grouping or content recomputation caused only by camera movement;
- semantic working-set reads caused by camera movement;
- workflow or semantic layout persistence caused by camera movement;
- full Pixi scene rebuilds caused by camera movement.

The first event in a gesture is part of this contract. A graph that eventually
reaches good frame cadence but starts 80ms late still fails.

### Instrumentation Hot-Path Contract

Diagnostics must not become the work that makes input late.

During a wheel, pinch, pointer-pan, or drag event handler, diagnostics may only:

- append a small fixed-shape sample to a preallocated or bounded ring buffer;
- read already-available timestamps and scalar fields;
- increment counters.

Diagnostics must not:

- allocate large nested objects;
- serialize snapshots;
- emit recording events;
- schedule or clear timers per event when a gesture-level mechanism can do it;
- read full camera state multiple times per event;
- walk nodes, edges, labels, sprites, or Pixi display trees;
- call `performance.mark` or `performance.measure` per input event unless the
  measurement overhead has been proven below budget on the reference machine.

Gesture incident reports are produced after the gesture settles or from an
off-hot-path observer. Long tasks should come from `PerformanceObserver` or CDP
trace data, not synchronous input-handler work.

### Transform Tier For Zoom

Pure transform is the default, but zoom has a small legitimate transform tier.

Some retained objects should stay a constant or bounded on-screen size while
the world zoom changes, such as labels, ports, and activity sprites. Updating
their container scale or transform-derived uniforms is allowed during zoom when
the update is:

- bounded to retained visible objects;
- a direct numeric transform update;
- free of text shaping, label content recomputation, edge path rebuilds, sprite
  regrouping, graph materialization, or display-tree structure changes;
- measured separately from dirty geometry work.

This transform tier exists to preserve readability. It must not become a back
door for camera-triggered rebuilds.

### Retained Scene Objects

The graph renderer should retain and update objects by identity:

- workflow node containers;
- semantic node containers;
- port hit targets;
- base workflow edges;
- base semantic edges;
- edge highlights;
- labels;
- activity sprites;
- glow/aura/effect layers;
- temporary interaction overlays.

Camera movement should not recreate or structurally resync those objects. It
should transform the parent viewport or the appropriate layer transform.

### Retention And Virtualization Policy

Retained scene and camera-driven virtualization are in tension. The renderer
must choose explicit policies rather than mixing them accidentally.

Initial policy:

- normal workflow/semantic graphs retain all graph objects needed for immediate
  pan/zoom continuity;
- dense synthetic or genuinely large graphs may use virtualization only as a
  bounded exception;
- virtualization must use hysteresis, padding, and throttled/off-hot-path
  updates;
- virtualization must never add/remove Pixi objects synchronously in the wheel
  or pointer handler;
- virtualization must not cause visible objects at the viewport edge to flash
  during ordinary camera movement;
- recordings must identify when virtualization ran, how many objects changed
  materialization state, and whether that happened during a gesture.

If a graph is small enough to retain, retaining it is preferred over culling
complexity.

### Dirty Geometry Rebuilds

Geometry rebuilds should be driven by explicit dirty reasons:

- graph structure changed;
- node layout changed;
- edge endpoints changed;
- label text/style changed;
- sprite content changed;
- zoom crossed an explicit product LOD threshold;
- renderer size/device-pixel-ratio changed;
- font or texture asset loaded.

Dirty work should be coalesced and measured. A camera delta without a dirty
reason must not rebuild graph content.

Semantic runtime activity is a dirty input only for affected activity state. A
semantic runtime tick must not re-materialize or structurally replace
unaffected workflow nodes, semantic nodes, labels, base edges, or sprites.

### Animation Model

Animations should not require broad CPU redraw loops.

Preferred approaches:

- retained sprite/mesh state with cheap property updates;
- shader or uniform-driven time effects;
- cached textures for static glow/aura layers;
- dirty-only redraws for static geometry;
- batched sprite updates for activity indicators;
- explicit animation budgets with hard failures when exceeded.

If an effect cannot meet the budget without degrading pan/zoom, redesign the
effect. Do not hide graph content as a substitute for architecture.

### Layout Ownership

Every node position must have an explicit owner:

- draft workflow definition layout;
- non-editing workflow view layout;
- semantic layout;
- synthetic layout for synthetic/performance scenarios only;
- no owner, which means non-movable.

Drag admission must happen before local mutation. Group drag must be constrained
by compatible owners. A workflow drag cannot accidentally include semantic
nodes through selection state. Semantic fallback placement must not depend on
mutable workflow node positions in a way that makes semantic nodes appear to
move when workflow nodes move.

### Activity And Details UI

Activity sprites should be clickable retained objects with clear hit targets.
Clicking an activity sprite opens an inline floating popover anchored near the
sprite, focused on that one activity item, dismissable on click-away, with a
link to open the owning workflow node's full details. The popover is not a third
bespoke surface: it renders the clicked item through the same shared leaf
component the node details panel uses.

Agent work in workflow details should be rendered through shared chat/agent
activity components. The workflow details pane may omit user-composer behavior,
but it should not reimplement assistant messages, run items, tool calls,
approvals, output pagination, or transcript-like activity rows with a separate
visual language.

#### Decision Record: Extract Shared Leaf Components, Do Not Embed The Transcript

This decision is verified against the data model and is intentional. Do not
revise it back toward a full chat transcript embed without re-verifying the
types below.

- Chat renders the agent as a `TranscriptTurn` (`triggerMessage` +
  `assistantMessage` + `run` + `steeringMessages`), where the assistant text is
  a `ChatMessage` with `parts: MessagePart[]`. Chat is conversation-keyed.
- A workflow node's agent work loads as `RunActivityPage`
  (`{ runId, items: RunItem[], output: RunItemOutput[] }`), reached through
  `WorkflowActivityRef` keyed by `executionId`/`nodeExecutionId`/`attempt`/
  `iteration`. It is a flat run-item list with no trigger message, no assistant
  `ChatMessage`, and no turn structure. It is workflow-execution-keyed.
- The two share a `Run` + `RunItem` core. They do not share conversation/turn
  structure, and the agent's text is a `ChatMessage` in chat but a `RunItem` in
  the workflow path.

Therefore:

- Extract the leaf presentation components (assistant message body / markdown,
  run item, tool call, output pagination, approval, status) so chat and workflow
  details render the same shapes from the same code.
- Compose those leaf components directly in the node details panel and in the
  sprite popover.
- Do not embed the `ChatTranscript` (virtualized turn list) in workflow details.
- Do not synthesize `TranscriptTurn` or `ChatMessage` objects from `RunItem`s to
  satisfy a transcript embed; that fabricates conversation structure the
  workflow execution path does not have.
- If the backend later unifies workflow node runs onto genuine conversation
  turns (real trigger/assistant `ChatMessage`s), revisit the embed then, not by
  adapter-faking it in the renderer now.

## Diagnostic Contract

Recordings must answer these questions without rerunning the app:

- Was input delivered late? If so, which main-thread work preceded it?
- Did camera input trigger React commits, scene rebuilds, label hiding, edge
  hiding, graph replacement, semantic reads, or sprite regrouping?
- Did visible label, edge, node, or sprite counts drop while the camera was
  moving? If yes, why?
- Which dirty reasons ran during the gesture?
- Which renderer lanes ran during the gesture, and did they mutate geometry,
  content, or only transform/uniform state?
- Which node ids changed position during drag? Which owners accepted those
  moves?
- Did any non-dragged node move? Was it workflow, semantic, or synthetic?
- Which activity sprite was clicked, and what details target opened?

Each pan/zoom gesture should produce a compact gesture incident report:

- input timestamps and delivery delay;
- first-event start latency attribution;
- first camera-transform timestamp;
- first renderer-frame timestamp;
- true presented-frame timestamp when compositor trace evidence is available;
- main-thread long tasks overlapping the gesture;
- camera deltas;
- visible object count deltas;
- dirty-work reasons;
- scene rebuild counts;
- label/edge/sprite visibility drops;
- React commit count;
- renderer lane work with durations;
- final pass/fail verdict against the camera fast-path contract.

Until compositor presentation tracing is wired, CI must not pretend it has a
true "pixels reached the screen" timestamp. Renderer-frame timing is useful
proxy evidence only. The hard CI teeth are deterministic invariants: no
camera-caused React commits, no graph content rebuilds, no label/edge drops, no
semantic reads, no layout writes, no graph replacements, and no hot-path
diagnostic work.

The report must distinguish:

- event delivery delay before the handler runs;
- input-handler time;
- camera-transform time;
- transform-tier update time;
- dirty geometry time;
- render/presentation time;
- unrelated main-thread work that delayed the first response.

Raw snapshots may still exist, but the compact report is the primary debugging
artifact.

## Phase 0: Baseline And Evidence Reset

Goal: stop calling known-bad UX a pass, and land the small independent fix for
cross-owner drag immediately.

Tasks:

- Add a baseline report from current `HEAD` that captures pan/zoom delay,
  visible label drops, edge visibility drops, scene rebuilds, renderer lane
  work, and long tasks.
- Attribute start-of-gesture latency before changing the renderer architecture:
  event delivery delay, input-handler work, instrumentation overhead, Pixi
  viewport/plugin work, first camera transform, first render, and overlapping
  main-thread tasks must be separated.
- Measure diagnostic overhead with recording/debug enabled and disabled. The
  initial hard budget is: recording/debug-on first-camera-transform p95 may add
  at most 2ms over recording/debug-off for the same scripted workload on the
  same machine. If the baseline already exceeds that budget, Phase 0 must mark
  it red and attribute the overhead before proceeding.
- Convert current report-only findings that describe unacceptable pan/zoom UX
  into hard failures for the relevant workflow.
- Add assertions that camera motion does not hide labels or base edges.
- Add assertions that camera motion does not trigger React commits or full graph
  replacements.
- Add assertions that camera motion does not trigger semantic working-set reads
  or trajectory regrouping.
- Record current failures as expected red tests before implementation.
- Fix the small cross-owner drag bug immediately: dragging a workflow node must
  not drag a selected semantic node.
- Add the deterministic cross-owner drag regression for that fix.

Acceptance criteria:

- The current UX regressions are visible in one compact report.
- Start-of-gesture delay is attributed to a named category rather than inferred.
- Recording/debug overhead is measured and bounded by the 2ms p95 same-machine
  budget, or explicitly red with attribution.
- The test suite fails when labels or base edges disappear during pan/zoom.
- The test suite fails when pan/zoom is accepted with only report-only timing
  regressions.
- The test suite fails if workflow drag can move semantic nodes through mixed
  selection.
- Workflow drag no longer moves semantic nodes through mixed selection before
  Phase 1 starts.

## Phase 1: Camera Fast-Path Invariant

Goal: make pan/zoom a transform-only renderer path.

Tasks:

- Define a camera fast-path invariant in renderer code and tests.
- Define the zoom transform tier and its budget separately from dirty geometry.
- Remove camera-motion label hiding.
- Remove camera-motion base-edge hiding.
- Ensure `onCameraStateChange` does not cause React state churn for ordinary
  camera motion.
- Ensure graph scene-store updates are not scheduled by camera movement.
- Ensure camera input cannot trigger layout persistence.
- Ensure camera input cannot trigger graph projection refresh.
- Add a per-frame camera work audit that records all work categories during a
  gesture.
- Ensure diagnostics use the hot-path ring-buffer contract and flush incident
  reports after gesture settlement.

Acceptance criteria:

- Pan/zoom updates viewport transform and camera state without rebuilding graph
  content.
- Node labels and base edges remain visible while moving the camera.
- Camera motion produces no React commits, graph replacements, semantic reads,
  or layout writes.
- Zoom transform-tier work is bounded, measured, and does not rebuild labels,
  edges, sprites, or graph content.
- Diagnostic capture stays within the Phase 0 2ms p95 same-machine overhead
  budget.

## Phase 2: Retained Geometry Dirty Pipeline

Goal: separate data-driven geometry updates from camera-driven rendering.

Tasks:

- Introduce explicit dirty reasons for nodes, labels, base edges, highlights,
  activity sprites, glow/effects, ports, and temporary overlays.
- Decide and implement the retention/virtualization fork:
  normal graphs retain objects; dense graphs may virtualize only through the
  explicit bounded exception.
- Replace broad per-camera sync calls with dirty-reason dispatch.
- Cache edge paths until endpoint geometry or edge style changes.
- Cache label content/layout until text, font, style, or explicit zoom LOD
  threshold changes.
- Keep labels in a coordinate space where camera transforms carry them without
  per-frame recomputation.
- Keep activity sprites in a coordinate space where camera transforms carry
  anchored sprites without per-frame position recomputation.
- Ensure semantic runtime activity ticks update only affected activity state and
  never re-materialize unaffected nodes, labels, base edges, or sprites.
- Add focused tests for each dirty reason.

Acceptance criteria:

- Camera movement alone produces no dirty geometry rebuilds.
- Data/layout changes rebuild only the affected retained objects.
- Tests fail if a camera delta is used as a dirty reason for graph content.
- Tests fail if semantic runtime ticks structurally replace unaffected graph
  objects.
- Tests fail if virtualization materialization churn occurs synchronously during
  wheel/pointer input.

## Phase 3: Animation Architecture

Goal: make decorative/liveness effects compatible with continuous camera input
without degrading graph readability.

Tasks:

- Inventory every animated/effect layer and classify its state as geometry,
  retained object property, texture, shader/uniform, or data-driven content.
- Replace per-frame `Graphics.clear()` redraw loops for glow and edge flow with
  retained geometry, cached textures, or GPU-friendly time-driven effects.
- Make activity sprite progress/fade updates batched and bounded.
- Ensure animation work never changes base node, label, edge, or sprite
  visibility because the camera is moving.
- Add hard budgets for animation CPU time during camera gestures.

Acceptance criteria:

- Decorative animation can run during camera movement without causing input
  delay, label drops, edge drops, or scene rebuilds.
- If an animation exceeds its budget, the test reports the specific layer and
  work type.

## Phase 4: Layout Ownership And Cross-Owner Drag

Goal: broaden layout ownership and grouped movement after the Phase 0
cross-owner bug fix.

Tasks:

- Preserve the Phase 0 behavior that workflow drags cannot include semantic
  nodes through mixed selection.
- Restrict all remaining group drag cases to nodes with compatible movement
  owners.
- If selected nodes have mixed owners, drag only the primary node or require an
  explicit grouped move product affordance.
- Keep the Phase 0 deterministic coverage that dragging a workflow node cannot
  move a semantic node through selection state, then broaden it for persisted
  workflow, view-layout, semantic, and synthetic owners.
- Stabilize semantic fallback placement so it does not shift when workflow node
  positions change.
- Require recordings to list all nodes whose world positions changed during a
  drag and their movement owners.

Acceptance criteria:

- Workflow drag moves only intended workflow nodes.
- Semantic nodes move only through semantic layout ownership.
- Unpinned semantic fallback positions are stable across workflow node moves
  unless semantic graph data/layout changes.

## Phase 5: Activity Sprite Interactions

Goal: make activity sprites useful rather than passive decoration.

Tasks:

- Give activity sprites explicit hit targets and interaction state.
- Map each sprite to its underlying activity item (its `runItemId`) and owning
  workflow node.
- On click, open an inline floating popover anchored near the sprite, focused on
  that one activity item, dismissable on click-away or escape.
- Render the popover body with the shared leaf activity component from Phase 6,
  not a sprite-specific bespoke layout.
- Include a "open full node details" link in the popover that opens the owning
  workflow node details with that item in view.
- Keep sprite rendering retained and camera-fast-path compatible; the popover is
  a screen-space overlay and must not run graph content work during pan/zoom.
- Add E2E coverage for clicking a sprite, rendering the popover, following the
  link to full details, and dismissing on click-away.
- Add recording events for sprite hover/click, the popover item id, and the
  details link target.

Acceptance criteria:

- Clicking a sprite opens an inline popover focused on the clicked activity item.
- The popover renders through the shared leaf component, not a third bespoke
  surface.
- The popover links to the owning workflow node's full details.
- Sprite interaction and the popover do not compromise pan/zoom performance.
- Recordings identify the clicked sprite, the popover item, and the link target.

## Phase 6: Shared Agent Activity UI

Goal: stop duplicating inferior agent-work UI in workflow node details. Follow
the Activity And Details UI decision record: extract shared leaf components and
compose them; do not embed the full chat transcript and do not fabricate
`TranscriptTurn`/`ChatMessage` from run items.

Tasks:

- Extract reusable leaf presentation components from the chat surface: assistant
  message body/markdown (`MessagePart[]` rendering), run item, tool call, output
  pagination, approval, and status. Keep them independent of the
  `TranscriptTurn` virtualized container.
- Keep chat-specific controls, composer, user-message affordances, and the
  `ChatTranscript` virtualized turn list outside the shared leaf components.
- Render workflow node `RunActivityPage` (`items: RunItem[]`, `output:
  RunItemOutput[]`) by composing the shared leaf components directly, with no
  synthesized conversation turns.
- Render the same shared leaf component inside the Phase 5 sprite popover for a
  single activity item.
- Delete the bespoke `WorkflowRunActivityItem` representation once the shared
  components render workflow run activity.
- Reuse approval, tool call, output pagination, status, and message text
  presentation where the data contracts are the same.
- Add tests proving workflow details, the sprite popover, and chat render the
  same agent activity shapes from the same components.

Acceptance criteria:

- Workflow node details and the sprite popover render agent messages/run
  items/tool calls through the shared leaf components, not a bespoke
  representation.
- The bespoke `WorkflowRunActivityItem` is removed.
- The `ChatTranscript` virtualized turn list is not embedded in workflow details,
  and no `TranscriptTurn`/`ChatMessage` is synthesized from run items.
- Agent work looks and behaves consistently between chat and workflow details.

## Phase 7: Recording And Debugging Tools

Goal: make recordings diagnose user-visible graph bugs directly.

Tasks:

- Add compact gesture incident reports for pan/zoom, node drag, sprite click,
  selection, and graph replacement.
- Include causal work summaries rather than only raw snapshots.
- Include explicit visibility-drop reasons for labels, edges, nodes, and
  sprites.
- Include all moved node ids, owners, old positions, new positions, and save
  outcomes.
- Include main-thread long tasks and user timing entries overlapping gestures.
- Add a parser that summarizes recordings into a human-readable failure report.

Acceptance criteria:

- A recording can explain delayed pan/zoom, flashing, unintended node movement,
  and sprite-click behavior without manual JSON spelunking.
- The parser fails when required evidence is missing.

## Phase 8: Broad Verification

Goal: prove the retained scene architecture through production paths.

Required checks:

- focused renderer tests for dirty reasons and camera invariants;
- deterministic Electron workflows through production main/preload/renderer
  paths;
- pan/zoom performance recordings on normal and dense graphs;
- recording/debug on/off comparisons proving diagnostics are not the source of
  input latency;
- explicit notes separating deterministic CI invariant gates from
  machine-dependent millisecond timing reports;
- node drag ownership workflows;
- activity sprite click workflows;
- workflow details agent activity workflows;
- live Codex E2E workflows when ChatGPT auth is available.

Acceptance criteria:

- Pan/zoom remains readable and responsive.
- Labels and base edges remain visible during camera movement.
- Camera input does not trigger graph content rebuilds.
- Activity sprites are inspectable.
- Workflow details reuse shared agent activity UI.
- Recordings produce compact causal reports for each tested gesture.
- CI proves deterministic fast-path invariants. Millisecond snappiness and
  physical MacBook trackpad feel are verified on the target Mac, not inferred
  from CI alone.

## Final Definition Of Done

The plan is complete only when:

- the normal graph feels snappy on a MacBook trackpad;
- no visible graph content flashes or disappears solely due to camera movement;
- pan/zoom has a verified camera-only fast path;
- retained scene dirty work is explicit and bounded;
- cross-owner drag bugs are impossible by contract;
- activity sprites are clickable and diagnosable;
- workflow agent details use shared chat/agent activity UI;
- recordings explain failures in compact causal terms;
- broad quality gates pass after focused verification.
