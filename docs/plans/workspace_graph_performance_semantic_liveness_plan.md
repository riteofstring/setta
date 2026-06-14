# Workspace Graph Performance and Semantic Liveness Plan

- **Date:** June 15, 2026
- **Status:** Phase 0 complete; Phase 1 ready
- **Scope:** Diagnose and fix workspace graph pan/zoom/interaction performance, then make the semantic cartographer feel live and useful during real workflow runs.
- **Related docs:**
  - `docs/plans/living_workspace_neon_redesign_plan.md`
  - `docs/plans/semantic_cartographer_usefulness_plan.md`
  - `docs/plans/setta_semantic_work_graph_implementation_plan.md`

## Resolved Product Decisions

1. **Live pre-claim state renders as source pulses, not full semantic cells.** When the workflow/cartographer is observing activity but has not yet proposed or committed a semantic claim, show small live source pulses/beads tied to the workflow node, run item, or existing semantic target. Do not render a full temporary semantic cell until there is a typed proposed patch preview.
2. **Duplicate evidence is handled at the store boundary.** The semantic store should deterministically upsert or reject duplicate evidence anchors using stable typed identity, so repeated target/source evidence does not leak into every read/projection/UI path.
3. **Ambient semantic motion is information-driven by default.** Animate active, recent, live, selected, hovered, or patch-touched semantic cells. Do not enable always-on breathing for every visible settled cell unless measurement proves it is cheap and the motion remains useful.
4. **Committed graph state and live working state stay separate.** Keep `SemanticGraph` as durable memory and add a separate Go-owned `SemanticWorkingSet` contract/stream for live workflow/cartographer state. The renderer may merge them for presentation, but backend contracts should not blur persistence with process state.

## Position

The recent work produced the right structural direction, but the product still has two coupled gaps:

1. The graph renderer is too expensive on the interaction path, and the current recording does not contain enough profiler-grade data to prove the exact bottleneck.
2. The semantic graph is still mostly a post-hoc artifact. It can contain real nodes, edges, and evidence, but it does not show what the workflow and cartographer are doing now, so it feels static and low-value.

The long-term fix should not be another visual tuning pass or a prompt-only change. We need:

- A repeatable performance recording mode that captures renderer, React, IPC, and input timing together.
- A renderer architecture where pan/zoom work is bounded by visible objects and coalesced to animation frames.
- A typed semantic "working set" that represents in-flight cartographer activity separately from committed semantic memory.
- A usefulness gate that fails when semantic output is sparse, duplicate-heavy, unconnected, or late.

## What The Latest Recording Proves

The recording at `.recordings/20260615T155237Z` is useful, but not sufficient for root-cause performance diagnosis.

It proves these product/data facts:

- The screenshot shows a visible merged workflow/semantic graph, but the semantic layer is visually static.
- The semantic graph payload had 4 nodes, 1 semantic edge, 11 source links, and 0 activity-summary targets.
- Source links include repeated evidence for the same target/source pairs, so the graph has evidence volume without corresponding user value.
- The workflow projection was a 3-node draft where every workflow node was `not_started`, so no workflow status or semantic activity would naturally drive live animation.
- The renderer loaded semantic graph and activity summary twice on startup, and workflow graph projection multiple times. These duplicate loads are not necessarily the core performance issue, but they are measurable overhead.

It does not prove the pan/zoom bottleneck because it does not contain:

- CDP trace slices or main-thread long-task records.
- Renderer debug snapshots during the pan/zoom interaction.
- Per-frame draw timings for labels, glow, edge flow, filters, spatial queries, or scene graph updates.
- Pointer/wheel sample timestamps and deltas.
- A high-frame-rate clip or contact sheet showing frame cadence.
- A deterministic temp-data reproduction. The manifest uses `/Users/kevin/.setta`, which is good for manual inspection but not reproducible.

The correct answer to "does the recording enable diagnosis?" is: it narrows the problem, but we need better logging before making confident performance fixes. It already diagnoses the semantic liveness problem more strongly than the render-performance problem: there was no semantic activity data for the renderer to animate.

## Current Suspect Hotspots

These are hypotheses to measure, not conclusions to optimize blindly:

- `commitCameraChange` runs synchronously during wheel/pointer pan and calls `labels.syncAllLabels()`, `animationCoordinator.syncActiveSet()`, and `syncFilterAreas()`.
- `labels.syncAllLabels()` iterates every node, then does a second semantic label pass. This is the wrong shape for pan/zoom on large graphs.
- `animationCoordinator.syncActiveSet()` recomputes visible nodes and redraws static glow on camera changes. That should not happen on every input event unless visibility actually crosses a padded boundary.
- Node and label lookup paths still use linear `nodes.find(...)` in several hot helpers.
- Pixi blur filters on broad graphics layers may be expensive during camera movement, especially if filter areas update too often.
- Scene graph updates still redraw grid, labels, outlines, glow, and all edges after every graph replacement.
- Existing scale validation already recommends visible node/port pooling before edge culling for the 5,000-node case.

Semantic liveness has clearer current causes:

- The renderer only animates semantic cells when `node.activity.active === true`.
- The recorded activity summary returned zero targets.
- Cartographer audit/status changes are published, but `useSemanticGraphState` ignores `cartographer_audit` for the workspace graph surface.
- In-flight cartographer windows/runs are not projected into the graph, so the UI goes quiet until a committed semantic event lands.
- The graph can accumulate duplicate evidence anchors without improving visible relationships.

## North Star

### Performance

Pan and zoom should be cheap, bounded, and predictable:

- Pointer and wheel event handlers should mutate only camera state and set dirty flags.
- Work that can be delayed should run once per animation frame, not once per DOM event.
- Camera movement should not force full-graph label sync, static glow redraw, or active-set recompute over all nodes.
- Visible objects should be pooled; offscreen nodes, ports, labels, and most edges should not contribute display objects or label work.
- Idle or settled graphs should cost near zero CPU unless a measured, bounded animation is active.

### Semantic Liveness

The semantic map should answer these while a workflow is running:

- What is the agent currently exploring, editing, validating, debugging, or blocked on?
- Which semantic nodes are being considered, updated, or connected now?
- What evidence just arrived, and which workflow node/run item/chat message produced it?
- Which proposed semantic updates are pending, applied, rejected, or no-op?
- What changed since I last looked?

Committed semantic nodes are durable memory. Live cartographer state is working memory. They should be rendered together, but stored and reasoned about separately.

## Phase 0 - Diagnostic Recording Upgrade

Add a profiler-grade graph recording mode before performance refactors.

### Renderer Debug Sampling

Extend the existing workflow graph debug surface and recording harness to sample:

- `workflowGraphDebugSnapshot({ includeVisual: false })` before interaction, every 250 ms during interaction, and after interaction.
- `recentFrameMs`, average/worst frame, p95 frame, frame count deltas.
- Camera update counts, wheel/pointer pan counts, wheel zoom counts.
- Label sync counts and visible label counts.
- Spatial query counts and candidate counts.
- Display object counts by layer.
- Animation counts and redraw counts.
- Graph update counts and add/remove/update counts.

Add timing buckets inside the renderer for:

- `commitCameraChange` total.
- Label position sync and label visibility sync.
- Animation active-set recompute.
- Static glow redraw and animated glow redraw.
- Filter-area sync.
- Scene graph node diff/update/rebuild.
- Edge redraw and edge label redraw.
- Grid redraw.
- Pixi render time where measurable.

Expose these as an append-only ring buffer in the debug snapshot, not as noisy console logs.

### Input And Trace Capture

Add recording support for:

- Pointer/wheel event samples: timestamp, event kind, delta, modifiers, target canvas, camera before/after.
- CDP tracing with main-thread timeline categories around scripted pan/zoom.
- `PerformanceObserver` long-task records and event-timing records where available.
- A 2-3 second fit-to-view clip or contact sheet for the interaction.

### Reproducible Scenarios

Add deterministic recording workflows using temporary app data:

- `workflow-graph-pan-zoom-baseline`: small real workflow plus 4 semantic nodes.
- `workflow-graph-pan-zoom-active`: running workflow, active edge, active semantic activity.
- `workflow-graph-pan-zoom-large`: 500, 1,000, 2,500, 5,000 nodes.
- `semantic-live-run`: scripted fake Codex/provider run that creates observations, cartographer windows, patches, activity, and final synthesis.

Manual recordings against `~/.setta` should remain useful for symptoms, but only temp-data deterministic recordings are accepted as verification evidence.

### Phase 0 Implementation Review

Commits `a7fc49f4a` and `aced32937` completed Phase 0. The core diagnostic surface now includes renderer timing buckets, p95 frame stats, display-object layer counts, pointer/wheel input samples, CDP traces, PerformanceObserver records, contact-sheet capture, deterministic `workflow-graph-pan-zoom-*` workflow registrations, and the `semantic-live-run` workflow registration.

The required baseline report is checked in at `docs/reports/performance/workspace-graph-semantic-liveness-phase-0-baseline.md`. It covers:

- `workflow-graph-pan-zoom-baseline`
- `workflow-graph-pan-zoom-active`
- `workflow-graph-pan-zoom-large` at 500, 1,000, 2,500, and 5,000 nodes
- `semantic-live-run`

The baseline supports Phase 1 as the next implementation step. Camera events still trigger whole-graph label sync: at 5,000 nodes, 22 camera updates produced 110,000 label sync deltas. `commit-camera-change` scales from 0.2 ms average at 7 nodes to 73.9 ms average at 5,000 nodes, and `label-all-sync` is the largest measured camera-dependent sub-bucket at 5,000 nodes with 80.5 ms average and 146.7 ms worst. Display objects also scale linearly, reaching 60,021 stage objects at 5,000 nodes; that keeps Phases 2 and 3 justified, but the first measured interaction fix is Phase 1 camera coalescing.

## Phase 1 - Interaction Path Refactor

Make pan/zoom event handling frame-coalesced.

Readiness gate: Phase 1 is ready to implement. The Phase 0 baseline report exists and identifies synchronous camera-dependent work as the next measured bottleneck. The Phase 1 implementation must use that report as the before state, then append a before/after report under `docs/reports/performance/`.

- Replace synchronous per-event camera work with a camera dirty flag processed in the ticker.
- During a pan/zoom frame, update viewport transform immediately, but run label/visibility/filter/animation sync once per frame.
- Split `commitCameraChange` into:
  - `recordCameraState`
  - `scheduleCameraDependentSync`
  - `runCameraDependentSyncFrame`
- Keep `onCameraStateChange` cheap and in-memory, but coalesce writes if it ever becomes persistent.
- Add a camera movement state so expensive fidelity can be reduced while the camera is moving, then restored after a short settle window.

Expected outcome:

- Wheel/pointer event handlers are O(1) or O(log visible).
- The maximum expensive camera-dependent work rate is the display frame rate, not the input event rate.
- A performance report shows reduced main-thread time during drag and wheel gestures.

## Phase 2 - Visibility-First Labels, Glow, And Filters

Stop treating labels and glow as whole-graph camera work.

### Labels

- Maintain a visible-label set with padded viewport hysteresis.
- Only position labels whose nodes are visible or newly entering/leaving the padded region.
- Keep semantic labels in the same visible-label system; remove the second all-semantic positioning pass.
- Replace hot `nodes.find(...)` lookups with maintained `Map<string, node>`.
- Consider viewport-child labels with inverse scale only if screen-space labels remain expensive after measurement.

### Glow

- Separate static glow from camera movement. Static glow should only redraw when graph content changes or when visible-node membership crosses a padded boundary.
- Do not redraw static glow on every pan pixel.
- Disable or simplify broad blur filters while the camera is actively moving if trace data shows filters dominate frame time.

### Filter Areas

- Measure filter-area sync cost.
- Only update filter areas on resize and zoom changes if pan-only movement does not require it.
- If pan does require it for correctness, coalesce it with the camera dirty frame and measure.

## Phase 3 - Scene Graph Pooling And Level Of Detail

Implement the existing Phase 7 direction as a first-class renderer architecture, not as a narrow fix.

- Introduce a `VisibleSceneWindow` owned by the renderer. It maps the authoritative graph to a smaller visible display set.
- Pool node containers, port graphics, labels, glow graphics, and activity overlays.
- Keep authoritative graph state in JS data structures, but only materialize visible display objects.
- Render semantic and workflow edges with endpoint/segment culling.
- Add edge LOD:
  - At low zoom, draw only important active/source/semantic relationship edges.
  - At medium zoom, draw visible endpoint edges.
  - At high zoom, draw labels and diagnostics.
- Keep hit-testing backed by the spatial index and authoritative graph, not by display object presence alone.
- Preserve production Pixi paths and avoid moving graph state into React.

This phase should be measured at 500, 1,000, 2,500, and 5,000 nodes for both workflow and semantic-cell scenes.

## Phase 4 - Semantic Working Set Contract

Add a Go-owned, generated TypeScript contract for live semantic state.

The committed graph remains `SemanticGraph`. Add a separate read/event surface, for example `SemanticWorkingSet`, that is owned by `internal/semanticgraph` and delivered over the existing push model.

Candidate fields:

- `workspaceId`
- `workflowExecutionId`
- `chatRunId`
- `activeWorkflowNodeIds`
- `activeRunItemIds`
- `activeCartographerWindows`
- `activeCartographerRuns`
- `recentCartographerRuns`
- `recentSemanticChanges`
- `candidateTargets`
- `pendingPatchPreviews`
- `liveSourceRefs`
- `lastUpdatedAt`

Each live item should expose public, typed status only:

- `status`: observing, window_open, queued, running, proposing, applying, pending_review, applied, noop, rejected, failed, superseded.
- `triggerKind`
- source refs
- input item counts
- changed semantic node ids
- changed semantic edge ids
- patch operation names
- public summaries
- diagnostics

Do not store or expose chain-of-thought. Do not infer live state with keyword heuristics. Use cartographer run/window status, workflow events, run item metadata, patch records, and semantic change events.

Renderer projection:

- Project live working-set items into visual metadata on existing semantic nodes when they target known nodes.
- Project small live source pulses from active workflow nodes/run items when the cartographer is observing work but has no committed semantic target yet.
- Project translucent preview cells only for typed pending patch previews that would create a new semantic node if accepted/applied.
- Project live source links from active workflow nodes/run items to committed nodes, live pulses, or pending preview cells.
- Remove live pulses or preview cells when a committed node/edge/evidence update supersedes them.

This makes the semantic map live before durable semantic mutations exist.

## Phase 5 - Deterministic Activity And Change Pulses

Do not rely exclusively on LLM-proposed `start_activity` patches for liveness.

- Use workflow/cartographer status to create non-persistent live activity pulses in the working set.
- Continue using persistent `SemanticActivityInterval` for durable activity history when the cartographer explicitly creates it or when a deterministic source-to-node relationship is known.
- Add renderer visual states:
  - active workflow source pulse
  - cartographer observing pulse
  - cartographer running pulse
  - patch proposed pulse
  - node updated recency pulse
  - evidence attached pulse
  - edge created pulse
- Keep ambient cell breathing measured, capped, and limited to active/recent/live/selected/hovered cells by default. Information-driven pulses should matter more than decorative motion.

This fixes the current "zero activity targets means zero life" failure mode.

## Phase 6 - Semantic Quality And Idempotency

Improve the value of committed semantic memory.

- Add evidence idempotency so the same target/source pair is not repeatedly attached as duplicate anchors unless it carries materially different typed evidence.
- Use a deterministic evidence identity at the store boundary, such as workspace id, target entity id, source kind, source id, URI/path, range, and content hash. Repeated identical evidence should update/merge metadata instead of creating another anchor.
- Make duplicate evidence visible in cartographer diagnostics until the underlying idempotency is fixed.
- Strengthen automatic patch policy:
  - A new durable node must be specific, evidence-backed, and connected by source link or semantic edge.
  - A final synthesis should connect, merge, dismiss, or justify isolated session nodes.
  - Repeated generic process notes should be rejected or left pending review.
- Add a graph usefulness score to cartographer run audit:
  - applied patches
  - no-op patches
  - rejected patches
  - duplicate evidence prevented
  - created nodes by kind
  - created edges by kind
  - source links by source kind
  - activity coverage
  - median time from source event to visible live pulse
  - median time from source event to committed semantic update

The score is not a user-facing grade. It is a diagnostic and test artifact.

## Phase 7 - Semantic UI Usefulness

Make semantic nodes worth inspecting.

- On hover or selection, highlight:
  - connected semantic edges
  - source workflow node/run item edges
  - recent evidence attachments
  - active cartographer work touching the node
- In the details pane, surface:
  - concise node summary
  - why it exists
  - newest evidence
  - source workflow/run item/chat refs
  - related semantic nodes
  - cartographer patch provenance
  - live status when a patch is currently touching it
- Add a "recent changes" strip or compact timeline in the semantic details pane, not as explanatory marketing copy on the graph itself.
- Keep labels short and stable. Long summaries belong in details, not on cells.

This phase should make interaction valuable even when the graph is small.

## Phase 8 - Verification Gates

### Performance Gate

Add a deterministic Electron workflow, through production main/preload/renderer/HTTP/store paths, that:

- Opens a temp workspace.
- Seeds the canonical graph scenario.
- Captures initial debug snapshot.
- Runs scripted pan, zoom, hover, selection, and node drag.
- Captures per-frame and trace evidence.
- Writes reports under `docs/reports/performance/`.

Budgets should start as report-only if local variance is high, then become hard gates after calibration. Initial targets:

- Pan/zoom p95 frame under 24 ms for normal scenes.
- No long task over 100 ms during scripted interaction.
- No full-graph label sync per pointer/wheel event.
- No static glow redraw per pointer/wheel event.
- Display object count scales with visible nodes after pooling.

### Semantic Liveness Gate

Add a deterministic workflow with a scripted fake Codex/provider harness that:

- Opens a workspace.
- Runs an agent workflow.
- Emits command, file, test, assistant, and workflow-node events.
- Produces cartographer windows and patch envelopes on controlled timing.
- Verifies semantic working-set events before committed patches land.
- Verifies committed graph updates after patches land.
- Verifies source links, edges, activity/live pulses, details-pane provenance, and restart/reload recovery.

Minimum pass conditions:

- A live semantic pulse appears within one second of meaningful workflow activity.
- Cartographer queued/running/proposed/applied/noop/failed states are visible in the working set.
- At least one useful final semantic node has granular evidence.
- Useful nodes are connected by source link or semantic edge.
- Duplicate evidence is either prevented or explicitly reported.
- The graph and details pane remain consistent after reload.

Because this touches workflow, cartographer, event streaming, generated contracts, renderer graph state, and transcript/workflow paths, implementation must use deterministic end-to-end app workflow tests through production Electron/main/preload/renderer/HTTP/store paths. If live Codex/provider behavior is touched, run the live Codex E2E tests when local ChatGPT auth is available; skip narrowly and report the skip when it is not.

## Implementation Order

1. Complete: add diagnostic recording and debug timing.
2. Complete: run the new recording against current code and save the baseline performance report.
3. Next: refactor camera interaction work to be frame-coalesced.
4. Make labels/glow/filter sync visibility-aware.
5. Add visible object pooling and edge LOD if the measured bottleneck remains display-object scale.
6. Add the semantic working-set contract and renderer projection.
7. Add deterministic activity/change pulses.
8. Fix semantic evidence idempotency and usefulness diagnostics.
9. Add semantic details/highlight polish.
10. Promote calibrated performance and liveness checks into gates.

## Non-Goals

- No polling. Use existing or new push/event streams.
- No keyword heuristic fallbacks for semantic meaning.
- No fake semantic estimates. Live UI must be driven by typed workflow/cartographer/runtime state.
- No manually maintained TypeScript mirrors of Go-owned contracts.
- No generated-output edits by hand.
- No backward compatibility shims or legacy renderer modes unless explicitly requested.
- No moving graph state into React as a workaround for renderer issues.

## Open Questions

None for the currently proposed architecture. The earlier questions about live seed rendering, duplicate evidence handling, ambient breathing, and the working-set contract are resolved in "Resolved Product Decisions."
