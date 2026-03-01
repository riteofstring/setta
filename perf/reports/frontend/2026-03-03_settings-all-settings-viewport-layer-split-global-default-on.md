# Settings All Settings Viewport Layer Split Global Default-On

Date: 2026-03-03
Area: frontend
Implementation status: **Kept (global default-on + explicit kill switch)**.

## Goal

Switch viewport layer split from scoped default-on to global default-on, while preserving an explicit local override kill switch for safe rollback.

## Change Summary

- `useViewportLayerSplitEnabled` now resolves as:
  - override `enabled` -> `true`
  - override `disabled` -> `false`
  - override `unset` -> `true` (global default-on)
- Removed scope gating from the runtime decision path.
- Kept localStorage override key:
  - `setta.viewportLayerSplit.enabled`
  - accepted values unchanged:
    - enable: `1/true/on`
    - disable: `0/false/off`
    - anything else/missing: `unset`

## Verification

- Vitest:
  - `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/viewportLayerSplitFlag.test.ts`
  - Result: `1 passed`, `4 tests`.

- Playwright baseline (default path = unset localStorage key):
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
  - Result sample:
    - `pan=120.4`, `zoom=101.3`
    - `start p95=4.0ms`, `stop p95=9.5ms`
    - `viewportLayerSplitEnabled=true`

- Playwright control (forced off):
  - `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=0 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
  - Result sample:
    - `pan=35.0`, `zoom=34.9`
    - `start p95=4.2ms`, `stop p95=17.0ms`
    - `viewportLayerSplitEnabled=false`

- Playwright guardrail:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-viewport-layer-split-guardrail.spec.ts`
  - Result sample:
    - `pan=116.6`, `zoom=88.7`
    - `start p95=3.7ms`
    - `viewportLayerSplitEnabled=true`

## CDP Supplementary Validation

- Control rerun (`setta.viewportLayerSplit.enabled=\"0\"`):
  - `pan=48.0`, `zoom=34.5`, `start p95=8.9ms`
  - `viewportLayerSplitEnabled=false`
- Enabled (`setta.viewportLayerSplit.enabled` removed -> default-on):
  - `pan=118.6`, `zoom=95.7`, `start p95=10.1ms`
  - `viewportLayerSplitEnabled=true`

Trace artifacts:
- `perf/artifacts/frontend/2026-03-03_viewport-layer-split-global-default-control-rerun.trace.json`
- `perf/artifacts/frontend/2026-03-03_viewport-layer-split-global-default-enabled.trace.json`

Visual artifacts:
- `perf/artifacts/frontend/2026-03-03_viewport-layer-split-global-default-control-rerun_visual-check.png`
- `perf/artifacts/frontend/2026-03-03_viewport-layer-split-global-default-enabled_visual-check.png`

Console note:
- Observed existing React 19 warning (`Accessing element.ref was removed in React 19`) during CDP pass; not introduced by this flag change.

## Conclusion

- Global default-on keeps the large motion throughput gain for the benchmarked `Settings -> All Settings` scenario.
- Explicit local kill switch remains available for rollback/debug.
- This removes scope allowlist maintenance and better matches user-created heavy project usage.
