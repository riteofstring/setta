# All Settings Frontend Performance Plan

## Goal
Improve responsiveness for the `Settings` project `All Settings` view with the highest-impact, lowest-complexity frontend changes.

## Clarification
The request text says "backend performance", but the benchmark and measured bottlenecks are in frontend rendering/layout work. This plan targets frontend performance.

## Scope
- In scope:
  - `frontend/src/components/Section/**`
  - `frontend/src/components/Utils/Resizable/**`
  - `frontend/src/state/actions/edgeHandles.ts`
  - `frontend/src/forks/xyflow/core/components/Handle/index.tsx`
  - `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`
  - `frontend/src/state/actions/nodeInternals.ts`
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

### Interaction timings (3-run sample, no CPU throttle)
- `All Settings -> Core`: ~`903 ms` elapsed, ~`404 ms` long-task time
- `Core -> All Settings`: ~`1415 ms` elapsed, ~`1198 ms` long-task time

### Scroll smoothness (synthetic scroll sweep)
- No throttle: average frame ~`22.52 ms` (~44 FPS), `83/98` frames above `16.7 ms`
- 6x CPU throttle: average frame ~`145.82 ms`

### Trace insights
- Forced reflow hotspot during interaction:
  - `getHandleCenter` in `frontend/src/state/actions/edgeHandles.ts` (`37 ms` total reflow in trace)
- Forced reflow hotspot on navigation load:
  - `Resizable2.componentDidMount` (`re-resizable`) (`50 ms` in trace)
- LCP trace:
  - LCP `1505 ms`, with render delay accounting for `1482 ms` (98.5%)

## Prioritized Plan

### 1) Remove unnecessary layout reads in edge-handle updates
Impact: High  
Complexity: Low  
Confidence: High

Changes:
- Remove redundant `updateEdgeHandlePosition(key)` call immediately after `registerEdgeHandle(...)` in [Handle index](../../frontend/src/forks/xyflow/core/components/Handle/index.tsx).
- Guard `recomputeEdgeHandlePositions()` in [EdgeRenderer](../../frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx) when there are no data edges to render.
- Add a lightweight no-op guard in [edgeHandles](../../frontend/src/state/actions/edgeHandles.ts) update paths when no tracked handles/affected sections exist.

Why first:
- Directly tied to measured forced reflow in traces.
- Small, localized edits with low regression risk.

### 2) Avoid mounting `re-resizable` for non-resizable/inactive sections
Impact: High  
Complexity: Low-Medium  
Confidence: High

Changes:
- In [CustomResizable](../../frontend/src/components/Utils/Resizable/CustomResizable.tsx), render a static wrapper (same markup/class contract) when resizing is effectively disabled.
- Mount `ResizableWithScale` only when resize handles are actually enabled.

Why second:
- Navigation trace attributes ~`50 ms` forced reflow to `re-resizable` mount work.
- `All Settings` mounts `42` resizable wrappers (`126` handles), so this is a large startup cost multiplier.

### 3) Eliminate deep clone churn in node internals updates
Impact: Medium-High  
Complexity: Medium  
Confidence: High

Changes:
- Replace `_.cloneDeep(useNodeInternals.getState().x)` with `new Map(...)` in [nodeInternals](../../frontend/src/state/actions/nodeInternals.ts).
- Clone/update only touched node entries; preserve object identity for untouched nodes.

Why third:
- Current deep clone path scales poorly and increases work on every node update cycle.
- This is a straightforward data-structure improvement without behavior changes.

### 4) Add an `All Settings` performance guardrail test
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
- `Core -> All Settings` median interaction time reduced by at least `30%` from current baseline.
- Long-task total during `Core -> All Settings` reduced by at least `40%`.
- `ForcedReflow` insight no longer flags `edgeHandles.ts` as a top offender for this scenario.
- No behavior regressions in:
  - selecting sections
  - resizing sections
  - edge creation/reconnection behavior
  - All Settings content correctness

## Verification Plan
1. Baseline:
- Run the same CDP trace + script measurements used in this investigation.
2. After each priority item:
- Re-run `Core -> All Settings` timing loop and scroll sweep.
- Re-run CDP trace and inspect `ForcedReflow`.
3. Automated:
- Run relevant Vitest suites for modified modules.
- Run Playwright scenario for Settings view interaction/perf guardrails.
4. Record:
- Append before/after numbers under `perf/` in an append-only report.

## Execution Order
1. Priority 1 (edge-handle reflow fixes)
2. Priority 2 (resizable mount gating)
3. Priority 3 (node internals clone reduction)
4. Priority 4 (Playwright perf guardrail + final profiling pass)
