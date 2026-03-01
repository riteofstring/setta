# Settings All Settings Viewport Content-Visibility Spike

Date: 2026-03-03
Area: frontend
Implementation status: **Not kept (rolled back).**

## Goal

Evaluate whether browser-level occlusion (`content-visibility: auto`) can provide a fundamental pan/zoom gain without introducing start/stop hitching or interaction-mode switches.

## Spike Summary

A feature-flagged experiment was implemented and benchmarked:
- localStorage flag key: `setta.viewportContentVisibility.enabled`
- viewport attribute wiring: `data-viewport-content-visibility`
- CSS path: apply `content-visibility: auto` to section resizable roots under React Flow nodes
- baseline harness A/B control support:
  - `PLAYWRIGHT_ENABLE_VIEWPORT_CONTENT_VISIBILITY=0|1`

The spike was then fully rolled back after measurement.

## Playwright A/B (clean sequential runs)

Common command shape:
- `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=0 PLAYWRIGHT_ENABLE_VIEWPORT_CONTENT_VISIBILITY=<0|1> ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`

Run pair A:
- Control (`0`):
  - `panFps=38.1`, `zoomFps=36.6`
  - `start p95=4.7ms`, `stop p95=8.0ms`
  - `typing avg=180.78ms`
- Experiment (`1`):
  - `panFps=33.9`, `zoomFps=29.5`
  - `start p95=3.7ms`, `stop p95=8.0ms`
  - `typing avg=184.54ms`

Run pair B:
- Control (`0`):
  - `panFps=37.9`, `zoomFps=36.4`
  - `start p95=4.6ms`, `stop p95=7.8ms`
  - `typing avg=162.20ms`
- Experiment (`1`):
  - `panFps=33.6`, `zoomFps=30.3`
  - `start p95=3.7ms`, `stop p95=8.4ms`
  - `typing avg=181.50ms`

Interpretation:
- Throughput regressed in both clean pairs (`~4-5 FPS` pan drop and `~6-7 FPS` zoom drop).
- Stop hitch was not improved.
- Non-pan typing also regressed.

Note:
- An earlier parallel A/B launch was discarded as invalid due CPU contention.

## CDP Supplemental A/B

Same app scenario (`/settings` -> `All Settings` -> fit view), scripted wheel pan/zoom and hitch sampling.

- Control (`setta.viewportContentVisibility.enabled=0`):
  - `panFps=43.2`, `zoomFps=36.1`
  - `start p95=8.4ms`, `stop p95=7.4ms`
- Experiment (`setta.viewportContentVisibility.enabled=1`):
  - `panFps=44.5`, `zoomFps=33.3`
  - `start p95=6.8ms`, `stop p95=25.6ms`

Interpretation:
- Zoom throughput dropped.
- Stop hitch showed a large p95 regression in the experiment path.

## Decision

Do not keep this approach.

Reason:
- No reliable pan/zoom win in the target benchmark.
- Repeated A/B shows directional zoom/pan regression.
- Supplemental CDP sample indicates stop-hitch risk.

## Artifacts

- Visual check screenshot:
  - `perf/artifacts/frontend/2026-03-03_viewport-content-visibility-spike_visual-check.png`
