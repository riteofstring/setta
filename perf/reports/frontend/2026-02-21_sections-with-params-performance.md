# Sections With Params Performance (Phases 1-5 Slice)

Date: 2026-02-21
Area: frontend
Branch/Commit: sections-with-params-performance @ d70056bb

## Goal

Reduce pan/render cost in Settings `All Settings` by lowering repeated param filtering work, reducing per-row DOM/painters, and caching expensive dummy-code highlight rendering.

## Scenario

- Entry point: `http://127.0.0.1:3071/settings`
- Steps:
  - Open `All Settings` tab.
  - Keep default zoom/layout for dense params.
  - Pan/translate viewport repeatedly across param-heavy sections.
- Data set: built-in settings project (`42` sections, `697` param rows).
- Browser + OS: Chrome DevTools MCP (local desktop), no CPU/network throttling.
- Notes: dev build; added dev-only helper `window.__settaReadParamsPerfDebugMetrics()` for visibility counts.

Touched code paths:
- `frontend/src/components/Params/ParamDndList.tsx`
- `frontend/src/components/Params/GetParamSwitch.tsx`
- `frontend/src/components/Params/ParamSwitch.tsx`
- `frontend/src/components/Params/ParamContainer.tsx`
- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- `frontend/src/components/Params/GroupContainer.tsx`
- `frontend/src/components/Params/paramsPerfDebug.ts`
- `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx`
- `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`

## Before (baseline)

Source baseline (same project/view) from `docs/plans/sections-with-params-performance-plan.md` investigation:
- Avg frame time: `~25.11ms` (`~39.8 FPS`)
- Hide value column: `~13.66ms` (`~73.2 FPS`)
- Hide full param rows: `~8.34ms` (`~119.9 FPS`)
- Main bottleneck: param/value row paint+compositing, not wheel JS or grid/chrome.

## After

CDP measurements after this slice:
- Dev helper snapshot:
  - `totalSectionCount: 42`
  - `totalParamRowCount: 697`
  - `visibleSectionCount: 36`
  - `visibleParamRowCount: 636`
- Scripted viewport transform sweep (160 frames, no throttling):
  - Avg frame time: `20.59ms` (`48.57 FPS`)
  - p95 frame time: `23.10ms` (`43.29 FPS`)
- Structural pan guardrail (Playwright):
  - No param row DOM churn during pan (`addedParamRows = 0`, `removedParamRows = 0` assertion)
  - Viewport transform/style changes observed during pan interaction
  - Spec passed

## Conclusion

- Improved:
  - Reduced repeated param filter/match work by computing filtered required-id sets once in `ParamDndList` and propagating them through nested param rendering.
  - Added caching for duplicate-index/tree derivations when state snapshots are unchanged.
  - Reduced per-row DOM (removed extra per-row border span in text/password rows; removed nested guide-line helper divs in `ParamContainer`).
  - Added cached dummy highlight output path in `DummyCodeMirror` for unchanged code/language/theme.
- Not yet at target (`<16.7ms` avg) in this measurement slice; additional work is still needed for heavy value-control paint cost.
- Follow-ups:
  - Continue row/control visual simplification in high-density modes.
  - Investigate additional paint isolation and widget-level complexity cuts for value controls.

## Raw Artifacts (local-only)

- `perf/artifacts/frontend/2026-02-21-settings-all-settings-after-params-perf-v2.png`
- `perf/artifacts/frontend/2026-02-21-settings-all-settings-after-params-perf.trace.json`

## Automated Perf Tests

Playwright:
- `frontend/tests/e2e/settings/settings-all-settings-pan-perf.spec.ts`

Vitest:
- `frontend/src/components/Params/getParamSwitchUtils.perf.test.ts`
- `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.test.tsx` (cache reuse behavior)
- `frontend/src/components/Params/getParamSwitchUtils.test.ts`
- `frontend/src/components/Params/paramsPerfDebug.test.ts`

Budgets/assertions added:
- Param pan structural guardrail: no param-row add/remove churn while panning.
- Param filter utility perf smoke budget under strict mode (`SETTA_STRICT_PERF=1`).

## Follow-up (DOM Flattening, same day)

Additional behavior-preserving DOM flattening pass while keeping hover/selection UX:
- removed non-kwarg key wrapper node in `ParamContainer` and let key label node own placement classes.
- removed `display: contents` wrapper in `ParamNameInput`.
- flattened `ResizeHandle` inner structure by replacing a nested bar node with a pseudo-element.

Verification rerun:
- Vitest suite (targeted params/code-mirror coverage): pass.
- Playwright:
  - `frontend/tests/e2e/settings/settings-all-settings-pan-perf.spec.ts` pass
  - `frontend/tests/e2e/params/params-section-scroll.spec.ts` pass

CDP same-scenario measurement (160-frame scripted viewport sweep):
- Avg frame time: `20.38ms` (`49.07 FPS`)
- p95 frame time: `23.30ms` (`42.92 FPS`)

Additional artifact:
- `perf/artifacts/frontend/2026-02-21-settings-all-settings-dom-flattening-v1.png`

## Follow-up (DOM Flattening + Highlight Range Merge, same day)

Additional behavior-preserving pass (steps 1-4):
- removed `ParamNameInput` underline span and moved key-input underline/focus/error border styling onto dummy/real CodeMirror roots.
- simplified nested child wrapper layout in `ParamContainer` from nested grid wrapper to lighter flex wrapper while keeping connector + hover UX.
- reduced row paint complexity by removing always-on row color transitions and using less expensive row hover/outline treatment.
- merged adjacent same-class highlight segments in `DummyCodeMirror` before creating spans.

Verification rerun:
- Vitest targeted suites (including new `DummyCodeMirror` merge tests): pass.
- Playwright:
  - `frontend/tests/e2e/settings/settings-all-settings-pan-perf.spec.ts` pass
  - `frontend/tests/e2e/params/params-section-scroll.spec.ts` pass

CDP same-scenario measurement (`All Settings`, 160-frame scripted viewport sweep, no throttling):
- Previous reference (latest earlier run in this file): avg `20.38ms`, p95 `23.30ms`.
- Run 1: avg `19.94ms` (`50.15 FPS`), p95 `25.00ms` (`40.00 FPS`).
- Run 2: avg `19.83ms` (`50.42 FPS`), p95 `24.60ms` (`40.65 FPS`).
- Run 3: avg `19.97ms` (`50.07 FPS`), p95 `24.70ms` (`40.49 FPS`).
- Aggregate of these 3 runs:
  - avg frame time: `19.92ms` (`50.20 FPS`)
  - p95 frame time (median of run p95s): `24.70ms` (`40.49 FPS`)

Observed density snapshot during this rerun:
- `totalSectionCount: 42`
- `totalParamRowCount: 697`
- `visibleSectionCount: 36`
- `visibleParamRowCount: 636`
- `totalDomNodes: 7,942`

Additional artifacts:
- `perf/artifacts/frontend/2026-02-21-settings-all-settings-dom-flattening-v2.png`
- `perf/artifacts/frontend/2026-02-21-settings-all-settings-dom-flattening-v2.trace.json`

## Follow-up (Switch Thumb Compositing Cleanup, 2026-02-22)

Targeted optimization:
- removed persistent `will-change-transform` from switch-thumb classes and narrowed transitions from `transition-all` to `transition-transform` across:
  - `frontend/src/components/Params/ParamUIs/SwitchInput.tsx`
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx`
  - `frontend/src/components/Panes/Overview/ProjectConfigs.tsx`
  - `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`
  - `frontend/src/components/Panes/UiEditor/QuickInfoConfig/QuickInfoConfig.tsx`

Why:
- CDP what-if experiment showed large gain when switch thumb `will-change` was disabled in dense settings pan (from ~`20.14ms` to ~`14.86ms` avg in a controlled temporary toggle run).

Verification rerun:
- Vitest:
  - `frontend/src/components/Params/ParamUIs/SwitchInput.test.tsx` pass (updated assertion for no `will-change-transform`).
  - targeted Overview/App pane tests pass.
- Playwright:
  - `frontend/tests/e2e/settings/settings-all-settings-pan-perf.spec.ts` pass
  - `frontend/tests/e2e/params/params-section-scroll.spec.ts` pass

CDP same-scenario measurement (`All Settings`, dense viewport, 160-frame scripted sweep, no throttling):
- Density snapshot:
  - `totalSectionCount: 42`
  - `totalParamRowCount: 697`
  - `visibleSectionCount: 36`
  - `visibleParamRowCount: 636`
- Switch density:
  - `button[role='switch']`: `119`
  - switch thumbs with computed `will-change: transform`: `0`
- Runs:
  - Run 1: avg `14.95ms` (`66.89 FPS`), p95 `16.70ms` (`59.88 FPS`)
  - Run 2: avg `15.53ms` (`64.38 FPS`), p95 `16.70ms` (`59.88 FPS`)
  - Run 3: avg `15.44ms` (`64.76 FPS`), p95 `16.70ms` (`59.88 FPS`)
- Aggregate:
  - avg frame time: `15.31ms` (`65.32 FPS`)
  - median p95 frame time: `16.70ms` (`59.88 FPS`)

Comparison against previous latest reference in this file:
- Previous aggregate avg: `19.92ms`
- New aggregate avg: `15.31ms`
- Improvement: `-4.61ms` (~`23.1%` faster average frame time)

Additional artifacts:
- `perf/artifacts/frontend/2026-02-22-settings-all-settings-switch-thumb-will-change-removal-v1.png`
- `perf/artifacts/frontend/2026-02-22-settings-all-settings-switch-thumb-will-change-removal-v1.trace.json`

## Follow-up (Low-Zoom Icon LOD + Pan Style Downgrade, 2026-02-22)

Targeted optimizations:
- Added a lightweight store subscription that writes perf-mode flags to the root canvas container:
  - `data-low-zoom-icons` is enabled when zoom is at/below `0.25`.
  - `data-pane-dragging` mirrors `paneDragging` during pan start/end.
- Added low-detail CSS behavior in project flow styles:
  - hide css.gg icon glyphs in nodes when `data-low-zoom-icons="true"` (layout preserved via `visibility: hidden`).
  - while `data-pane-dragging="true"`, disable transition/animation/shadow/filter on common param/button surfaces.
- Kept behavior and DOM structure unchanged; this is a style/detail-level runtime mode change only.

Touched code paths:
- `frontend/src/forks/xyflow/core/container/flowPerformanceMode.ts`
- `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
- `frontend/src/components/Pages/Project/react-flow-css.css`
- `frontend/tests/e2e/settings/settings-all-settings-pan-perf.spec.ts`

Verification rerun:
- Vitest:
  - `frontend/src/forks/xyflow/core/container/flowPerformanceMode.test.ts` pass
  - `frontend/src/forks/xyflow/core/container/flowPerformanceMode.integration.test.ts` pass
- Playwright:
  - `frontend/tests/e2e/settings/settings-all-settings-pan-perf.spec.ts` pass (now also asserts low-zoom icon hiding and pane-dragging flag toggles)

CDP same-scenario measurement (`All Settings`, dense fit-view transform `translate(659.9px, -77.9px) scale(0.1)`, 160-frame scripted viewport sweep, no throttling):
- Pre-change reference from immediate prior profiling pass in this branch:
  - avg frame time: `~14.90ms`
  - p95 frame time: `~16.70ms`
- Post-change density/flags snapshot:
  - `totalParamRowCount: 697`
  - `visibleParamRowCount: 636`
  - `i.gg* iconCount: 426`
  - hidden `i.gg*` icons at low zoom: `426`
  - `data-low-zoom-icons: true`
- Runs:
  - Run 1: avg `9.61ms` (`104.06 FPS`), p95 `13.40ms` (`74.63 FPS`)
  - Run 2: avg `9.23ms` (`108.31 FPS`), p95 `11.40ms` (`87.72 FPS`)
  - Run 3: avg `9.21ms` (`108.59 FPS`), p95 `11.00ms` (`90.91 FPS`)
- Aggregate:
  - avg frame time: `9.35ms` (`106.95 FPS`)
  - median p95 frame time: `11.40ms` (`87.72 FPS`)

Comparison against pre-change reference:
- Avg frame time improved from `~14.90ms` to `9.35ms` (`-5.55ms`, ~`37.2%` faster).
- p95 frame time improved from `~16.70ms` to `11.40ms` (`-5.30ms`, ~`31.7%` faster).

Additional artifacts:
- `perf/artifacts/frontend/2026-02-22-settings-all-settings-icon-lod-and-pan-style-v1.png`

## Follow-up (No-Icons Experiment, 2026-02-22)

Experiment goal:
- Remove icon rendering from section nodes entirely (no pan/zoom-based behavior).

Implementation:
- Removed flow-performance data-attribute subscription path and its tests:
  - deleted `frontend/src/forks/xyflow/core/container/flowPerformanceMode.ts`
  - deleted `frontend/src/forks/xyflow/core/container/flowPerformanceMode.test.ts`
  - deleted `frontend/src/forks/xyflow/core/container/flowPerformanceMode.integration.test.ts`
  - removed subscription wiring from `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
- Switched to unconditional node-icon suppression in CSS:
  - `frontend/src/components/Pages/Project/react-flow-css.css`
  - `.react-flow .react-flow__node i.gg*` and `.react-flow .react-flow__node svg` now `display: none !important`.
- Updated pan perf guardrail test to assert static icon removal (instead of low-zoom/pan flag toggles):
  - `frontend/tests/e2e/settings/settings-all-settings-pan-perf.spec.ts`

Verification rerun:
- Playwright:
  - `frontend/tests/e2e/settings/settings-all-settings-pan-perf.spec.ts` pass

CDP same-scenario measurement (`All Settings`, dense transform `translate(659.9px, -77.9px) scale(0.1)`, 160-frame scripted viewport sweep, no throttling):
- Density/icon snapshot:
  - `totalParamRowCount: 697`
  - `visibleParamRowCount: 636`
  - node icon elements (`i.gg*` + `svg`): `502`
  - hidden via CSS (`display:none`): `502`
- Runs:
  - Run 1: avg `8.81ms` (`113.48 FPS`), p95 `10.60ms` (`94.34 FPS`)
  - Run 2: avg `8.73ms` (`114.52 FPS`), p95 `10.20ms` (`98.04 FPS`)
  - Run 3: avg `8.77ms` (`114.03 FPS`), p95 `10.20ms` (`98.04 FPS`)
- Aggregate:
  - avg frame time: `8.77ms` (`114.01 FPS`)
  - median p95 frame time: `10.20ms` (`98.04 FPS`)

Comparison against previous section (low-zoom icon LOD + pan style downgrade):
- Previous aggregate avg: `9.35ms`
- New aggregate avg: `8.77ms`
- Additional improvement: `-0.58ms` (~`6.2%` faster average frame time)

Additional artifact:
- `perf/artifacts/frontend/2026-02-22-settings-all-settings-no-icons-v1.png`

## Follow-up (Empty-Circle Icon Placeholder Experiment, 2026-02-22)

Experiment goal:
- Replace removed node icons with lightweight empty-circle placeholders (always on; no pan/zoom gating).

Implementation:
- Updated unconditional node icon style in `frontend/src/components/Pages/Project/react-flow-css.css`:
  - `i.gg*` and node `svg` elements render as `0.75rem` transparent circles (`border: 1.5px solid currentColor`, `border-radius: 9999px`).
  - Suppressed css.gg pseudo-element glyph internals (`::before`/`::after`) and nested `svg` child drawing.
- Updated pan perf guardrail assertions in `frontend/tests/e2e/settings/settings-all-settings-pan-perf.spec.ts`:
  - verifies icon elements are present and styled as placeholders (rather than hidden).
  - verifies placeholder state remains stable across pan interactions.

Verification rerun:
- Playwright:
  - `frontend/tests/e2e/settings/settings-all-settings-pan-perf.spec.ts` pass

CDP same-scenario measurement (`All Settings`, dense transform `translate(659.9px, -77.9px) scale(0.1)`, 160-frame scripted viewport sweep, no throttling):
- Density/icon snapshot:
  - `visibleParamRowCount: 636`
  - icon elements (`i.gg*` + `svg`): `502`
  - placeholder-styled icon elements: `502`
- Runs:
  - Run 1: avg `10.16ms` (`98.41 FPS`), p95 `12.90ms` (`77.52 FPS`)
  - Run 2: avg `10.16ms` (`98.46 FPS`), p95 `12.80ms` (`78.12 FPS`)
  - Run 3: avg `10.02ms` (`99.81 FPS`), p95 `12.60ms` (`79.37 FPS`)
- Aggregate:
  - avg frame time: `10.11ms` (`98.89 FPS`)
  - median p95 frame time: `12.80ms` (`78.12 FPS`)

Comparison:
- vs No-icons experiment:
  - `8.77ms` -> `10.11ms` (`+1.34ms`, ~`15.3%` slower)
- vs earlier pre-icon-optimization dense-pan reference (`~14.90ms`):
  - still faster by about `-4.79ms` (~`32.1%` improvement).

Additional artifact:
- `perf/artifacts/frontend/2026-02-22-settings-all-settings-empty-circle-icons-v1.png`

## Follow-up (Original Icons, Hover-Only Visibility, 2026-02-22)

Experiment goal:
- Restore original icon rendering, but only show node icons when the section is hovered/focused.

Implementation:
- Updated icon CSS in `frontend/src/components/Pages/Project/react-flow-css.css`:
  - default state for node `i.gg*` and node `svg`: `opacity: 0`.
  - reveal state on `.react-flow__node:hover` and `.react-flow__node:focus-within`: `opacity: 1`.
  - removed empty-circle placeholder styling/suppression overrides.
- Updated pan perf guardrail assertions in `frontend/tests/e2e/settings/settings-all-settings-pan-perf.spec.ts`:
  - verifies baseline non-hover icon visibility is zero.
  - verifies icons become visible for the hovered section.
  - verifies non-hover hidden state remains after pan.

Verification rerun:
- Playwright:
  - `frontend/tests/e2e/settings/settings-all-settings-pan-perf.spec.ts` pass

CDP same-scenario measurement (`All Settings`, dense transform `translate(659.9px, -77.9px) scale(0.1)`, 160-frame scripted viewport sweep, no throttling, no hovered node during sampling):
- Density/icon snapshot:
  - `visibleParamRowCount: 636`
  - icon elements (`i.gg*` + `svg`): `502`
  - visible icons during baseline non-hover sampling: `0`
- Runs:
  - Run 1: avg `9.65ms` (`103.57 FPS`), p95 `12.20ms` (`81.97 FPS`)
  - Run 2: avg `9.67ms` (`103.41 FPS`), p95 `12.20ms` (`81.97 FPS`)
  - Run 3: avg `9.44ms` (`105.88 FPS`), p95 `12.00ms` (`83.33 FPS`)
- Aggregate:
  - avg frame time: `9.59ms` (`104.28 FPS`)
  - median p95 frame time: `12.20ms` (`81.97 FPS`)

Comparison:
- vs No-icons experiment (`8.77ms`): `+0.82ms` (~`9.4%` slower).
- vs Empty-circle placeholder experiment (`10.11ms`): `-0.52ms` (~`5.1%` faster).
- vs earlier pre-icon-optimization dense-pan reference (`~14.90ms`): still faster by about `-5.31ms` (~`35.6%` improvement).

Additional artifact:
- `perf/artifacts/frontend/2026-02-22-settings-all-settings-hover-icons-v1.png`
