# Canvas WebGPU Workspace Step 4 Passive Parity

Date: 2026-05-28
Area: frontend
Current branch/commit: `go-rewrite-canvas-webgpu-only` @ `eacc6681c` plus working tree edits
Reference branch/commit: `go-rewrite` @ `8f36f30b7`
Related plan: `docs/plans/canvas-webgpu-workspace-replacement-plan.md`

## Goal

Record a code-backed and browser-backed Step 4 passive-renderer visual parity
check for the Settings `All Settings` benchmark view.

This report covers the clean normal dark-mode and light-mode passive views with
side panes, chat windows, and the minimap closed for section/control captures.
It uses the same Settings state as the `go-rewrite` reference. The
full-workspace, anchor, section, text, switch, color-swatch, dropdown,
nested-row, code-preview, section-scrollbar, zoomed-out overview,
selected-section, and selected-minimap checks pass for these scenarios. A
separate dedicated dark minimap capture also passes. This report does not claim
full parity for the complete benchmark milestone because later interaction and
active-editor visual states remain outside the Step 4 passive-renderer gate:
active editor, combobox popup, color picker popup, hovered row, switch changed
state, error state, and section drag/resize affordance states.

## Scenario

- Current canvas runtime:
  `SETTA_NO_OPEN=1 ./ai.sh --runtime-root /tmp/setta-canvas-step4-current-goal --setta-files-root /tmp/setta-step4-current-state-goal/setta_files_dev`
- DOM reference runtime:
  `SETTA_PORT=8090 SETTA_DEV_FRONTEND_PORT=3090 DEBUG_PORT=9290 SETTA_NO_OPEN=1 ./ai.sh --runtime-root /tmp/setta-dom-step4-reference-goal --setta-files-root /tmp/setta-step4-reference-state-goal/setta_files_dev`
- Current URL:
  `http://127.0.0.1:3075/settings`
- Reference URL:
  `http://127.0.0.1:3090/settings`
- View:
  Settings `All Settings`
- Viewport:
  `1440x1200`, device scale factor `1`
- Browser:
  Playwright Chromium for deterministic captures; Chrome DevTools MCP for live
  visual verification

Before screenshot capture, the overview pane, UI editor pane, and project chat
windows were closed. The current canvas branch had no visible chat window and
the visible workspace area was the canvas. The disposable current runtime used a
temporary copy of the reference `setta_files_dev` state so the grid pattern,
Settings project values, saved viewport, and top-level layout matched the DOM
reference and geometry/pixel deltas measured the renderer rather than local
runtime state drift.

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

Current section/control screenshot:

- `perf/artifacts/frontend/canvas-webgpu-step4-current-dark-sections-hidden-minimap-after-light-bg-swatch-glyph.png`
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

Reference section/control screenshot:

- `perf/artifacts/frontend/canvas-webgpu-step4-reference-dark-sections-hidden-minimap-settled.png`
- Dimensions: `1440x1200`

## Image Sanity

The saved screenshots have matching dimensions. A simple workspace-crop pixel
sanity check over `x=39..1400`, `y=36..1164` reported:

- Mean absolute RGB delta: `1.37`
- RMS RGB delta: `8.26`
- Workspace-crop local 8x8 grayscale SSIM sanity score: `0.963`
- Full-viewport local 8x8 grayscale SSIM sanity score: `0.960`

The mean RGB sanity metric is under the plan's initial `<= 8` workspace crop
threshold. The full-workspace SSIM, section, row, and label/value-column anchors
pass the initial Step 4 thresholds for this normal dark closed-chrome capture.
Minimap anchors are intentionally optional for this capture because the minimap
is hidden. A separate dedicated minimap capture now passes with `0.943` local
SSIM against the `0.92` crop threshold and `0.979` viewport-mask IoU against
the `0.95` anchor threshold.

The representative crop gate passes the plan's initial `>= 0.92` section crop
SSIM threshold:

- Section crop: `0.928`
- Text row/control crop: `0.973`
- Switch row/control crop: `0.937`
- Color swatch row/control crop: `0.985`
- Dropdown row/control crop: `0.946`
- Nested row crop: `0.955`

The light-mode hidden-minimap section/control capture now also passes:

- Workspace mean absolute RGB delta: `1.75`
- Full-viewport local 8x8 grayscale SSIM: `0.957`
- Section crop: `0.924`
- Text row/control crop: `0.951`
- Switch row/control crop: `0.924`
- Color swatch row/control crop: `0.978`
- Dropdown row/control crop: `0.944`
- Nested row crop: `0.950`

The dark hidden-minimap code-preview capture now also passes after seeding the
Settings `codeSectionDefault.code` value to `return 42` in disposable reference
and current state:

- Workspace mean absolute RGB delta: `1.53`
- Full-viewport local 8x8 grayscale SSIM: `0.950`
- Code-preview row/control crop: `0.922`

The dark hidden-minimap section-scrollbar capture now also passes:

- Workspace mean absolute RGB delta: `1.53`
- Full-viewport local 8x8 grayscale SSIM: `0.950`
- Section-scrollbar row/control crop: `0.921`

The dark hidden-minimap zoomed-out overview capture now also passes the
full-workspace and anchor gate:

- Workspace mean absolute RGB delta: `2.19`
- Full-viewport local 8x8 grayscale SSIM: `0.935`
- Section anchors: `46/46` matched, max section rect delta `0px`
- Visible row anchors: `166/166` matched

The dark hidden-minimap selected-section capture now also passes. The selected
state crop intentionally measures the selected outline band because normal
section bodies are covered by the section crop gate:

- Workspace mean absolute RGB delta: `1.53`
- Full-viewport local 8x8 grayscale SSIM: `0.950`
- Selected-section outline crop: `0.999`

The dark selected-minimap capture now also passes with the minimap enabled:

- Workspace mean absolute RGB delta: `1.55`
- Full-viewport local 8x8 grayscale SSIM: `0.950`
- Minimap crop: `0.942`
- Minimap bounds IoU: `1.000`
- Minimap viewport-mask IoU: `0.951`
- Minimap section preview count: `46/46`

Machine-readable comparison result:

- `perf/reports/frontend/2026-05-28_canvas-webgpu-workspace-step4-passive-parity.json`
- `perf/reports/frontend/2026-05-28_canvas-webgpu-workspace-step4-passive-parity-minimap.json`
- `perf/reports/frontend/2026-05-28_canvas-webgpu-workspace-step4-passive-parity-light.json`
- `perf/reports/frontend/2026-05-28_canvas-webgpu-workspace-step4-passive-parity-code-preview-after-alignment.json`
- `perf/reports/frontend/2026-05-28_canvas-webgpu-workspace-step4-passive-parity-section-scrollbar-after-dom-anchor.json`
- `perf/reports/frontend/2026-05-28_canvas-webgpu-workspace-step4-passive-parity-zoomed-overview.json`
- `perf/reports/frontend/2026-05-28_canvas-webgpu-workspace-step4-passive-parity-selected-section.json`
- `perf/reports/frontend/2026-05-28_canvas-webgpu-workspace-step4-passive-parity-selected-minimap.json`

Reusable comparison command:

```bash
pnpm -C frontend exec node scripts/compare-workspace-screenshots.mjs \
  --reference ../perf/artifacts/frontend/canvas-webgpu-step4-reference-dark-sections-hidden-minimap-settled.png \
  --current ../perf/artifacts/frontend/canvas-webgpu-step4-current-dark-sections-hidden-minimap-after-light-bg-swatch-glyph.png \
  --reference-anchors ../perf/artifacts/frontend/canvas-webgpu-step4-reference-dark-sections-hidden-minimap-settled-anchors.json \
  --current-anchors ../perf/artifacts/frontend/canvas-webgpu-step4-current-dark-sections-hidden-minimap-after-light-bg-swatch-glyph-anchors.json \
  --minimap-anchors optional \
  --representative-crops \
  --crop-kinds section,text,switch,color-swatch,dropdown,nested-row \
  --required-crops section,text,switch,color-swatch,dropdown,nested-row
```

Result:

- Exit code without `--allow-fail`: `0`
- Pass: `true`

## Verification

Focused tests:

```bash
pnpm -C frontend exec vitest run \
  src/components/WorkspaceCanvas/workspaceScene.test.ts \
  src/components/WorkspaceCanvas/workspaceCanvasRenderer.test.ts \
  src/components/WorkspaceCanvas/workspaceTextMeasurementCache.test.ts
```

Result:

- Test files: `3 passed`
- Tests: `24 passed`

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

The clean normal dark-mode Settings `All Settings` passive view passes the
current full-workspace SSIM, workspace mean RGB, section anchor, row anchor,
label/value-column anchor, and minimap anchor thresholds while preserving the
Step 4 architecture requirements for the active workspace: one canvas surface,
no xyflow workspace DOM, no xyflow minimap, no passive section DOM, no passive
Param row DOM, and no inactive CodeMirror editors.

This is a Step 4 passive-renderer visual parity pass for the current captured
matrix. The normal dark hidden-minimap section/control capture, light
hidden-minimap section/control capture, dedicated dark minimap crop, dark
hidden-minimap code-preview crop, dark hidden-minimap section-scrollbar crop,
dark hidden-minimap zoomed-out overview, dark hidden-minimap selected-section
crop, and dark selected-minimap crop now pass. It is not a full benchmark
milestone acceptance because the later active/interaction visual states remain.
