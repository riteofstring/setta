# Settings All Settings Phase1 Hybrid Motion Proxy Spike (Pass 3)

Date: 2026-03-03
Area: frontend
Implementation status: **Not kept (rolled back after measurement)**.

## Goal

Run a fresh hybrid motion-proxy spike (motion-only canvas shells + DOM hide during movement) behind an explicit localStorage feature flag and evaluate against the existing `All Settings` baseline harness.

## Implementation Attempted

- Added a new motion-proxy flag (`setta.viewportMotionProxy.enabled`) with default-off semantics.
- Added transform-driven motion lifecycle in viewport rendering (`idle -> active -> settling -> idle`).
- Added a canvas shell overlay intended to render lightweight section placeholders during motion while hiding heavy DOM painting.
- Ran A/B measurements with the same baseline harness and supplementary CDP checks.

## Measurement Results

- Playwright control (`PLAYWRIGHT_ENABLE_VIEWPORT_MOTION_PROXY=0`):
  - `pan=36.7`, `zoom=33.5`
  - `start p95=3.8ms`, `stop p95=9.4ms`
  - `typing avg frame=178.14ms`

- Playwright motion-proxy on (`PLAYWRIGHT_ENABLE_VIEWPORT_MOTION_PROXY=1`):
  - `pan=36.0`, `zoom=35.4`
  - `start p95=4.4ms`, `stop p95=8.7ms`
  - `typing avg frame=181.22ms`

- CDP supplementary samples:
  - Control off: `pan=43.4`, `zoom=33.6`
  - Proxy on: `pan=41.4`, `zoom=34.7`
  - Directionally near parity, no robust uplift.

Visual artifact:
- `perf/artifacts/frontend/2026-03-03_viewport-motion-proxy-spike_visual-check.png`

## Decision

- This pass did **not** meet the motion gain gates.
- No robust pan/zoom throughput improvement relative to control.
- Implementation was fully rolled back (no production behavior change kept from this pass).

## Conclusion

- Phase1 pass 3 is closed as a failed spike.
- Further hybrid proxy work should only continue with a materially different design (for example, lower start/stop overhead and stronger DOM paint suppression strategy) and strict A/B gating.
