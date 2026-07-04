# Branch 2 Phase 2B Typed Workspace Activity Markers

- Date: 2026-06-22
- Workflow: `desktop/tests/electron/workflow-activity-feed.test.mjs --skip-build`
- Artifact: `.recordings/workflow-activity-feed/20260622T092801186Z`
- Build: production desktop bundle from `pnpm build`

## Result

The deterministic Electron workflow opened a temporary workspace, displayed the
workflow graph, ran a scripted activity workflow, panned the graph while
activity deltas arrived, rendered typed activity markers, submitted the workflow
approval, and observed terminal marker states.

## Evidence

Pending-approval window:

- `activityDeltasDuringCameraMovement`: 10
- `deltasApplied`: 10
- `graphSceneReplacementCheckCount`: 10
- `graphSceneReplacementTouched`: false
- `backendReadsDuringCameraMovement`: 0
- `markerCreatedCount`: 10
- `markerUpdatedCount`: 28
- `recordsRetained`: 10

Terminal window after approval:

- `deltasApplied`: 15
- `graphSceneReplacementCheckCount`: 15
- `graphSceneReplacementTouched`: false
- `backendReadsDuringCameraMovement`: 0
- `markerCreatedCount`: 14
- `markerRemovedCount`: 2
- `markerRetainedCount`: 49
- `markerUpdatedCount`: 45
- `recordsRetained`: 14

Observed marker coverage:

- workflow-status markers anchored to `activity`, `start`, and `end`;
- command markers anchored to `activity`, including a completed scripted
  command and a still-running command approval item whose typed source remains
  running;
- file-change marker anchored to `activity` with completed path/status-level
  metadata;
- approval marker anchored to `activity`, waiting during the pan and approved
  after submission;
- execution-level workflow status in the bounded recent lane.

The test asserted no `file_read` or `diff` markers.
