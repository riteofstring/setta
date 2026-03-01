# Settings All Settings Viewport Shell-Mode Feasibility Spike

Date: 2026-03-03
Area: frontend
Implementation status: **Kept as experiment (default-off).**

## Goal

Measure maximum practical pan/zoom headroom from a static, no-gesture-switch lightweight section representation.

This spike intentionally sacrifices editing UX to test whether browser display/compositing cost is the dominant bottleneck.

## Implementation

- Added a default-off experiment flag:
  - localStorage key: `setta.viewportShellMode.enabled`
  - parser/resolver tests:
    - `frontend/src/forks/xyflow/core/container/viewportShellModeFlag.test.ts`
- Added viewport metadata for deterministic harness checks:
  - `data-viewport-shell-mode`
- Added shell rendering path in section container stack:
  - when enabled, render a lightweight section shell body and skip heavy section internals/nested content.
- Extended baseline harness A/B control:
  - `PLAYWRIGHT_ENABLE_VIEWPORT_SHELL_MODE=0|1`
  - typing metric is `null` when shell mode is enabled (no section filter inputs exist in shell mode).

## Playwright A/B (clean sequential runs)

Common command shape:
- `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=0 PLAYWRIGHT_ENABLE_VIEWPORT_SHELL_MODE=<0|1> ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`

Run pair A:
- Control (`0`):
  - `panFps=38.2`, `zoomFps=36.6`
  - `start p95=3.7ms`, `stop p95=7.9ms`
  - `typing avg=182.36ms`
  - `totalNodes=9715`
- Shell (`1`):
  - `panFps=120.2`, `zoomFps=120.8`
  - `start p95=4.9ms`, `stop p95=8.5ms`
  - `typing=null` (not applicable in shell mode)
  - `totalNodes=1400`

Run pair B:
- Control (`0`):
  - `panFps=38.4`, `zoomFps=36.1`
  - `start p95=3.7ms`, `stop p95=7.8ms`
  - `typing avg=166.84ms`
  - `totalNodes=9715`
- Shell (`1`):
  - `panFps=120.8`, `zoomFps=120.9`
  - `start p95=2.9ms`, `stop p95=8.7ms`
  - `typing=null` (not applicable in shell mode)
  - `totalNodes=1400`

Directional summary:
- Pan throughput improved from ~`38` to ~`120` FPS (`~3.1x`).
- Zoom throughput improved from ~`36` to ~`121` FPS (`~3.3x`).
- Stop hitch remained in the same band (~`8ms` p95).
- DOM size dropped from ~`9715` to ~`1400` nodes (`~85%` reduction).

## CDP Supplemental A/B

Same scenario (`/settings` -> `All Settings` -> fit view), scripted wheel pan/zoom + hitch checks.

- Control (`shell=0`):
  - `panFps=44.7`, `zoomFps=35.9`
  - `start p95=6.4ms`, `stop p95=8.1ms`
  - `totalNodes=9567`
- Shell (`shell=1`):
  - `panFps=120.4`, `zoomFps=120.4`
  - `start p95=10.5ms`, `stop p95=8.4ms`
  - `totalNodes=1252`

Interpretation:
- CDP confirms strong throughput headroom from shell rendering.
- Start hitch stays below the current `20ms` guardrail in this sampling.

## Decision

- Keep as **experiment-only diagnostic path** (default off).
- Do not treat this static shell mode as a shippable UX state.

Reason:
- It proves fundamental pan/zoom headroom exists when heavy section internals are removed from paint/compositing.
- It also confirms that solving zoom/pan likely requires a no-hitch lifecycle that can use shell-level rendering during motion while preserving full editing behavior at rest.

## Artifacts

- Visual check screenshot:
  - `perf/artifacts/frontend/2026-03-03_viewport-shell-mode-spike_visual-check.png`
