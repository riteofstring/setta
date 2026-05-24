# GPU Flow Phase 7 Activation Visual Parity Probe

Date: 2026-04-30

## Scope

Added a reusable browser/jsdom activation-delta probe for the sequence:

1. passive GPU texture before input activation
2. live teleported DOM after activation
3. live DOM during input mutation
4. restored passive texture after blur/final upload

The probe records node rects, expected GPU quad rect deltas, device-pixel
snapped deltas, computed/owner presentation style snapshots, scroll offsets,
texture resolution metadata, sampler diagnostics, and per-node upload state
from the existing GPU flow performance probe when installed.

## Owner Fix

The first CDP run exposed a style parity issue: passive hosts inside the
html-in-canvas layout subtree reported implicit paint containment and could
enter activation before their owner inline positioning was stable, while the
teleported host was explicitly absolute-positioned. The owner fix initializes
GPU node hosts with the same base positioning as frame sync and makes GPU node
paint containment explicit via the GPU flow node class.

The probe now compares owner-applied inline presentation for host-owned
properties such as position, transform, dimensions, pointer events, and z-index,
because Chromium reports `position: static` from `getComputedStyle()` for
layout-subtree canvas children even when the owner inline style is absolute.

## CDP Run

Command:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Scenario:

- Production `GpuFlow` fixture rendered in the live Vite app.
- One 240x128 text-input node.
- Zoom levels: `0.5`, `1`, and `2`.
- Captured passive, live-before-input, live-during-input, and
  restored-after-upload snapshots.
- Screenshot:
  `perf/reports/frontend/gpu-flow-phase7-activation-visual-parity-probe-2026-04-30.png`

## Results

| Zoom | Expected rect delta | Snapped rect delta | Live style mismatches | Restored style mismatches | Visual-node uploads | Write buffers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.5 | 0 px | 0 px | 0 | 0 | 2 | 2 |
| 1 | 0 px | 0 px | 0 | 0 | 2 | 2 |
| 2 | 0 px | 0 px | 0 | 0 | 2 | 2 |

Upload timing:

- Each zoom had one passive warmup upload and one active final upload.
- Active texture uploads stayed at `0` for `live-before-input` and
  `live-during-input`.
- The restored snapshot saw `activeTextureUploadCountForNode: 1`, confirming the
  final upload happened after restore instead of while the node was live.

Texture diagnostics:

| Zoom | DPR | Zoom bucket | Texture pixels | Resolution scale | Sampler |
| --- | ---: | ---: | --- | ---: | --- |
| 0.5 | 2 | 0.5 | 240x128 | 1 | linear |
| 1 | 2 | 1 | 480x256 | 2 | linear |
| 2 | 2 | 2 | 960x512 | 4 | linear |

Frame/operation summary:

- Each zoom sample recorded `46` RAF frames and `12` node-layer frames.
- Each zoom sample recorded `4` queue calls: `2` texture uploads and `2`
  `writeBuffer()` calls.
- No texture upload occurred solely because the node switched to live DOM.

Console notes:

- Existing development noise remained: Vite logs, React DevTools info, React
  Router future-flag warning, and existing React 19 `element.ref` warnings.
- The synthetic pointer-event runner produced `setPointerCapture` NotFound
  errors because scripted pointer events are not browser-trusted active
  pointers. The visual parity measurements were taken after successful
  activation/deactivation and no WebGPU errors were reported.

## Remaining Phase 7 Work

- Extend the probe from the text-input sample to toggles, sliders, CodeMirror,
  terminal, scrollable content, and representative section families.
- Add pixel-diff or screenshot-region comparison for stable text/chrome regions.
- Continue auditing deactivation pop under real trusted pointer input where
  Playwright or manual CDP click orchestration can capture the same sequence.
