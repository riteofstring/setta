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
- `GpuFlow` accepts `nodeTextureMemoryBudgetBytes` and forwards it through the
  production node-layer frame path to the manager-owned eviction API, so browser
  stress fixtures and future project settings can exercise the same renderer
  path under a smaller budget.
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
| Frame budget forwarding test | `1,048,576` byte budget passed to `evictNodeTextures()` |

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

## Large Graph Budget Stress Addendum

Command used:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Clean CDP page run, corrected harness preserving
`setta-gpu-flow__canvas` sizing:

- Mounted production `GpuFlow` with `900` deterministic nodes in a `30 x 30`
  sparse grid.
- Used the production `GpuFlow` node layer, production texture manager, and
  `onNodeLayerFrame` probe; no mock renderer or fallback path was used.
- Configured `nodeTextureMemoryBudgetBytes = 10,485,760` bytes (`10 MiB`) to
  force eviction without requiring hundreds of MiB of GPU memory.
- Panned across `80` sparse graph positions after warmup; probe reset happened
  after the first valid texture frame so mount-time work was excluded.
- Screenshot:
  `perf/reports/frontend/gpu-flow-phase5-large-graph-budget-stress-2026-04-30.png`
  (ignored by perf artifact policy).

| Metric | Value |
| --- | ---: |
| Device pixel ratio | `2` |
| Canvas CSS size | `1400 x 900` |
| Node count | `900` |
| Pan positions | `80` |
| Layer frames | `160` |
| RAF frames | `160` |
| Average frame interval | `32.08 ms` |
| Worst frame interval | `58.50 ms` |
| Long tasks | `0` |
| Texture uploads | `2,160` |
| Unique uploaded nodes | `729` |
| Eviction frames | `77` |
| Unique evicted nodes | `691` |
| Evicted bytes total | `194,469,696` |
| Max allocated texture bytes | `10,457,856` |
| Final allocated texture bytes | `10,381,248` |
| Max visible texture bytes | `2,614,464` |
| Max texture count | `38` |
| Max visible nodes | `9` |
| Latest drawn nodes | `9` |
| `writeBuffer()` calls | `160` |
| Camera uniform writes | `80` |
| Node vertex writes | `80` |

Memory stabilized below the configured `10 MiB` budget while panning across
nodes that were not all simultaneously visible. Visible texture bytes stayed
well below the budget, while offscreen textures were evicted by the manager LRU
policy and recaptured when needed.

The clean page still reported existing development-console noise unrelated to
this change: React Router future-flag warning, React 19 `element.ref` warnings,
and input `id`/`name` accessibility issues from the synthetic node controls. The
corrected run produced no WebGPU maximum-texture or invalid-command warnings.

## Remaining Phase 5 Work

- Phase 5 is complete for manager-owned texture byte accounting, protected
  offscreen eviction, frame/debug visibility, focused tests, and a production
  `GpuFlow` browser stress run. Future budget tuning should use additional
  project-scale reports rather than changing this initial default from the
  synthetic run alone.
