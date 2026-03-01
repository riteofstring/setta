# Settings All Settings Phase 1 Hybrid Motion Proxy Spike (Pass 2)

Date: 2026-03-03
Area: frontend
Branch/Commit: setta.frontend-performance-3 @ e5dc184e8 (with local experiment changes during measurement)
Experimented code paths (reverted):
- `frontend/src/forks/xyflow/core/container/MotionProxyCanvasLayer.tsx`
- `frontend/src/forks/xyflow/core/container/Viewport.tsx`
- `frontend/src/forks/xyflow/core/container/ZoomPane.tsx`
- `frontend/src/forks/xyflow/core/container/motionProxyStateMachine.ts`
- `frontend/src/forks/xyflow/core/container/motionProxyGeometry.ts`
- `frontend/src/forks/xyflow/core/container/motionProxyFlag.ts`
- `frontend/src/forks/xyflow/core/store/initialState.ts`
- `frontend/src/forks/xyflow/core/types/general.ts`
- `frontend/src/forks/xyflow/core/styles/style.css`
- `frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts` (A/B env toggle)

Implementation status: **Not kept** (experiment reverted; report retained for decision history).

## Goal

Re-run a scoped Phase 1 hybrid motion-proxy implementation to verify whether:
- pre-mounted lightweight shell proxy rendering improves sustained pan/zoom, and
- motion start/stop hitch remains within acceptable bounds.

## Change Summary (Experiment)

- Added motion-proxy state fields to React Flow store (`enabled`, `ready`, `status`).
- Added explicit `idle/armed/active/settling` transition helpers with unit tests.
- Added scoped phase-1 flag:
  - local storage key `setta.hybridMotionProxy.phase1`
  - enabled only for project `settings` + view `All Settings`.
- Added pre-mounted proxy canvas shell layer and viewport DOM/proxy layer switch logic.
- Added pan/zoom lifecycle hooks in `ZoomPane` to enter `active` on gesture start and settle after quiet window.
- Added deterministic baseline-harness toggle:
  - `PLAYWRIGHT_ENABLE_HYBRID_MOTION_PROXY=1` sets localStorage key before load.

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/motionProxyStateMachine.test.ts src/forks/xyflow/core/container/motionProxyGeometry.test.ts src/forks/xyflow/core/container/motionProxyFlag.test.ts`
  - `3 passed`, `11 tests`.
- Playwright A/B harness:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`
  - `PLAYWRIGHT_ENABLE_HYBRID_MOTION_PROXY=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-performance-baseline.spec.ts`

## Playwright Results (Same-Day A/B)

Control (proxy disabled):
- Run A:
  - Throughput: `panFps=118.9`, `zoomFps=102.7`
  - Start hitch: `avg=3.32ms`, `p95=3.5ms`, `worst=3.6ms`
  - Stop hitch: `avg=8.18ms`, `p95=8.5ms`, `worst=9.3ms`
  - Typing: `avgFrameMs=142.42`
- Run B:
  - Throughput: `panFps=120.0`, `zoomFps=90.8`
  - Start hitch: `avg=3.41ms`, `p95=3.8ms`, `worst=4.1ms`
  - Stop hitch: `avg=7.94ms`, `p95=8.8ms`, `worst=8.9ms`
  - Typing: `avgFrameMs=152.09`

Proxy enabled:
- Run A:
  - Throughput: `panFps=120.1`, `zoomFps=96.2`
  - Start hitch: `avg=3.48ms`, `p95=4.0ms`, `worst=4.5ms`
  - Stop hitch: `avg=7.77ms`, `p95=8.6ms`, `worst=8.6ms`
  - Typing: `avgFrameMs=149.08`
- Run B:
  - Throughput: `panFps=111.4`, `zoomFps=98.9`
  - Start hitch: `avg=3.27ms`, `p95=3.6ms`, `worst=4.5ms`
  - Stop hitch: `avg=7.57ms`, `p95=8.2ms`, `worst=8.5ms`
  - Typing: `avgFrameMs=149.52`

Computed summary (proxy enabled medians vs control medians):
- Pan FPS median: `115.75` vs control `119.45` (worse)
- Zoom FPS median: `97.55` vs control `96.75` (effectively flat)
- Start hitch p95 median: `3.8ms` vs control `3.65ms` (slightly worse)
- Stop hitch p95 median: `8.4ms` vs control `8.65ms` (slightly better)
- Typing median: `149.30` vs control `147.26` (slightly worse)

## Interpretation

- In this pass, enabling the hybrid proxy did not produce a material end-to-end win versus control.
- A notable observation is that both A/B modes in this experiment were far faster than the older baseline report range (`~38 pan FPS / ~36 zoom FPS`), which indicates the always-on structural viewport layering in this pass likely drove most gains, not the proxy toggle itself.

## Conclusion

- This Phase 1 pass was **not kept**.
- The current hybrid proxy path adds complexity without a clear incremental A/B improvement.
- Keep this result as decision history and treat the structural layering effect as a separate follow-up candidate to isolate and benchmark independently.
