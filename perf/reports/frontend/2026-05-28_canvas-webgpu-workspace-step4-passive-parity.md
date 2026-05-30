# Canvas WebGPU Workspace Step 4 Passive Parity

Date: 2026-05-28
Area: frontend
Current branch/commit: `go-rewrite-canvas-webgpu-only` @ `ad2fd7c74` plus working tree edits
Reference branch/commit: `go-rewrite` @ `8f36f30b7`
Related plan: `docs/plans/canvas-webgpu-workspace-replacement-plan.md`

## Goal

Record a code-backed and browser-backed Step 4 passive-renderer visual parity
check for the Settings `All Settings` benchmark view.

This report covers the clean normal dark-mode passive view with side panes and
chat windows closed. It does not claim full parity for every visual reference
state from Step 1, such as active editor, combobox popup, color picker popup,
hovered row, or section drag/resize affordance states.

## Scenario

- Current canvas runtime:
  `SETTA_NO_OPEN=1 ./ai.sh --runtime-root /tmp/setta-canvas-step4-parity-20260528`
- DOM reference runtime:
  `SETTA_NO_OPEN=1 ./ai.sh --runtime-root /tmp/setta-step4-dom-parity-reference-20260528`
- Current URL:
  `http://127.0.0.1:3075/settings`
- Reference URL:
  `http://127.0.0.1:3090/settings`
- View:
  Settings `All Settings`
- Viewport:
  `1440x1200`, device scale factor `1`
- Browser:
  Chrome DevTools MCP

Before screenshot capture, the overview side pane and project chat window were
closed in the DOM reference. The current canvas branch had no visible chat
window and the visible workspace area was the canvas.

## Current Canvas Evidence

Observed from the live current branch page:

- Workspace canvas surfaces: `1`
- `.react-flow` roots: `0`
- `.react-flow__node` elements: `0`
- `.react-flow__edge` elements: `0`
- `.react-flow__minimap` elements: `0`
- Passive section DOM nodes: `0`
- Passive Param row DOM nodes: `0`
- Inactive CodeMirror editors: `0`
- Visible chat windows: `0`
- Element at workspace center: `CANVAS`

Current screenshot:

- `perf/artifacts/frontend/canvas-webgpu-step4-parity-current-clean-normal-final.png`
- Dimensions: `1440x1200`
- File size: `175K`

## DOM Reference Evidence

Observed from the clean `go-rewrite` reference page:

- Workspace canvas surfaces: `0`
- `.react-flow` roots: `1`
- `.react-flow__node` elements: `46`
- `.react-flow__edge` elements: `0`
- `.react-flow__minimap` elements: `1`
- Passive section DOM nodes: `46`
- Visible overview pane buttons: `0`
- Visible chat close buttons: `0`

Reference screenshot:

- `perf/artifacts/frontend/canvas-webgpu-step4-parity-dom-clean-normal.png`
- Dimensions: `1440x1200`
- File size: `345K`

## Image Sanity

The saved screenshots have matching dimensions. A simple workspace-crop pixel
sanity check over `y=36..1164` reported:

- Current workspace mean RGB: `(20.53, 26.39, 39.86)`
- DOM reference workspace mean RGB: `(27.89, 33.21, 44.77)`
- Mean absolute RGB delta: `14.72`
- RMS RGB delta: `24.59`

These numbers are a sanity check, not a pixel-perfect target. The renderer is
expected to be visually close, not byte-identical to the DOM/xyflow reference.

## Verification

Focused tests:

```bash
pnpm -C frontend exec vitest run \
  src/components/Pages/Project/UiPage.canvasWorkspace.test.tsx \
  src/components/WorkspaceCanvas/workspaceScene.test.ts \
  src/components/WorkspaceCanvas/workspaceCanvasRenderer.test.ts \
  src/components/WorkspaceCanvas/workspacePassiveCodeHighlighter.test.ts \
  src/components/WorkspaceCanvas/workspaceTextMeasurementCache.test.ts
```

Result:

- Test files: `5 passed`
- Tests: `24 passed`

## Result

The clean normal dark-mode Settings `All Settings` passive view is now recorded
as visually close to the clean `go-rewrite` DOM reference while preserving the
Step 4 architecture requirements for the active workspace: one canvas surface,
no xyflow workspace DOM, no xyflow minimap, no passive section DOM, no passive
Param row DOM, and no inactive CodeMirror editors.

This is a Step 4 passive-renderer parity checkpoint for the clean normal view.
The broader visual reference suite still needs separate capture and verification
as the interaction and active-editor milestones land.
