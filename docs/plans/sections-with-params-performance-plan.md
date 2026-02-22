# Sections With Parameters Performance Plan

## Why This Replaces The Old Pan/Zoom Focus

`docs/plans/pan-zoom-performance-plan.md` focused on grid/background/chrome paint. Current profiling on the Settings project (`All Settings` view) shows the dominant cost is parameter content rendering, especially parameter value controls.

## Investigation Summary (2026-02-21)

Scenario used:
- Settings project, `All Settings` view.
- 42 sections.
- 697 parameter rows.
- ~9,711 DOM nodes.
- Zoomed interaction around parameter-dense sections (`~316` visible rows in viewport).

Measured signals:
- Wheel event dispatch JS cost is low:
  - ~`0.24ms` avg per event (`~0.5ms` p95).
- DOM mutation activity during pan is minimal:
  - Mutations are almost entirely `style` changes on `.react-flow__viewport`.
  - No meaningful subtree DOM churn while panning.
- Pan frame time is dominated by rendered parameter content:
  - Baseline (dense viewport): `~25.11ms` avg frame (`~39.8 FPS`).
  - Hide parameter value column only: `~13.66ms` (`~73.2 FPS`).
  - Hide full parameter rows: `~8.34ms` (`~119.9 FPS`).
  - Hide grid background: no meaningful improvement (`~24.99ms`).
  - Flatten section chrome (outline/shadow/radius): no meaningful improvement (`~25.25ms`).

Conclusion:
- Primary bottleneck is raster/compositing cost of parameter-heavy section internals, especially value/input widgets.
- Grid/chrome tuning alone will not materially solve this.

## Likely Code Hotspots

- Heavy row/value DOM:
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamItems/ParamInput.tsx`
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- Large list rendering and derived data work:
  - `frontend/src/components/Params/GroupContainer.tsx`
  - `frontend/src/components/Params/ParamDndList.tsx`
  - `frontend/src/components/Params/GetParamSwitch.tsx`
- Expensive value rendering paths (text/code controls):
  - `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx`
  - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`

## Plan

### Phase 1: Baseline + Guardrails

1. Add an append-only perf note in `perf/` with:
   - scenario description,
   - visible row counts,
   - frame-time/FPS measurements for baseline and key toggles.
2. Add a reproducible Playwright perf check for `All Settings` pan behavior (guardrail style, not strict micro-timing).
3. Add a lightweight debug helper (dev-only) that reports visible section/param-row counts during perf runs.

### Phase 2: Preserve Behavior, Reduce Paint Cost

Behavior requirement for all phases below:
- Keep current UX model: all parameters remain visible in sections at all times.
- Do not introduce preview-only modes, pan-only simplification, or activation-triggered hydration.

1. Add targeted containment/compositing improvements on existing parameter containers/rows (`contain`, compositing hints where they are proven to help).
2. Reduce expensive visual work in param rows while preserving current look and interactions.
3. Validate each CSS/rendering change against the same dense pan scenario before keeping it.

### Phase 3: Simplify Parameter DOM Shape (No UX Change)

1. Flatten wrapper structure in `ParamContainer`/`ParamInput` render paths where markup is redundant.
2. Keep current row layout and controls, but lower node count per row.
3. Re-profile after each sub-step to avoid “refactor without measurable gain”.

### Phase 4: Optimize Existing Value Renderers

1. Optimize `DummyCodeMirror` rendering/caching to reduce repeated parse/highlight work for unchanged inputs.
2. Reduce avoidable per-row work in `ParamUI` switching and control wrappers.
3. Keep control behavior identical (same visible controls, same editing flows, same keyboard/mouse behavior).

### Phase 5: Selector/Computation Cleanup For Interaction

1. Memoize filter and mapping work in `GetParamSwitch` (avoid recompute churn).
2. Cache duplicate-index/tree derivation in `ParamDndList` for unchanged section snapshots.
3. Remove repeated per-render derivations where identical data is computed in multiple selectors.

## Verification Targets

For the Settings `All Settings` dense pan scenario:
- Bring average frame time under `16.7ms` (60 FPS target) on the same machine/profile used for baseline.
- Keep wheel-handler JS overhead low (no regression over current sub-millisecond dispatch cost).
- Confirm no behavior regressions for:
  - parameter editing,
  - pinned/unpinned sections,
  - drag-and-drop of params,
  - search/filter in parameter lists.

## Rollout Strategy

1. Land Phase 2 first behind a temporary feature flag for quick validation.
2. If results are strong and behavior is stable, enable by default.
3. Then proceed with Phases 3-5 in small measurable slices.
4. Keep perf reports append-only in `perf/` for each phase.
