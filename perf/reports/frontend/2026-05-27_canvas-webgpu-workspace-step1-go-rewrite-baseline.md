# Canvas WebGPU Workspace Step 1 Go Rewrite Baseline

Date: 2026-05-27
Area: frontend
Branch/Commit: baseline `go-rewrite` @ `8f36f30b7`
Report branch base: `go-rewrite-canvas-webgpu-only` @ `f6856e2d5`
Related plan: `docs/plans/canvas-webgpu-workspace-replacement-plan.md`

## Goal

Record the clean `go-rewrite` Settings `All Settings` baseline before replacing
the xyflow/dnd-kit workspace with a retained canvas/WebGPU workspace.

## Scenario

- Baseline worktree:
  `/Users/kevin/Documents/AppDevelopment/setta.go-rewrite-actual-go-rewrite-branch`
- App startup:
  `SETTA_NO_OPEN=1 ./start.sh --backend-port 8090 --frontend-port 3090 --setta-home /tmp/setta-step1-go-rewrite-baseline-20260527-clean/.setta-development --setta-files-root /tmp/setta-step1-go-rewrite-baseline-20260527-clean/setta_files_dev`
- Entry path:
  open bootstrap URL, land on Home, click the visible Settings link, then click
  the `All Settings` view tab.
- Browser + OS:
  Chrome DevTools MCP / Playwright over CDP, macOS.
- Viewport:
  `1440x1200`, device scale factor `1`.
- Runtime state:
  isolated temp Setta home/files root; clean `go-rewrite` worktree.

## Measurement Method

The benchmark used the real app and browser input path. It did not use a
benchmark query parameter, frontend store mutation, synthetic viewport setter,
or backend shortcut.

1. Start clean `go-rewrite` with `start.sh`.
2. Authenticate through the normal bootstrap URL.
3. Navigate by clicking Home's Settings link and the `All Settings` tab.
4. Click the visible React Flow `fit view` control.
5. Record a DevTools Performance trace while Playwright sends CDP browser input:
   - Space + mouse drag for drag-pan.
   - Mouse wheel for pan-on-scroll.
   - Meta + mouse wheel for zoom.
6. Collect `requestAnimationFrame` intervals and live DOM counts from the page.

DevTools reported no CPU throttling and no network throttling. The trace summary
labels the URL as the bootstrap document because the tab was originally opened
through the bootstrap URL, but the measured route was `http://127.0.0.1:3090/settings`.

## Baseline Metrics

- Body DOM elements: `9462`
- `.react-flow` subtree elements: `8598`
- `.react-flow` DOM depth: `24`
- React Flow section nodes: `46`
- Param rows / `ParamContainer-*` ids: `755`
- Switch controls: `156`
- Combobox controls: `36`
- Native color inputs: `6`
- Inactive CodeMirror editor instances before editing: `0`

Initial fit-view transform:

- `x = 771.054`
- `y = 51.2727`
- `scale = 0.110098`

Pan/zoom frame sample:

- Frame count: `829`
- Total sample time: `14012.3ms`
- Average frame interval: `16.90ms`
- Approx FPS: `59.16`
- p50 frame interval: `8.40ms`
- p95 frame interval: `58.70ms`
- Max frame interval: `216.70ms`
- Frames over `16.7ms`: `163`
- Frames over `33.3ms`: `104`
- Frames over `50ms`: `77`

DevTools trace summary:

- Observed INP: `260ms`
- CLS: `0.00`
- Highlighted insights: `DOMSize`, `ForcedReflow`, `INPBreakdown`

## Interaction Behavior

- Workspace ownership is xyflow/React Flow. The active workspace mounts
  `.react-flow`, `.react-flow__viewport`, `.react-flow__node`, xyflow controls,
  and the xyflow minimap.
- Drag-pan requires the configured pan activation key (`Space`) plus mouse drag.
  The benchmark moved the viewport from `matrix(..., 771.054, 51.2727)` to
  `matrix(..., 951.054, 159.273)` at the same scale.
- Wheel pan is enabled. The benchmark moved the viewport vertically to
  `y = -3680.73` and back to `y = 159.273`.
- Meta-wheel zoom is enabled. The benchmark moved scale from `0.110098` to
  `0.989562`, then back to `0.110098`.
- Section selection is DOM-backed. Active selection appears through
  `data-section-active="true"` and visible section outline styling.
- Section and Param drag affordances are dnd-kit backed through DOM nodes with
  `aria-roledescription="draggable"`.
- Resize and Param column-resize affordances are DOM-backed handles.
- Passive Param rows are live DOM `article[data-param-row="true"]` nodes. Switches,
  comboboxes, and color inputs are live DOM controls even in the passive view.
- The active value focus reference used a real click target on the existing value
  cell and did not type or commit a value. Playwright had to force that click
  because the passive Param row advertises `aria-disabled="true"`.

## Minimap Behavior

- Current minimap implementation: xyflow DOM/SVG minimap.
- Selector: `.react-flow__minimap`
- Position at fit view: `x = 350`, `y = 997`
- Size: `202x152`
- Minimap node count: `46`
- Viewport mask present: yes
- Visible controls include minimap toggle and move-minimap-to-right.

## Visual References

Captured reference images are local ignored artifacts under
`perf/artifacts/frontend/canvas-webgpu-step1-go-rewrite-real-user-2026-05-27-clean/references/`.
They were captured from a fresh isolated visual-reference runtime
`/tmp/setta-step1-go-rewrite-baseline-20260527-clean-refs` after the benchmark
trace; the backend log for that capture had no Param value or section
column-width save requests.

- Normal dark mode: `normal-dark-mode.png`
- Zoomed-out overview: `zoomed-out-overview.png`
- Light mode: `light-mode.png`
- Hovered row: `hovered-row.png`
- Active editor/value focus: `active-editor.png`
- Error state: `error-state-prompt-render-fields.png`
- Dropdown/combobox: `dropdown-combobox.png`
- Color picker/swatch: `color-picker.png`
- Switch: `switch.png`
- Minimap: `minimap.png`
- Section selection/drag/resize affordances:
  `section-selection-drag-resize-affordance.png`
- Capture metadata: `visual-reference-metadata.json`

The error-state reference uses the existing `promptSectionDefault` fields
(`Missing Variables []` and `Render Error null`) rather than injecting an error.

## Raw Artifacts

- Trace:
  `perf/artifacts/frontend/canvas-webgpu-step1-go-rewrite-real-user-2026-05-27-clean/traces/real-user-pan-zoom-trace.json.gz`
- Parsed summary:
  `perf/artifacts/frontend/canvas-webgpu-step1-go-rewrite-real-user-2026-05-27-clean/traces/real-user-pan-zoom-summary.json`
- Visual references:
  `perf/artifacts/frontend/canvas-webgpu-step1-go-rewrite-real-user-2026-05-27-clean/references/`

## Automated Perf Tests

No automated guardrail was added in this step. This step is the pre-replacement
baseline and visual reference capture for the canvas/WebGPU workspace plan.
