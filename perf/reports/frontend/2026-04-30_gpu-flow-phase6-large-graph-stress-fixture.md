# GPU Flow Phase 6 Large Graph Stress Fixture

Date: 2026-04-30

## Scope

Added a reusable deterministic large graph fixture for GPU flow performance and
browser probes.

Changed owners:

- `frontend/tests/e2e/gpuFlowLargeGraphStressFixture.ts`
- `frontend/tests/e2e/gpuFlowLargeGraphStressFixture.test.ts`
- `frontend/src/gpuFlow/GpuNodeLayer.tsx`
- `frontend/src/gpuFlow/GpuFlow.tsx`

The fixture generates production `GpuFlow` inputs rather than a fake renderer
shape: `GpuNodeLayout[]`, `GpuEdgeBufferInput[]` built through
`buildGpuEdgeGeometry()`, viewport samples, zoom samples, and movement samples.

## Fixture Coverage

| Scale | Nodes |
| --- | ---: |
| smoke | 250 |
| medium | 1,000 |
| stress | 5,000 |
| stretch | 10,000 |

The fixture includes varied node sizes, deterministic sparse/dense grid bands,
row/column/diagonal edges, culling viewports, zoom samples at `0.5`, `1`, and
`2`, single-node movement, and multi-node selected movement data.

Focused tests assert:

- deterministic smoke/medium/stress generation
- edge geometry is produced through the production edge owner
- viewport-only movement reuses cached textures without another element upload
- DOM transform work is bounded to visible and previous-visible nodes in a
  1,000-node graph
- node movement updates rendered quad geometry
- small-budget panning evicts offscreen textures and recaptures them when the
  view returns
- direct node-wrapper paint events caused by viewport transform sync do not mark
  textures dirty, while child/control paint events still do

## Owner Fix From Fixture Audit

The CDP fixture initially exposed an earlier hot-path blocker: html-in-canvas
reported node wrapper paints after viewport DOM transform updates. Those direct
wrapper paint events were treated as content changes, causing passive node
texture recapture during viewport-only movement.

The owner fix keeps this suppression narrow:

- `renderGpuNodeLayerFrame()` now reports DOM transform updated/parked node ids.
- `GpuFlow` records those ids only for viewport frames.
- `markGpuNodeLayerPaintDirty()` ignores only direct node-wrapper paint events
  for those transform-only ids.
- Descendant control paint events still resolve by ancestry and mark the owning
  node dirty.

## Focused Verification

```bash
pnpm -C frontend exec vitest run tests/e2e/gpuFlowLargeGraphStressFixture.test.ts src/gpuFlow/GpuNodeLayer.test.tsx src/gpuFlow/GpuFlow.test.tsx src/gpuFlow/nodeTextures.test.ts tests/e2e/gpuFlowPerformanceProbe.test.ts --environment jsdom
```

Result: 49 tests passed.

Lint:

```bash
pnpm -C frontend exec eslint --no-warn-ignored -- tests/e2e/gpuFlowLargeGraphStressFixture.ts tests/e2e/gpuFlowLargeGraphStressFixture.test.ts vite.config.ts
```

Result: passed.

## CDP Browser Check

Command used:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Mounted a disposable production `GpuFlow` harness through Vite dynamic imports
on the running app page. The harness used the Phase 6 medium fixture:

- `1,000` nodes
- `1,427` edges
- zoom samples: `0.5`, `1`, `2`
- viewport-only budget: `128 MiB`
- eviction-pan budget: `12 MiB`
- screenshot:
  `perf/reports/frontend/gpu-flow-phase6-large-graph-stress-2026-04-30.png`
  (ignored by perf artifact policy)

Before the owner fix, the same fixture recaptured passive textures during a
viewport-only sample:

| Sample | Texture uploads | Node vertex writes |
| --- | ---: | ---: |
| viewport-only before fix | 682 | 2 |

After the owner fix, a subpixel viewport-only sample with unchanged drawn quads
stayed on the hot path:

| Metric | Value |
| --- | ---: |
| RAF frames | 16 |
| Node-layer frames | 16 |
| Average frame interval | 25.00 ms |
| Average FPS | 40.00 |
| Long tasks | 0 |
| Texture uploads | 0 |
| Camera uniform writes | 8 |
| Node vertex writes | 0 |
| Latest drawn nodes | 64 |
| Latest drawn edges | 1,427 |
| Latest edge vertices | 23,784 |
| Texture allocated bytes | 22,779,264 |
| Texture visible bytes | 22,779,264 |

The culling-boundary pan sample intentionally crossed visible sets and exercised
eviction/recapture:

| Metric | Value |
| --- | ---: |
| RAF frames | 10 |
| Node-layer frames | 10 |
| Average frame interval | 66.68 ms |
| Average FPS | 15.00 |
| Long tasks | 0 |
| Texture uploads | 189 |
| Unique uploaded nodes | 189 |
| Unique evicted nodes | 163 |
| Evicted bytes total | 69,932,112 |
| Max allocated bytes before eviction | 22,779,264 |
| Final allocated bytes | 12,500,736 |
| Max visible bytes | 22,779,264 |
| Max visible nodes | 68 |
| Camera uniform writes | 5 |
| Node vertex writes | 5 |

The movement sample changed the deterministic middle node and produced the
expected geometry update:

| Metric | Value |
| --- | ---: |
| RAF frames | 4 |
| Node-layer frames | 4 |
| Texture uploads | 65 |
| Camera uniform writes | 1 |
| Node vertex writes | 2 |
| Latest drawn nodes | 64 |

Console output contained existing dev noise only: Vite connection logs, React
DevTools info, React Router future-flag warning, and React 19 `element.ref`
warnings from existing app code. No WebGPU errors were reported.

## Phase 6 Status

Phase 6 is complete for a repeatable production-path fixture, deterministic
stress scales, focused owner tests, viewport-only no-upload/no-vertex-rewrite
evidence, bounded DOM transform helper coverage, movement coverage, and
small-budget eviction/recapture browser evidence.
