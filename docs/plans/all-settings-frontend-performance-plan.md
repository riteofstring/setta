# All Settings Frontend Performance Plan

## Goal
Improve responsiveness for the `Settings` project `All Settings` view with the highest-impact, lowest-complexity frontend changes.

## Clarification
The request text says "backend performance", but the benchmark and measured bottlenecks are in frontend rendering/layout work. This plan targets frontend performance.

## Status
- Implemented:
  - Priority 1 from the prior plan (edge-handle no-op guards + redundant update removal).
- Investigated and de-prioritized:
  - `re-resizable` mount gating (prior Priority 2): negligible startup gain with clear lock/unlock regressions in our benchmark.
  - `nodeInternals` deep-clone reduction (prior Priority 3): measurable in isolation, but negligible in the `Core -> All Settings` interaction at current node counts.

## Scope
- In scope:
  - `frontend/src/components/Section/**`
  - `frontend/src/components/Utils/Resizable/**`
  - `frontend/src/state/actions/edgeHandles.ts`
  - `frontend/src/forks/xyflow/core/components/Handle/index.tsx`
  - `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Section/Header/SectionHeader.tsx`
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - `frontend/src/state/hooks/sectionSizes.ts`
  - `frontend/src/forks/xyflow/core/hooks/useViewportHelper.ts`
  - Performance guardrail tests for the `All Settings` scenario
- Out of scope:
  - Backend API/query performance
  - Visual/UX redesign of settings pages
  - Broad architectural rewrites (full canvas virtualization rewrite)

## Investigation Summary (CDP)
Benchmark context: `http://127.0.0.1:3054/settings`, `Settings` project, `All Settings` tab.

### Measured deltas (`Core` vs `All Settings`)
- Total DOM elements: `3696` -> `9715` (`+162.9%`)
- Rendered section containers: `5` -> `42`
- Buttons: `135` -> `612`
- Form inputs: `46` -> `126`
- Draggable nodes: `311` -> `744`
- JS heap used: `192.4 MB` -> `215.2 MB`

### Interaction timings
- Post Priority-1 reference from `perf/all-settings-edge-handle-optimizations.md`:
  - `All Settings -> Core`: ~`903 ms` elapsed, ~`393 ms` long-task total
  - `Core -> All Settings`: ~`1335 ms` elapsed, ~`1125 ms` long-task total

### Scroll smoothness (synthetic scroll sweep)
- No throttle: average frame ~`22.52 ms` (~44 FPS), `83/98` frames above `16.7 ms`
- 6x CPU throttle: average frame ~`145.82 ms`

### Updated trace + runtime instrumentation findings
- CDP `DOMSize` insight (`Core -> All Settings` trace window):
  - Style recalculation event: `1376 ms` with `6151` elements affected.
  - Largest child set: `.section-args-nested ...` container with `62` children.
- Layout-read instrumentation during `Core -> All Settings` (3 runs, stable counts):
  - `getBoundingClientRect`: `477` calls
    - `244` from `frontend/src/forks/xyflow/core/hooks/useViewportHelper.ts`
    - `222` from `frontend/src/state/actions/edgeHandles.ts`
  - `getComputedStyle`: `407` calls
    - `111` from `SectionHeader.tsx`
    - `111` from `KwargsControls.tsx`
    - `109` from `GroupContainer.tsx`
    - `74` from `re-resizable`
  - `offsetHeight`: `1056` reads
    - `792` from `GroupContainer.tsx`
    - `111` from `SectionHeader.tsx`
    - `111` from `KwargsControls.tsx`
- Temporary height state churn (`useTemporaryMiscState.setState`) during one `Core -> All Settings` transition:
  - Total calls: `629`
  - Callsite split:
    - `GroupContainer.tsx`: `333`
    - `SectionHeader.tsx`: `148`
    - `KwargsControls.tsx`: `148`
- Dead-measurement signal:
  - `pinned-params-area-height-*` and `unpinned-params-area-height-*` keys are produced in `GroupContainer.tsx`.
  - Repo search shows no consumers outside `GroupContainer.tsx` and constants declarations.

## Prioritized Plan

### 1) Remove dead pinned/unpinned param-area height measurement pipeline
Impact: High  
Complexity: Low  
Confidence: High

Changes:
- In [GroupContainer](../../frontend/src/components/Params/GroupContainer.tsx), remove the `useMeasuredParamAreaMinHeight(...)` tracking for:
  - `getPinnedParamsAreaHeightKey(sectionId)`
  - `getUnpinnedParamsAreaHeightKey(sectionId)`
- Delete related constants/helpers if unused after removal.
- Keep the still-used `paramsFixedHeight` path.

Why first:
- Currently responsible for a large portion of mount work and state churn.
- Eliminates an apparently dead measurement pathway with low behavior risk.

### 2) Reduce temporary height state churn with batched updates
Impact: High  
Complexity: Low-Medium  
Confidence: High

Changes:
- Introduce a shared frame-batched writer for temporary height keys used by:
  - [GroupContainer](../../frontend/src/components/Params/GroupContainer.tsx)
  - [SectionHeader](../../frontend/src/components/Section/Header/SectionHeader.tsx)
  - [KwargsControls](../../frontend/src/components/Section/SectionParts/KwargsControls.tsx)
- Coalesce multiple per-section writes into one `setState` call per frame.
- Keep strict no-op guards for unchanged values.

Why second:
- Current transition emits ~`629` temporary-state writes.
- Batching should reduce store update overhead and downstream selector/re-render pressure without UX changes.

### 3) Trim layout reads in section height measurers
Impact: Medium-High  
Complexity: Medium  
Confidence: High

Changes:
- In [SectionHeader](../../frontend/src/components/Section/Header/SectionHeader.tsx) and [KwargsControls](../../frontend/src/components/Section/SectionParts/KwargsControls.tsx):
  - remove repeated `getComputedStyle(...)` margin reads from every ResizeObserver callback.
  - prefer direct measured box size (`ResizeObserverEntry`/`getBoundingClientRect`) and static margin handling.
- In [GroupContainer](../../frontend/src/components/Params/GroupContainer.tsx):
  - cache fixed-element margin values once per observed element instead of recomputing on every measure pass.
  - avoid repeated full row scans where possible while preserving exact behavior.

Why third:
- Directly targets the measured `getComputedStyle` + `offsetHeight` hotspots.
- Reduces forced style/layout work in the hottest mounting path.

### 4) Cache viewport origin during edge-handle recompute passes
Impact: Medium  
Complexity: Low-Medium  
Confidence: Medium-High

Changes:
- Extend the flow-position conversion path so edge-handle update loops can reuse one viewport origin read per pass instead of calling `domNode.getBoundingClientRect()` per handle.
- Apply in [edgeHandles](../../frontend/src/state/actions/edgeHandles.ts) and [useViewportHelper](../../frontend/src/forks/xyflow/core/hooks/useViewportHelper.ts) with behavior-preserving tests.

Why fourth:
- `useViewportHelper.ts` still accounts for `244` `getBoundingClientRect` calls in the measured transition.
- This is localized and should reduce layout-read volume.

### 5) Add an `All Settings` performance guardrail test
Impact: Medium  
Complexity: Medium  
Confidence: High

Changes:
- Add Playwright perf scenario for `Core -> All Settings` and record:
  - transition elapsed time
  - long-task count/total via `PerformanceObserver`
  - DOM element count
- Add a non-flaky regression budget based on current baseline + margin.

Why fourth:
- Prevents regressions after improvements land.
- Keeps optimization effort focused on real user interactions.

## Acceptance Criteria
- `Core -> All Settings` long-task total reduced by at least `25%` from current post-Priority-1 baseline (`~1125 ms` median).
- Temporary height state writes during one `Core -> All Settings` transition reduced by at least `60%` from current (`629` calls).
- `getComputedStyle` + `offsetHeight` reads from `GroupContainer.tsx`, `SectionHeader.tsx`, and `KwargsControls.tsx` reduced by at least `50%` in the same instrumentation script.
- No behavior regressions in:
  - selecting sections
  - resizing sections
  - edge creation/reconnection behavior
  - All Settings content correctness

## Verification Plan
1. Baseline:
- Run the same CDP trace + instrumentation used in this investigation:
  - DOM/style insight
  - layout-read callsite counters
  - temporary height write counters
2. After each priority item:
- Re-run `Core -> All Settings` timing loop and long-task collection.
- Re-run CDP trace and inspect `DOMSize`/style recalculation impact.
- Re-run layout-read + temporary-state-write instrumentation scripts.
3. Automated:
- Run relevant Vitest suites for modified modules.
- Run Playwright scenario for Settings view interaction/perf guardrails.
4. Record:
- Append before/after numbers under `perf/` in an append-only report.

## Execution Order
1. Priority 1 (remove dead pinned/unpinned height measurements)
2. Priority 2 (batch temporary height state writes)
3. Priority 3 (trim header/kwargs/group layout reads)
4. Priority 4 (cache viewport origin in edge-handle recomputes)
5. Priority 5 (Playwright perf guardrail + final profiling pass)
