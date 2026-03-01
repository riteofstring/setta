# Settings All Settings Shared Param Filter Visibility Context

Date: 2026-03-03
Area: frontend
Branch/Commit: setta.frontend-performance-3 @ 83f001d23 (with local experiment changes during measurement)
Experimented code paths (reverted):
- `frontend/src/components/Params/ParamDndList.tsx`
- `frontend/src/components/Params/GetParamSwitch.tsx`
- `frontend/src/components/Params/ParamFilterVisibilityContext.tsx`
- `frontend/src/components/Params/paramFilterVisibility.ts`
- `frontend/src/components/Params/paramFilterVisibility.test.ts`

Implementation status: **Not kept** (experiment reverted; report retained for decision history).

## Goal

Reduce per-keystroke filter work by computing param-filter visibility once per pinned/unpinned list and reusing it across nested param rows.

## Change Summary (Experiment)

- Added a list-scoped filter-visibility provider for params.
- Moved `matchSorter` execution from nested `GetParamSwitch` calls to one computation in `ParamDndList` per list.
- Kept nested `GetParamSwitch` filtering as cheap set-membership checks.
- Added unit coverage for path flattening/dedup helper behavior.

## Measurement Setup

- Playwright baseline harness:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
- CDP scripted supplementary sample:
  - `/settings` -> `All Settings`
  - same scripted pan/zoom/start/stop/typing sequence used in prior reports.

## Playwright Results

Control run before patch:
- Throughput: `panFps=37.8`, `zoomFps=36.4`
- Start hitch: `avg=4.15ms`, `p95=4.8ms`, `worst=5.1ms`
- Stop hitch: `avg=3.71ms`, `p95=7.9ms`, `worst=8.2ms`
- Typing: `avgFrameMs=182.18`

Patch run A:
- Throughput: `panFps=37.2`, `zoomFps=34.0`
- Start hitch: `avg=4.08ms`, `p95=4.8ms`, `worst=5.0ms`
- Stop hitch: `avg=3.97ms`, `p95=8.2ms`, `worst=8.3ms`
- Typing: `avgFrameMs=178.87`

Patch run B:
- Throughput: `panFps=37.6`, `zoomFps=35.4`
- Start hitch: `avg=4.45ms`, `p95=5.0ms`, `worst=9.3ms`
- Stop hitch: `avg=4.05ms`, `p95=8.1ms`, `worst=8.3ms`
- Typing: `avgFrameMs=192.72`

Computed summary (patch medians):
- Pan FPS median: `37.4` (below control `37.8`)
- Zoom FPS median: `34.7` (below control `36.4`)
- Typing median: `185.80` (above control `182.18`)

## CDP Supplementary Sample

Patched sample:
- Throughput: `panFps=41.8`, `zoomFps=35.9`
- Start hitch: `avg=7.15ms`, `p95=8.4ms`, `worst=9.3ms`
- Stop hitch: `avg=3.74ms`, `p95=6.8ms`, `worst=7.7ms`
- Typing: `avgFrameMs=260.57`

Interpretation:
- Supplementary CDP sample did not indicate a clear user-visible gain.

## Conclusion

- This shared visibility-context pass was **not kept**.
- While the refactor reduced repeated nested `matchSorter` execution structurally, end-to-end measurements did not show a reliable improvement in this benchmark.

Decision:
- Revert experiment code.
- Keep this report as decision history.
- Continue with alternative non-pan work that reduces global subscription/render fanout or move to the next hybrid proxy redesign spike.

## Verification

- `pnpm -C frontend exec vitest run src/components/Params/paramFilterVisibility.test.ts src/components/Params/GroupContainer.test.tsx`
- Playwright baseline harness runs (values above).
- CDP scripted supplementary sample (values above).
