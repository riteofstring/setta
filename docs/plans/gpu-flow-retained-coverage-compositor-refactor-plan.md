# GPU Flow Retained Coverage Compositor Refactor Plan

## Context

The latest Chrome recording shows a different failure mode from the earlier
retained-content blanking problem. The visible symptom is poor performance
during some zooming and panning interactions on the Settings All Settings view.

The relevant recording signals were:

- Wheel input handling was cheap. `gpu-flow-viewport-runtime-frame` stayed near
  0 ms, with max runtime around 0.2 ms and no input backlog.
- Browser long tasks lined up with `gpu-flow-frame.durationMs` spikes, not with
  network, websocket, backend, raster, or upload work.
- The worst interaction frames were around 200-267 ms, producing frame gaps up
  to about 292 ms.
- Those same frames had retained coverage planning explode:
  - `retainedTexturePageTargetDescriptorCount` reached 585.
  - `retainedTexturePageRejectedStaleRectCount` reached about 33,000.
  - `retainedTexturePageUploadMs` and raster time were near zero.
  - Upload work was mostly deferred or budgeted to one tiny item.

This points at synchronous retained coverage computation during the render
frame. The current path still asks page descriptors to drive display
publication. When zoom and pan move through certain scale buckets and visible
windows, the compositor enumerates a large desired page set, then repeatedly
queries retained coverage and rejected coverage per descriptor. That turns the
frame loop into roughly:

1. Generate many desired page descriptors.
2. For each descriptor, query exact coverage.
3. If exact coverage is missing, query rejected coverage.
4. Query compatible coverage.
5. Build draw quads, true holes, and refinement descriptors.

The current transactional coverage store is a useful direction, but it is still
being consumed through a page-by-page compatibility loop. That loop scans the
committed region set too many times and materializes high-volume rejected
coverage diagnostics in normal frames.

The principled fix is not a small index on the existing loop. The compositor
needs to own display planning at the visible region level, with batched spatial
queries, stable committed regions, and explicit replacement commits. Page
descriptors should become a rasterization detail, not the display compositor's
unit of publication.

## Ideas To Borrow From Example Repositories

Use these ideas from `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos`
as design constraints, not as code to copy.

- `html-in-canvas-cracks`: keep the render loop on stable texture references
  and update scroll/viewport state through uniforms or transforms. The scene
  samples the current committed texture while paint/capture work happens as a
  separate lifecycle event. It also keeps viewport-locked geometry in CSS pixel
  space, so motion does not require rebuilding content.
- `html-in-canvas-cracks`: preserve the JavaScript texture object identity when
  possible, and only force GPU allocation changes on actual backing-size
  changes. Consumers keep sampling the same logical texture handle.
- `compiz-web`: treat old and new page textures as separate committed visual
  states. Wait until the new page has painted before exposing it, then composite
  between old and new textures instead of showing blank intermediate state.
- `three-html-render`: native interaction placement is a transform problem, not
  a texture recapture problem. CSS `matrix3d` overlays can move with the camera
  or projection independently from the underlying texture capture lifecycle.
- `three-html-render` polyfill: dirty HTML paint work is coalesced into one
  scheduled RAF paint event, and the paint event reports changed elements. This
  is a better model than treating every render frame as an opportunity to
  rediscover all capture work.
- `html-in-canvas-official/Examples/webgpu-jelly-slider`: use current/history
  texture buffers. A render frame can keep sampling history while the next
  texture resolves, and resize/reallocation is explicit.
- `html-in-canvas-room`: native event routing can be handled by applying the
  correct transform to the source wrapper. Interaction routing should not force
  whole-surface retained texture invalidation.

The shared principle is that visual continuity is a committed scene contract.
Motion state changes every frame; content replacement commits only when coverage
is ready.

## Goal

Refactor GPU Flow retained content around a retained coverage compositor with
these invariants:

- Active zoom, pan, scroll offsets, hit-test geometry, and native island
  placement are current every frame.
- The display frame consumes a batched retained coverage plan for visible
  regions, not per-page descriptor lookups.
- Existing compatible committed regions remain drawable until replacement
  coverage for the same visual region is committed.
- Page descriptors, LOD, DPR, zoom buckets, and source windows are raster work
  parameters. They are not the display compositor's semantic publication unit.
- Coverage queries are spatially indexed by owner and content coordinates.
  Runtime cost should scale with visible regions plus local candidate count, not
  with `target page count * committed page count`.
- Rejected compatibility diagnostics are aggregated in normal frames and only
  expanded under an explicit verbose diagnostic mode.
- Visible true-hole repair is prioritized and bounded. LOD refinement and
  prefetch are cancellable background work.
- Active native islands detach transactionally. Passive retained coverage for an
  edited region is published only after final passive content commits.

This plan does not replace the transactional retained-coverage model. It makes
that model efficient enough to run at frame cadence:

```text
region-planned display publication
+ transactional replacement
+ page-based raster implementation
```

No backward-compatibility layer, dual implementation, migration shim, old-field
alias, or transitional adapter is required. Replace the old page-key display
publication model directly.

## Publication Exit Checks

The refactor is not complete until the old display-publication boundary is gone.
These checks are intentionally concrete so review cannot stop at adding another
helper under the existing page loop:

- `RetainedContentTexturePageManager.prepareFrame()` no longer returns
  `targetDescriptors` as the display publication primitive.
- `resolveRetainedTexturePageCoverage()` is not called from the render-frame
  display publication path.
- `queryVisibleCoverage()` is not called once per retained page descriptor.
- Page descriptor creation runs only inside raster/upload scheduling derived
  from replacement requests, not before display planning.
- Display frame composition consumes `RetainedVisibleCoveragePlan` draw regions
  and true holes, not retained page descriptors or page-key coverage results.

## Post-Refactor Ownership Boundary

- The display planner owns `RetainedVisibleCoveragePlan`, visible draw regions,
  true holes, replacement requests, native-island publications, and bounded
  coverage diagnostics.
- The raster scheduler owns page descriptors, tiling, raster priority, upload
  ordering, and cancellation after replacement requests exist.
- The texture cache owns committed texture resources, resource lifetimes,
  memory accounting, and texture handle lookup.
- The display frame consumes draw regions and texture handles. It must not
  reinterpret page descriptors, page keys, or target descriptor counts as
  display coverage truth.

## Structural Contracts

These contracts are required to prevent the new planner from becoming the old
page loop under different names.

### Visible Region Target Granularity

Visible targets are semantic/content regions, not raster tiles.

```ts
type RetainedRegionTarget = {
  readonly owner: RetainedSemanticOwner;
  readonly contentRect: ContentRect;
  readonly clipRect: ContentRect;
  readonly requestedFidelity: RetainedFidelityTarget;
  readonly reason:
    | "visible"
    | "active-island"
    | "newly-exposed"
    | "refinement";
};
```

The planner may split targets only for clipping, semantic ownership boundaries,
active native island regions, or actual coverage subtraction. Raster tiling
happens only after replacement requests are emitted. It is not acceptable to
generate hundreds of visible region targets that correspond one-for-one with
retained texture pages.

### Typed Compatibility

Compatibility remains a typed result with structured rejection reasons:

```ts
type RetainedCompatibilityResult =
  | {
      readonly kind: "compatible";
      readonly fidelity:
        | "exact"
        | "lower-lod"
        | "previous-grid"
        | "previous-source-rect"
        | "compatible-mapped-region";
      readonly region: RetainedCommittedRegion;
    }
  | {
      readonly kind: "incompatible";
      readonly reason:
        | "surface-mismatch"
        | "owner-mismatch"
        | "content-version-mismatch"
        | "theme-or-font-mismatch"
        | "active-passive-mode-mismatch"
        | "content-to-texture-mapping-mismatch";
    };
```

The planner aggregates rejection reasons in normal frames. It must not silently
draw stale content and must not allocate every rejected rectangle unless verbose
diagnostics are explicitly enabled.

### Coverage Proof

Every visible coverage plan carries an auditable proof:

```ts
type RetainedVisibleCoverageProof = {
  readonly visibleAreaCssPx: number;
  readonly exactCoveredAreaCssPx: number;
  readonly compatibleCoveredAreaCssPx: number;
  readonly trueHoleAreaCssPx: number;
  readonly replacementRequestedAreaCssPx: number;
  readonly rejectedCoverageCountByReason: Readonly<Record<string, number>>;
};
```

Only `trueHoles` from the planner may render fallback visuals. Descriptor
misses, upload backlog, and fidelity misses cannot independently produce
fallback visuals.

### Planner Cost Invariant

Planner cost must be structurally bounded and measured:

```ts
type RetainedCoveragePlanCost = {
  readonly visibleRegionCount: number;
  readonly visibleRegionGroupCount: number;
  readonly spatialQueryCount: number;
  readonly candidateCount: number;
  readonly compatibilityCheckCount: number;
  readonly rejectedSampleCount: number;
  readonly allocatedDiagnosticRectCount: number;
};
```

Development assertions and planner tests should enforce:

- `spatialQueryCount <= visibleRegionGroupCount * small_constant`;
- `allocatedDiagnosticRectCount <= diagnosticSampleCap`;
- `compatibilityCheckCount` is bounded by intersecting local candidates, not by
  page target count;
- `visibleRegionCount` remains semantic-region scale for All Settings-like
  scenes, not raster-tile scale.

These checks are planner contract tests and diagnostics. They are not the
user-facing E2E oracle.

### Legal Coverage Plan Reuse

A previous coverage plan may be reused for motion-only frames only when the
visible semantic region set is unchanged or mappable through the current motion
transform, and every draw region still has a valid content-to-texture mapping
for the current viewport and clip.

If the viewport crosses into newly visible content, the previous plan may still
draw overlapping committed regions, but the planner must account for newly
exposed regions and queue repair. Plan reuse must not hide true holes or stale
active native island geometry.

### Replacement Cancellation Identity

Replacement requests must have cancellation and coalescing identity:

```ts
type RetainedReplacementRequestKey = {
  readonly owner: RetainedSemanticOwner;
  readonly contentRect: ContentRect;
  readonly contentVersion: string;
  readonly fidelityTarget: RetainedFidelityTarget;
};
```

If zoom bucket or target fidelity changes, obsolete refinement requests are
canceled or coalesced before tiling. Visible true-hole and active-island
requests are never starved behind obsolete refinement tiles.

### Eviction Order And Reserves

Eviction policy is a correctness contract:

1. Obsolete superseded offscreen regions.
2. Offscreen prefetch.
3. Near-visible refinement.
4. Near-visible compatible historical coverage.
5. Visible compatible historical coverage only after replacement exists.

```ts
type RetainedCoverageBudget = {
  readonly hardMaxBytes: number;
  readonly visibleCompatibleReserveBytes: number;
  readonly activeIslandReserveBytes: number;
  readonly visibleTrueHoleRepairReserveBytes: number;
  readonly refinementMaxBytes: number;
  readonly prefetchMaxBytes: number;
};
```

Memory pressure must not evict the only compatible visible coverage and expose
a blank region.

## Non-Goals

- Do not tune budgets as the primary fix.
- Do not hide the issue by lowering test thresholds or disabling diagnostics.
- Do not add a heuristic stale-content fallback.
- Do not keep page descriptors as the compositor's authoritative display
  coverage source.
- Do not make tests pass by asserting internal counters such as rejected rect
  count, target descriptor count, or cache size.
- Do not add generator drift tests that only rerun generators and compare output.

## Regression Prevention Requirements

Regression prevention is a first-class requirement for this refactor.

- The first tests must be realistic observed-behavior tests that fail against
  the current issue. They must drive production UI paths and assert frame
  cadence, long-task absence, and visual continuity.
- The failing-first baseline must reproduce this performance failure class:
  interaction-window long tasks, high retained frame duration, and frame gaps in
  the same class as the latest Chrome recording while raster and upload work are
  not the bottleneck. Target descriptor and rejected coverage counts may be
  attached as diagnostics only.
- Implementation-detail tests are allowed only as secondary coverage for pure
  coverage-store, planner, and scheduler contracts. They are not sufficient to
  prove the refactor correct.
- Internal counters such as target descriptor count, rejected coverage count,
  cache size, upload count, and planner query count are diagnostics only. They
  must not be the pass/fail oracle for the user-facing regression.
- Final verification must run the full GPU Flow-related test suite, not only the
  new tests and not only files touched by the refactor.
- Full GPU Flow-related verification includes all GPU Flow retained-content
  Vitest suites, adjacent GPU Flow frame/viewport/interaction suites, and all
  Playwright E2E suites that exercise GPU Flow surfaces, retained content,
  viewport motion, Settings All Settings, and retained/native-island
  interactions.
- Any skipped, quarantined, or flaky GPU Flow-related test must be recorded in
  the `perf/` report with the reason, owner, and follow-up path. Do not silently
  narrow the suite to get a pass.

## Performance Targets

The refactor should target 120 fps-class interaction on capable hardware for
large retained-content scenes comparable to the Settings project's All Settings
page.

The performance tests must cover these workloads:

- canvas panning across a dense retained-content scene;
- zooming in and out across scale buckets;
- retained-section scrolling within large sections;
- mixed pan, zoom, and section-scroll sequences while retained replacement work
  is pending.

The tests should report refresh-rate-aware results instead of assuming every
machine can present at 120 Hz:

- On a 120 Hz-capable browser/display path, p95 RAF interval should be <= 8.5
  ms for steady-state panning, zooming, and retained-section scrolling.
- If the measured environment cannot present at 120 Hz, scale the pass
  threshold to the detected warm-up cadence and still require low variance. A
  60 Hz environment should stay near 16.7 ms p95, not hide 30-50 ms stalls
  behind a lower target.
- Record p99 frame interval, worst frame interval, dropped-frame bursts, and
  long tasks separately from the p95 target.
- Treat any app-caused main-thread long task over 50 ms during the measured
  interaction window as a failure.
- Run each workload after warm-up and during a coverage-repair case. Warm
  steady-state performance should be near the display target; repair cases may
  use a slightly wider budget but must not produce visible blanking or
  multi-frame stalls.

If 120 fps-class performance is proven impossible for a specific scene or
device class, document the measured ceiling in `perf/` with trace evidence,
hardware/browser context, and an explicit fallback budget. Do not silently lower
the target or remove workloads from the suite.

## First Step: Failing Observed-Behavior Tests

Before refactoring implementation code, add tests that reproduce this exact
performance issue and fail against the current implementation.

The tests should drive production UI paths through Playwright or the existing
browser E2E harness. They should use user-visible frame behavior as the pass/fail
oracle:

- Open Settings.
- Switch to All Settings.
- Wait for the retained content to settle.
- Perform the same interaction pattern from the recording:
  - trackpad-like wheel pan bursts;
  - ctrl-wheel zoom-in and zoom-out bursts;
  - retained-section scroll bursts inside large visible sections;
  - rapid mixed zoom and pan over the canvas while All Settings is visible.
- Measure RAF cadence during the active interaction window.
- Capture browser long tasks during the same window.
- Optionally capture screenshots or canvas readback at sample points to ensure
  the view remains visible and does not blank.

Required pass/fail assertions:

- No main-thread long task over 50 ms during the measured interaction window.
- RAF p95 is refresh-rate aware:
  - at 120 Hz, p95 frame interval <= 8.5 ms;
  - at 60 Hz, p95 frame interval near 16.7 ms with low variance;
  - for other detected rates, threshold scales from measured warm-up cadence.
- p99 and worst frame interval are reported separately and must not include
  multi-frame stalls comparable to the recording's 200-292 ms gaps.
- The canvas should not visibly blank during the interaction. Use pixel
  continuity or screenshot comparison against the settled view, not retained
  internal counters.

Allowed diagnostics attached to failures:

- `gpu-flow-frame.durationMs`
- long task entries
- frame gap entries
- retained target descriptor count
- retained rejected coverage count
- coverage query count
- coverage candidate count
- uploaded bytes and upload count

Those diagnostics help explain failures, but they must not be the oracle.

Suggested test files:

- `frontend/tests/e2e/gpu-flow-retained-all-settings-performance.spec.ts`
- shared helper additions under `frontend/tests/e2e/gpuFlowInteractionLatencyProbe.ts`
  only if the existing helper can be extended without making the test
  implementation-specific.

The first commit in the refactor should contain only these failing tests and
their measurement harness.

## Target Architecture

### 1. Retained Coverage Scene Graph

Introduce a retained coverage scene graph owned by GPU Flow retained content.
It should store committed drawable regions by semantic owner and content-space
rect:

```ts
type RetainedCoverageScene = {
  readonly generation: number;
  readonly regionsBySurface: RetainedSpatialIndex<RetainedCommittedRegion>;
  readonly pendingReplacements: RetainedReplacementQueue;
  readonly visibleProtection: RetainedVisibleProtectionSet;
};
```

Committed regions are the display primitive. A committed region owns:

- semantic manifest: surface, document, section, row or region owner, content
  proof, theme/font generation, render mode;
- content-space coverage rect and clip rect;
- texture handle and content-to-texture mapping;
- fidelity metadata: DPR bucket, LOD, page-grid generation, pixel size, zoom
  bucket;
- generation and memory accounting.

This replaces page-key publication as the display contract.

### 2. Batched Visible Coverage Planning

The display frame asks the coverage scene for one plan per frame:

```ts
type RetainedVisibleCoverageRequest = {
  readonly frameId: number;
  readonly viewport: GpuViewportInput;
  readonly visibleRegions: readonly RetainedRegionTarget[];
  readonly activeNativeIslands: readonly RetainedNativeIslandTarget[];
};

type RetainedVisibleCoveragePlan = {
  readonly drawRegions: readonly RetainedDrawRegion[];
  readonly nativeIslandRegions: readonly RetainedNativeIslandPublication[];
  readonly trueHoles: readonly ContentRect[];
  readonly replacementRequests: readonly RetainedReplacementRequest[];
  readonly proof: RetainedVisibleCoverageProof;
  readonly diagnostics: RetainedCoveragePlanDiagnostics;
};
```

The planner must be batched:

- group visible targets by surface/section;
- query spatial indexes once per group;
- evaluate compatibility only against intersecting candidates;
- subtract coverage in region space;
- emit draw regions directly;
- emit replacement requests for uncovered or non-target-fidelity areas.

The planner must not call `queryVisibleCoverage` once per page descriptor.

### 3. Spatial Index And Exact Lookup

Replace full committed-region scans with owner-scoped indexes. Start with a
per-surface owner-scoped exact map plus uniform grid or sweep/grid hybrid, then
graduate to an R-tree only if benchmarks show pathological bucket density:

- exact lookup by stable committed region key for the common case;
- grid or sweep-index lookup for compatible mapped coverage;
- optional per-row sub-index for text-like rows;
- separate indexes for exact target fidelity and compatible historical fidelity;
- aggregate rejected reasons without materializing every rejected rectangle.

The index should support:

- insert committed region;
- remove or retire committed region;
- query intersecting candidates for target rects;
- protect visible committed regions;
- evict by memory budget without evicting the only visible compatible coverage.

Adding an owner-scoped index under the existing per-page display loop is not
sufficient. The spatial store is only complete when the display planner queries
it in batches by visible owner/region group and emits draw regions directly.

### 4. Motion-First Display Pipeline

Split the current frame pipeline into three phases:

1. Motion frame:
   - consume wheel/pan/zoom input;
   - update viewport transform;
   - update hit-test transforms;
   - update native island placement;
   - issue a cheap draw using the last committed coverage plan when possible.

2. Coverage planning frame:
   - batch visible region planning;
   - produce draw regions and replacement requests;
   - never materialize huge rejected rect arrays in normal mode.

3. Capture/upload commit:
   - raster and upload replacement regions under budget;
   - commit them into the coverage scene only after the texture and mapping are
     ready;
   - mark old compatible coverage replaceable only after replacement coverage
     commits.

Motion must not require rebuilding the full retained page target set. During
active interaction, old compatible regions can be sampled through their mapping
proof while replacement work is queued.

Active native island placement comes from current motion geometry. Passive
retained replacement for the affected region is a replacement request. Neither
operation may trigger whole-section coverage invalidation.

### 5. Raster Work Becomes A Derived Task

Page descriptors can still exist as a raster tiling implementation detail, but
they must be derived from replacement requests after display planning:

```ts
type RetainedReplacementRequest = {
  readonly key: RetainedReplacementRequestKey;
  readonly target: RetainedRegionTarget;
  readonly reason:
    | "true-hole"
    | "target-fidelity-missing"
    | "content-dirty"
    | "active-island-detach";
  readonly priority: "interactive" | "visible-hole" | "visible-refinement" | "prefetch";
};
```

The raster scheduler should consume replacement requests, split them into tiles
only as needed for GPU limits, and commit the uploaded regions transactionally.

Do not let LOD refinement produce hundreds of visible scheduler items that are
reconsidered during every active wheel frame. LOD refinement work should be:

- coalesced by visible region;
- cancellable when the target zoom bucket changes;
- deprioritized behind visible true-hole repair and active island completion;
- resumable without forcing display planning to enumerate every tile.

### 6. Diagnostic Model

Normal-frame diagnostics should be compact and bounded:

```ts
type RetainedCoveragePlanDiagnostics = {
  readonly visibleRegionCount: number;
  readonly committedCandidateCount: number;
  readonly exactRegionCount: number;
  readonly compatibleRegionCount: number;
  readonly trueHoleAreaCssPx: number;
  readonly trueHoleRectCount: number;
  readonly rejectedCoverageCountByReason: Readonly<Record<string, number>>;
  readonly sampledRejectedCoverage: readonly RetainedRejectedCoverageSample[];
  readonly cost: RetainedCoveragePlanCost;
  readonly coveragePlanDurationMs: number;
  readonly spatialQueryDurationMs: number;
  readonly compatibilityDurationMs: number;
};
```

Verbose mode may include expanded rejected rectangles, but normal Chrome
recordings must not allocate tens of thousands of rejected rect objects per
frame.

`sampledRejectedCoverage` must be capped in normal frames. The default cap
should be small, such as 20 samples per frame, with full rejected-rectangle
expansion available only through an explicit verbose diagnostic mode.

## Implementation Plan

### 1. Add Failing Observed-Behavior Tests

Add the All Settings zoom/pan performance tests described above.

Also add a small measurement utility if needed:

- detect display cadence from a warm-up RAF sample;
- record active interaction start/end;
- collect RAF intervals, long tasks, and optional screenshot samples;
- export diagnostics on failure.

The baseline report must show that the failing test reproduces the same shape as
the latest recording:

- no input backlog and cheap viewport runtime handling;
- app-caused long task over 50 ms during the interaction window;
- p99 or worst RAF interval showing a multi-frame stall;
- high retained frame duration while raster and upload time are near zero;
- high target descriptor count and rejected coverage count recorded only as
  explanatory diagnostics.

Do not change compositor behavior in this step.

### 2. Add Focused Bench Tests For Coverage Planning Cost

Add a non-oracle benchmark-style test that reproduces the shape of the
recording using production retained coverage APIs:

- hundreds of visible target regions;
- dozens of committed compatible regions;
- high zoom-bucket transition;
- stale/rejected content present.

This test should record before/after numbers for coverage planning duration and
candidate counts. It may fail initially if there is an explicit performance
budget, but user-visible E2E tests remain the required regression gate.

### 3. Define The New Coverage Scene Contracts

Create the owner-level types for:

- committed drawable region;
- visible region target;
- native island target;
- visible coverage plan;
- visible coverage proof;
- replacement request;
- replacement request cancellation key;
- replacement transaction;
- coverage diagnostics;
- coverage plan cost;
- memory/eviction report.

Keep the contracts in the GPU Flow retained-content owner modules. Do not add
parallel frontend aliases in unrelated folders.

### 4. Implement The Spatial Coverage Store

Replace the scan-all coverage store with owner-scoped indexed storage.

Required behavior:

- exact lookup should be O(1) or near O(1);
- compatible lookup should consider only intersecting regions for the same
  semantic owner;
- initial index shape should be `regionsBySurface -> regionsByOwner ->
  exactKeyMap + uniformGridBuckets`, unless the benchmark proves a different
  structure is required;
- rejected reason aggregation should be bounded;
- insert/remove/protect/evict should update the index deterministically;
- eviction order must never remove the only visible compatible coverage before
  replacement coverage exists.

Add focused unit tests for:

- exact coverage lookup;
- mapped compatible coverage;
- row/content-version compatibility;
- aggregate rejected diagnostics;
- structural cost counters for query count, candidate count, compatibility
  check count, and allocated diagnostic rect count;
- visible protection and eviction order.

### 5. Build The Batched Visible Coverage Planner

Add a planner that accepts all visible retained region targets for a display
frame and returns draw regions plus replacement requests.

It should:

- group targets by surface/section;
- query indexes in batches;
- subtract coverage once per visible target;
- produce draw regions directly;
- produce bounded diagnostics;
- produce a coverage proof and planner cost report;
- avoid allocating per-page rejected coverage arrays.

Add tests that compare output to realistic visible-region fixtures. These tests
can inspect data contracts because they are planner unit tests, but they should
not replace the observed-behavior E2E tests.

Planner contract tests must prove the old algorithm did not sneak back:

- spatial query count is bounded by visible region groups;
- allocated diagnostic rect count is capped;
- compatibility checks are bounded by intersecting local candidates;
- visible target count remains semantic-region scale, not raster-tile scale.

Before replacing display publication, record a mid-refactor benchmark result
showing the new planner shape no longer scales with
`target page count * committed page count`. This checkpoint may still fail the
end-to-end user-facing performance target, but it must prove the core coverage
planning cost has moved to visible regions plus local candidate count.

### 6. Replace Display Publication

Update GPU Flow frame rendering so display publication consumes the new
coverage plan. Remove the page-descriptor display publication path directly.

The render path should:

- use current viewport and hit-test transforms every frame;
- reuse the last committed coverage plan when motion-only state changes and the
  visible region set remains mappable;
- request a new coverage plan when visible regions change;
- publish true holes only when no compatible committed region can cover the
  visible target;
- avoid per-frame generation of large desired page descriptor arrays during
  active interaction.

Required code-shape result:

- the display frame receives `drawRegions`, `trueHoles`, native island
  publications, and replacement requests from the planner;
- retained page descriptors are created only after replacement requests reach
  raster/upload scheduling;
- page keys are texture/resource identifiers only, not display coverage
  identities;
- previous coverage plans are reused only for legal motion-only frames with
  mappable visible semantic regions and valid content-to-texture mappings;
- expanded rejected coverage arrays are absent from normal render-frame
  diagnostics.

Do not keep an adapter around the old retained page frame as a compatibility
layer.

### 7. Convert Raster And Upload To Replacement Requests

Move retained raster scheduling behind replacement requests:

- visible true-hole requests first;
- active island completion requests next;
- target-fidelity refinement after visible coverage is stable;
- prefetch last.

Split requests into tiles only inside the raster/upload layer. Tiling should
not leak back into display coverage publication.

Cancellation and coalescing must happen before tiling. Obsolete refinement
requests for previous zoom buckets or superseded fidelity targets should be
canceled before they produce page descriptors or upload work.

Commit replacement regions transactionally:

- begin transaction for target manifest and rect;
- upload texture and mapping;
- commit uploaded region;
- retire superseded region only after replacement commit;
- reject transaction loudly on manifest mismatch, allocation failure, or raster
  failure.

### 8. Native Island Transaction Cleanup

Make active native islands first-class coverage transactions:

- activating an island marks only its region active;
- passive retained coverage under the island remains protected but not shown
  over the active island;
- detach waits for passive committed replacement coverage that reflects the
  final value;
- if passive replacement coverage is not committed at detach time, the native
  island remains visually covering the edited region until replacement coverage
  commits;
- no full retained section invalidation for row focus, hover, or blur.

### 9. Remove Old Page-Key Publication Code

Delete old display-publication-only concepts after the new path is wired:

- page descriptors as display identity;
- per-descriptor exact/compatible/rejected coverage loops;
- normal-frame expanded rejected rect diagnostics;
- old retained page frame publication helpers that are no longer the display
  contract.

Keep tiling helpers only where they are needed by raster/upload.

### 10. Verification And Perf Report

Run the full GPU Flow-related verification set before considering the refactor
complete. Do not stop after the new tests or only the files edited in the
refactor.

Run:

- focused Vitest coverage for retained coverage store/planner/scheduler;
- all existing GPU Flow retained-content Vitest suites;
- all adjacent GPU Flow frame, viewport, interaction, retained-native-island,
  and retained-text-like Vitest suites;
- the new All Settings E2E performance tests;
- all existing Playwright GPU Flow suites, including retained content,
  viewport-motion, Settings/All Settings, and native-island interaction
  coverage;
- `./scripts/quality/check.sh` unless the developer explicitly narrows scope.

Record before/after results in `perf/`:

- latest Chrome recording baseline summary;
- new test warm-up cadence;
- p95/p99/worst frame intervals for panning, zooming, retained-section
  scrolling, and mixed interaction workloads;
- detected refresh cadence and the derived pass thresholds;
- dropped-frame bursts;
- long task count and max duration;
- coverage planning duration;
- `coveragePlanDurationMs` during active zoom/pan in a new Chrome recording of
  the original repro flow;
- coverage candidate count;
- planner cost report: visible region count, spatial query count, compatibility
  check count, rejected sample count, and allocated diagnostic rect count;
- replacement request count;
- upload/raster totals;
- visible true-hole continuity result.

Any skipped or flaky GPU Flow performance test must be recorded in the perf
report with reason, owner, and follow-up path.

## Acceptance Criteria

- The new All Settings zoom/pan tests fail before the refactor and pass after.
- The new large-scene panning, zooming, retained-section scrolling, and mixed
  interaction performance tests meet the 120 fps-class refresh-aware targets, or
  have a documented trace-backed fallback ceiling in `perf/`.
- A new Chrome recording of the original repro shows bounded
  `coveragePlanDurationMs` during active zoom/pan, capped normal-frame rejected
  diagnostic allocation, and no correlation between zoom-bucket transitions and
  multi-frame main-thread stalls.
- No measured interaction long task over 50 ms in the target workload.
- No 200 ms-class frame gaps during All Settings zoom/pan.
- Display publication no longer loops through hundreds of page descriptors and
  scans committed regions for each descriptor.
- `RetainedContentTexturePageManager.prepareFrame()` does not publish
  `targetDescriptors` as display state.
- `resolveRetainedTexturePageCoverage()` is not in the render-frame publication
  path.
- Page descriptors are produced only for raster/upload work derived from
  replacement requests.
- Visible region targets are semantic/content regions and are not raster tiles
  in disguise.
- Coverage plans include an auditable coverage proof, and only planner true
  holes can render fallback visuals.
- Planner cost counters show bounded spatial queries, local-candidate
  compatibility checks, and capped diagnostic allocation.
- Replacement requests are canceled or coalesced by semantic owner, content
  rect, content version, and fidelity target before raster tiling.
- Normal Chrome recordings do not contain tens of thousands of rejected retained
  rect diagnostics for one frame.
- Visible content remains continuous while zooming and panning.
- True-hole repair progresses under bounded budget when compatible coverage is
  unavailable.
- LOD refinement can be canceled or coalesced without invalidating visible
  committed coverage.
- Old page-key display publication is removed, not wrapped.

## Risks And Design Checks

- Spatial indexes must use content-coordinate rects and owner manifests, not
  viewport heuristics.
- Reusing compatible lower-fidelity coverage must always require a valid
  content-to-texture mapping proof.
- Diagnostics must stay bounded by design; verbose expansion should be
  opt-in and clearly labeled.
- The render loop must not wait on raster/upload completion.
- Eviction must be coverage-aware. Memory pressure cannot expose a blank region
  when compatible visible coverage exists.
- The test harness must measure observed browser behavior. Internal retained
  counters are diagnostics only.

## Open Questions

- What bucket size and owner grouping should the first per-surface uniform grid
  use? Start simple with exact lookup plus grid buckets; graduate to an R-tree
  only if the step 2 benchmark shows pathological bucket density.
- Should compatible historical coverage be allowed across zoom buckets only
  while active interaction is in progress, or always when the mapping proof is
  valid? The stricter choice is active-interaction-only plus immediate
  refinement.
- Should the first implementation keep current texture atlas allocation, or
  switch committed regions to stable logical texture handles before planner
  integration? Stable handles are cleaner, but planner batching is the
  immediate performance win.
