# GPU Flow Phase 7 Toggle And Slider Activation Parity

Date: 2026-04-30

## Scope

Extended the Phase 7 activation parity pass from text inputs to checkbox-style
toggles and range sliders. The browser probe used a production `GpuFlow`
fixture in the live Vite app and captured the sequence:

1. passive GPU texture before activation
2. live teleported DOM before input mutation
3. live DOM during input mutation
4. restored passive texture after blur/final upload

The probe also now has reusable stable screenshot-region metadata helpers and
RGBA pixel-region diff helpers for future screenshot comparisons.

## Owner Fix

The first toggle/slider run exposed a real passive/live mismatch for nodes whose
content sizes itself with percentages. Passive GPU node hosts applied position
and transform but not the owner node width/height, while the teleported live host
did apply width/height. That made passive hosts measure from content/layout
instead of the node geometry, causing visible activation pop.

The fix moves width/height ownership into the DOM transform sync state. Visible
GPU node hosts now apply unscaled node CSS width and height together with the
screen transform, so passive hosts and teleported hosts use the same layout box.

Before the fix, the same fixture reported live-vs-passive max rect deltas of
`116.105px` at zoom `0.5`, `232.211px` at zoom `1`, and `464.422px` at zoom
`2`, plus style mismatches for host `width` and `height`.

## CDP Run

Command:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Scenario:

- Production `GpuFlow` fixture rendered in the live Vite app.
- One 280x150 toggle node or slider node per sample.
- Zoom levels: `0.5`, `1`, and `2`.
- Captured passive, live-before-input, live-during-input, and
  restored-after-upload snapshots.
- Screenshot artifact:
  `perf/reports/frontend/gpu-flow-phase7-toggle-slider-activation-parity-2026-04-30.png`
  (ignored by perf artifact policy).

## Results After Fix

| Control | Zoom | Live rect delta | Live snapped delta | Live style mismatches | Restored rect delta | Restored style mismatches | Final value |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| toggle | 0.5 | 0 px | 0 px | 0 | 0 px | 0 | `true` |
| slider | 0.5 | 0 px | 0 px | 0 | 0 px | 0 | `72` |
| toggle | 1 | 0 px | 0 px | 0 | 0 px | 0 | `true` |
| slider | 1 | 0 px | 0 px | 0 | 0 px | 0 | `72` |
| toggle | 2 | 0 px | 0 px | 0 | 0 px | 0 | `true` |
| slider | 2 | 0 px | 0 px | 0 | 0 px | 0 | `72` |

Upload and buffer counts:

| Control | Zoom | Passive uploads | Active final uploads | Total uploads | `writeBuffer()` calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| toggle | 0.5 | 2 | 1 | 3 | 3 |
| slider | 0.5 | 2 | 1 | 3 | 2 |
| toggle | 1 | 2 | 1 | 3 | 3 |
| slider | 1 | 2 | 1 | 3 | 2 |
| toggle | 2 | 2 | 1 | 3 | 3 |
| slider | 2 | 2 | 1 | 3 | 2 |

The two passive uploads are fixture warmup/settle uploads before activation.
No active-node texture upload occurred while the node was teleported; each
sample produced one active final upload after blur/restoration.

Texture diagnostics:

| Zoom | DPR | Zoom bucket | Texture pixels | Resolution scale | Sampler |
| --- | ---: | ---: | --- | ---: | --- |
| 0.5 | 2 | 0.5 | 280x150 | 1 | linear |
| 1 | 2 | 1 | 560x300 | 2 | linear |
| 2 | 2 | 2 | 1120x600 | 4 | linear |

Stable screenshot regions:

| Zoom | Region clip |
| ---: | --- |
| 0.5 | `x=78 y=71 w=128 h=63` |
| 1 | `x=176 y=145 w=168 h=72` |
| 2 | `x=412 y=302 w=168 h=72` |

The passive and restored region clips matched exactly for both controls at each
zoom.

## Console Notes

The CDP console included existing development noise: Vite logs, React DevTools
info, React Router future-flag warnings, and existing React 19 `element.ref`
warnings. Synthetic pointer dispatch for the scripted before/live/after capture
still produced browser `setPointerCapture` NotFound errors. The parity
measurements were taken after successful activation, mutation, blur, final
upload, and restoration; no WebGPU errors were reported.

## Remaining Phase 7 Work

- Extend the same probe coverage to CodeMirror, terminal, scrollable content,
  and representative section families.
- Use trusted browser input for deactivation-pop runs where the exact
  before/live/after sequence can be captured without synthetic pointer-capture
  noise.
