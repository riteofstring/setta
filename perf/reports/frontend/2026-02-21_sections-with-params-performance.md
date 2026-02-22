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
