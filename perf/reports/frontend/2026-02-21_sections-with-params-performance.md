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
