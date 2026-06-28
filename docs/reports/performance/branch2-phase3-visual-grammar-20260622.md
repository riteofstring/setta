# Branch 2 Phase 3 Visual Grammar Evidence

Date: 2026-06-22

## Visual Role Inventory

Workflow node body:

- Node fill continues to communicate the owning node kind for idle nodes and the
  typed workflow node status for run projections.
- Node size and label remain layout/content channels only; runtime status must
  not resize nodes or add overflow-prone text.

Workflow edge stroke:

- Edge stroke communicates the typed workflow edge status from the graph
  projection: inactive, active, completed, or cancelled.
- Edge direction remains the existing source-port to target-port curve; Phase 3
  does not add animated particles, trails, or timing-derived route effects.

Activity marker:

- Marker shape communicates the typed activity kind established in Phase 2B:
  workflow status, command, file change, or approval.
- Marker status emphasis uses stroke, alpha, and width while preserving marker
  dimensions and positions.

Interaction overlays:

- Hover and selected states remain separate outline overlays.
- Hover and selection do not change the resolved runtime visual state.

Runtime states:

- Failed and cancelled states use the highest-priority failure channel.
- Waiting approval uses the approval channel.
- Running uses the active channel.
- Completed uses a quieter terminal success channel.
- Pending, scheduled, and ready states use a pending channel.
- Idle, inactive, not-started, and unknown states use an idle channel.

Occupied channels:

- Node fill is already occupied by kind/status color, so Phase 3 adds runtime
  legibility with stroke/accent styling rather than new text.
- Marker shape is already occupied by activity kind, so Phase 3 layers status
  emphasis without changing the kind vocabulary.
- Edge geometry is already occupied by graph topology and direction, so Phase 3
  uses stroke color, alpha, and width for status.

Intentionally absent states:

- No file-read, diff-stat, test-result, inferred shell-output, assistant-text,
  or semantic-usefulness marker appears because there is no approved typed
  runtime source for those visual states in this phase.
- No animated trajectory, sprite, popover, details panel, or semantic memory
  promotion UI appears in Phase 3.

## Implementation Evidence

Focused checks:

- `pnpm vitest run src/renderer/src/features/workspace-graph/pixi-renderer-visual-state.test.js src/renderer/src/features/workspace-graph/pixi-renderer-scene-graph.test.js src/renderer/src/features/workspace-graph/pixi-renderer-edge-rendering.test.js src/renderer/src/features/workspace-graph/pixi-renderer-activity-markers.test.js src/renderer/src/features/workspace-graph/pixi-renderer-debug-snapshot.test.js src/renderer/src/features/workspace-graph/workflow-graph-projection.test.ts src/renderer/src/features/workspace-graph/workflow-graph-projection-state.test.ts`
  - Result: passed, 7 files / 28 tests.
- `pnpm vitest run src/renderer/src/features/workspace-graph/pixi-renderer-visual-state.test.js src/renderer/src/features/workspace-graph/pixi-renderer-scene-graph.test.js src/renderer/src/features/workspace-graph/pixi-renderer-edge-rendering.test.js src/renderer/src/features/workspace-graph/pixi-renderer-activity-markers.test.js src/renderer/src/features/workspace-graph/pixi-renderer-debug-snapshot.test.js src/renderer/src/features/workspace-graph/workflow-graph-projection.test.ts src/renderer/src/features/workspace-graph/workflow-graph-projection-state.test.ts src/renderer/src/features/workspace-graph/workspace-activity-state.test.ts`
  - Result: passed, 8 files / 34 tests.
- `pnpm build`
  - Result: passed; production Electron/main/preload/renderer bundle built.
- `node tests/electron/workflow-activity-feed.test.mjs --skip-build`
  - Result: passed.
  - Artifact directory:
    `.recordings/workflow-activity-feed/20260622T175452554Z`.
- `./scripts/format.sh`
  - Result: passed.
- `./check_quality.sh --all`
  - Result: passed; required Electron workflow artifact directory:
    `.recordings/workflow-activity-feed/20260622T180124881Z`.

Visual evidence:

- Failed graph screenshot:
  `.recordings/workflow-activity-feed/20260622T180124881Z/activity-feed-failed.png`
  (140,725 bytes).
- Cancelled graph screenshot:
  `.recordings/workflow-activity-feed/20260622T180124881Z/activity-feed-cancelled.png`
  (144,807 bytes).
- Idle graph screenshot:
  `.recordings/workflow-activity-feed/20260622T180124881Z/activity-feed-idle.png`
  (133,882 bytes).
- Waiting approval screenshot:
  `.recordings/workflow-activity-feed/20260622T180124881Z/activity-feed-waiting-approval.png`
  (167,885 bytes).
- Completed graph screenshot:
  `.recordings/workflow-activity-feed/20260622T180124881Z/activity-feed-completed.png`
  (141,205 bytes).

Machine-checked visual grammar:

- Failed assertion covered:
  - `activity` node resolved to `failed`;
  - `start_activity` edge resolved to `completed`;
  - `activity_end` edge resolved to `idle`;
  - workflow-status marker resolved to `failed`.
- Cancelled assertion covered:
  - `activity` node resolved to `cancelled`;
  - `start_activity` edge resolved to `completed`;
  - `activity_end` edge resolved to `idle`;
  - workflow-status marker resolved to `cancelled`.
- Idle state assertion covered `start`, `activity`, and `end` nodes plus both
  workflow edges before execution.
- Waiting approval assertion covered:
  - `activity` node resolved to `waiting_approval`;
  - `start_activity` edge resolved to `completed`;
  - `activity_end` edge resolved to `idle`;
  - approval and workflow-status markers resolved to `waiting_approval`;
  - command markers resolved to both `running` and `completed`;
  - file-change marker resolved to `completed`.
- Completed assertion covered all three workflow nodes, both workflow edges,
  approval, workflow-status, command, and file-change markers resolving to
  `completed` where the typed runtime source had completed.

Renderer and activity invariants from the passing run:

- Activity deltas during camera movement: 10.
- Backend reads during camera movement: 0.
- Graph scene replacement touched: false.
- Revision gap reloads: 0.
- Waiting snapshot marker work: created 24, retained 118, updated 59,
  removed 8, retained records 24.
- Completed snapshot marker work: created 28, retained 238, updated 76,
  removed 16, retained records 28.
- Activity marker graphics count equaled the projected activity marker count at
  the waiting snapshot and completion snapshot.
- Renderer console errors: 0.
