# Branch 2 Phase 2A Typed Workspace Activity Evidence

- Date: 2026-06-22
- Workflow: `workflow-activity-feed`
- Artifact: `.recordings/workflow-activity-feed/20260622T084258955Z/summary.json`
- Command: `./check_quality.sh --all`

## Activity Feed While Panning

The workflow opened a temporary workspace through the production Electron
main/preload/renderer/store path, opened the workflow graph, held a camera pan
active, and started a scripted workflow agent run that emits typed workflow
status, command, approval, and file-change activity.

| Counter                              | Value |
| ------------------------------------ | ----: |
| `snapshotsLoaded`                    |     2 |
| `deltasApplied`                      |    10 |
| `activityDeltasDuringCameraMovement` |    10 |
| `recordsRetained`                    |    10 |
| `graphSceneReplacementCheckCount`    |    10 |
| `graphSceneReplacementTouched`       | false |
| `backendReadCameraMovementCheckCount` |    1 |
| `backendReadsDuringCameraMovement`   |     0 |
| `markerCreatedCount`                 |     0 |
| `markerUpdatedCount`                 |     0 |
| `markerRetainedCount`                |     0 |
| `markerRemovedCount`                 |     0 |
| `revisionGapReloads`                 |     0 |

The activity snapshot included these kinds:

```json
[
  "workflow_status",
  "approval",
  "command",
  "file_change",
  "command",
  "workflow_status",
  "workflow_status",
  "workflow_status",
  "workflow_status",
  "workflow_status"
]
```

This proves Phase 2A activity deltas reached the renderer while the graph camera
was moving, did not request backend reads during that movement, did not replace
the graph scene, and did not create renderer markers.
