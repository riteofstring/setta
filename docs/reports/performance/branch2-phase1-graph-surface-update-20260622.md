# Branch 2 Phase 1 Graph Surface Update Evidence

- Date: 2026-06-22
- Workflow: `workflow-graph-smoke`
- Artifact: `.recordings/workflow-graph/20260622T045910501Z/summary.json`
- Command: `node desktop/tests/electron/run-workflows.mjs --workflow workflow-graph-smoke --skip-build`

## Safe Workflow Projection Update While Panning

The workflow graph smoke workflow opened a temporary workspace through the
production Electron main/preload/renderer/store path, started a camera pan,
updated the selected workflow definition through `window.setta.workflow`, and
waited for the renderer debug snapshot to report the refreshed projection.

| Counter                                       | Before Safe Update | After Safe Update |
| --------------------------------------------- | -----------------: | ----------------: |
| `graphUpdateCount`                            |                  1 |                 2 |
| `edgeRedrawCount`                             |                  2 |                 2 |
| `edgeGraphicsRedrawSkipCount`                 |                  0 |                 1 |
| `edgeLabelObjectCount`                        |                  1 |                 1 |
| `edgeLabelRematerializeCount`                 |                  0 |                 0 |
| `graphUpdateCameraMovingCount`                |                  0 |                 1 |
| `graphUpdateInteractionCancelCount`           |                  0 |                 0 |
| `graphUpdateSourceCounts.workflow-projection` |                  1 |                 2 |

The last graph update after the safe projection change reported:

```json
{
  "source": "workflow-projection",
  "cameraMoving": true,
  "interactionCancelled": false,
  "edgeGraphicsRedrawn": false,
  "edgeGraphicsSkipped": true,
  "edgeRematerializeCount": 0,
  "edgeRetainCount": 2,
  "edgeOrderUpdateCount": 0,
  "edgeLabelRematerializeCount": 0,
  "edgeLabelRetainCount": 1
}
```

This proves the safe update did not recreate the Pixi app, redraw the shared
edge graphics batch, destroy/recreate the existing edge label, or cancel the
active camera pan. The test then continued the same pan gesture and released it
normally.
