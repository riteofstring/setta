# Settings All Settings Viewport Layer Split Rollout Hardening

Date: 2026-03-03
Area: frontend
Branch/Commit: setta.frontend-performance-3 @ 9eaa455c6 (with local rollout-hardening changes during measurement)
Implementation status: **Kept (scoped default-on + kill switch + guardrail)**.

## Goal

Harden the kept viewport layer-split win for production rollout:
- default-on for the validated scope (`settings` project + `All Settings` view),
- keep explicit localStorage kill switch,
- add automated Playwright performance guardrail.

## Change Summary

- Updated flag handling to support explicit override states:
  - `enabled` for `1/true/on`
  - `disabled` for `0/false/off`
  - `unset` for missing/unknown values
- Added scoped default-on behavior when override is unset:
  - project name `settings`
  - active view mode `All Settings`
- Kept localStorage kill switch key:
  - `setta.viewportLayerSplit.enabled`
- Expanded unit tests for:
  - override parsing (`enabled/disabled/unset`)
  - scope default enablement logic
- Updated baseline harness override behavior:
  - `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=1` -> force on
  - `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=0` -> force off
  - unset env var -> remove key (exercise scoped default behavior)
- Added Playwright guardrail spec:
  - `frontend/tests/e2e/settings/settings-all-settings-viewport-layer-split-guardrail.spec.ts`
  - thresholds: `panFps > 80`, `zoomFps > 80`, `startHitch.p95 < 12ms`

## Verification

- Vitest:
  - `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/viewportLayerSplitFlag.test.ts`
  - Result: `1 passed`, `4 tests`.

- Playwright baseline A/B (`3x` each):
  - Control forced off:
    - `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=0 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
  - Enabled forced on:
    - `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
  - Default path (override unset, scoped default expected on):
    - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
    - Result sample: `pan=120.4`, `zoom=102.6`, `viewportLayerSplitEnabled=true`.

- Playwright guardrail:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-viewport-layer-split-guardrail.spec.ts`
  - Result: passed (`panFps=121.0`, `zoomFps=112.1`, `startHitch.p95=5.2ms`, split enabled true).

## Playwright Results (Rollout-Hardening Pass)

Control runs (forced off):
- Run 1: `pan=38.2`, `zoom=34.4`, `start p95=4.6ms`, `stop p95=7.8ms`, `typing=166.51ms`
- Run 2: `pan=37.8`, `zoom=36.7`, `start p95=4.3ms`, `stop p95=8.4ms`, `typing=192.32ms`
- Run 3: `pan=37.9`, `zoom=36.7`, `start p95=4.4ms`, `stop p95=7.8ms`, `typing=180.58ms`

Enabled runs (forced on):
- Run 1: `pan=120.0`, `zoom=119.8`, `start p95=5.3ms`, `stop p95=9.1ms`, `typing=136.20ms`
- Run 2: `pan=119.9`, `zoom=113.1`, `start p95=3.8ms`, `stop p95=8.9ms`, `typing=146.17ms`
- Run 3: `pan=119.8`, `zoom=118.2`, `start p95=5.0ms`, `stop p95=8.8ms`, `typing=140.34ms`

Median comparison:
- Pan FPS: `119.9` vs control `37.9` (**3.16x**)
- Zoom FPS: `118.2` vs control `36.7` (**3.22x**)
- Start hitch p95: `5.0ms` vs control `4.4ms` (higher but low)
- Stop hitch p95: `8.9ms` vs control `7.8ms` (higher but low)
- Typing avg frame: `140.34ms` vs control `180.58ms` (better)

## CDP Supplementary Validation

Scripted control sample (`setta.viewportLayerSplit.enabled=\"0\"`):
- `panFps=43.5`, `zoomFps=34.8`
- `startHitch.p95=8.3ms`
- `viewportLayerSplitEnabled=false`

Scripted enabled sample (override removed -> scoped default-on):
- `panFps=120.0`, `zoomFps=103.4`
- `startHitch.p95=9.5ms`
- `viewportLayerSplitEnabled=true`

Notes:
- CDP typing values were noisy/high in these scripted runs due trace overhead.
- Directional motion throughput result matched Playwright A/B (strong uplift).

Trace artifacts:
- `perf/artifacts/frontend/2026-03-03_viewport-layer-split-rollout-control.trace.json`
- `perf/artifacts/frontend/2026-03-03_viewport-layer-split-rollout-enabled.trace.json`

Visual artifacts:
- `perf/artifacts/frontend/2026-03-03_viewport-layer-split-rollout-control_visual-check.png`
- `perf/artifacts/frontend/2026-03-03_viewport-layer-split-rollout-enabled_visual-check.png`

## Conclusion

- Rollout hardening validated:
  - scoped default-on behavior works,
  - kill switch works,
  - guardrail test passes,
  - large motion gain remains intact.
- This path should stay prioritized; hybrid canvas remains paused unless a later residual gap justifies re-opening it.
