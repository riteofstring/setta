# GPU Flow Phase 7 Editor And Terminal Z-Index Parity

Date: 2026-04-30

## Scope

Extended the Phase 7 activation parity audit to editor-like and terminal-like
node families using the production `GpuFlow` renderer in the live Vite app. The
CDP fixture captured this sequence for each sample:

1. passive GPU texture before activation
2. live teleported DOM before input mutation
3. live DOM during input mutation
4. restored passive texture after blur/final upload

The first run exposed an owner-level style mismatch: passive DOM hit-test hosts
reported `z-index: auto`, while the teleported live host applied the resolved
node z-index inline. That made the activation path use different stacking style
than the passive path even when geometry and textures were aligned.

## Owner Fix

`GpuNodeLayer` DOM transform sync now owns z-index alongside transform, size,
pointer-events, visibility, and interactive state. Visible passive hosts apply
the resolved node z-index, z-index changes are part of the sync cache key, and
culled hosts clear z-index when parked offscreen. This matches
`GpuActiveNodeTeleport`, which already applies the active snapshot z-index while
the node is live DOM.

## CDP Run

Command:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Scenario:

- Production `GpuFlow` fixture rendered in the live Vite app.
- One 420x260 CodeMirror node or one 420x240 xterm-style terminal node per
  sample.
- Node z-index set to `3` to prove passive/live stack style parity.
- Zoom levels: `0.5`, `1`, and `2`.
- Captured passive, live-before-input, live-during-input, and
  restored-after-upload snapshots.
- Screenshot artifact:
  `perf/reports/frontend/gpu-flow-phase7-editor-terminal-zindex-parity-2026-04-30.png`
  (ignored by perf artifact policy).

## Results After Fix

| Control | Zoom | Activation rect delta | Activation style mismatches | Deactivation rect delta | Deactivation style mismatches | Active after restore |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| CodeMirror | 0.5 | 0 px | 0 | 0 px | 0 | none |
| terminal | 0.5 | 0 px | 0 | 0 px | 0 | none |
| CodeMirror | 1 | 0 px | 0 | 0 px | 0 | none |
| terminal | 1 | 0 px | 0 | 0 px | 0 | none |
| CodeMirror | 2 | 0 px | 0 | 0 px | 0 | none |
| terminal | 2 | 0 px | 0 | 0 px | 0 | none |

Upload and buffer counts:

| Control | Zoom | Passive uploads | Active final uploads | Total uploads | `writeBuffer()` calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| CodeMirror | 0.5 | 2 | 1 | 3 | 3 |
| terminal | 0.5 | 3 | 1 | 4 | 2 |
| CodeMirror | 1 | 3 | 1 | 4 | 3 |
| terminal | 1 | 3 | 1 | 4 | 2 |
| CodeMirror | 2 | 3 | 1 | 4 | 3 |
| terminal | 2 | 3 | 1 | 4 | 2 |

Texture diagnostics:

| Control | Zoom | DPR | Zoom bucket | Texture pixels | Resolution scale | Sampler |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| CodeMirror | 0.5 | 2 | 0.5 | 420x260 | 1 | linear |
| terminal | 0.5 | 2 | 0.5 | 420x240 | 1 | linear |
| CodeMirror | 1 | 2 | 1 | 840x520 | 2 | linear |
| terminal | 1 | 2 | 1 | 840x480 | 2 | linear |
| CodeMirror | 2 | 2 | 2 | 1680x1040 | 4 | linear |
| terminal | 2 | 2 | 2 | 1680x960 | 4 | linear |

The terminal sample changed internal scroll offsets after writing terminal
output, so passive-to-restored scroll offsets differed by the expected terminal
content mutation. The deactivation comparison used live-during-input as the
reference and measured `0` scroll mismatches after restore.

## Console Notes

The CDP console contained existing development noise: React Router future-flag
warnings, React 19 `element.ref` warnings, and favicon/source-map 404s. No
WebGPU errors were reported.

## Verification

Focused tests:

```bash
pnpm -C frontend exec vitest run src/gpuFlow/GpuNodeLayer.test.tsx tests/e2e/gpuFlowVisualParityProbe.test.ts --environment jsdom
pnpm -C frontend exec eslint --no-warn-ignored -- src/gpuFlow/GpuNodeLayer.tsx src/gpuFlow/GpuNodeLayer.test.tsx tests/e2e/gpuFlowVisualParityProbe.ts tests/e2e/gpuFlowVisualParityProbe.test.ts
```

## Remaining Phase 7 Work

- Continue scrollable-content activation parity with a trusted wheel or
  focus-owned scroll release path.
- Extend representative section-family coverage beyond the direct CodeMirror
  and terminal fixtures.
