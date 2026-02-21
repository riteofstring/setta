# Settings view switch performance

## 2026-02-20 - Run 1 (baseline)
- Environment:
  - Frontend: dev server at `http://127.0.0.1:3011/settings`
  - Browser profiling: chrome-devtools-mcp
- Scenario:
  - Switch tabs in the settings project bottom tab bar.
  - Measured from click to "active tab + stable `.react-flow__node` count".
- Method:
  - In-page script executed via CDP (`evaluate_script`).
  - Stability check: node count unchanged for 3 samples (40ms interval).

| Switch target | Duration (ms) | Node count |
| --- | ---: | ---: |
| Core | 727.8 | 5 |
| Section Defaults Structure and Code | 1029.4 | 9 |
| Section Defaults Content and Media | 841.9 | 10 |
| Param Defaults | 905.2 | 13 |
| All Settings | 1841.9 | 42 |

Notes:
- Largest observed cost was switching into `All Settings`.
- Most non-`All Settings` transitions were ~0.8s-1.0s.

## 2026-02-20 - Run 2 (after optimistic active view-mode switching)
- Change set:
  - Frontend optimistic active-view-mode updates added for:
    - bottom tab bar (`ViewModeTabs`)
    - overview view-mode list (`ViewingEditingMode`)
    - URL-driven mode switching (`useViewModeUrlSync`)
  - Local store/node/viewport sync now happens immediately before backend websocket reconciliation.

| Switch target | Duration (ms) | Node count |
| --- | ---: | ---: |
| Core | 606.7 | 5 |
| Section Defaults Structure and Code | 679.3 | 9 |
| Section Defaults Content and Media | 682.7 | 10 |
| Param Defaults | 656.1 | 13 |
| All Settings | 1885.6 | 42 |

## Delta summary (Run 2 vs Run 1)
- Core: -121.1 ms
- Section Defaults Structure and Code: -350.1 ms
- Section Defaults Content and Media: -159.2 ms
- Param Defaults: -249.1 ms
- All Settings: +43.7 ms (within run-to-run variance)

Interpretation:
- This change improved perceived latency for most tab switches by updating UI state immediately.
- `All Settings` remains the dominant expensive transition and still needs deeper optimization (render/reconcile/payload cost).

## 2026-02-20 - Run 3 (after deferred node-dimension update scheduling)
- Change set:
  - Node-dimension updates requested by `useMisc.requestUpdateNodeDimensions` were deferred/coalesced via `requestAnimationFrame` in `frontend/src/state/subscriptions.ts`.

| Switch target | Duration (ms) | Node count |
| --- | ---: | ---: |
| Core | 658.9 | 5 |
| Section Defaults Structure and Code | 706.4 | 9 |
| Section Defaults Content and Media | 686.4 | 10 |
| Param Defaults | 650.8 | 13 |
| All Settings | 1862.3 | 42 |

Notes:
- This reduced immediate synchronous work on the interaction path but did not materially improve `All Settings`.
- `All Settings` remained the dominant slow path.

## 2026-02-20 - Run 4 (after edge-handle geometry gating when no edges)
- Change set:
  - Added edge-handle geometry guard in `frontend/src/state/actions/edgeHandles.ts`:
    - skip `getBoundingClientRect`/position updates when `projectConfig.edges.length === 0`
    - keep handle registration, but defer position computation until edge rendering/connection needs it
  - Removed duplicate immediate handle position update in `frontend/src/forks/xyflow/core/components/Handle/index.tsx`.
  - Skipped `recomputeEdgeHandlePositions()` in `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx` when there are no edges.

| Switch target | Duration (ms) | Node count |
| --- | ---: | ---: |
| Core | 613.2 | 5 |
| Section Defaults Structure and Code | 373.8 | 9 |
| Section Defaults Content and Media | 623.2 | 10 |
| Param Defaults | 361.5 | 13 |
| All Settings | 1542.7 | 42 |

Notes:
- Repeated sample runs still showed variance on `All Settings` (~1534ms to ~1849ms), but the lower-bound and median behavior improved relative to Run 3.
- A focused `Core -> All Settings` performance trace no longer surfaced the previous forced-reflow hotspot.

## Delta summary (Run 4 vs Run 3)
- Core: -45.7 ms
- Section Defaults Structure and Code: -332.6 ms
- Section Defaults Content and Media: -63.2 ms
- Param Defaults: -289.3 ms
- All Settings: -319.6 ms

## 2026-02-20 - Run 5 (after suppressing unchanged node-dimension writes)
- Change set:
  - `frontend/src/state/actions/nodeInternals.ts`
    - `updateNodeDimensions` now skips `useNodeInternals.setState` and layout persistence dispatch when measured dimensions are unchanged.
    - `getNodeUpdateInformation` no longer forces updates for every node when no dimension change occurred.

| Switch target | Duration (ms) | Node count |
| --- | ---: | ---: |
| Core | 612.2 | 5 |
| Section Defaults Structure and Code | 331.1 | 9 |
| Section Defaults Content and Media | 574.7 | 10 |
| Param Defaults | 369.2 | 13 |
| All Settings | 1377.4 | 42 |

## Delta summary (Run 5 vs Run 4)
- Core: -1.0 ms
- Section Defaults Structure and Code: -42.7 ms
- Section Defaults Content and Media: -48.5 ms
- Param Defaults: +7.7 ms
- All Settings: -165.3 ms

Trace observation:
- Focused `Core -> All Settings` trace still returned no forced-reflow/DOM-size insights after this change.

## 2026-02-20 - Run 6 (after backend active-view-mode ack node-map short-circuit)
- Change set:
  - Added pending-op kind tagging for optimistic operations (`PendingOperationKindEnum`).
  - Tagged `persistActiveViewMode` optimistic ops as `active_view_mode`.
  - Added frontend reconcile guard in `processProjectStateUpdateFromBackend`:
    - if backend update only completes active-view-mode optimistic ops and node-map inputs are unchanged,
      skip `createNodesMapFromProjectConfigChildren(...)` + `useNodeInternals.setState(...)`.

| Switch target | Duration (ms) | Node count |
| --- | ---: | ---: |
| Core | 564.0 | 5 |
| Section Defaults Structure and Code | 324.0 | 9 |
| Section Defaults Content and Media | 570.4 | 10 |
| Param Defaults | 364.0 | 13 |
| All Settings | 1316.0 | 42 |

## Delta summary (Run 6 vs Run 5)
- Core: -48.2 ms
- Section Defaults Structure and Code: -7.1 ms
- Section Defaults Content and Media: -4.3 ms
- Param Defaults: -5.2 ms
- All Settings: -61.4 ms

Trace observation:
- Focused `Core -> All Settings` trace continued to show no forced-reflow/DOM-size insight entries.

## 2026-02-20 - Root-cause observations (why large view switches stay expensive)
- Live `All Settings` DOM snapshot (CDP evaluate script):
  - `reactFlowNodes`: `42`
  - `sectionHeaders`: `42`
  - `paramRows`: `697`
  - `kwargsControls`: `42`
  - `handles`: `84`
  - total DOM elements: `9711`
- Dominant bottleneck is frontend rendering/measurement scale, not backend handler latency:
  - backend `setActiveViewMode` handlers typically complete around ~170ms in logs, while end-to-end tab switch remains ~1.3s-1.5s.

Observed root causes:
1. Large one-shot mount workload in `All Settings`:
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` mounts full area trees for every visible section via `AreaSwitch`.
- This produces a high immediate main-thread burst when many sections become visible at once.

2. Repeated synchronous layout measurement across many section subtrees:
- `frontend/src/components/Section/Header/SectionHeader.tsx` uses `getComputedStyle` + `offsetHeight` + `ResizeObserver` per section header.
- `frontend/src/components/Section/SectionParts/KwargsControls.tsx` runs similar measurement logic for each args controls row.
- `frontend/src/components/Section/SectionParts/Search.tsx` measures search height and computes handle offsets, including `getBoundingClientRect` fallback logic.

3. Param-area observer/measurement fan-out:
- `frontend/src/components/Params/GroupContainer.tsx` uses `MutationObserver` and `ResizeObserver`, queries `[data-param-row]` elements, and iterates row heights for min-height calculation.
- With hundreds of param rows, this scales poorly during large view switches.

4. High volume of per-item global-store derivation work:
- `frontend/src/components/Section/Container/SectionContainer.tsx` derives multiple values per section from project state (`getCurrEffectiveSectionImpl`, view-mode visibility, active membership, codegen checks).
- `frontend/src/components/Params/ParamContainer.tsx` computes display metadata per param row using store selectors.

5. Expensive deep comparison usage in hot render paths:
- `_.isEqual` is used in several high-frequency selectors/memo boundaries (for example in `SectionContainer`, `ContainerWrappers`, and `ParamContainer`).
- At large tree sizes, deep equality checks add non-trivial CPU overhead.

## 2026-02-21 - Run 7 (baseline refresh before no-virtualization workstreams)
- Environment:
  - Frontend: dev server at `http://127.0.0.1:3011/settings`
  - Browser profiling: chrome-devtools-mcp
- Scenario:
  - Fixed tab sequence: `Core -> Section Defaults Structure and Code -> Section Defaults Content and Media -> Param Defaults -> All Settings`.
  - Two consecutive passes with the same in-page harness.
- Method:
  - Click target tab via `button[aria-label="<tab name>"]`.
  - `activeMs`: click -> tab style becomes active (first visual response proxy).
  - `settledMs`: click -> active tab + stable `.react-flow__node` count (3 consecutive 40ms samples).
  - Long tasks collected with `PerformanceObserver({ entryTypes: ['longtask'] })` for each switch.

### Pass A / Pass B timings
| Switch target | Active ms (A) | Settled ms (A) | Active ms (B) | Settled ms (B) | Node count |
| --- | ---: | ---: | ---: | ---: | ---: |
| Core | 0.5 | 125.3 | 0.3 | 124.8 | 5 |
| Section Defaults Structure and Code | 756.0 | 915.5 | 461.2 | 649.5 | 9 |
| Section Defaults Content and Media | 241.7 | 381.7 | 335.4 | 597.8 | 10 |
| Param Defaults | 507.3 | 648.4 | 275.5 | 442.2 | 13 |
| All Settings | 1240.1 | 1515.7 | 1112.8 | 1704.1 | 42 |

### Long-task summary
| Pass | Total long tasks | Largest long task (ms) | `All Settings` long-task total (ms) | `All Settings` largest long task (ms) |
| --- | ---: | ---: | ---: | ---: |
| A | 10 | 869 | 1387 | 869 |
| B | 11 | 947 | 1584 | 947 |

### Snapshot + interpretation
- `All Settings` DOM scale remained large:
  - `reactFlowNodes`: `42`
  - `paramRows`: `697`
  - `handles`: `84`
  - total DOM elements: `9711`
- `Core -> All Settings` settled latency in this baseline refresh was ~`1.52s` to `1.70s`.
- Compared with the previous best run (`Run 6` All Settings `1316.0 ms`), this refresh is slower and confirms persistent variance on the heavy switch path.

### Trace note
- A focused `Core -> All Settings` CDP trace was recorded in this session.
- The MCP summary returned no insight entries for this interaction window, so scripting-vs-rendering split was not directly available from the insight API in this run.

## 2026-02-21 - Run 8 (after Workstream A: keep section trees mounted, hide instead of unmount)
- Change set:
  - `createNodesMapFromProjectConfigChildren(...)` now keeps top-level sections in the node map and marks non-rendered sections with `hidden: true` instead of dropping them.
  - `SectionContainer` no longer hard-returns `null` for hidden sections; hidden sections are style-hidden (`display: none`) in container wrappers.
  - Node wrapper now applies `display: none` + `pointer-events: none` for hidden nodes.
  - `getNodes()` now excludes hidden nodes by default (opt-in includeHidden), preserving minimap/fit-view/selection behavior.
  - Drag-item selection ignores hidden nodes.

- Measurement note:
  - Because hidden top-level nodes remain mounted, this run tracks both:
    - `visibleNodeCount` (nodes not `display:none`)
    - `totalNodeCount` (all mounted `.react-flow__node` elements)

### Pass A / Pass B timings
| Switch target | Active ms (A) | Settled ms (A) | Active ms (B) | Settled ms (B) | Visible nodes | Total mounted nodes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Core | 0.2 | 125.5 | 0.3 | 126.6 | 5 | 42 |
| Section Defaults Structure and Code | 498.8 | 758.8 | 502.2 | 767.3 | 9 | 42 |
| Section Defaults Content and Media | 366.7 | 741.7 | 362.9 | 733.8 | 10 | 42 |
| Param Defaults | 257.5 | 738.6 | 248.1 | 730.7 | 13 | 42 |
| All Settings | 436.4 | 945.3 | 417.5 | 927.7 | 42 | 42 |

### Long-task summary
| Pass | Total long tasks | Largest long task (ms) | `All Settings` long-task total (ms) | `All Settings` largest long task (ms) |
| --- | ---: | ---: | ---: | ---: |
| A | 12 | 443 | 778 | 356 |
| B | 12 | 444 | 764 | 360 |

### Delta summary vs Run 7 baseline refresh
- `Core -> All Settings` settled latency improved from ~`1515.7-1704.1 ms` to ~`927.7-945.3 ms`.
- `Core -> All Settings` first-visual-response proxy (`activeMs`) improved from ~`1112.8-1240.1 ms` to ~`417.5-436.4 ms`.
- Largest long task on the sequence dropped from ~`869-947 ms` to ~`443-444 ms`.

Tradeoff observed:
- `All Settings` transition improved materially.
- Some intermediate tab transitions (`Content and Media`, `Param Defaults`) were slower than the previous run-7 medians, so follow-up work should target per-section measurement/observer cost while keeping mounted-tree wins.

### Focused trace observation
- Trace file: `perf/traces/2026-02-21-core-to-all-settings-workstream-a.trace.json`
- CDP insights surfaced in this run:
  - `DOMSize`
  - `ForcedReflow`
- Top forced-reflow hotspot from insight output:
  - `checkScrollable` in `frontend/src/state/hooks/sectionSizes.ts` (reported total reflow time ~`188 ms`)
  - additional hit in `updateHeight` in `frontend/src/components/Section/Header/SectionHeader.tsx`

## 2026-02-21 - Run 9 (after batching `useIsScrollable` observer measurements)
- Change set:
  - `frontend/src/state/hooks/sectionSizes.ts`
    - `useIsScrollable` now batches `ResizeObserver`/`MutationObserver` checks into a single `requestAnimationFrame` pass.
    - Scrollability state updates are now change-detected before calling `setState`, reducing redundant updates.

### Pass A / Pass B timings
| Switch target | Active ms (A) | Settled ms (A) | Active ms (B) | Settled ms (B) | Visible nodes | Total mounted nodes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Core | 0.3 | 126.7 | 0.3 | 127.6 | 5 | 42 |
| Section Defaults Structure and Code | 498.3 | 766.6 | 464.8 | 727.7 | 9 | 42 |
| Section Defaults Content and Media | 381.6 | 788.6 | 363.2 | 752.3 | 10 | 42 |
| Param Defaults | 291.7 | 781.5 | 258.5 | 726.6 | 13 | 42 |
| All Settings | 494.3 | 996.9 | 425.0 | 900.0 | 42 | 42 |

### Long-task summary
| Pass | Total long tasks | Largest long task (ms) | `All Settings` long-task total (ms) | `All Settings` largest long task (ms) |
| --- | ---: | ---: | ---: | ---: |
| A | 12 | 423 | 868 | 375 |
| B | 12 | 393 | 787 | 363 |

### Comparison note
- Compared with Run 8, the `All Settings` path remained around the ~`0.9s-1.0s` settled range in this sample set.
- Largest long task reduced further in this run sample (`~393 ms` pass B vs `~444 ms` in Run 8 pass B).

### Trace note
- Trace file recorded: `perf/traces/2026-02-21-core-to-all-settings-workstream-a-plus-scroll-batching.trace.json`.
- CDP transport disconnected while stopping/reading insight details, so insight-level breakdown could not be extracted in this run.
