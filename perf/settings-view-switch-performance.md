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
