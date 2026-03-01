# Settings All Settings Viewport Layer Split Spike

Date: 2026-03-03
Area: frontend
Branch/Commit: setta.frontend-performance-3 @ 1c3fadbde (with local experiment changes during measurement)
Experimented code paths (kept, feature-flagged):
- `frontend/src/forks/xyflow/core/container/Viewport.tsx`
- `frontend/src/forks/xyflow/core/container/viewportLayerSplitFlag.ts`
- `frontend/src/forks/xyflow/core/container/viewportLayerSplitFlag.test.ts`
- `frontend/src/forks/xyflow/core/styles/style.css`
- `frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`

Implementation status: **Kept (feature-flagged)**.

## Goal

Isolate and measure the simple structural change observed in prior hybrid experiments:
- pre-mount a dedicated viewport DOM wrapper layer,
- no canvas proxy,
- no motion state machine,
- no `ZoomPane` interaction lifecycle hooks.

## Change Summary

- Added local-storage flag:
  - key: `setta.viewportLayerSplit.enabled`
  - accepted truthy values: `1`, `true`, `on`
- In `Viewport`, when enabled:
  - wrap heavy flow children in `.setta-viewport-dom-layer`
  - expose `data-viewport-layer-split` for deterministic verification.
- Added CSS for enabled layer split:
  - absolute inset layer with `contain: paint`.
- Added baseline harness A/B toggle:
  - `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=1` sets the local-storage key.
  - default/off path explicitly removes the key.
- Added focused unit test for flag parsing.

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/viewportLayerSplitFlag.test.ts`
  - `1 passed`, `2 tests`.
- Playwright A/B baseline runs (`3x` each):
  - Control:
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
  - Enabled:
    - `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`

## Playwright Results (3x Control vs 3x Enabled)

Control runs (flag off):
- Run 1: `pan=36.6`, `zoom=35.0`, `start p95=4.1ms`, `stop p95=8.0ms`, `typing=170.62ms`
- Run 2: `pan=37.5`, `zoom=34.9`, `start p95=3.6ms`, `stop p95=8.2ms`, `typing=180.26ms`
- Run 3: `pan=37.8`, `zoom=34.8`, `start p95=3.7ms`, `stop p95=8.6ms`, `typing=191.06ms`

Enabled runs (flag on):
- Run 1: `pan=120.7`, `zoom=117.1`, `start p95=3.6ms`, `stop p95=9.2ms`, `typing=146.59ms`
- Run 2: `pan=120.7`, `zoom=115.4`, `start p95=3.6ms`, `stop p95=9.0ms`, `typing=155.48ms`
- Run 3: `pan=120.5`, `zoom=113.6`, `start p95=3.6ms`, `stop p95=8.7ms`, `typing=165.56ms`

Median comparison:
- Pan FPS: `120.7` vs `37.5` (**3.2x**)
- Zoom FPS: `115.4` vs `34.9` (**3.3x**)
- Start hitch p95: `3.6ms` vs `3.7ms` (slightly better)
- Stop hitch p95: `9.0ms` vs `8.2ms` (slightly worse, still low)
- Typing avg frame: `155.48ms` vs `180.26ms` (better)

## CDP Supplementary Validation

Scripted sample under `http://127.0.0.1:3003/settings`:
- Control (`viewportLayerSplitEnabled=false`):
  - `panFps=28.0`, `zoomFps=27.4`
- Enabled (`viewportLayerSplitEnabled=true`):
  - `panFps=120.2`, `zoomFps=102.5`

Trace artifacts:
- `perf/artifacts/frontend/2026-03-03_viewport-layer-split_control.trace.json`
- `perf/artifacts/frontend/2026-03-03_viewport-layer-split_enabled.trace.json`

Visual check artifacts:
- `perf/artifacts/frontend/2026-03-03_viewport-layer-split_control_visual-check.png`
- `perf/artifacts/frontend/2026-03-03_viewport-layer-split_enabled_visual-check.png`

## Conclusion

- This simple structural layer split delivers a clear, repeatable step-change in pan/zoom throughput without introducing hybrid canvas complexity.
- The spike is worth keeping behind a feature flag and should be prioritized ahead of further hybrid canvas work.
