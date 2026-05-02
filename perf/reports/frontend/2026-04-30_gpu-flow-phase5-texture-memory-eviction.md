# GPU Flow Phase 5 Texture Memory Accounting And Eviction

Date: 2026-04-30

## Scope

Implemented the manager-owned Phase 5 slice for texture memory accounting and
protected offscreen eviction.

Changed owners:

- `frontend/src/gpuFlow/nodeTextures.ts`
- `frontend/src/gpuFlow/GpuNodeLayer.tsx`
- `frontend/tests/e2e/gpuFlowPerformanceProbe.ts`

## Before

- `NodeTextureRecord` exposed pixel dimensions but no byte estimate.
- `NodeTextureManager` retained every registered texture until explicit node
  unmount or manager teardown.
- Frame/debug results did not expose allocated bytes, visible bytes, largest
  texture, or evicted texture ids.

## After

- Each record estimates `textureBytes` from pixel width, pixel height, and GPU
  texture format.
- `NodeTextureManager.getTextureMemorySnapshot()` reports allocated bytes,
  visible bytes, largest texture, and texture counts.
- `NodeTextureManager.evictNodeTextures()` enforces a configurable budget
  (`384 MiB` default) with deterministic least-recent-visible eviction.
- Eviction protects visible nodes, explicit protected ids, interactive records,
  and dirty interactive records.
- `renderGpuNodeLayerFrame()` calls eviction after render and reports
  `textureMemory`, `textureMemoryBeforeEviction`, evicted bytes, and evicted node
  ids.
- The browser performance probe now preserves those frame memory and eviction
  fields.

## Focused Results

| Check | Result |
| --- | ---: |
| DPR accounting sample | `200 x 100 x 4 = 80,000` bytes |
| Resolution upgrade sample | `300 x 150 x 4 = 180,000` bytes |
| Max texture clamp sample | `1024 x 512 x 4 = 2,097,152` bytes |
| LRU eviction test | `1,200 -> 800` bytes, evicted `oldest` |
| Protected eviction test | evicted only `candidate`; visible/explicit/interactive/dirty-interactive retained |

Focused verification:

```bash
pnpm -C frontend exec vitest run src/gpuFlow/nodeTextures.test.ts src/gpuFlow/GpuNodeLayer.test.tsx tests/e2e/gpuFlowPerformanceProbe.test.ts --environment jsdom
```

Result: 38 tests passed.

## CDP Browser Check

Command used:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Settings -> All Settings, zoom `1`, screenshot:

- `perf/reports/frontend/gpu-flow-phase5-texture-memory-eviction-2026-04-30.png`

Settings wheel-pan sample after idle:

| Metric | Value |
| --- | ---: |
| Mounted GPU node DOM count | 5 |
| `copyElementImageToTexture()` calls | 6 |
| `writeBuffer()` calls | 18 |
| Camera uniform writes | 18 |
| Node quad vertex writes | 0 |
| Console errors/warnings | 0 |

Synthetic in-page production `GpuFlow` harness with `onNodeLayerFrame`:

| Metric | Value |
| --- | ---: |
| Node-layer frames captured | 20 |
| Drawn nodes in latest frame | 12 |
| Allocated texture bytes | 2,361,600 |
| Visible texture bytes | 2,361,600 |
| Largest texture | 196,800 bytes |
| Texture count | 12 |
| Evicted bytes | 0 |

No eviction was expected in the browser harness because the sample stayed under
the default `384 MiB` budget. Eviction behavior is covered by the focused
manager tests with a small configured budget.

## Remaining Phase 5 Work

- Add the large-graph/stress browser scenario that pans across enough nodes to
  show memory stabilizing under the eviction budget.
- Tune any future project-level budget setting only after that stress report has
  measured real graph scales.
