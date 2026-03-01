# Settings All Settings Param Filter Worker Spike

Date: 2026-03-03
Area: frontend
Implementation status: **Not kept (rolled back after measurement)**.

## Goal

Reduce per-keystroke main-thread cost in section param filtering by moving filter visibility matching to a Web Worker and reusing list-scoped visibility results across nested param rows.

## Implementation Attempted

- Added experiment flag:
  - `setta.paramFilterWorker.enabled`
- Added list-scoped param filter visibility pipeline:
  - worker-based visibility compute (`paramFilterVisibility.worker.ts`),
  - list-level visibility hook/provider,
  - removed nested `GetParamSwitch` filter matching/store-selector work and replaced it with cheap set-membership filtering.
- Added unit coverage for:
  - filter visibility helper,
  - worker flag parsing/resolution.
- Extended existing Playwright baseline harness for deterministic A/B via env override:
  - `PLAYWRIGHT_ENABLE_PARAM_FILTER_WORKER=0|1`.

## Measurement Setup

- Playwright baseline harness (`layer split forced off`):
  - `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=0 PLAYWRIGHT_ENABLE_PARAM_FILTER_WORKER=0 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
  - `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=0 PLAYWRIGHT_ENABLE_PARAM_FILTER_WORKER=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
- CDP supplementary A/B sample on `/settings` -> `All Settings`:
  - scripted pan/zoom/start-stop + typing into visible section filter input,
  - localStorage override toggled and page reloaded between variants.

## Results

Playwright samples:

- Control (`worker=0`) run A:
  - `pan=38.8`, `zoom=36.5`
  - `start p95=3.4ms`, `stop p95=7.9ms`
  - `typing avg frame=157.04ms`
- Experiment (`worker=1`) run A:
  - `pan=38.2`, `zoom=37.0`
  - `start p95=3.4ms`, `stop p95=8.0ms`
  - `typing avg frame=163.28ms`

- Control (`worker=0`) run B:
  - `pan=38.8`, `zoom=36.6`
  - `start p95=3.5ms`, `stop p95=7.9ms`
  - `typing avg frame=160.07ms`
- Experiment (`worker=1`) run B:
  - `pan=38.8`, `zoom=36.9`
  - `start p95=3.3ms`, `stop p95=9.6ms`
  - `typing avg frame=171.71ms`

Computed summary:

- Throughput: near parity.
- Typing: experiment median regressed (`167.50ms` vs control median `158.56ms`).

CDP supplementary samples:

- Control (`worker=0`):
  - `pan=41.0`, `zoom=36.9`
  - `typing avg=266.80ms`, `typing p95=484.90ms`
- Experiment (`worker=1`):
  - `pan=40.8`, `zoom=35.3`
  - `typing avg=271.17ms`, `typing p95=465.90ms`

Interpretation:

- CDP A/B did not show a reliable user-visible typing gain; throughput stayed near parity.

## Conclusion

- This worker-filter spike did **not** meet the performance gain bar.
- No robust pan/zoom improvement and typing regressed in deterministic Playwright A/B.
- Decision: **do not keep** this implementation.
- All production/test code changes from this spike were rolled back; this report is retained as decision history.
