# WebGL/WebGPU Scene-Graph Phase 2 Camera + Interaction Parity

Date: 2026-03-03
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ 309a2c77c (+ local Phase 2 working changes)
Related PR: n/a

## Goal

Implement Phase 2 parity wiring for the scene-graph renderer layer:
- keep camera metadata in sync with pan/zoom updates,
- carry selection/hover interaction metadata into snapshots,
- render active/selected/hover visual accents in the scene layer,
- verify parity signals on `Settings -> All Settings`.

## Code Paths Touched

- `frontend/src/sceneGraphRenderer/types.ts`
- `frontend/src/sceneGraphRenderer/snapshot.ts`
- `frontend/src/sceneGraphRenderer/snapshot.test.ts`
- `frontend/src/sceneGraphRenderer/SceneGraphRendererLayer.tsx`
- `frontend/src/sceneGraphRenderer/backends/CanvasSceneBackendBase.ts`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Scenario

- Entry point (URL/route/screen): `http://127.0.0.1:3084/settings` (`All Settings` tab)
- Steps:
  1. Force flags via localStorage (`enabled=1`, `backend=webgl`, `domIslandRadius=2`, `debugOverlay=0`).
  2. Load `Settings -> All Settings`.
  3. Run scripted wheel-pan loop and pinch-zoom loop.
  4. Verify canvas metadata (`hovered section`, `camera zoom`) through CDP.
- Data set / project used: built-in `settings` project, `All Settings` view.
- Browser + OS: Chrome via `chrome-devtools-mcp` on macOS.
- Notes: local dev server; no CPU/network throttling.

## Before

Reference baseline from Phase 0 report (`2026-03-03_webgl-webgpu-scene-graph-phase0-baseline.md`):
- Pan `p50 FPS`: `46.30`
- Zoom `p50 FPS`: `119.05`

## After

Measurement method:
- CDP Performance trace (`performance_start_trace` / `performance_stop_trace`) over scripted pan/zoom loop.
- In-page scripted frame-interval sampling during the same loop.
- Direct DOM metadata checks from `.setta-scene-graph-renderer-layer`.

Key metrics:
- Pan `p50 FPS`: `62.89`
- Zoom `p50 FPS`: `119.05`
- Layer metadata during run:
  - `visible=1`, `backend=webgl`
  - `sections=42`, `edges=0`
  - `cameraZoom` tracked from `0.10` to `0.12` after zoom-in control
  - `hoveredSection` updated to hovered node id (verified via synthetic pointer move + RAF settle)
- Trace summary (`NO_NAVIGATION`): `CLS 0.00`

## Conclusion

- What improved:
  - Scene snapshot now includes interaction state (`isActive`, `isSelected`, `isHovered`) and diff signatures capture those transitions.
  - Scene layer now publishes deterministic interaction + camera metadata for parity harnesses.
  - Canvas backend draws active/selected/hover accents for parity-oriented visualization.
- What regressed (if any):
  - No regression detected in this targeted scenario.
- Follow-ups:
  - Add explicit edge-hover parity once edge paths are present in this benchmark fixture.
  - Continue with Phase 3 DOM island management once parity guardrails remain stable across additional views.

## Raw Artifacts (local-only)

- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase2-camera-parity.trace.json`

## Automated Perf/Parity Tests

- Playwright:
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts`
- Vitest:
  - `frontend/src/sceneGraphRenderer/runtime.test.ts`
  - `frontend/src/sceneGraphRenderer/snapshot.test.ts`
  - `frontend/src/sceneGraphRenderer/backendFactory.test.ts`
