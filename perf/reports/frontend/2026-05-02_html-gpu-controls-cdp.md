# HTML GPU Controls CDP Verification

Plan: `docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md`

## Run

- Date: 2026-05-02
- Route: `http://127.0.0.1:3019/driving_dog`
- Browser/app: `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`
- Driver: Chrome DevTools Protocol `Input.dispatchMouseEvent` and `Input.insertText` at GPU visual coordinates. The sampled points targeted the canvas, then production hit projection aligned the source DOM for native control handling.
- Runtime fixture additions: editable Code section `62750c6dda3360402b139907b5888710`, terminal section `2279bd4d4203e91fdc1bb743966a47cf`, dropdown meta-control section `fea63cad4a45581756d761963ae3b8c9`.

The run verified that the old active DOM teleport path stayed absent:

| Check | Count |
| --- | ---: |
| `.setta-gpu-flow__active-node-teleport-layer` | 0 |
| `.setta-gpu-flow__node--teleported` | 0 |
| `.setta-gpu-flow__node--settling-clone` | 0 |
| `[data-gpu-flow-html-source="true"]` | 5 |
| direct canvas-child HTML sources | 5 |

## Results

| Scenario | Input point / action | User-visible result | requestPaint | texture uploads | source style / transform mutations | long tasks |
| --- | --- | --- | ---: | ---: | --- | ---: |
| CodeMirror edit | Clicked editable CodeMirror at `(400, 516)`, inserted `gpu_codemirror_ok` | `.cm-content` text became `gpu_codemirror_ok`; active element remained CodeMirror `role=textbox` in section `62750c6dda3360402b139907b5888710` | 93 | 151 | 46 / 0 | 1 at 59 ms |
| Terminal input | Clicked canvas point `(742, 440)`, inserted `pwd`, pressed Enter | xterm buffer contained `pwd`; active element was `.xterm-helper-textarea` with `aria-label="Terminal input"` in section `2279bd4d4203e91fdc1bb743966a47cf` | 57 | 146 | 5 / 4 | 0 |
| Shared combobox/dropdown | Clicked GPU-rendered combobox at `(660, 180)`, clicked `GPU Gamma` option at `(700, 277)` | shared combobox input value became `GPU Gamma`; active element was `role=combobox` in section `fea63cad4a45581756d761963ae3b8c9` | 82 | 76 | 16 / 6 | 1 at 64 ms |

The terminal and combobox interactions left the active source projected for focus (`data-gpu-flow-projected-interaction="true"`), but the visible content remained GPU-rendered. CodeMirror and terminal recaptured active caret/cursor frames while focused; this report is interaction evidence, not the dense pan/zoom performance gate.

Screenshot: `perf/reports/frontend/2026-05-02_html-gpu-controls-cdp.png`

## Remaining Plan Work

This closes the browser verification gap for CodeMirror edit, terminal input, and shared combobox/dropdown interaction through the GPU-rendered surface. The separate performance report gap remains open: isolated and end-to-end pan/zoom over a dense graph still needs updated counters and CDP evidence.
