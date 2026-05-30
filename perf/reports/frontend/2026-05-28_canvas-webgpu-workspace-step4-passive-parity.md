# Canvas WebGPU Workspace Step 4 Passive Parity

Date: 2026-05-28
Area: frontend
Current branch/commit: `go-rewrite-canvas-webgpu-only` @ `94cc59f3d` plus working tree edits
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

Before screenshot capture, the overview pane, UI editor pane, and project chat
windows were closed. The current canvas branch had no visible chat window and
the visible workspace area was the canvas. The current capture also seeded the
same explicit viewport and Settings GUI grid-pattern state used for the DOM
reference.

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

- `perf/artifacts/frontend/canvas-webgpu-step4-current-after-mono-values.png`
- Dimensions: `1440x1200`

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
sanity check over `x=39..1400`, `y=36..1164` reported:

- Mean absolute RGB delta: `7.26`
- RMS RGB delta: `18.70`
- Local 8x8 grayscale SSIM sanity score: `0.568`

The mean RGB sanity metric is now under the plan's initial `<= 8` workspace
crop threshold, but the SSIM-style sanity score is still far below the plan's
initial `>= 0.90` full-workspace SSIM threshold. This remains a checkpoint, not
an accepted quantitative visual parity pass.

Machine-readable comparison result:

- `perf/reports/frontend/2026-05-28_canvas-webgpu-workspace-step4-passive-parity.json`

Reusable comparison command:

```bash
pnpm -C frontend exec node scripts/compare-workspace-screenshots.mjs \
  --reference ../perf/artifacts/frontend/canvas-webgpu-step4-parity-dom-clean-normal.png \
  --current ../perf/artifacts/frontend/canvas-webgpu-step4-current-after-mono-values.png
```

Result:

- Exit code: `1`
- Failure: `full-workspace-ssim` (`0.613 < 0.9`)

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
- Tests: `26 passed`

Focused typecheck filter:

```bash
pnpm -C frontend exec tsc --noEmit --pretty false 2>&1 | \
  rg 'WorkspaceCanvas|workspaceController|workspaceScene|workspaceCanvasRenderer|workspaceTextMeasurementCache'
```

Result:

- No matching errors in the touched workspace canvas files. The repo-wide
  frontend typecheck still has unrelated pre-existing errors outside this
  change.

## Result

The clean normal dark-mode Settings `All Settings` passive view is closer to
the clean `go-rewrite` DOM reference while preserving the Step 4 architecture
requirements for the active workspace: one canvas surface, no xyflow workspace
DOM, no xyflow minimap, no passive section DOM, no passive Param row DOM, and
no inactive CodeMirror editors.

This does not pass the quantitative visual parity gate yet. Remaining gaps
include SSIM/crop parity, minimap crop parity, light-mode and zoomed-out
captures, representative control crops, and deterministic extraction of section
and row bounds for the gate report.
