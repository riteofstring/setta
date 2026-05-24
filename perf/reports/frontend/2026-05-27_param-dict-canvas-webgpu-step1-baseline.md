# Param Dict Canvas/WebGPU Step 1 Baseline

Date: 2026-05-27
Area: frontend
Current branch/commit: `go-rewrite-canvas-webgpu-only @ 393d4f17c`
Visual reference branch/commit: `go-rewrite @ 8f36f30b7`
Related plan: `docs/plans/param-dict-canvas-webgpu-plan.md`

## Goal

Complete step 1 of the Param Dict canvas/WebGPU plan:

- Baseline the Settings project `All Settings` view on the current branch.
- Record DOM size, pan/zoom frame rate, and current interaction behavior.
- Capture `go-rewrite` visual references for Settings Param Dict states.

The Settings project is only the benchmark scene. The numbers below should not be read as justification for Settings-specific optimization.

## Scenario

- Project/view: Settings project, `All Settings`
- Browser: headless Chromium via Playwright
- Viewport: `1440x1200`, device scale factor `1`
- Disposable current-branch workspace:
  - frontend `http://127.0.0.1:3121`
  - backend `http://127.0.0.1:8121`
  - `SETTA_HOME=/tmp/setta-param-dict-current/.setta`
  - `SETTA_FILES_ROOT=/tmp/setta-param-dict-current/setta_files`
- Disposable `go-rewrite` reference workspace:
  - frontend `http://127.0.0.1:3122`
  - backend `http://127.0.0.1:8122`
  - `SETTA_HOME=/tmp/setta-param-dict-gorewrite/.setta`
  - `SETTA_FILES_ROOT=/tmp/setta-param-dict-gorewrite/setta_files`

## Measurement Method

The previous benchmark spec referenced by the March report,
`frontend/tests/e2e/settings/settings-all-settings-benchmark.spec.ts`, is not present on this branch. I reproduced the same core measurement in a Playwright browser script:

1. Bootstrap a disposable app session.
2. Navigate to `/settings`.
3. Activate `All Settings`.
4. Apply a fixed overview transform:
   - `x = 779.9`
   - `y = -55.7`
   - `zoom = 0.1`
5. Run five deterministic pan/zoom loops:
   - 36 pan frames down/right
   - 36 pan frames up/left
   - 18 zoom-in frames
   - 18 zoom-out frames
6. Collect page-side `requestAnimationFrame` deltas and DOM complexity from the live `.react-flow` tree.

## Current Baseline

Raw JSON: `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/current/current-baseline.json`

### DOM

- `.react-flow` DOM nodes: `8599`
- document DOM nodes: `9525`
- max `.react-flow` DOM depth: `24`
- section nodes: `46`
- param rows: `755`
- param containers: `755`
- resize handles: `679`
- active CodeMirror editors before interaction: `0`
- passive CodeMirror lines: `423`
- switches: `156`
- color inputs: `6`
- comboboxes: `36`
- minimap nodes: `46`

Settings Param UI composition in this benchmark scene:

- `TextParam`: `388`
- `TextAreaParam`: `93`
- `DropdownParam`: `36`
- `SwitchParam`: `156`
- `ColorPickerParam`: `6`
- `NestedParam`: `122`

### Pan/Zoom

Five-run average:

- average frame time: `37.70ms`
- approximate FPS: `26.53`
- median frame time: `41.48ms`
- max frame time: `50.10ms`
- slow frames `>16.7ms`: `517 / 535`
- slow frames `>33.3ms`: `437 / 535`
- slow frames `>50ms`: `2 / 535`

Per-run approximate FPS:

- `26.75`
- `26.42`
- `26.28`
- `26.42`
- `26.75`

## Current Interaction Smoke

Raw JSON:

- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/current/current-interaction-state-capture.json`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/current/current-error-state-capture.json`

- Switch interaction worked: first switch toggled from `true` to `false`.
- Combobox interaction worked: first combobox reported `aria-expanded="true"`.
- Active CodeMirror interaction worked: a passive text field instantiated a real `.cm-editor` at zoom `1.76157`.
- Color picker element was captured. Headless Chromium does not render the native OS color picker surface into the screenshot.
- Inline Param error visual state was captured by importing the existing Vite dev module `/src/state/definitions.ts` and setting `useTypeErrors` for one Settings Param row. This uses the app's normal error rendering path; it is not a natural Settings data error because the benchmark scene has no numeric or otherwise type-constrained Param Dict field.

## Visual References

Artifacts are local-only and ignored by git under `perf/artifacts/`.

Current branch screenshots:

- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/current/current-dark-normal.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/current/current-dark-zoomed-out.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/current/current-light-normal.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/current/current-hover-row.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/current/current-active-editor.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/current/current-error-state.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/current/current-combobox-open.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/current/current-color-picker.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/current/current-switch.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/current/current-minimap.png`

`go-rewrite` visual reference screenshots:

- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/go-rewrite/go-rewrite-dark-normal.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/go-rewrite/go-rewrite-dark-zoomed-out.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/go-rewrite/go-rewrite-light-normal.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/go-rewrite/go-rewrite-hover-row.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/go-rewrite/go-rewrite-active-editor.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/go-rewrite/go-rewrite-error-state.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/go-rewrite/go-rewrite-combobox-open.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/go-rewrite/go-rewrite-color-picker.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/go-rewrite/go-rewrite-switch.png`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/go-rewrite/go-rewrite-minimap.png`

Reference capture summary:

- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/go-rewrite/go-rewrite-visual-reference-capture.json`
- `perf/artifacts/2026-05-27_param-dict-canvas-webgpu-step1/go-rewrite/go-rewrite-error-state-capture.json`
- active editor captured at zoom `1.76157`
- injected error-state reference rendered `1` inline Param error icon at zoom `1.76157`
- `go-rewrite` reference DOM contained `156` switches, `36` comboboxes, `6` color inputs, and `46` minimap nodes
- light-mode reference confirmed `document.documentElement.classList.contains("dark") === false`

## Notes

- This is a baseline report, not an optimization result.
- No DevTools trace was recorded in this pass; the recorded FPS is browser-side frame timing from the deterministic Playwright loop.
- The current branch is already well below 60 FPS in the `All Settings` pan/zoom loop, with nearly every frame above the `16.7ms` budget.
- The visual reference set is complete for normal/dark, zoomed-out, light, hover, active editor, injected inline Param error, combobox, color picker, switch, and minimap states.
