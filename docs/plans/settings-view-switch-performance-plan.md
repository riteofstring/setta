# Settings view switch performance plan

## Goals
- Identify the dominant bottleneck when switching view tabs in the `settings` project.
- Reduce user-visible switch latency (click to stable view) and remove jank.
- Add automated guardrails so regressions are caught in CI.

## Scope
- Focus interaction: switching tabs in the bottom view-mode bar for `/settings`.
- Pipeline in scope:
  1. `route_set_active_view_mode` call from tab click (`frontend/src/components/Pages/Project/ViewModeTabs.tsx`).
  2. Backend active-view-mode mutation + broadcast (`backend/setta/project_state/base_project_manager.py`).
  3. Frontend websocket message handling (`frontend/src/state/actions/websocketReceive.ts`).
  4. Project-state reconciliation + node map rebuild (`frontend/src/state/actions/sectionInfos.ts`).
  5. React Flow node render path (`frontend/src/forks/xyflow/core/container/NodeRenderer.tsx`, `frontend/src/forks/xyflow/core/components/wrapNode.tsx`, `frontend/src/components/Section/Container/SectionContainer.tsx`).

## Current code signals (likely hotspots)
- View switch currently triggers a full project-state broadcast (`_update_and_broadcast_project_state_no_name_validation` -> `broadcast_project_state`) instead of a minimal view-switch payload.
- Websocket send serializes large pydantic payloads via `model_dump_json()` (`backend/setta/websockets/websocket_manager.py`).
- Frontend processes the full snapshot in `processProjectStateUpdateFromBackend`, including node map rebuild and batched updates across multiple stores.
- `createNodesMapFromProjectConfigChildren` and related visibility/layout lookups do repeated section/view-mode scanning.
- Per-node render selectors in `NodeWrapper`/`SectionContainer` do expensive effective-impl access, which can amplify cost when many settings sections are present.
- Settings view modes are grouped tabs with broad visibility changes (`backend/setta/project_state/settings_project.py`), so each switch can change many nodes at once.

## Phase 1: Baseline and observability
1. Repro harness
- Use `/settings` and switch across all tabs (`Core`, `Section Defaults...`, `Param Defaults`, `All Settings`) in a fixed sequence.
- Repeat for at least 20 switches per run.

2. Capture baseline metrics
- CDP (required): record Chrome Performance trace for one full switch sequence.
- React DevTools Profiler: record commit durations and rerender counts during the same sequence.
- Record:
  - click -> first visual response
  - click -> settled (no further long tasks/layout bursts)
  - main-thread long-task count
  - largest scripting block
  - largest rendering/paint block

3. Add temporary instrumentation (behind a debug flag)
- Backend timing around `set_active_view_mode` and `_broadcast_project_state_snapshot`:
  - handler time
  - serialization time
  - payload byte size
- Frontend timing in `receiveMessage` and `processProjectStateUpdateFromBackend`:
  - JSON parse time
  - reconcile time
  - node-map rebuild time
  - store update time
- Keep instrumentation narrowly scoped and removable.

4. Persist baseline
- Append results to `perf/settings-view-switch-performance.md` (append-only, include date/time, environment, run notes).

## Phase 2: Isolate bottleneck by layer
1. Backend vs frontend split
- Compare end-to-end switch latency with backend timings.
- If backend serialization/broadcast dominates: prioritize payload reduction.
- If frontend reconcile/render dominates: prioritize client-side data/render changes.

2. Reconcile vs render split on frontend
- Use performance marks around:
  - message receive
  - `processProjectStateUpdateFromBackend`
  - post-update render settle
- If reconcile is small but render is large: focus on React/DOM path.
- If reconcile is large: focus on state diffing/data-shape updates.

3. Render hot component identification
- React Profiler: rank top components by commit cost during switch.
- Confirm whether `SectionContainer`, `NodeWrapper`, or layout/fit-view paths dominate.

## Phase 3: Fix strategy (priority order)
1. High-impact, low-risk fixes first
- Reduce switch payload scope where possible:
  - Prefer a dedicated "active view mode changed" message payload for frontend, or
  - Apply incremental frontend update for known view-mode fields before full snapshot reconcile.
- Avoid unnecessary work on switch:
  - Skip fit-view and node-dimension refresh when viewport/layout did not require it.
  - Cache/reuse view-mode-derived top-level/visibility lookups during a switch.

2. Rendering-path optimizations
- Minimize expensive per-node selector work during switch:
  - Replace deep/effective-impl selector calls in hot components with narrower precomputed selectors.
  - Ensure stable props/references for node wrappers where possible.
- Confirm no avoidable full remount/remap patterns in node rendering.

3. Settings-project-specific optimizations
- Evaluate whether hidden settings sections can avoid expensive subtree work (not just CSS-hidden).
- Ensure tab switches do not trigger unnecessary data recomputation for non-visible settings sections.

4. Optional deeper change (if still slow)
- Introduce a dedicated backend/frontend protocol path for view-mode switching that sends only:
  - `activeViewModeId`
  - affected `topLevelSections`/visibility/viewport fields
  - op tracking ids
- Keep full snapshot sync as fallback.

## Phase 4: Regression guardrails
1. Playwright performance test
- Extend `frontend/tests/e2e/settings/settings-view-modes.spec.ts` (or add a dedicated perf spec) to:
  - switch tabs in a loop
  - record switch durations with `performance.now()`
  - assert robust threshold (p95 and/or median budget with headroom)

2. Unit/perf test for reconciliation
- Add a focused perf test around `processProjectStateUpdateFromBackend` with a settings-like payload size.
- Assert no major regressions relative to a stable budget.

3. Keep existing behavior coverage
- Re-run and update existing settings view-mode E2E tests:
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts`
  - `frontend/tests/e2e/settings/settings-tab-persistence.spec.ts`
  - `frontend/tests/e2e/settings/view-mode-url-sync.spec.ts`

## Exit criteria
- Measured, repeatable reduction in settings-tab switch latency (target: >=50% improvement from baseline).
- No visible jank during repeated tab switches in CDP traces.
- Performance results appended in `perf/` with before/after comparison.
- New/updated Playwright + perf tests pass and protect against regression.

## Risks / open questions
- Payload reduction may require protocol/schema changes across backend + frontend.
- Timing thresholds in E2E perf tests can be flaky; choose robust budgets and aggregate metrics.
- Need representative machine/environment notes so before/after comparisons remain meaningful.
