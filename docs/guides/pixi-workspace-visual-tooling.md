# Pixi Workspace Visual Tooling

Use this workflow when developing or reviewing the Pixi workspace surface in niri.

Run the hidden visual smoke workflow:

```sh
./scripts/test_pixi_workspace_visual.sh
```

Run with the Electron window visible:

```sh
./scripts/test_pixi_workspace_visual.sh --visible --keep-artifacts
```

Artifacts are written under:

```text
.recordings/pixi-workspace/
```

The latest run is available at:

```text
.recordings/pixi-workspace/latest
```

The smoke workflow launches Electron with temporary app data and:

```text
SETTA_PIXI_WORKSPACE_DEBUG=1
```

It captures screenshots, verifies the niri-hosted canvas is nonblank through the
Pixi debug snapshot API, drives pan and zoom gestures, drags a hard-coded node,
cancels a temporary edge, commits a port-to-port edge, and writes `summary.json`.

To attach Chrome DevTools MCP to the latest visual run while it is still open:

```sh
./scripts/electron-devtools-mcp.sh
```

If the debug port is not from the latest Pixi visual run, provide it directly:

```sh
SETTA_ELECTRON_CDP_PORT=9229 ./scripts/electron-devtools-mcp.sh
```

## Manual Mac Trackpad Check

Use this check when physical trackpad behavior needs verification. Build first
when you need the production Electron path:

```sh
pnpm -C desktop build
```

Then launch the niri app with a visible app window:

```sh
cd desktop
SETTA_PIXI_WORKSPACE_DEBUG=1 pnpm exec electron .
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
