# Workspace Runtime Performance - 2026-06-30

## Scope

This report records the post-change verification for the workspace runtime,
presentation drag/drop workflow, chat streaming workflow, and Pixi workflow graph
scale validation.

The related work modularized the Pixi renderer runtime, extracted pane
presentation controls, tuned runtime budgeting/interpolation behavior, and
stabilized the Electron performance harnesses so they sample after the relevant
interactive state is active.

## Baseline

The 2026-06-28 local report recorded:

- `chat-stream-performance`: passed with p95 18.50 ms, p99 31.60 ms, max
  34.40 ms, and 0 long tasks.
- `pane-drag-drop-benchmark-performance`: failed before frame assertions because
  the normal-row drag highlighted `workspace_pane_31` instead of the intended
  target.

The earlier Pixi scale report from 2026-06-05 passed correctness assertions but
kept timing report-only. It recommended starting the next phase with visible
node/port pooling because sparse 5,000-node performance already exceeded the
interaction budget.

## Local Verification

All commands below used the already-built desktop app and temporary app data.

| Workflow | Command | Artifact | Result |
| --- | --- | --- | --- |
| Pane drag/drop benchmark | `node desktop/tests/electron/pane-drag-drop-benchmark-performance.test.mjs --skip-build` | `.recordings/pane-drag-drop-benchmark-performance/20260630T191848731Z` | Passed |
| Chat stream performance | `node desktop/tests/electron/chat-stream-performance.test.mjs --skip-build` | `.recordings/chat-stream-performance/20260630T191913449Z` | Passed |
| Workflow graph scale validation | `node desktop/tests/electron/workflow-graph-scale-validation.test.mjs --skip-build` | `.recordings/workflow-graph-scale-validation/20260630T192001765Z` | Passed |

### Pane Drag/Drop

The benchmark now reaches the frame assertions for both normal-row and overview
dragging.

| Scenario | Visible panes | p95 frame | p99 frame | Max frame | Long tasks | React commits during movement | Snapshot capture requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal row drop | 40 | 16.70 ms | 16.70 ms | 17.50 ms | 0 | 0 | 0 |
| Overview drag | 500 | 16.70 ms | 16.70 ms | 17.00 ms | 0 | 0 | 0 |

The overview drag sample held the WebGPU canvas snapshot path stable with
8,471,250 backing-store pixels, a 33,885,000 byte GPU memory estimate, and 3
renderer resize observations during setup.

### Chat Stream

`chat-stream-performance` passed on the local 60 Hz run:

- p95 frame delta: 17.40 ms
- p99 frame delta: 17.50 ms
- max frame delta: 17.50 ms
- frame count: 129
- long tasks: 0

This improves on the 2026-06-28 local p99 and max frame results while preserving
the zero-long-task result.

### Workflow Graph Scale

All eight scale scenarios passed.

| Nodes | Edge density | Initial render |
| ---: | ---: | ---: |
| 500 | 1 | 1.90 s |
| 500 | 2 | 1.88 s |
| 1,000 | 1 | 2.17 s |
| 1,000 | 2 | 2.34 s |
| 2,500 | 1 | 3.43 s |
| 2,500 | 2 | 3.75 s |
| 5,000 | 1 | 5.16 s |
| 5,000 | 2 | 7.33 s |

The harness recommendation remains to start the next phase with visible
node/port pooling first, then re-check edge culling after the node-scaled display
object cost is reduced.

## Notes

- Chat stream sampling now waits for early streamed content before starting the
  frame sample, which avoids measuring startup unrelated to the active stream.
- Drag/drop sampling now waits for the drag target state first, then samples the
  steady-state movement window.
- Graph marquee testing now chooses an empty canvas point that actually receives
  input, avoiding false failures caused by overlaying UI.
