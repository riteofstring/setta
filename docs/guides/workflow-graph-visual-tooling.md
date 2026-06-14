# Workflow Graph Visual Tooling

Use this workflow when developing or reviewing the workflow graph surface in the
workspace layout.

Run the hidden visual smoke workflow:

```sh
./scripts/test_workflow_graph_visual.sh
```

Run with the Electron window visible:

```sh
./scripts/test_workflow_graph_visual.sh --visible --keep-artifacts
```

Artifacts are written under:

```text
.recordings/workflow-graph/
```

The latest run is available at:

```text
.recordings/workflow-graph/latest
```

The smoke workflow launches Electron with temporary app data and:

```text
SETTA_WORKFLOW_GRAPH_DEBUG=1
```

It captures screenshots, verifies the workspace-hosted canvas is nonblank through
the workflow graph debug snapshot API, drives pan and zoom gestures, drags a hard-coded node,
cancels a temporary edge, commits a port-to-port edge, and writes `summary.json`.

For the living workspace neon calibration gate, the workflow also writes:

- `workflow-idle-fit.png` — a deterministic temp-app-data draft workflow at fit-to-view zoom.
- `workflow-idle-fit.json` — the camera, graph, and visual debug evidence for that capture.
- `workflow-idle-fit-review.html` — the production fit capture next to `workflow-graph-aesthetics.html#neon`.

Run the phase 6.5 canonical visual calibration capture:

```sh
node desktop/tests/electron/run-workflows.mjs --workflow workflow-graph-visual-calibration
```

Artifacts are written under `.recordings/workflow-graph-visual/` with fit-to-view captures for
`workflow-idle`, `workflow-running`, `semantic-cells`, and `merged`.

To attach Chrome DevTools MCP to the latest visual run while it is still open:

```sh
./scripts/electron-devtools-mcp.sh
```

If the debug port is not from the latest workflow graph visual run, provide it directly:

```sh
SETTA_ELECTRON_CDP_PORT=9229 ./scripts/electron-devtools-mcp.sh
```

## Manual Mac Trackpad Check

Use this check when physical trackpad behavior needs verification. Build first
when you need the production Electron path:

```sh
pnpm -C desktop build
```

Then launch the desktop app with a visible app window:

```sh
cd desktop
SETTA_WORKFLOW_GRAPH_DEBUG=1 pnpm exec electron .
```

Verify:

- Two-finger trackpad pan moves the workspace camera smoothly without selecting
  or dragging a node.
- Trackpad pinch zoom changes canvas zoom at a useful rate where
  Electron/Chromium exposes pinch as supported input.
- Empty-space click-drag pans the camera.
- Dragging from the colored node body moves the node. Dragging from a source port
  starts edge drawing instead.
- Mouse drag pan, mouse-wheel zoom, node drag, temporary edge cancellation, and
  source-port to target-port edge commit still work after trackpad gestures.

Input policy:

- Small pixel wheel deltas pan the camera. This is the expected Mac trackpad
  two-finger swipe path.
- Chromium pinch wheel events with `ctrlKey` or `metaKey` zoom around the
  pointer.
- Large notched wheel deltas zoom, preserving mouse-wheel zoom behavior.

Record the result in `docs/reports/performance/pixi-workspace-visual-smoke.md`.
If pinch is not exposed by the OS/Electron configuration, record that limitation
instead of treating it as automated proof of failure.
