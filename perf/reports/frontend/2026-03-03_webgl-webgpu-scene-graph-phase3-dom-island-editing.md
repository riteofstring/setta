# WebGL/WebGPU Scene-Graph Phase 3 DOM Island Editing

Date: 2026-03-03
Area: frontend
Branch/Commit: webgpu-scene-graph-impl @ 6ef6524be (+ local Phase 3 working changes)
Related PR: n/a

## Goal

Implement Phase 3 DOM island behavior for the scene-graph renderer:
- keep only an active/focused + nearby ring mounted in DOM,
- keep other sections scene-only,
- promote scene-only sections into DOM islands on first click,
- maintain pan/zoom parity and verify no extra click is required to begin editing.

## Code Paths Touched

- `frontend/src/sceneGraphRenderer/domIslands.ts`
- `frontend/src/sceneGraphRenderer/domIslands.test.ts`
- `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
- `frontend/src/forks/xyflow/core/container/FlowRenderer.tsx`
- `frontend/src/forks/xyflow/core/container/NodeRenderer.tsx`
- `frontend/src/forks/xyflow/core/container/Pane.tsx`
- `frontend/tests/e2e/settings/settings-view-modes.spec.ts`

## Scenario

- Entry point: `http://127.0.0.1:3084/settings` (`All Settings` tab)
- Flags:
  - `enabled=1`
  - `backend=webgl`
  - `domIslandRadius=2` (perf capture)
  - `debugOverlay=0`
- Dataset: built-in `settings` project, `All Settings` view
- Browser/OS: Chrome via `chrome-devtools-mcp` on macOS

## Before

Measurement method:
- CDP Performance trace + scripted pan/zoom loop (same loop used for after run)

Key metrics (pre-change baseline):
- Pan `p50 FPS`: `60.24`
- Zoom `p50 FPS`: `63.69`
- DOM mounted section nodes: `42`
- Scene layer sections: `42`

Trace artifact:
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase3-dom-islands-baseline.trace.json`

## After

Measurement method:
- CDP Performance trace + same scripted pan/zoom loop
- Scene-only promotion check via pane click using runtime metadata target

Key metrics (post-change):
- Pan `p50 FPS`: `120.48`
- Zoom `p50 FPS`: `120.48`
- DOM mounted section nodes (steady-state): `1`
- DOM island count metadata: `1`
- Scene layer sections: `42`
- Scene-only first-click promotion:
  - before click: `domNodeCount=0`, `domIslandCount=0`, `activeLayerCount=0`
  - after click: `domNodeCount=1`, `domIslandCount=1`, `activeLayerCount=1`

Trace artifact:
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase3-dom-islands-after.trace.json`

Visual artifact (local-only):
- `perf/artifacts/frontend/2026-03-03_settings-all-settings_phase3-dom-islands-visual.png`

## Conclusion

- What improved:
  - DOM work dropped from full section mounts to island-only mounts.
  - Pan/zoom frame pacing improved materially in this benchmark run.
  - Scene-only section clicks now promote directly into DOM-mounted editable sections.
- Regressions observed:
  - No functional regressions detected in targeted Playwright + CDP verification.

## Automated Tests

- Vitest:
  - `pnpm -C frontend exec vitest run src/sceneGraphRenderer/domIslands.test.ts src/sceneGraphRenderer/snapshot.test.ts src/sceneGraphRenderer/runtime.test.ts`
- Playwright:
  - `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-view-modes.spec.ts`
