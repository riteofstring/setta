# Semantic Runtime and Graph Interaction Refactor Plan

- **Date:** June 16, 2026
- **Status:** Phase 7 complete; plan implemented with calibrated report-only performance follow-up remaining
- **Scope:** Fix baseline pan/zoom latency even before a workflow starts, replace the current event-to-full-read semantic working-set path with a bounded runtime projection, restore workflow-first visual hierarchy, and make pan/zoom interaction predictably responsive while semantic cartography is active.
- **Related docs:**
  - `docs/plans/workspace_graph_performance_semantic_liveness_plan.md`
  - `docs/plans/semantic_cartographer_usefulness_plan.md`
  - `docs/plans/semantic_cartographer_settings_audit_plan.md`
  - `docs/plans/living_workspace_neon_redesign_plan.md`

## Position

The latest live recording changes the diagnosis, but it does not fully explain
the pan/zoom problem.

The user observed delayed/sluggish pan and zoom before starting the workflow on
a simple three-node graph. That means the baseline camera/input path has an
independent responsiveness problem. The workflow-time semantic storm is still
real and important, but it should be treated as an amplifier and a second
failure mode, not as the sole root cause.

There are therefore two long-term problems to solve together:

- Baseline camera interaction feels delayed even when the graph is small and
  idle.
- While a workflow is running, semantic liveness is implemented as frequent
  renderer-initiated full working-set reads in response to backend semantic
  change events. That creates a high-churn IPC/HTTP path, repeatedly rebuilds
  renderer semantic state, and competes with camera input.

At the same time, the visual language makes semantic activity more prominent
than workflow state, even when the semantic activity is only transient
cartographer machinery.

The long-term fix should not be another animation tuning pass. Setta needs a
first-class semantic runtime layer:

- Workflow and cartographer runtime facts should become a backend-owned,
  revisioned, compact projection.
- The renderer should receive bounded deltas and maintain a local scene store.
- Camera input should remain an immediate, high-priority path that does not
  wait for semantic reads, React state updates, label sync, or particle churn.
- Semantic visuals should explain useful work state, not display every internal
  runtime object as an equally important graph object.

## Recording Evidence

The active recording at `.recordings/20260617T041546Z` is sufficient to diagnose
the semantic runtime churn and visual hierarchy class of problem.

Measured from the recording:

- `ipc.jsonl` grew to about `193 MB` in roughly five minutes.
- The app made `2,968` `semantic-graph:working-set-read` IPC calls.
- Those calls were mirrored by `2,968` backend
  `POST /semantic-graph/working-set/read` requests.
- Working-set read latency was `p50 68 ms`, `p95 127 ms`, and `max 228 ms`.
- Almost all IPC bytes came from `semantic-graph:working-set-read` responses.
- The semantic event stream forwarded `3,519` semantic graph events.
- `3,517` of those events were only `cartographer_audit,working_set`.
- Semantic event bursts reached more than `100` events in a single second.
- The renderer recorded repeated DOM mutation snapshots while the workflow was
  running.
- The cartographer processing state showed many superseded/no-op/rejected
  windows while the UI rendered many live visual objects.

The full IPC payload recording inflates the recording file size, but it does
not create the request storm. The repeated working-set reads are real app work.

This recording does not prove that semantic runtime churn caused the original
pre-workflow pan/zoom delay. Because sluggishness was also present before the
workflow started, Phase 0 must measure an idle three-node graph separately from
an active workflow graph. If idle pan/zoom is sluggish with no semantic runtime
traffic, the first fix must target camera event handling, camera smoothing,
settle timing, render scheduling, label/glow work, Electron input delivery, or
other baseline renderer work before cartographer liveness is involved.

The screenshots also expose a product issue:

- The active workflow node outline exists in some frames, but semantic edges,
  source beads, and preview visuals dominate the composition.
- Live-source pulse nodes are intentionally projected with `label: ""`, so the
  user sees animated objects with no visible meaning.
- Live-source anchors stack beside the workflow node using `fallbackIndex * 10`,
  so a small workflow can produce a tall unexplained bead strip.
- The committed semantic labels eventually become more understandable, but only
  after the workflow-first graph has already been visually overwhelmed.

## Root Cause

### Baseline Camera Responsiveness

Idle pan/zoom sluggishness on a tiny graph points to an interaction-path problem
that exists before semantic cartographer load:

- Trackpad wheel/pinch normalization may introduce delayed starts or long
  deceleration tails.
- Camera smoothing or settle logic may be creating intentional-feeling latency.
- Wheel handlers may be doing more work than camera math and scheduling.
- Label, glow, filter, hover, or layout sync may still run in response to camera
  movement even when the graph is small.
- React or DOM overlay updates may be sharing the same turn as canvas input.
- Electron development/recording overhead may amplify the problem, but should
  not be assumed to be the cause without a packaged or recording-disabled
  comparison.

The baseline path needs its own measurement and budget. The semantic runtime
refactor is necessary, but it is not sufficient if idle camera movement still
feels delayed.

### Runtime Architecture

`useSemanticGraphState` subscribes to semantic graph change events. For selected
workspace events, it turns these areas into refresh requests:

- `graph`
- `layout`
- `activity`
- `working_set`
- `cartographer_audit`

For `working_set` and `cartographer_audit`, the renderer calls
`readWorkingSet`. The current coalescing is a `queueMicrotask` merge. That only
coalesces events already in the same JavaScript turn. It does not impose a
frame-rate, interaction-rate, or payload budget. A running cartographer can
therefore drive many full working-set reads per second.

### Product Semantics

The current UI treats several different concepts as graph objects:

- Durable semantic memory.
- Proposed cartographer patch previews.
- Live cartographer sources.
- Recent pulse records.
- Workflow-to-semantic source references.

Those are not equivalent. Durable semantic memory should be inspectable graph
state. Proposed patches should be visible but provisional. Live cartographer
sources and pulses are process telemetry; they should usually aggregate into
workflow-node status, semantic-node status, or details-pane provenance instead
of appearing as independent mystery objects.

### Interaction Priority

Pan and zoom must be the highest-priority renderer path. Semantic runtime
updates can be important, but they are not allowed to block or dilute camera
feedback. Today, semantic updates can trigger backend reads, IPC serialization,
React state updates, projection updates, Pixi object churn, label sync, and
animation changes while the user is trying to move the camera.

## Principles

1. **Camera input is sacred.**
   Wheel, pinch, and pointer pan should update the camera immediately and do
   bounded work per animation frame. Semantic updates must yield to interaction.

2. **Live semantic state is runtime state, not durable graph state.**
   The backend should maintain a compact runtime projection for active workflow
   and cartographer state. Durable `SemanticGraph` remains committed memory.

3. **Push compact deltas; do not pull full snapshots per event.**
   After an initial snapshot, renderer semantic runtime updates should arrive as
   revisioned deltas over the existing event stream or a dedicated stream.

4. **Fast liveness cannot depend on model latency.**
   Workflow node state, run item activity, command/file/test events,
   cartographer queue state, and patch lifecycle state should appear from typed
   runtime facts before Codex finishes semantic interpretation.

5. **Model output creates claims, not animation.**
   Cartographer model results should create proposed or committed semantic
   memory. Basic "what is active now" UI should not wait for `gpt-5.5`, high
   reasoning, or any provider response.

6. **Visual hierarchy follows user intent.**
   Workflow execution state is primary. Semantic committed memory is secondary
   context. Cartographer runtime telemetry is tertiary unless selected,
   hovered, or directly relevant to the active workflow node.

7. **Aggregate process telemetry by default.**
   Many live source refs should become one small status cluster, badge, lane, or
   detail affordance. Individual beads should appear only when they carry
   inspectable meaning at the current zoom/selection state.

8. **Every live visual needs a readable meaning.**
   No unlabeled mystery particles in the default view. A visual can be compact,
   icon-based, or tooltip-driven, but the user must be able to tell what it
   represents through hover, selection, or a nearby status label.

9. **Budgeted data shapes are part of the contract.**
   Runtime snapshot/delta contracts should specify maximum list sizes, detail
   separation, TTL behavior, and revision semantics. Large audit records belong
   in details panes, not in the graph hot path.

10. **No polling, no heuristic fallbacks, no compatibility layers.**
    Use push streams and typed runtime state. Do not add polling, keyword
    heuristics, generated TypeScript mirrors, backward compatibility shims,
    legacy paths, migrations, dual-read/write behavior, old-field aliases, or
    transitional adapters. If a semantic store shape changes, fail loudly and
    require a fresh store reset.

## Target Architecture

### Backend Runtime Projection

Add a Go-owned semantic runtime projection that is separate from the durable
semantic graph:

```text
SemanticRuntimeSnapshot
  workspaceId
  revision
  generatedAt
  workflow
  cartographer
  patches
  semanticActivity
  displayHints

SemanticRuntimeDelta
  workspaceId
  fromRevision
  toRevision
  changedAreas
  workflowNodeUpdates
  runItemUpdates
  cartographerRunUpdates
  cartographerWindowUpdates
  patchPreviewUpdates
  semanticNodeActivityUpdates
  aggregateSourceUpdates
  removals
```

The exact type names can change during implementation, but the ownership should
not: Go owns the contract, HTTP endpoint registry owns the API surface, and
TypeScript is generated.

The projection should be maintained from typed events that already exist:

- Workflow run and node execution state.
- Chat run and run item state.
- Command/file/test/diff observations.
- Cartographer window queue, lease, running, no-op, failed, rejected, applied,
  and pending-review state.
- Cartographer patch preview state.
- Recent semantic event summaries.

The backend should publish compact deltas when this projection changes. The
renderer should not turn every `cartographer_audit` notification into a full
working-set read.

### Renderer Semantic Runtime Store

The renderer should maintain a local semantic runtime store:

- Bootstrap once with `SemanticRuntimeSnapshot`.
- Apply `SemanticRuntimeDelta` by revision.
- Drop stale deltas.
- If a gap is detected, perform one single-flight snapshot reload.
- Expose derived scene data to Pixi without replacing large React state on
  every runtime event.
- Keep durable graph reads, activity reads, and details-pane reads separate from
  the high-frequency runtime path.

`useSemanticGraphState` should no longer own all semantic liveness. It can still
own durable graph loading and low-frequency activity summaries, but runtime
liveness needs a purpose-built subscription/store.

### Interaction Scheduler

The graph renderer should have explicit priority lanes:

```text
Lane 1: camera input and transform
Lane 2: visible object position sync
Lane 3: hover/selection hit feedback
Lane 4: semantic runtime visual updates
Lane 5: settled fidelity restore
Lane 6: offscreen/detail/background recompute
```

During camera movement:

- Apply transform immediately.
- Keep labels/glow/semantic animation in movement-mode fidelity.
- Defer non-critical semantic runtime visual changes until the next available
  frame budget or camera settle.
- Never issue backend semantic reads from the camera path.
- Never rebuild semantic scene objects because a wheel event arrived.

### Visual Grammar

Default graph hierarchy:

1. Workflow nodes and workflow execution edges.
2. Active workflow node status.
3. Committed semantic nodes and semantic relationships.
4. Proposed patch previews.
5. Aggregated live cartographer/source activity.
6. Detailed pulses/beads only under hover, selection, details mode, or high
   zoom when they remain legible.

For a simple `Start -> Reviewer -> End` workflow:

- `Reviewer` should have an unmistakable active green outline while running.
- Active workflow edge motion should remain visible and not be hidden by
  semantic source edges.
- Cartographer/runtime activity should appear as a compact status near
  `Reviewer`, such as a small cluster or badge that communicates observing,
  extracting, proposing, or applying.
- Durable semantic findings should appear as labeled semantic cells connected
  to the reviewer or relevant workflow/source node.
- A pending patch preview can be visually distinct, but it should not look more
  important than the running workflow node.
- The user should not see a vertical pile of unlabeled beads in the default
  view.

## Phase 0 - Evidence Report And Hard Regression Budgets

Capture the current failure as an append-only report before changing code.

Add a report under `docs/reports/performance/` that summarizes
`.recordings/20260617T041546Z` and separates idle-camera evidence from active
workflow evidence:

- Pre-workflow idle pan/zoom observations and screenshots, when present.
- Working-set read count, rate, latency quantiles, and largest payloads.
- Semantic event counts by changed area.
- Backend HTTP counts by path.
- IPC bytes by channel.
- Renderer event counts.
- Cartographer queued/running/superseded/no-op/rejected/applied state from the
  recording snapshot.
- Screenshots showing the unlabeled live-source bead pile and the later
  committed semantic labels.

Then promote the current report-only findings into concrete guardrails:

- Hard fail if idle three-node pan/zoom exceeds camera latency budgets.
- Hard fail if a small running workflow performs repeated full working-set reads
  above a calibrated budget.
- Hard fail if semantic runtime IPC bytes per minute exceed a calibrated budget.
- Hard fail if camera interaction causes semantic working-set reads.
- Hard fail if wheel/pinch-to-camera-update latency exceeds the calibrated
  budget.
- Keep frame p95 report-only only if local variance is still not stable enough,
  but record it every time.

Recommended initial budgets for the simple three-node review workflow:

```text
idle wheel/pinch event to camera transform: p95 < 16 ms
idle wheel/pinch event to rendered frame: p95 < 32 ms
working-set full reads after bootstrap: 0 during normal event flow
snapshot reloads after stream gap: <= 1 per detected gap
semantic runtime IPC payload: < 1 MB/minute
wheel/pinch event to camera transform: p95 < 16 ms
wheel/pinch event to rendered frame: p95 < 32 ms
long tasks during camera movement: 0 over 100 ms
unlabeled live-source graph nodes in default view: 0
```

If the existing contracts make a `0` read budget impossible for the first
implementation step, the phase must document the temporary measured budget and
the phase that removes it. Do not add a compatibility path to preserve the old
behavior.

### Phase 0 Implementation Review

Phase 0 is implemented by commit `1cf772c9f` (`Implement semantic runtime phase
0 guardrails`).

Implemented:

- Added the append-only evidence report at
  `docs/reports/performance/semantic-runtime-graph-interaction-phase-0.md`.
- Summarized `.recordings/20260617T041546Z`, including active workflow
  working-set read count/rate/latency, IPC bytes, backend HTTP counts, semantic
  event bursts, renderer layout snapshots, cartographer runtime state, and
  screenshot evidence.
- Added hard camera guardrails to the deterministic pan/zoom recordings:
  small-trackpad wheel/pinch-to-camera p95 `< 16 ms`,
  wheel/pinch-to-rendered-frame p95 `< 32 ms`, no semantic working-set reads
  during the camera interaction window, and no long task over `100 ms` outside
  large/report-only scenarios.
- Added a focused semantic-live budget gate that records blank-scope
  working-set reads and working-set IPC bytes/minute for the current
  pre-runtime-projection path.
- Added a default-view guard against unlabeled live-source graph nodes.

Focused review verification passed for semantic graph projection Vitest
coverage and the Phase 0 Electron guardrail/helper ESLint set.

Important caveat:

- Phase 0 intentionally pulled one narrow Phase 4 visual guardrail forward by
  hiding untargeted live-source pulse graph nodes in the default renderer
  projection. That is acceptable as a guardrail against the recorded mystery
  bead failure, but it is not the full workflow-first visual grammar. Phase 4
  still needs aggregate runtime indicators, active workflow hierarchy, details
  affordances, and selected/hover/details expansion rules.

Phase 1 handoff:

- Phase 1 is ready to implement.
- It must replace the temporary `semantic-live-run` budgets with the real
  runtime projection path: `0` repeated full working-set reads after bootstrap
  during normal event flow, one single-flight snapshot reload per detected
  revision gap, and semantic runtime IPC restored toward the `< 1 MB/minute`
  target.
- It should stay scoped to backend-owned runtime contracts, revision semantics,
  the snapshot endpoint, runtime delta publication, generated TypeScript, and
  production-path deterministic coverage. Do not implement the renderer runtime
  store, interaction scheduler, or broader visual grammar in Phase 1.

## Phase 1 - Backend Semantic Runtime Projection

Create the backend-owned runtime projection and API contracts.

Implementation requirements:

- Add Go-owned snapshot and delta types.
- Add revision numbers and gap detection semantics.
- Add a compact initial read endpoint.
- Add delta payloads to the semantic event stream or introduce a dedicated
  semantic runtime stream.
- Bound every list in the snapshot and delta contracts.
- Split graph-hot-path data from details/audit data.
- Keep recent cartographer run lists out of the default graph runtime payload.
- Include aggregate counts and statuses for hidden or collapsed live sources.
- Preserve typed source refs so details panes can load precise provenance on
  demand.

The projection should be updated transactionally with cartographer/workflow
state changes where practical. If an event cannot carry the full delta, it must
carry a revision that lets the renderer perform one explicit snapshot reload.

Acceptance criteria:

- A running workflow produces runtime deltas without the renderer calling
  `readWorkingSet` per event.
- The initial snapshot is compact enough for the graph hot path.
- A stream reconnect with a revision gap performs one single-flight reload.
- Generated TypeScript is regenerated from Go-owned contracts.
- Deterministic Electron coverage exercises production
  Electron/main/preload/renderer/HTTP/store paths.

### Phase 1 Implementation Review

Phase 1 is implemented by commit `13fdd4a46` (`Implement semantic runtime
projection phase 1`).

Implemented:

- Added Go-owned `SemanticRuntimeSnapshot`, `SemanticRuntimeDelta`, runtime
  change-area, limits, workflow, cartographer, patch preview, semantic
  activity, aggregate-source, and removal contracts.
- Added the `/semantic-graph/runtime/snapshot` endpoint through the
  `internal/httpapi` endpoint registry and regenerated TypeScript from the
  Go-owned contracts.
- Added semantic runtime revision fields and `semanticRuntimeDelta` /
  `semanticRuntimeSnapshotRequired` to semantic graph change events.
- Added targeted runtime delta construction for changed cartographer runs,
  windows, patches, semantic node activity, aggregate sources, and removals.
- Added bounded runtime snapshots that exclude the full recent cartographer run
  list from the graph hot path and preserve typed source refs for details.
- Updated the renderer/preload/main IPC surface so the graph can bootstrap from
  the runtime snapshot endpoint.
- Updated the current renderer semantic graph state path so
  `cartographer_audit` and `working_set` events are handled through runtime
  deltas/snapshot reload instead of scheduling full `readWorkingSet` refreshes.

Focused review verification passed for `./internal/semanticgraph`,
`./internal/httpapi`, and the renderer/preload/main semantic runtime Vitest
coverage.

Important caveat:

- Phase 1 pulled forward part of Phase 2 by wiring runtime snapshots/deltas into
  `useSemanticGraphState`. That is useful for proving the hot-path contract, but
  it is not the final Phase 2 renderer architecture. Runtime-derived working-set
  state is still updated through React state, runtime visual invalidations are
  not yet explicitly frame-batched, and burst handling does not yet merge
  runtime deltas by entity id outside React.

Phase 2 handoff:

- Phase 2 is ready to implement.
- It should keep the Phase 1 backend contract intact and focus on the renderer
  side: a purpose-built semantic runtime store, frame-coalesced notifications,
  stale-delta/gap handling tests, burst backpressure, details-pane separation,
  and production-path Electron coverage proving no repeated full working-set
  reads after bootstrap.
- Do not redesign the backend runtime contract or broaden into the interaction
  scheduler/visual grammar phases unless a Phase 2 acceptance criterion truly
  requires it.

## Phase 2 - Renderer Runtime Store And Backpressure

Move semantic liveness out of the React full-state refresh path.

Implementation requirements:

- Add a semantic runtime store that can be consumed by the Pixi graph surface.
- Bootstrap once from the runtime snapshot endpoint.
- Apply deltas by revision.
- Drop stale deltas and recover gaps with one snapshot reload.
- Batch runtime visual invalidations to animation frames.
- Keep durable semantic graph refreshes separate from runtime deltas.
- Remove `cartographer_audit -> full readWorkingSet` behavior from the graph
  hot path.
- Avoid replacing large arrays/maps in React state for every runtime event.
- Keep selected details panes free to request richer data when needed.

Backpressure rules:

- If runtime deltas arrive faster than frames can render, merge them by entity
  id and render the latest revision.
- If the camera is moving, apply data to the store but defer low-priority visual
  expansion until movement settles.
- If a details pane is open, prioritize selected-node/runtime updates over
  offscreen aggregate updates.

Acceptance criteria:

- The three-node review workflow no longer produces repeated
  `semantic-graph:working-set-read` traffic after bootstrap.
- The renderer can process semantic event bursts without large React state churn.
- Runtime visual updates remain correct after reload and stream reconnect.
- Existing semantic details behavior still works through explicit detail reads.

### Phase 2 Implementation Review

Phase 2 is implemented by commit `174271b7d` (`Implement semantic runtime
renderer store`), with the focused follow-up below now completed.

Implemented:

- Added `SemanticRuntimeStore`, with snapshot bootstrap, revision-ordered delta
  application, stale-delta dropping, revision-gap reload, animation-frame
  coalescing, and camera-movement deferral.
- Split runtime working-set projection into
  `semantic-runtime-working-set.ts`, so the runtime snapshot/delta path no
  longer depends on repeated full `readWorkingSet` calls.
- Updated `useSemanticGraphState` so `cartographer_audit` and `working_set`
  events do not schedule durable graph refreshes, while graph/layout/activity
  changes still refresh their durable data.
- Threaded camera movement notifications from the Pixi camera callback into the
  runtime store so low-priority semantic runtime publication can wait until the
  camera settles.
- Added focused renderer unit coverage for runtime delta burst coalescing,
  stale-delta dropping, revision-gap reload, and camera-settle deferral.

Focused review verification passed for the semantic runtime store/state/projection
Vitest coverage and `./internal/semanticgraph ./internal/httpapi`.

Phase 2 follow-up completion:

- Fixed runtime workflow/run-item removal semantics in the renderer store. The
  backend contract names these removal fields `workflowNodeIds` and
  `runItemIds`, and the backend populates them with source ids such as
  `reviewer` or `run_item_review`. The renderer now merges and replaces
  workflow-node runtime entries by `workflowNodeId`, and run-item runtime
  entries by `runItemId`, while other runtime collections continue to use their
  generated runtime `id`. Renderer tests prove removal wins when it is latest
  and an update wins when it is latest within a coalesced frame.
- Added production-path verification for the Phase 2 traffic contract. The
  semantic cartographer automatic Electron workflow now writes
  `semantic-runtime-phase2-traffic-gate.json`, requires a runtime snapshot
  bootstrap through the production IPC/HTTP path, and hard-fails if the graph
  liveness path performs any blank-scope
  `semantic-graph:working-set-read` IPC or backend HTTP request after runtime
  bootstrap.

Focused follow-up verification passed for runtime store/state/projection Vitest,
runtime-store/cartographer ESLint, desktop build, and the semantic-live
recording-only Electron workflow.

The focused Electron run produced a passing Phase 2 traffic report with
`0` blank-scope working-set IPC reads, `0` blank-scope working-set IPC reads
after runtime bootstrap, `0` blank-scope working-set backend HTTP requests,
and `0` blank-scope working-set backend HTTP requests after runtime bootstrap.
The current review run also recorded `9` runtime snapshot IPC reads,
`151,862` runtime snapshot IPC bytes per minute, `8` scoped working-set reads
from explicit readback/detail paths, and `131` forwarded semantic events.

Phase 3 handoff:

- Phase 3 is ready to implement. The remaining pan/zoom work should stay scoped
  to interaction priority and camera isolation; do not reopen the Phase 2
  runtime-store contract unless Phase 3 measurements expose a concrete runtime
  store regression.

## Phase 3 - Interaction Priority And Camera Isolation

Fix baseline pan/zoom latency first, then make pan/zoom independent of semantic
runtime churn.

Implementation requirements:

- Introduce explicit scheduler priority lanes in the Pixi graph renderer.
- Ensure wheel/pinch/pointer handlers do only camera math and scheduling.
- Audit camera smoothing, inertia, settle windows, and wheel delta
  normalization for delayed start/stop behavior.
- Compare recording-enabled development, recording-disabled development, and
  packaged or production-like runs before blaming semantic runtime work.
- Prove no backend semantic reads are triggered by camera movement.
- Keep label sync, glow sync, filter sync, and semantic animation updates
  frame-coalesced.
- Add a camera-moving mode that reduces semantic detail expansion, broad glow,
  expensive filters, and decorative animation.
- Restore settled fidelity after a measured delay only once movement stops.
- Add instrumentation for event-to-transform and event-to-rendered-frame
  latency.

Acceptance criteria:

- Idle three-node pan/zoom is immediate before a workflow starts.
- Small graph pan/zoom feels immediate while the cartographer is actively
  producing runtime events.
- Scripted trackpad/pinch recording shows bounded event-to-camera latency.
- Semantic runtime bursts cannot create long tasks during camera movement.
- Existing Phase 8 performance gate is updated so the prior report-only
  label-sync churn is either fixed or fails hard.

### Phase 3 Implementation Review

Phase 3 is implemented in the current worktree.

Implemented:

- Added explicit Pixi renderer interaction lanes for camera input, visible
  position sync, hover/selection feedback, semantic runtime visuals, settled
  fidelity restore, and background recompute. The lanes are exported through
  the workflow graph debug snapshot and recorded as renderer timing buckets.
- Removed Pixi viewport deceleration/inertia from graph navigation. Touch
  pinch remains immediate and non-dragging; wheel/pinch camera movement stays
  in the Setta-owned wheel handler and responsiveness tracker.
- Kept wheel/pinch and pointer-pan handlers on the immediate camera path:
  input records update the viewport camera first, then schedule frame-coalesced
  camera-dependent work.
- Added pointer-pan interaction lifetime tracking so settled fidelity is
  restored after pointer-up rather than between delayed pointer-move samples.
  Wheel/pinch gestures continue to use the measured quiet settle window.
- Added camera-moving fidelity mode. Moving frames hide/defer screen-space node
  labels, avoid forced filter-area sync, keep active workflow edge motion, and
  defer semantic cell/tendril decorative animation until movement settles.
- Restored settled fidelity through the lower-priority lane after movement
  stops: visible scene, labels, active sets, glow/cell fidelity, and filter
  areas are restored once per completed camera gesture.
- Hardened the Phase 8 label-sync guardrail. The old report-only
  `no-full-graph-label-sync-per-pan-wheel-event` check is now a hard check
  requiring `cameraMovingLabelSyncDelta=0`.
- Kept the Phase 2 semantic runtime traffic contract intact: camera movement
  still produces `0` semantic working-set reads during the interaction window,
  and the cartographer runtime traffic gate still reports `0` blank-scope
  working-set reads after runtime bootstrap.

Focused verification passed for runtime/projection and Pixi camera tests,
targeted ESLint, desktop build, active and small-trackpad pan/zoom Electron
recordings, and the semantic-live recording-only Electron workflow.

The final `small-trackpad` recording at
`.recordings/workflow-graph-pan-zoom-small-trackpad/20260618T011559Z`
reported:

```text
idle wheel/pinch to camera transform p95: 0.5 ms
idle wheel/pinch to rendered frame p95: 23.799999952316284 ms
semantic working-set reads during camera interaction: 0
cameraMovingLabelSyncDelta: 0
max long task: 76 ms
hard failures: 0
report-only findings: 1
```

The remaining report-only finding is `normal-scene-p95-pan-zoom-frame-ms` at
`29.30000001192093 ms` against the intentionally noisy `24 ms` report-only
budget. This does not block Phase 4 because the Phase 3 hard latency budget
uses event-to-camera and event-to-rendered-frame measurements, both of which
passed.

The active semantic recording at
`.recordings/workflow-graph-pan-zoom-active/20260618T011525Z` reported:

```text
semantic working-set reads during camera interaction: 0
cameraMovingLabelSyncDelta: 0
cameraSettleRestoreFrameCount: 4
max long task: 95 ms
hard failures: 0
```

The cartographer production-path traffic gate at
`.recordings/semantic-live-run/2026-06-18T011626-983Z/automatic-agent/semantic-runtime-phase2-traffic-gate.json`
reported:

```text
blank-scope working-set reads after runtime bootstrap: 0
blank-scope working-set HTTP requests after runtime bootstrap: 0
runtime snapshot IPC bytes per minute: 151817
```

Important caveat:

- The active pan/zoom recording is the existing production-like built Electron
  synthetic semantic scene, not a live-provider run. The live cartographer
  production-path gate was rerun separately to prove the runtime traffic
  contract. Dedicated live runtime-burst camera workflows remain part of the
  Phase 7 verification matrix.

Phase 4 handoff:

- Phase 4 is ready to implement. Keep the Phase 3 camera scheduler and
  movement-mode fidelity contract intact while adding workflow-first visual
  grammar and aggregate cartographer runtime indicators.

## Phase 4 - Workflow-First Visual Grammar

Redesign semantic runtime visuals around explanation and hierarchy.

Implementation requirements:

- Restore an unmistakable green active workflow node treatment for running
  workflow nodes.
- Keep active workflow edge styling above semantic source-edge styling.
- Replace default individual live-source beads with an aggregate workflow-node
  runtime indicator.
- Show aggregate states such as observing, extracting, proposing, applying,
  pending review, no-op, failed, and applied.
- Use icons, small counts, hover cards, details panes, or selected-state
  expansion instead of unlabeled graph particles.
- Only show individual live sources when they are selected, hovered, zoomed
  enough to be legible, or tied to a visible proposed/committed semantic node.
- Make proposed patch previews visibly provisional.
- Keep committed semantic nodes readable, concise, and clearly secondary to the
  active workflow path.

Acceptance criteria:

- The default view of a three-node workflow has zero mystery beads.
- A user can tell which workflow node is active at a glance.
- A user can tell whether the cartographer is observing, proposing, applying,
  no-oping, or failing without opening logs.
- Hovering/selecting the aggregate runtime indicator exposes the underlying
  source refs and recent pulses.
- Screenshots for the simple review workflow show workflow state first,
  semantic findings second, runtime telemetry third.

### Phase 4 Implementation Review

Phase 4 is implemented by commit `faf3ba31f` (`Add workflow-first semantic
runtime indicators`).

Implemented:

- Added a renderer-side workflow runtime projection that aggregates live
  semantic working-set facts by workflow node instead of rendering individual
  live-source beads in the default graph view.
- Threaded aggregate workflow runtime indicators through the merged
  workflow/semantic graph, debug snapshots, selected workflow-node target state,
  and workflow-node details panes.
- Added compact workflow-node runtime badges with status color, source-count
  dots, pulse marker, and bounded run/window/patch/source-ref detail.
- Restored an unmistakable green running workflow-node treatment.
- Drew semantic edges before workflow edges so active workflow edges remain
  visually above semantic source/context edges.
- Made patch-preview semantic cells visibly provisional with small perimeter
  marks.
- Added workflow-node details sections for semantic runtime status counts,
  source refs, and recent pulses, so selection exposes the provenance behind
  the aggregate indicator.
- Added tests and Electron assertions proving the default view has zero
  unlabeled live-source nodes and does expose an aggregate workflow runtime
  indicator.

Verification passed with `./scripts/format.sh` and `./check_quality.sh --all`,
including Go tests, desktop formatting,
typecheck, Vitest, desktop build, dead-code checks, and the required Electron
workflow tier. The required Electron workflows included workflow graph smoke,
semantic graph, and `semantic-cartographer-auto`; the semantic cartographer
workflow passed both the smoke path and the long-running/restart branch.

Important caveat:

- Phase 4 exposes underlying source refs and recent pulses through workflow-node
  selection/details. It does not add a separate hover card on the graph badge.
  That is acceptable for the Phase 4 acceptance wording because selection is a
  supported provenance path, but Phase 5 should avoid expanding graph-hover
  behavior unless the liveness product contract proves it is needed.

Phase 5 handoff:

- Phase 5 is ready to implement. Keep the Phase 4 workflow-first visual
  hierarchy intact: fast runtime state should aggregate onto workflow nodes,
  proposed semantic memory should stay provisional, and durable semantic nodes
  should remain secondary to active workflow execution.

## Phase 5 - Cartographer Liveness Product Contract

Separate fast typed liveness from slow model interpretation.

Implementation requirements:

- Define which live states are produced directly from typed workflow/runtime
  events.
- Define which states require model output.
- Ensure workflow activity appears immediately from typed events, even if the
  cartographer model is slow or queued.
- Render queued/running/superseded/no-op/rejected/failed/applied state as
  runtime lifecycle, not as durable semantic memory.
- Treat no-op and rejected runs as audit-visible health state, not graph clutter.
- Make pending-review previews inspectable without dominating the workflow.
- Ensure model/reasoning settings are included in runtime/audit surfaces where
  they help explain latency, but do not block fast liveness on provider metadata.

Acceptance criteria:

- In a `Start -> Reviewer -> End` code-review workflow, `Reviewer` becomes
  visibly active immediately from workflow execution state.
- Within one second of meaningful workflow activity, the graph shows compact
  runtime activity without waiting for a model response.
- Committed semantic findings appear only when evidence-backed claims are
  proposed/applied.
- Slow or failed cartographer model runs leave clear audit/runtime status
  without flooding the graph.

### Phase 5 Implementation Review

Phase 5 is implemented by commit `b35f1ec60` (`Implement semantic runtime model audit`).

Implemented:

- Added Go-owned `SemanticRuntimeModelAudit`, regenerated TypeScript, and
  threaded compact requested/effective/reported model, reasoning, duration, and
  error fields through runtime runs, aggregate workflow-source hints, the
  working-set bridge, and selected workflow-node details.
- Preserved workflow-first hierarchy: queued/running/pending-review/no-op/rejected/failed/applied lifecycle stays aggregated onto workflow nodes, pending previews remain provisional, and committed findings still require applied evidence-backed patches.
- Kept fast liveness typed-event based. Workflow execution projection still drives active node styling, and cartographer queued/open/running/terminal records drive compact runtime status without waiting for model output or provider metadata.
- Added focused backend and renderer tests for terminal no-op lifecycle visibility without source-pulse nodes and selected-node rendering of model audit metadata.

Focused verification passed during review for `./internal/semanticgraph`,
`./internal/httpapi`, runtime/projection/details Vitest coverage, targeted
ESLint, and desktop typecheck.

Phase 6 is ready. The phase 5 model-audit fields are intentionally compact, but
they are not yet governed by a measured hot-path byte budget or details-only
contract. Phase 6 must measure snapshot/delta payload costs, add explicit
budgets, and either enforce caps/truncation on audit strings or move richer
audit detail behind an on-demand details/diagnostics surface.

## Phase 6 - Payload Budgets And Detail Separation

Make payload size a first-class API constraint.

Implementation requirements:

- Split hot-path runtime snapshot/delta payloads from details/audit payloads.
- Add explicit limits for recent runs, recent changes, live sources, pulses,
  and patch previews in hot-path contracts.
- Include aggregate counts when details are collapsed or omitted.
- Move full recent cartographer run lists to a details or diagnostics endpoint.
- Add byte-size instrumentation for semantic runtime snapshots and deltas.
- Fail tests when hot-path payloads exceed the calibrated budget.

Acceptance criteria:

- A simple workflow runtime snapshot is small and stable.
- A long code-review workflow does not produce 100 KB hot-path runtime payloads
  at high frequency.
- Details panes can still load full provenance on demand.
- Recording with payloads enabled remains useful instead of being dominated by
  repeated full working-set responses.

### Phase 6 Implementation Review

Phase 6 is implemented by commit `7bd232a06` (`Implement semantic runtime
payload budgets`).

Implemented:

- Added Go-owned `SemanticRuntimePayloadBudget` metadata to runtime snapshots
  and deltas, regenerated TypeScript, and records byte size, max byte size, and
  truncated string count on hot-path payloads.
- Added explicit snapshot limits for active cartographer runs/windows, patch
  previews, preview nodes, semantic changes, aggregate sources, workflow nodes,
  run items, changed IDs, operation names, created event IDs, public summaries,
  preview text, model-audit text, and model-audit errors.
- Split full recent cartographer detail out of the runtime hot path by exposing
  recent/omitted counts in the runtime snapshot while leaving full run details
  available through the existing cartographer list/read detail endpoints.
- Added truncation and budget tests for large runtime snapshots and deltas,
  including assertions that durable cartographer run detail is not truncated.
- Added recording payload metrics for semantic runtime snapshots and forwarded
  deltas, plus a phase 6 payload gate report in the deterministic Electron
  semantic cartographer workflow.
- Preserved the renderer runtime-store behavior from Phase 3: runtime deltas
  coalesce by frame/entity, revision gaps request a snapshot, and visual
  publishing still waits for camera movement to settle.

Focused verification passed during review for `./internal/semanticgraph`,
`./internal/httpapi`, runtime/projection/details Vitest coverage, targeted
ESLint, desktop typecheck/build, and the semantic-live recording-only Electron
workflow.

Phase 7 is ready. The Phase 6 gates prove the runtime payload contract for the
focused semantic-live workflow and large backend fixtures; Phase 7 should
broaden that into the full product acceptance matrix, especially the large
review, reconnect, and runtime-burst camera workflows.

## Phase 7 - Verification Matrix And Product Acceptance

Turn this refactor into durable gates.

Required deterministic workflows:

- `workflow-graph-pan-zoom-small-active`: three workflow nodes, active reviewer,
  semantic runtime events, scripted trackpad-like pan/zoom.
- `workflow-graph-pan-zoom-runtime-burst`: small graph with a burst of semantic
  runtime deltas during camera movement.
- `semantic-review-live-product`: `Start -> Reviewer -> End` with a scripted
  reviewer agent, typed command/file/test/chat activity, slow model response,
  patch preview, applied finding, no-op, and failure.
- `semantic-runtime-reconnect`: runtime stream disconnect/reconnect with and
  without revision gaps.
- `semantic-runtime-large-review`: many semantic findings and runtime events
  with payload and visual LOD budgets.

Hard gates:

- No repeated full working-set reads after bootstrap in normal runtime flow.
- No camera-triggered semantic backend reads.
- Wheel/pinch event-to-camera-transform latency within budget.
- Semantic runtime IPC bytes/minute within budget.
- Hot-path runtime payload size within budget.
- No unlabeled source-pulse graph nodes in default view.
- Active workflow node styling visible in screenshot checks.
- Runtime aggregate status visible during active workflow execution.
- Details pane can explain aggregate runtime status and committed semantic
  findings.
- Reload/reconnect preserves durable graph state and recovers runtime state.

Report-only until calibrated:

- Cross-machine frame p95, if local variance remains high.
- GPU/compositor timing, if Electron/CDP measurement remains noisy.

### Phase 7 Implementation Review

Phase 7 is implemented by commit `0aa0c0e05` (`Implement semantic runtime phase
7 acceptance gates`).

Implemented:

- Added deterministic Electron acceptance workflows for the Phase 7 matrix:
  `workflow-graph-pan-zoom-small-active`,
  `workflow-graph-pan-zoom-runtime-burst`, `semantic-review-live-product`,
  `semantic-runtime-reconnect`, and `semantic-runtime-large-review`.
- Added shared semantic runtime traffic gates covering runtime snapshot
  bootstrap, zero blank-scope working-set reads after runtime bootstrap,
  semantic runtime IPC bytes per minute, snapshot/delta payload byte budgets,
  and runtime payload bytes per minute.
- Added production-path product acceptance checks for typed liveness within one
  second, reviewer active styling, workflow runtime detail explanation,
  semantic finding provenance detail, applied finding readback, reconnect
  recovery, large-review visual budgets, and no default-view live-source graph
  node clutter.
- Added runtime-burst pan/zoom acceptance that streams semantic runtime deltas
  during camera input and reuses the graph performance guardrails for camera
  latency, no camera-time working-set reads, label-sync deferral, materialized
  node counts, display-object counts, and long-task checks.
- Added a three-node synthetic running workflow with aggregate runtime
  indicator for small-active pan/zoom verification.

Focused verification passed during review:

- `./scripts/go.sh test ./internal/semanticgraph ./internal/httpapi`
- `pnpm --dir desktop exec vitest run src/renderer/src/features/workspace-graph/pixi-renderer-synthetic-graph.test.js src/preload/index.test.ts src/renderer/src/features/workspace-graph/semantic-runtime-store.test.ts src/renderer/src/features/workspace-graph/semantic-graph-projection.test.ts`
- `pnpm --dir desktop exec eslint src/preload/index.ts src/preload/index.test.ts src/shared/types.ts src/renderer/src/features/workspace-graph/pixi-renderer-synthetic-graph.js src/renderer/src/features/workspace-graph/pixi-renderer-synthetic-graph.test.js tests/electron/semantic-runtime-phase7-acceptance.test.mjs tests/electron/semantic-runtime-phase7-helpers.mjs tests/electron/semantic-runtime-traffic-gate.mjs tests/electron/workflow-graph-pan-zoom-recording.test.mjs tests/electron/workflow-graph-phase0-performance-guardrails.mjs tests/electron/workflows.mjs`
- `pnpm --dir desktop typecheck`
- `pnpm --dir desktop build`
- `node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --skip-build --scenario small-active`
- `node desktop/tests/electron/semantic-runtime-phase7-acceptance.test.mjs --skip-build --workflow workflow-graph-pan-zoom-runtime-burst`
- `node desktop/tests/electron/semantic-runtime-phase7-acceptance.test.mjs --skip-build --workflow semantic-review-live-product`
- `node desktop/tests/electron/semantic-runtime-phase7-acceptance.test.mjs --skip-build --workflow semantic-runtime-reconnect`
- `node desktop/tests/electron/semantic-runtime-phase7-acceptance.test.mjs --skip-build --workflow semantic-runtime-large-review`

All hard Phase 7 gates passed in the review recordings. The remaining misses are
intentionally report-only calibration items:

- `workflow-graph-pan-zoom-small-active` reported p95 frame time above the
  provisional 24 ms frame budget, while the hard wheel-to-camera and
  wheel-to-rendered-frame latency gates passed.
- `workflow-graph-pan-zoom-runtime-burst` reported static-glow redraw count and
  p95 frame time above provisional budgets, while the hard camera latency,
  no-working-set-read, payload, visual budget, and long-task gates passed.

The implementation is complete for the current plan's hard requirements. Future
work should either calibrate those report-only frame/GPU thresholds across
machines or convert them into hard gates once the metrics are stable enough.

## Expected User Experience After Completion

For a simple workflow:

```text
Start -> Reviewer -> End
```

where `Reviewer` is an agent reviewing the codebase:

- The graph opens with workflow nodes as the primary visual structure.
- When the workflow starts, the active path and `Reviewer` node visibly turn
  active with a clear green running treatment.
- Pan and zoom remain immediate even while chat output and cartographer runtime
  events are streaming.
- Near `Reviewer`, the user sees a compact live semantic activity indicator,
  not a pile of unlabeled beads.
- That indicator changes as the system observes workflow activity, extracts
  candidate findings, proposes patches, applies useful findings, no-ops
  low-value windows, or records failures.
- Durable semantic findings appear as concise labeled cells only when they have
  evidence-backed content.
- Selecting a semantic finding explains why it exists, what evidence supports
  it, which workflow/chat/run item produced it, and what cartographer patch
  created or updated it.
- If the model is slow, the UI still feels live from typed workflow/runtime
  state. The user is not waiting on model interpretation just to see activity.

## Non-Goals

- Do not keep the old full working-set refresh behavior as a compatibility
  fallback.
- Do not add polling.
- Do not add keyword heuristics to decide semantic meaning.
- Do not store chain-of-thought or private model reasoning.
- Do not make every cartographer runtime object a graph node.
- Do not move graph rendering back into React as a workaround for Pixi
  scheduling issues.
- Do not manually edit generated TypeScript outputs.
- Do not add migrations, legacy readers, transitional adapters, old-field
  aliases, or dual-read/write paths.
