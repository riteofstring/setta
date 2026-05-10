# HTML GPU Surface Animated Switch CDP Check

Date: 2026-05-02

## Scenario

- App/browser launched with `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`.
- Mounted `HtmlSurfaceWarpedMeshFixture` in the Vite-served app page.
- Drove a synthetic pointer move/down/up through the layout-subtree canvas at the warped mesh switch's GPU-projected client point.
- Verified the role=switch state changed through the source projector while the visible surface remained WebGPU-rendered.

## Result

- Initial fixture render: `2` texture uploads, `2` `requestPaint` calls.
- Animated switch interaction delta over the capture window:
  - `24` `GPUQueue.copyElementImageToTexture` calls.
  - `27` source dirty marks.
  - `27` `requestPaint` calls.
  - `24` fixture texture upload completions.
  - `2` pointer projections through `html-surface-warped-mesh-fixture`.
- Settled follow-up window: `0` additional dirty marks and `0` additional texture uploads.
- Final switch state: `aria-checked="true"`.

Screenshot: `perf/reports/frontend/2026-05-02_html-gpu-animation-switch-cdp.png`

## Notes

The recapture lease sampled intermediate CSS transition frames for the switch
thumb and stopped after the transition settled. No DOM overlay or active-node
teleport path was used.
