# GpuFlow Interaction Benchmark Harness Baseline

Date: 2026-05-06

## Scope

Added a gated Playwright benchmark for a deterministic dense GpuFlow project.
The fixture creates dense Dict kwargs, a Callable parameter section, a slider
section, a Group with a nested child section, and separate drag source/target
sections.

The benchmark currently records probe metrics for:

- top-level section resize gesture
- nested section resize gesture
- section drag/drop gesture
- parameter drag/drop gesture
- wheel scroll inside a dense section
- slider drag inside a section

## Command

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" \
SETTA_GPUFLOW_INTERACTION_BENCHMARK=1 \
SETTA_E2E_BUILD_PLUGIN_FIXTURES=0 \
SETTA_E2E_SEED_PLUGIN_FIXTURES=0 \
SETTA_E2E_SEED_PLUGIN_ARTIFACTS=0 \
./scripts/run-playwright-e2e.sh tests/e2e/gpuFlowInteractionPerformance.spec.ts
```

Result: passed, 1 test in 13.9s.

## Baseline

| Scenario                 | Duration | Frames | Frame p95 | Frame p99 | Texture uploads | Upload bytes | `writeBuffer` | `requestPaint` | Source mutations | Transform writes | Long tasks | Durable mutations |
| ------------------------ | -------: | -----: | --------: | --------: | --------------: | -----------: | ------------: | -------------: | ---------------: | ---------------: | ---------: | ----------------: |
| top-level-section-resize | 370.7 ms |     96 |    8.4 ms |    9.0 ms |               6 |    2,516,400 |            26 |              0 |              312 |               24 |          0 |                 0 |
| nested-section-resize    | 369.1 ms |     98 |    8.4 ms |    9.1 ms |               6 |    3,275,048 |            24 |              0 |              318 |               24 |          0 |                 0 |
| section-drag-drop        | 359.0 ms |     45 |    8.5 ms |    9.0 ms |               0 |            0 |             0 |              0 |              258 |                0 |          0 |                 0 |
| parameter-drag-drop      | 366.3 ms |     45 |    8.8 ms |    9.2 ms |               0 |            0 |             0 |              0 |              264 |                0 |          0 |                 0 |
| wheel-scroll             | 172.1 ms |     22 |    8.7 ms |    9.0 ms |               0 |            0 |             0 |              0 |              126 |                0 |          0 |                 0 |
| slider-input             | 261.6 ms |     32 |    8.4 ms |    8.9 ms |               0 |            0 |             0 |              0 |              186 |                0 |          0 |                 0 |

## Notes

- The harness and probe plumbing are now reproducible from source-controlled
  Playwright code and do not depend on local `setta_files` state.
- The resize and drag/drop rows are a harness baseline, not yet an optimized
  semantic baseline: durable mutation counts are still zero. Follow-up work
  should make these scripted gestures assert persisted section size/order changes
  before using the numbers as optimization targets.
- The run did validate the required Chrome feature flag plumbing for
  Playwright: `CHROME_EXTRA_ARGS` is now passed to both global setup and test
  browser launches.

## Semantic Resize Baseline

Follow-up run after making the resize scenarios assert real state changes.

Result: passed, 1 test in 14.8s.

| Scenario                 | Duration | Frames | Frame p95 | Frame p99 | Texture uploads | Upload bytes | `writeBuffer` | `requestPaint` | Source mutations | Transform writes | Long tasks | Durable mutations |
| ------------------------ | -------: | -----: | --------: | --------: | --------------: | -----------: | ------------: | -------------: | ---------------: | ---------------: | ---------: | ----------------: |
| top-level-section-resize | 598.0 ms |    180 |    9.1 ms |    9.3 ms |              49 |   16,480,064 |            15 |             70 |              558 |               30 |          0 |                 1 |
| nested-section-resize    | 722.9 ms |    162 |    9.2 ms |   16.8 ms |              56 |   14,651,192 |             0 |             77 |              643 |               30 |          0 |                 2 |
| section-drag-drop        | 382.2 ms |     82 |    8.7 ms |    9.3 ms |              31 |        3,454 |             0 |             31 |              282 |                3 |          0 |                 0 |
| parameter-drag-drop      | 453.6 ms |    142 |    8.7 ms |    9.3 ms |              26 |    5,036,816 |            24 |             20 |              390 |               28 |          0 |                 0 |
| wheel-scroll             | 163.0 ms |     20 |    9.2 ms |    9.3 ms |               0 |            0 |             0 |              0 |              114 |                0 |          0 |                 0 |
| slider-input             | 314.4 ms |     40 |    9.1 ms |    9.3 ms |               0 |            0 |             0 |              0 |              228 |                0 |          0 |                 0 |

Additional findings:

- Top-level resize now scripts the visual canvas corner and waits for persisted
  section size to change. It produces one durable `/setSectionSizes` mutation.
- Nested resize projects the nested DOM handle through its parent GpuFlow node
  and waits for persisted child size to change. It produces durable size
  mutations, but it still recaptures the parent surface heavily.
- Section drag/drop is measured through the selected-section drag overlay, but
  the Playwright drag does not yet produce a durable top-level layout request in
  this harness. Treat this row as an interaction-cost sample, not a completed
  semantic baseline.
- Parameter drag/drop is measured with visual-coordinate row projection, but it
  does not reliably produce a final reordered parameter list or `/moveParams`
  request. Treat this row as an architecture blocker for the next optimization
  slice.

## Resize Rerasterization Deferral Run

Follow-up run after deferring active resize rerasterization, stretching existing
tiled textures during live resize, suppressing resize-subtree paint invalidation
while a resize is active, and leaving resize-handle pointer ownership with the
resize controller instead of the node dirty controller.

Result: passed, 1 test in 14.4s.

| Scenario                 | Duration | Frames | Frame p95 | Frame p99 | Texture uploads | Upload bytes | `writeBuffer` | `requestPaint` | Source mutations | Transform writes | Long tasks | Durable mutations |
| ------------------------ | -------: | -----: | --------: | --------: | --------------: | -----------: | ------------: | -------------: | ---------------: | ---------------: | ---------: | ----------------: |
| top-level-section-resize | 587.8 ms |    177 |    8.8 ms |   16.2 ms |              38 |    7,642,364 |            15 |             47 |              546 |               30 |          0 |                 1 |
| nested-section-resize    | 705.7 ms |    151 |    8.8 ms |   16.5 ms |              54 |   22,994,784 |             0 |             35 |              633 |               28 |          0 |                 2 |
| section-drag-drop        | 384.4 ms |     82 |    8.4 ms |    9.2 ms |              31 |        3,454 |             0 |             31 |              282 |                3 |          0 |                 0 |
| parameter-drag-drop      | 459.1 ms |    143 |    8.7 ms |    9.3 ms |              26 |    5,036,816 |            24 |             20 |              396 |               28 |          0 |                 0 |
| wheel-scroll             | 163.6 ms |     20 |    9.1 ms |    9.2 ms |               0 |            0 |             0 |              0 |              114 |                0 |          0 |                 0 |
| slider-input             | 257.8 ms |     32 |    9.2 ms |    9.3 ms |               0 |            0 |             0 |              0 |              186 |                0 |          0 |                 0 |

Comparison to the semantic resize baseline:

- Top-level resize upload bytes dropped from 16.5 MB to 7.6 MB and
  `requestPaint` calls dropped from 70 to 47.
- Nested resize `requestPaint` calls dropped from 77 to 35, but upload bytes are
  noisy and remain high because the parent surface still receives a stream of
  dirty uploads during the nested resize path.
- The repeated 30-31 tiny uploads in section drag/drop and parameter drag/drop
  remain visible. Those rows are still non-semantic and are the next likely
  interaction-dirty optimization target after making drag/drop assertions
  durable.

## Semantic Drag/Resize Benchmark Run

Follow-up run after making drag scenarios assert real mutations:

- section drag/drop selects the drag source and performs a keyboard nudge because
  Playwright pointer drag still does not reliably move the projected top-level
  section in this harness; the benchmark flushes the pending layout debounce and
  waits for `/setTopLevelSectionLayout`.
- parameter drag/drop uses the section's movable top-level param IDs from
  project state and keeps the drop x-position aligned with the source row so the
  DnD layer exercises same-parent reorder instead of reparenting into the target
  param.

Result: passed, 1 test in 14.5s.

| Scenario                 | Duration | Frames | Frame p95 | Frame p99 | Texture uploads | Upload bytes | `writeBuffer` | `requestPaint` | Source mutations | Transform writes | Long tasks | Durable mutations |
| ------------------------ | -------: | -----: | --------: | --------: | --------------: | -----------: | ------------: | -------------: | ---------------: | ---------------: | ---------: | ----------------: |
| top-level-section-resize | 615.0 ms |    134 |    9.1 ms |   16.7 ms |              37 |    8,096,388 |            15 |             47 |              138 |               30 |          0 |                 1 |
| nested-section-resize    | 701.8 ms |    108 |    8.4 ms |   25.0 ms |              57 |   12,131,236 |             0 |             58 |              141 |               28 |          0 |                 2 |
| section-drag-drop        | 204.8 ms |     13 |   16.7 ms |   16.7 ms |               7 |    2,188,568 |             2 |              3 |                8 |                0 |          0 |                 1 |
| parameter-drag-drop      | 658.5 ms |    149 |    8.9 ms |   41.7 ms |              69 |   27,128,952 |             0 |             74 |              104 |                3 |          1 |                 1 |
| wheel-scroll             | 156.5 ms |      1 |    8.3 ms |    8.3 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |
| slider-input             | 252.8 ms |      1 |    9.2 ms |    9.2 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |

Additional findings:

- The resize rows remain durable and show lower source mutation counts than the
  earlier semantic resize run because active-resize rerasterization is deferred.
- Parameter drag/drop is now a true same-parent reorder and produces one durable
  `/moveParams` mutation, but it still triggers 69 texture uploads and 27.1 MB
  of upload traffic. That is the strongest next optimization target.
- Section drag/drop is durable through keyboard nudge, but real pointer drag
  remains unresolved in the benchmark harness. Treat this row as a selection
  movement proxy until pointer drag can move the projected section reliably.

## Parameter Drag Pointer Dirty Suppression Run

Follow-up run after marking DnD-enabled parameter rows as passive for pointermove
texture dirtiness and suppressing content paint invalidation for the active
parameter-drag section while the drag is live. Pointer projection remains active
so native DnD still receives pointer movement, and the final drop/release can
still repaint.

Result: passed, 1 test in 13.8s.

| Scenario                 | Duration | Frames | Frame p95 | Frame p99 | Texture uploads | Upload bytes | `writeBuffer` | `requestPaint` | Source mutations | Transform writes | Long tasks | Durable mutations |
| ------------------------ | -------: | -----: | --------: | --------: | --------------: | -----------: | ------------: | -------------: | ---------------: | ---------------: | ---------: | ----------------: |
| top-level-section-resize | 594.8 ms |    134 |    9.0 ms |   16.8 ms |              37 |    8,096,388 |            15 |             47 |              138 |               30 |          0 |                 1 |
| nested-section-resize    | 721.2 ms |    114 |    9.2 ms |   25.0 ms |              60 |   14,719,220 |             0 |             62 |              141 |               28 |          0 |                 2 |
| section-drag-drop        | 212.1 ms |     14 |   17.2 ms |   17.2 ms |               9 |    3,766,704 |             2 |              3 |                8 |                0 |          0 |                 1 |
| parameter-drag-drop      | 688.3 ms |    143 |    9.0 ms |   50.1 ms |              50 |    9,498,432 |             0 |             50 |              112 |                3 |          2 |                 1 |
| wheel-scroll             | 165.1 ms |      1 |    8.3 ms |    8.3 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |
| slider-input             | 253.7 ms |      1 |    8.3 ms |    8.3 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |

Comparison to the semantic drag/resize run:

- Parameter drag/drop upload bytes dropped from 27.1 MB to 9.5 MB.
- Parameter drag/drop texture uploads dropped from 69 to 50.
- Parameter drag/drop `requestPaint` calls dropped from 74 to 50.
- Remaining parameter drag/drop cost is still high enough to warrant another
  pass; likely sources are paint events from DnD placeholder/overlay changes and
  final reorder recapture.

## Section Pointer Drag Investigation

Follow-up investigation into replacing the section drag/drop keyboard proxy with
real pointer DnD.

Result: not adopted. The benchmark was restored to the durable keyboard proxy
after the pointer variants failed to produce `/moveSections` or
`/setTopLevelSectionLayout`.

Attempts:

- Dragging the selected-node rectangle while section free-move DnD was active
  did not produce a `/moveSections` mutation.
- Dragging the top-level section DOM locator while free-move DnD was active did
  not project the section for hit testing; `data-gpu-flow-interactive` stayed
  `false`.
- Dragging from canvas visual coordinates through GpuFlow pointer handoff also
  did not produce a `/moveSections` mutation, including when the start point was
  moved into the section header/title area.

Observed blocker:

- The top-level section DnD path needs either a trusted DOM activator, such as
  the selection rectangle, or a bridge that can carry GpuFlow pointer handoff
  into dnd-kit reliably. The hidden source DOM is not a valid pointer target
  while the node is not projected, and the current benchmark could not activate
  dnd-kit from the selection rectangle even when `isMovingFree` was set.

Next step:

- Instrument the section dnd-kit sensor binding or add a focused integration
  test around `selectionDragHandle` registration before using section pointer
  drag as a performance baseline. Until then, the `section-drag-drop` row remains
  a durable selected-section movement proxy rather than a real pointer DnD
  measurement.

## Restored Harness Verification Run

Follow-up run after restoring the section drag/drop scenario to the durable
keyboard proxy and leaving the pointer-DnD investigation as a documented
blocker.

Result: passed, 1 test in 15.8s.

| Scenario                 | Duration | Frames | Frame p95 | Frame p99 | Texture uploads | Upload bytes | `writeBuffer` | `requestPaint` | Source mutations | Transform writes | Long tasks | Durable mutations |
| ------------------------ | -------: | -----: | --------: | --------: | --------------: | -----------: | ------------: | -------------: | ---------------: | ---------------: | ---------: | ----------------: |
| top-level-section-resize | 612.9 ms |    134 |    9.0 ms |   17.4 ms |              37 |    8,096,388 |            15 |             47 |              138 |               30 |          0 |                 1 |
| nested-section-resize    | 718.4 ms |    111 |    9.3 ms |   24.1 ms |              59 |   14,261,844 |             0 |             57 |              141 |               28 |          0 |                 2 |
| section-drag-drop        | 211.5 ms |     15 |   16.7 ms |   16.7 ms |               9 |    3,766,704 |             2 |              3 |                8 |                0 |          0 |                 1 |
| parameter-drag-drop      | 730.0 ms |    152 |    9.1 ms |   50.0 ms |              49 |   15,666,384 |             0 |             66 |              104 |                3 |          2 |                 1 |
| wheel-scroll             | 164.7 ms |      1 |    7.3 ms |    7.3 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |
| slider-input             | 253.5 ms |      1 |    8.4 ms |    8.4 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |

Notes:

- The section row is back to the durable keyboard proxy and remains comparable
  to the previous proxy rows.
- Parameter drag/drop stayed below the pre-suppression 27.1 MB upload baseline
  but was noisier than the first pointer-dirty suppression run at 15.7 MB versus
  9.5 MB.

## Nested Resize Parent Paint Suppression Run

Follow-up run after mapping active nested section resize events to their
top-level GpuFlow parent node, suppressing parent content paint invalidation
while the nested resize is active, and dispatching one final dimension-dirty
event when suppression releases.

Result: passed, 1 test in 13.6s.

| Scenario                 | Duration | Frames | Frame p95 | Frame p99 | Texture uploads | Upload bytes | `writeBuffer` | `requestPaint` | Source mutations | Transform writes | Long tasks | Durable mutations |
| ------------------------ | -------: | -----: | --------: | --------: | --------------: | -----------: | ------------: | -------------: | ---------------: | ---------------: | ---------: | ----------------: |
| top-level-section-resize | 587.6 ms |    134 |    8.8 ms |   16.7 ms |              37 |    8,096,388 |            15 |             47 |              138 |               30 |          0 |                 1 |
| nested-section-resize    | 695.1 ms |    108 |    8.7 ms |   24.9 ms |              43 |    6,294,788 |             0 |             58 |              141 |               28 |          0 |                 2 |
| section-drag-drop        | 204.5 ms |     13 |   16.8 ms |   16.8 ms |               7 |    2,188,568 |             2 |              3 |                8 |                0 |          0 |                 1 |
| parameter-drag-drop      | 698.9 ms |    145 |    8.9 ms |   41.7 ms |              49 |   15,666,384 |             0 |             66 |              104 |                3 |          1 |                 1 |
| wheel-scroll             | 165.1 ms |      1 |    8.4 ms |    8.4 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |
| slider-input             | 252.9 ms |      1 |    8.4 ms |    8.4 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |

Comparison to the restored harness verification run:

- Nested resize upload bytes dropped from 14.3 MB to 6.3 MB.
- Nested resize texture uploads dropped from 59 to 43.
- Nested resize `requestPaint` calls were flat at 57 to 58, which indicates the
  source still emits paint notifications during the projected child resize but
  the parent surface no longer rerasterizes for most of them.

## Visual Section Pointer Drag Run

Follow-up run after adding a GpuFlow visual-node drag target fallback for
CanvasDrawElement/WebGPU surfaces and blocking background pan when a primary
pointer drag begins over a draggable visual node. The benchmark now drags the
section by an unoccluded header/title point instead of using the keyboard proxy,
so `section-drag-drop` is a real pointer drag with `/setTopLevelSectionLayout`
persistence.

Result: passed, 1 test in 13.9s.

| Scenario                 | Duration | Frames | Frame p95 | Frame p99 | Texture uploads | Upload bytes | `writeBuffer` | `requestPaint` | Source mutations | Transform writes | Long tasks | Durable mutations |
| ------------------------ | -------: | -----: | --------: | --------: | --------------: | -----------: | ------------: | -------------: | ---------------: | ---------------: | ---------: | ----------------: |
| top-level-section-resize | 595.5 ms |    133 |    8.4 ms |   16.7 ms |              36 |    7,230,588 |            15 |             47 |              138 |               30 |          0 |                 1 |
| nested-section-resize    | 708.9 ms |    110 |    9.1 ms |   25.0 ms |              43 |    6,292,228 |             0 |             58 |              141 |               28 |          0 |                 2 |
| section-drag-drop        | 496.2 ms |     83 |    8.4 ms |   16.9 ms |               8 |    5,290,472 |            24 |              1 |              126 |               30 |          0 |                 1 |
| parameter-drag-drop      | 622.3 ms |    128 |    8.7 ms |   41.8 ms |              27 |   10,517,984 |             0 |             27 |               16 |                3 |          1 |                 1 |
| wheel-scroll             | 166.4 ms |      1 |    8.3 ms |    8.3 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |
| slider-input             | 258.0 ms |      1 |    8.3 ms |    8.3 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |

Notes:

- The section row is no longer the keyboard proxy. It performs 30 visual
  transform writes, 24 flat-vertex buffer writes, one durable
  `/setTopLevelSectionLayout` mutation, and only one `requestPaint`, so the
  active drag path stays transform/buffer-bound instead of repaint-bound.
- Drag starts over projected section source DOM can carry broad legacy
  `.nodrag` wrappers. The resolver treats projected source hits as visual-node
  drag candidates but still blocks actual interactive controls.
- Parameter drag/drop improved on this run compared with the nested resize
  suppression run, dropping from 49 to 27 texture uploads and from 15.7 MB to
  10.5 MB upload traffic; it remains the next interaction to stabilize further.

## Visual Section Pointer Drag Post-Refactor Verification Run

Follow-up run after extracting the visual node drag hit-testing helpers out of
`flowSurface.tsx` to satisfy the frontend file-length limit. The benchmark
numbers stayed materially equivalent to the visual section pointer drag run.

Result: passed, 1 test in 13.8s.

| Scenario                 | Duration | Frames | Frame p95 | Frame p99 | Texture uploads | Upload bytes | `writeBuffer` | `requestPaint` | Source mutations | Transform writes | Long tasks | Durable mutations |
| ------------------------ | -------: | -----: | --------: | --------: | --------------: | -----------: | ------------: | -------------: | ---------------: | ---------------: | ---------: | ----------------: |
| top-level-section-resize | 591.1 ms |    134 |    8.7 ms |   16.7 ms |              37 |    8,096,388 |            15 |             47 |              138 |               30 |          0 |                 1 |
| nested-section-resize    | 705.6 ms |    110 |    9.2 ms |   16.7 ms |              43 |    6,292,228 |             0 |             58 |              141 |               28 |          0 |                 2 |
| section-drag-drop        | 505.6 ms |     84 |    8.4 ms |   16.8 ms |               8 |    5,290,472 |            24 |              1 |              126 |               30 |          0 |                 1 |
| parameter-drag-drop      | 597.9 ms |    128 |    8.7 ms |   33.4 ms |              27 |   10,517,984 |             0 |             27 |               16 |                3 |          1 |                 1 |
| wheel-scroll             | 167.0 ms |      1 |    8.3 ms |    8.3 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |
| slider-input             | 263.1 ms |      1 |    8.4 ms |    8.4 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |

## Viewport Pan/Zoom Source-DOM Suppression Run

Follow-up run after adding explicit viewport pan/zoom benchmark coverage,
removing the section shell `viewportInteractionActive` transform promotion from
CanvasDrawElement source DOM, suppressing generic dirty events while pan/zoom
owns the interaction, and waiting for setup/settle churn outside measured
windows.

Result: passed, 1 test in 19.1s.

| Scenario                 | Duration | Frames | Frame p95 | Frame p99 | Texture uploads | Upload bytes | `writeBuffer` | `requestPaint` | Source mutations | Transform writes | Long tasks | Durable mutations |
| ------------------------ | -------: | -----: | --------: | --------: | --------------: | -----------: | ------------: | -------------: | ---------------: | ---------------: | ---------: | ----------------: |
| top-level-section-resize | 594.8 ms |    136 |    9.6 ms |   10.3 ms |              35 |    5,840,028 |            15 |             48 |               72 |                2 |          0 |                 1 |
| nested-section-resize    | 719.5 ms |    106 |   10.2 ms |   23.9 ms |              37 |    7,813,044 |             0 |             37 |               85 |                0 |          0 |                 1 |
| section-drag-drop        | 494.7 ms |     81 |    8.7 ms |   17.1 ms |               5 |    3,308,024 |            24 |              1 |               70 |                2 |          0 |                 1 |
| parameter-drag-drop      | 665.0 ms |    130 |    9.6 ms |   50.9 ms |              28 |   16,685,936 |             0 |             43 |               16 |                3 |          2 |                 1 |
| viewport-pan-zoom        | 249.3 ms |     54 |    9.0 ms |   16.7 ms |               0 |            0 |            25 |              0 |                2 |                0 |          0 |                 0 |
| wheel-scroll             | 162.6 ms |      1 |    8.3 ms |    8.3 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |
| slider-input             | 261.6 ms |      1 |    8.3 ms |    8.3 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |
| text-input               | 326.5 ms |     34 |   16.7 ms |   16.7 ms |               0 |            0 |             0 |              2 |               21 |                3 |          0 |                 0 |

Notes:

- Active viewport pan/zoom now has zero texture uploads, zero upload bytes, zero
  `requestPaint` calls, and zero source transform writes. Earlier viewport
  probes on this branch showed zero uploads but still had 6-7 `requestPaint`
  calls and 88 source mutations with 42 transform writes.
- Removing the per-section viewport-interaction CSS transform also reduced
  transform writes in the resize and section drag rows. Top-level resize dropped
  from 30 transform writes to 2; nested resize dropped from 28 to 0.
- The viewport row still records two non-transform source attribute mutations.
  They do not trigger texture uploads or `requestPaint`, so the remaining
  active pan/zoom path is camera-uniform buffer writes only.

## Parameter Drag Dirty-Mark Suppression Run

Follow-up run after suppressing direct node-interaction dirty marks for nodes in
the active content-paint suppression set. This prevents the DOM/dnd-kit-owned
parameter drag source from queuing repeated texture work while its containing
section is intentionally paint-suppressed.

Result: passed, 1 test in 23.5s.

| Scenario                 | Duration | Frames | Frame p95 | Frame p99 | Texture uploads | Upload bytes | `writeBuffer` | `requestPaint` | Source mutations | Transform writes | Long tasks | Durable mutations |
| ------------------------ | -------: | -----: | --------: | --------: | --------------: | -----------: | ------------: | -------------: | ---------------: | ---------------: | ---------: | ----------------: |
| top-level-section-resize | 621.7 ms |    132 |    9.1 ms |   25.0 ms |              31 |    5,329,196 |            15 |             45 |               72 |                2 |          0 |                 1 |
| nested-section-resize    | 692.9 ms |     81 |    8.5 ms |   33.3 ms |              17 |    4,043,656 |             0 |             11 |               85 |                0 |          0 |                 1 |
| section-drag-drop        | 496.1 ms |     83 |    8.9 ms |   16.6 ms |               6 |    4,020,360 |            24 |              1 |               70 |                2 |          0 |                 1 |
| parameter-drag-drop      | 662.2 ms |    119 |    9.2 ms |   55.2 ms |              16 |    8,755,052 |             0 |              1 |               16 |                3 |          2 |                 1 |
| viewport-pan-zoom        | 245.3 ms |     54 |    8.4 ms |   16.7 ms |               0 |            0 |            25 |              0 |                2 |                0 |          0 |                 0 |
| wheel-scroll             | 172.6 ms |      1 |    8.2 ms |    8.2 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |
| slider-input             | 259.0 ms |      1 |    8.3 ms |    8.3 ms |               0 |            0 |             0 |              0 |                0 |                0 |          0 |                 0 |
| text-input               | 355.1 ms |     34 |   33.3 ms |   33.3 ms |               0 |            0 |             0 |              2 |               21 |                3 |          0 |                 0 |

Comparison to the viewport pan/zoom source-DOM suppression run:

- Parameter drag/drop `requestPaint` dropped from 43 to 1.
- Parameter drag/drop texture uploads dropped from 28 to 16.
- Parameter drag/drop upload bytes dropped from 16.7 MB to 8.8 MB.

Remaining blocker:

- The active parameter drag path is now mostly bounded during pointer movement,
  but final reorder/reset is still owned by React/dnd-kit inside the source DOM.
  That final DOM reset can still recapture multiple visible section surfaces.
  Removing that remaining upload traffic requires moving parameter drag preview,
  placeholder, and final visual reorder to renderer-owned metadata or the
  full-scene canvas content architecture tracked by
  `docs/plans/gpuflow-full-scene-canvas-content-clean-break-plan.md`.
