# Settings All Settings Phase 1 Hybrid Motion Proxy Spike

Date: 2026-03-03
Area: frontend
Branch/Commit: setta.frontend-performance-3 @ 7c827bdf8 (with local experiment changes during measurement)
Experimented code paths (reverted):
- `frontend/src/forks/xyflow/core/container/MotionProxyCanvasLayer.tsx`
- `frontend/src/forks/xyflow/core/container/Viewport.tsx`
- `frontend/src/forks/xyflow/core/container/motionProxyStateMachine.ts`
- `frontend/src/forks/xyflow/core/container/motionProxyGeometry.ts`
- `frontend/src/forks/xyflow/core/container/motionProxyFlag.ts`
- `frontend/src/forks/xyflow/core/styles/style.css`
- `frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts` (optional env toggle for proxy flag)

Implementation status: **Not kept** (experiment reverted; report retained for decision history).

## Goal

Execute Phase 1 of the hybrid proxy plan:
- Add a scoped feature flag for `settings` project + `All Settings` view.
- Add a motion-proxy lifecycle state machine (`idle/armed/active/settling`).
- Prewarm a lightweight canvas shell proxy and switch to it during motion.

## Change Summary (Experiment)

- Added local-storage scoped feature flag (`setta.hybridMotionProxy.phase1`).
- Implemented explicit motion-proxy state machine with tests.
- Implemented deterministic proxy geometry mapping from node internals with tests.
- Mounted a prewarmed canvas proxy layer in `Viewport`.
- During `active/settling`, hid heavy DOM nodes/edges via root data-attribute CSS and showed proxy canvas.
- Added optional Playwright env switch (`PLAYWRIGHT_ENABLE_HYBRID_MOTION_PROXY=1`) to evaluate baseline harness with proxy enabled.

## Verification (Code + Tests)

- `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/motionProxyStateMachine.test.ts src/forks/xyflow/core/container/motionProxyGeometry.test.ts src/forks/xyflow/core/container/motionProxyFlag.test.ts`
  - `3 passed`, `10 tests`.

## Measurement Setup

- Playwright harness:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
  - `PLAYWRIGHT_ENABLE_HYBRID_MOTION_PROXY=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
- CDP validation:
  - confirmed proxy state transitions (`armed -> active -> settling -> armed`) and canvas visibility toggles on wheel pan.
  - scripted throughput/start/stop sample under `http://127.0.0.1:3003/settings`.

## Playwright Results (Same-Day A/B)

Control (proxy disabled):
- Throughput: `panFps=38.1`, `zoomFps=36.4`
- Start hitch: `avg=3.52ms`, `p95=3.6ms`, `worst=3.7ms`
- Stop hitch: `avg=4.57ms`, `p95=8.2ms`, `worst=8.2ms`
- Typing: `avgFrameMs=184.72`

Proxy enabled runs:
- Run A:
  - Throughput: `panFps=37.4`, `zoomFps=35.0`
  - Start hitch: `avg=5.59ms`, `p95=8.4ms`, `worst=9.3ms`
  - Stop hitch: `avg=4.7ms`, `p95=8.1ms`, `worst=8.1ms`
  - Typing: `avgFrameMs=186.54`
- Run B:
  - Throughput: `panFps=35.9`, `zoomFps=35.6`
  - Start hitch: `avg=5.43ms`, `p95=8.5ms`, `worst=8.9ms`
  - Stop hitch: `avg=4.08ms`, `p95=8.0ms`, `worst=8.5ms`
  - Typing: `avgFrameMs=195.39`

Computed summary (proxy enabled):
- Pan FPS median: `36.65` (below control `38.1`)
- Zoom FPS median: `35.3` (below control `36.4`)
- Start hitch p95 worsened relative to control (`~8.45ms` vs `3.6ms`)
- Typing worsened versus control (`186.54-195.39` vs `184.72`)

## CDP Supplementary Sample

Control sample (flag off):
- Throughput: `panFps=60.2`, `zoomFps=47.4`
- Start hitch: `avg=6.53ms`, `p95=6.7ms`, `worst=8.7ms`

Proxy sample (flag on):
- Throughput: `panFps=57.5`, `zoomFps=45.4`
- Start hitch: `avg=7.32ms`, `p95=8.5ms`, `worst=8.9ms`

Directional result matched Playwright: no motion gain in this implementation.

## Variant Tried and Rejected

- Switched DOM hide from `visibility:hidden` to `display:none` during `active/settling`.
- Result: baseline harness became behaviorally unstable (`Failed to locate a section-level Filter input`) because section DOM could remain unavailable during typing path.
- Variant rejected and reverted.

## Conclusion

- This Phase 1 implementation pass was **not kept**.
- The scoped prewarmed canvas-shell proxy architecture worked functionally, but this version did not improve sustained pan/zoom and increased start-hitch cost.
- It failed the current go/no-go direction for Phase 1.

Decision:
- Revert experiment code.
- Keep this report for decision history.
- Revisit Phase 1 design before next spike (particularly interaction-start switch cost and DOM-hide strategy that preserves behavior while reducing compositor pressure).
