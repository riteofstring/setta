# HTML GPU Warped Mesh Fixture

## Scope

- Added the Setta-local warped HTML mesh fixture for the HTML-in-canvas GPU
  surface replacement.
- Browser run used:
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`.
- Fixture mounted in the live Vite app through
  `frontend/src/gpuFlow/htmlSurfaces/warpedMeshFixture.tsx`.

## CDP Evidence

- Initial render drew `html-surface-warped-mesh-fixture` through the WebGPU mesh
  path with `vertexCount: 240`.
- Initial texture uploads after mount: `2`.
- Mesh projection produced UV/local hits, for example:
  `u: 0.7156`, `v: 0.7312`, `localX: 257.6`, `localY: 172.6`.
- Button projection toggled the fixture button to `aria-pressed="true"`.
- Slider projection changed the warped surface slider from `42` to `90`.
- Text input focus was projected through the mesh and the value changed to
  `typed through warped mesh`.
- Final metric sample after text input:
  `dirtyMarks: 33`, `pointerProjections: 7`, `textureUploads: 43`,
  `drawnSurfaceIds: ["html-surface-warped-mesh-fixture"]`, `vertexCount: 240`.
- Chrome console after the post-refactor smoke rerun showed existing app-level
  React Router/React 19 warnings under `ProjectNav`/`Header`; no console entry
  was attributed to `gpuFlow/htmlSurfaces/warpedMeshFixture.tsx`,
  `renderer.ts`, or `rendererMesh.ts`.

## Screenshots

- `perf/reports/frontend/2026-05-02_html-gpu-warped-mesh-fixture.png`
- `perf/reports/frontend/2026-05-02_html-gpu-warped-mesh-fixture-interaction.png`
