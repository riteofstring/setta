# Settings all-sections render performance plan (no virtualization)

## Goal
Improve view-switch performance for the `settings` project while keeping all section content mounted and rendered all the time.

## Hard constraints
- No virtualization/windowing.
- No lazy mount/unmount of section trees based on visibility.
- Preserve existing user-visible behavior and data flow.
- Keep backend/frontend behavior-compatible with current endpoint contracts.

## Baseline and known signals
- Latest measured `All Settings` switch is still ~1.3s-1.5s despite prior improvements.
- `All Settings` DOM scale snapshot:
  - `reactFlowNodes`: `42`
  - `paramRows`: `697`
  - total DOM elements: `9711`
- Backend handler time (~170ms) is not the dominant bottleneck; frontend render/measurement dominates.
- Current hotspot categories:
  1. one-shot large subtree mount work during view switches
  2. repeated synchronous layout measurement across many components
  3. `ResizeObserver`/`MutationObserver` callback fan-out
  4. per-item expensive store derivation in section/param components
  5. deep equality checks (`_.isEqual`) on hot paths

## Success criteria
- Reduce `Core -> All Settings` switch latency by at least 35% from current median baseline under the same machine/worktree conditions.
- Reduce long tasks >50ms during the switch by at least 40%.
- Keep visual behavior unchanged and existing settings workflows passing.
- Add automated perf guardrails so regressions fail CI.

## Measurement protocol (before and after each phase)
1. Use the same switch sequence and harness used in `perf/settings-view-switch-performance.md`.
2. Capture:
- click -> active tab + stable node count
- long-task count and largest long task
- scripting vs rendering split from CDP trace
- React commit count and max commit duration (React Profiler)
3. Append results to `perf/settings-view-switch-performance.md` after every meaningful phase.

## Workstream A: Keep section trees persistent across tab switches
### Problem
`AreaSwitch`/view-mode toggles cause large mount bursts when many sections become visible.

### Plan
1. Refactor section area rendering so section subtrees remain mounted regardless of active view mode.
2. Replace mount/unmount switching with visibility/state gating that does not destroy subtree instances.
3. Ensure hidden-area handling does not trigger unnecessary measurement writes.

### Primary files
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
- `frontend/src/components/Section/Container/SectionContainer.tsx`

### Acceptance checks
- View switch no longer produces large mount spikes in React Profiler.
- DOM node count stays stable across tab switches (except expected edge cases).

## Workstream B: Centralize and batch layout measurement
### Problem
Section header/kwargs/search/group components trigger repeated synchronous read/write layout work.

### Plan
1. Introduce a shared frame scheduler for layout work:
- phase 1: collect/read measurements
- phase 2: apply state writes
2. Migrate per-component ad hoc measurement logic to the scheduler.
3. Enforce one measurement pass per frame for section-level UI.

### Primary files
- `frontend/src/components/Section/Header/SectionHeader.tsx`
- `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
- `frontend/src/components/Section/SectionParts/Search.tsx`
- `frontend/src/components/Params/GroupContainer.tsx`
- new utility (proposed): `frontend/src/utils/perf/layoutFrameScheduler.ts`

### Acceptance checks
- Fewer forced sync-layout events in CDP trace.
- Lower scripting+rendering time during `All Settings` switch.

## Workstream C: Collapse observer fan-out for params/groups
### Problem
`GroupContainer` observer callbacks repeatedly rescan many rows and recompute totals.

### Plan
1. Replace query-and-scan loops with incremental row-height tracking.
2. Coalesce `ResizeObserver` + `MutationObserver` updates into one per-frame reconciliation.
3. Make row registration explicit so updates affect only changed rows.

### Primary files
- `frontend/src/components/Params/GroupContainer.tsx`
- related param-row components that emit height changes

### Acceptance checks
- Observer callback count and total callback time drop materially in traces.
- Param area min-height logic remains behaviorally identical.

## Workstream D: Slim selectors and derived data in hot paths
### Problem
Section/param components derive expensive values repeatedly from large global state.

### Plan
1. Precompute view-mode and effective-impl lookup maps once per relevant state revision.
2. Feed section/param components with narrow, stable primitives (ids/flags/version numbers) instead of deep objects.
3. Replace hot-path deep equality checks with:
- referentially stable selector outputs
- shallow equality where possible
- explicit revision counters for expensive maps

### Primary files
- `frontend/src/components/Section/Container/SectionContainer.tsx`
- `frontend/src/components/Params/ParamContainer.tsx`
- `frontend/src/components/Section/Container/ContainerWrappers.tsx`
- `frontend/src/state/actions/sectionInfos.ts`
- `frontend/src/state/*` selectors/utilities touched by these components

### Acceptance checks
- Fewer re-renders per switch for section/param components.
- Reduced CPU time spent in selector/equality logic.

## Workstream E: DOM/CSS cost reduction without changing UX
### Problem
Large DOM and style complexity increase layout and paint cost even when behavior is correct.

### Plan
1. Reduce wrapper depth in section/param markup where safe.
2. Add containment boundaries (`contain`) on expensive subtree roots where layout dependencies allow it.
3. Audit and minimize expensive repeated styles in dense lists (shadows/outlines/complex effects), preserving appearance as closely as possible.
4. Remove non-essential transition/animation work during tab switch if currently present.

### Primary files
- `frontend/src/components/Section/Container/SectionContainerCore.tsx`
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
- `frontend/src/components/Params/*.tsx`
- relevant CSS modules/global style files

### Acceptance checks
- Rendering/paint blocks shrink in CDP traces.
- No visual regression in section layout and controls.

## Workstream F: Automate regression protection
### Plan
1. Add/extend Playwright performance coverage for settings tab switching at large scale.
2. Add unit/integration tests for:
- scheduler coalescing guarantees
- selector stability/revision behavior
- observer batching behavior
3. Keep behavior tests for view-mode switching and URL sync green.

### Primary files
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`
- `frontend/tests/e2e/settings/view-mode-url-sync.spec.ts`
- new/updated Vitest files near touched components/state modules

### Acceptance checks
- Perf guardrails are stable enough for CI (median/p95 budget approach, not fragile single-sample timing).

## Execution order (recommended)
1. Instrumentation refresh and baseline capture.
2. Workstream A (persistent section trees).
3. Workstreams B + C (measurement/observer batching).
4. Workstream D (selector + derivation slimming).
5. Workstream E (DOM/CSS containment simplification).
6. Workstream F (automated perf guardrails finalization).

## Risk management
- Risk: persistent mounting may increase steady-state memory.
  - Mitigation: track memory snapshots before/after and ensure no runaway growth.
- Risk: containment can break sizing/layout dependencies.
  - Mitigation: apply incrementally per subtree with targeted visual checks.
- Risk: perf test flakiness.
  - Mitigation: use aggregated metrics (median/p95 over loops), warmups, and wide-enough thresholds.

## Deliverables
- Code changes across the workstreams above.
- Updated perf report entries in `perf/settings-view-switch-performance.md` for each phase.
- Playwright/Vitest coverage updates for behavior + performance guardrails.
- Final before/after summary with concrete numbers and trace notes.
