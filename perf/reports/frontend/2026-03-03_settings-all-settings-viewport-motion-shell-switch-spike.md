# Settings All Settings Viewport Motion-Shell Switch Spike

Date: 2026-03-03
Area: frontend
Implementation status: **Kept as experiment (default-off).**

## Goal

Validate a no-canvas motion-only shell switch that preserves normal editing DOM at rest but swaps to a pre-mounted lightweight shell during active pan/zoom.

## Implementation

- Added a default-off experiment flag:
  - localStorage key: `setta.viewportMotionShell.enabled`
  - parser/resolver tests:
    - `frontend/src/forks/xyflow/core/container/viewportMotionShellFlag.test.ts`
- Added viewport metadata for deterministic checks:
  - `data-viewport-motion-shell-enabled`
  - `data-viewport-motion-shell-active`
- Added motion lifecycle wiring in `ZoomPane`:
  - activation delay: `72ms`
  - idle settle delay: `132ms`
- Section rendering path (when enabled):
  - keep full section DOM mounted,
  - add pre-mounted lightweight shell overlay,
  - during active motion, show shell layer and hide full layer with CSS `visibility/pointer-events`.
- Extended baseline harness A/B control:
  - `PLAYWRIGHT_ENABLE_VIEWPORT_MOTION_SHELL=0|1`

## Playwright A/B (clean sequential runs)

Common command shape:
- `PLAYWRIGHT_ENABLE_VIEWPORT_LAYER_SPLIT=0 PLAYWRIGHT_ENABLE_VIEWPORT_SHELL_MODE=0 PLAYWRIGHT_ENABLE_VIEWPORT_MOTION_SHELL=<0|1> ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`

Run pair A:
- Control (`0`):
  - `panFps=34.4`, `zoomFps=33.3`
  - `start p95=3.9ms`, `stop p95=8.6ms`
  - `typing avg=174.78ms`
  - `totalNodes=9715`
- Motion shell (`1`):
  - `panFps=112.7`, `zoomFps=110.4`
  - `start p95=5.5ms`, `stop p95=9.5ms`
  - `typing avg=131.88ms`
  - `totalNodes=9883`

Run pair B:
- Control (`0`):
  - `panFps=35.0`, `zoomFps=32.8`
  - `start p95=3.3ms`, `stop p95=8.0ms`
  - `typing avg=179.18ms`
- Motion shell (`1`):
  - `panFps=109.2`, `zoomFps=110.5`
  - `start p95=4.9ms`, `stop p95=8.9ms`
  - `typing avg=126.64ms`

Directional summary:
- Pan throughput improved from about `35` to about `111` FPS (`~3.2x`).
- Zoom throughput improved from about `33` to about `111` FPS (`~3.3x`).
- Start hitch p95 increased from about `3.6ms` to `~5-6ms` (still below current `20ms` guardrail).
- Stop hitch p95 increased modestly from about `8.3ms` to `~9-10ms`.
- DOM nodes increased by `168` due pre-mounted shell/full layer pair.

## CDP Lifecycle Validation

With motion shell enabled on `/settings`:
- Before interaction: `data-viewport-motion-shell-active=false`.
- After a wheel interaction on `.react-flow__pane`:
  - `t=90ms`: active `true`
  - `t=250ms`: active `false`
  - `t=470ms`: active `false`

Interpretation:
- Motion shell activation/deactivation behaves as intended (brief active window, then idle restore).
- The baseline harness often samples while interaction is still active, which explains `viewportMotionShellActive=true` in some emitted metric snapshots.

## Decision

- Keep as **experiment-only** (default off).
- This is currently the strongest measured motion-throughput path that does not require static shell UX.
- Not ready for broad rollout yet; needs dedicated guardrails for motion correctness and non-pan interaction parity.

## Artifacts

- Visual check screenshot:
  - `perf/artifacts/frontend/2026-03-03_viewport-motion-shell-spike_visual-check.png`
