# Settings All Settings Transform Update Fanout RAF-Throttle Spike

Date: 2026-03-03
Area: frontend
Implementation status: **Not kept (rolled back after measurement)**.

## Goal

Reduce per-interaction transform update fanout by throttling `reactFlow.transform` store writes to one commit per animation frame, while flushing the final transform at interaction end.

## Implementation Attempted

- Added an experiment flag: `setta.viewportTransformRaf.enabled`.
- In `ZoomPane`, replaced per-zoom-event `useReactFlow.setState({ transform })` with RAF-scheduled commits.
- Added explicit flush on interaction end.
- Extended the baseline harness to force this experiment on/off for deterministic A/B.

## Measurement Setup

- Playwright baseline harness (`layer split forced off`):
  - `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=0 PLAYWRIGHT_ENABLE_VIEWPORT_TRANSFORM_RAF=0 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
  - `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=0 PLAYWRIGHT_ENABLE_VIEWPORT_TRANSFORM_RAF=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
- CDP supplementary scripted pan/zoom/start-stop sample on `/settings` `All Settings`, with localStorage override toggled and page reload between variants.

## Results

Playwright samples:

- Control (`RAF=0`) run A:
  - `pan=37.3`, `zoom=36.0`
  - `start p95=3.8ms`, `stop p95=8.3ms`
  - `typing avg frame=177.03ms`
- Experiment (`RAF=1`) run A:
  - `pan=37.6`, `zoom=35.5`
  - `start p95=3.7ms`, `stop p95=29.4ms`
  - `typing avg frame=179.99ms`

- Control (`RAF=0`) run B:
  - `pan=37.2`, `zoom=35.3`
  - `start p95=3.9ms`, `stop p95=8.6ms`
  - `typing avg frame=187.10ms`
- Experiment (`RAF=1`) run B:
  - `pan=35.4`, `zoom=35.3`
  - `start p95=3.5ms`, `stop p95=27.4ms`
  - `typing avg frame=175.39ms`

CDP supplementary samples:

- Control (`RAF=0`):
  - `pan=43.1`, `zoom=34.3`
  - `start p95=6.6ms`, `stop p95=7.5ms`
- Experiment (`RAF=1`):
  - `pan=39.1`, `zoom=34.9`
  - `start p95=6.7ms`, `stop p95=24.5ms`

## Conclusion

- Throughput stayed near parity, but stop-hitch regressed materially and consistently when RAF throttling was enabled.
- This fails the no-hitch requirement and fails the motion hitch guardrails.
- Decision: **do not keep** this approach.
- All implementation code and test harness changes for this spike were rolled back; report retained for decision history.
