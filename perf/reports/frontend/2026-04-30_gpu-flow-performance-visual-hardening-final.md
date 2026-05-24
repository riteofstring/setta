# GPU Flow Performance And Visual Hardening Final Verification

Date: 2026-04-30

## Scope

Final pass for `docs/plans/gpu-flow-performance-visual-hardening-plan.md`.
This report summarizes the phase evidence already recorded under
`perf/reports/frontend/` and the final CDP run from this iteration.

Browser command:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

## CDP Artifacts

- `perf/reports/frontend/gpu-flow-phase10-settings-final-2026-04-30.png`
- `perf/reports/frontend/gpu-flow-phase10-large-graph-final-2026-04-30.png`
- `perf/reports/frontend/gpu-flow-phase10-controls-final-2026-04-30.png`
- `perf/reports/frontend/gpu-flow-phase10-edge-final-2026-04-30.png`

## Before And After Summary

Initial Phase 1 baselines showed viewport movement was still doing passive
texture uploads and node vertex writes. The final pure viewport samples now
stay on the intended hot path.

| Scenario | Before evidence | Final evidence |
| --- | ---: | ---: |
| Settings pan at zoom `0.5` | Phase 1 baseline path still uploaded textures during viewport work | 0 texture uploads, 11 camera uniform writes, 0 long tasks |
| Settings pan at zoom `1` | Phase 1 baseline path still uploaded textures during viewport work | 0 texture uploads, 11 camera uniform writes, 0 long tasks |
| Settings pan at zoom `2` | Phase 1 baseline path still uploaded textures during viewport work | 0 texture uploads, 11 camera uniform writes, 0 long tasks |
| Medium fixture pure viewport pan | Earlier stress pass captured 682 viewport-only uploads before the owner fix | 0 texture uploads, 0 node vertex writes, 13 camera uniform writes |
| Medium fixture visible-boundary pan | Expected recapture at new visible sets | 167 passive uploads, 163 offscreen textures evicted, memory returned to budget |

## Operation Counts

Settings -> All Settings, after texture warmup:

| Zoom | Pan uploads | Pan `writeBuffer()` calls | Zoom uploads | Zoom `writeBuffer()` calls | Long tasks |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0.5 | 0 | 11 camera | 0 | 3 camera | 0 |
| 1 | 0 | 11 camera | 0 | 3 camera | 0 |
| 2 | 0 | 11 camera | 0 | 3 camera | 0 |

Production `GpuFlow` medium fixture (`1,000` nodes, `1,427` edges):

| Scenario | FPS | Texture uploads | `writeBuffer()` labels | Drawn nodes | Edge vertices | Long tasks |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Pure tiny-delta viewport pan | 198.1 | 0 | camera uniform only | 22 | 23,784 | 0 |
| Pan across graph | 122.8 | 167 | camera + node vertices for culling changes | 11 final | 23,784 | 0 |
| Direct node move | 102.9 | 0 | none in final visible set | 11 | 23,784 | 0 |
| Multi-node move | 130.0 | 0 | node vertices x1 | 11 | 23,784 | 0 |
| Resize sample | 120.1 | 0 | none in final visible set | 11 | 23,784 | 0 |

Edge workflow CDP sample:

- Edge hover, pointer down, click, and context-menu callbacks fired for the
  same scene edge.
- One edge label and two reconnect anchors rendered.
- 0 texture uploads, 0 long tasks.

## Visual Parity And Active Input

Final controls fixture used production `GpuFlow` with text input, toggle,
slider, dropdown, color input, CodeMirror-like editor, terminal-like control,
chat textarea, spreadsheet cell, dropzone, media button, and iframe/browser
node.

| Sample set | Zooms | Result |
| --- | --- | --- |
| Text input | `0.5`, `1`, `2` | before/live/during/restored rect delta 0 px, snapped delta 0 px, style mismatches 0 |
| Toggle | `0.5`, `1`, `2` | before/live/during/restored rect delta 0 px, snapped delta 0 px, style mismatches 0 |
| Slider | `0.5`, `1`, `2` | before/live/during/restored rect delta 0 px, snapped delta 0 px, style mismatches 0 |
| Editor-like node | `1` | before/live/during/restored rect delta 0 px, style mismatches 0 |
| Terminal-like node | `1` | before/live/during/restored rect delta 0 px, style mismatches 0 |

Interaction latency across 17 final samples was `0.1 ms` to `8.2 ms`. Active
texture uploads before first visible response were `0` for every sample. Each
node produced final uploads after response/restoration as expected. No long
tasks were recorded during the active input samples.

The final synthetic controls harness reported 0 active teleported nodes before
teardown. Two inert settling clones remained from scripted native control
samples before harness teardown; they were `data-gpu-flow-teleport="settling-clone"`,
not active teleports. Earlier Phase 7 reports include trusted-style restore
coverage for text, toggle, slider, editor, terminal, and scrollable content.

## Texture Memory And Eviction

Small-budget medium fixture run:

| Metric | Value |
| --- | ---: |
| Budget | 12 MiB |
| Evicted node count | 163 |
| Evicted bytes | 48,435,792 |
| Max allocated bytes before eviction | 22,779,264 |
| Max visible bytes | 22,779,264 |
| Final allocated bytes | 12,500,736 |
| Final texture count | 26 |
| Largest texture | 759,000 bytes |

Protected active/visible/dirty/focused texture cases are covered by
`nodeTextures.test.ts` and the Phase 5 report.

## Coverage Map

- Phase 1 instrumentation: browser-injected RAF, long-task, WebGPU queue, and
  node-layer probes are committed under `frontend/tests/e2e/`.
- Phase 2 viewport hot path: node quad cache and edge overlay viewport sync
  reports show camera-only viewport frames.
- Phase 3 DOM transform scaling: node DOM transform cache tests and large-node
  write-count coverage are complete.
- Phase 4 paint dirty ownership: ancestry resolution and narrow ancestor
  fallback tests are complete.
- Phase 5 texture accounting/eviction: accounting, protection, and eviction
  tests are complete.
- Phase 6 large graph fixture: deterministic 250/1,000/5,000/10,000 node
  fixture generation is complete.
- Phase 7 visual parity: text, toggle, slider, editor, terminal, and scrollable
  content reports show 0 px rect deltas at required zoom levels.
- Phase 8 active latency: text, toggle, slider, dropdown/color, editor,
  terminal, chat, spreadsheet, iframe/browser, media, and dropzone samples are
  covered.
- Phase 9 cleanup: ReactFlow-compatible class names are documented as the
  narrow retained DOM/CSS contract; no stale xyflow/d3/fallback renderer path
  remains in GPU-flow owners.

## Console Notes

The final CDP session had no WebGPU runtime errors. Console noise came from an
initial intentionally invalid edge-interaction harness attempt, synthetic
pointer capture on untrusted scripted pointer events, React contentEditable
warnings in the disposable editor/terminal fixture, and native browser warnings
for scripted range/color controls. The corrected edge harness used an explicit
`GpuEdgeScene`.

## Result

`CDP visual check: done (Settings -> All Settings at zoom 0.5/1/2, minimap navigation, medium large-graph stress, texture eviction, direct/multi movement, resize, active text/toggle/slider/editor/terminal/dropdown/color/chat/spreadsheet/dropzone/media controls, edge hover/click/context/reconnect-anchor rendering; command used CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh).`
