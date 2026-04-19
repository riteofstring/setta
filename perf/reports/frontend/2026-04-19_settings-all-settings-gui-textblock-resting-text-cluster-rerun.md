# Settings All Settings Gui/Text-Block Resting-Text Cluster Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior dense reference: `perf/reports/frontend/2026-04-19_settings-all-settings-code-like-resting-text-cluster-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-gui-textblock-resting-text-cluster.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Land one bounded dense-scene product slice on the remaining pure text pair by moving `settings-section__gui` and `settings-section__textBlockSectionDefault` onto the shared canvas-owned resting-text path, then rerun the normalized `All Settings` baseline to see whether that pair reduces the mounted row-value DOM surface.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - focused probe: Playwright Chromium, headless Linux
  - dense probe: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Canonical target section: `settings-section__gui`
- Sibling section landed in the same shared slice:
  - `settings-section__textBlockSectionDefault`
- Canonical target rows:
  - `settings-section__gui`:
    - input id: `settings-section__gui-settings-codeobj__gui__gui__defaultZoomLevel-ParamInput`
  - `settings-section__textBlockSectionDefault`:
    - input id: `settings-section__textBlockSectionDefault-settings-codeobj__textBlockSectionDefault__textBlockSectionDefault__format-ParamInput`
- Authentication:
  - probes used fresh one-shot bootstrap tokens via `./scripts/run-playwright-against-runtime.sh`

## Implementation Summary

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now includes `settings-section__gui` and `settings-section__textBlockSectionDefault` in the shared resting-text-owned section set and gives both sections lightweight underline ownership.
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures both sections directly so the retained scene can paint their resting text and underline primitives without opening a new renderer branch.
- Focused coverage now exists at:
  - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - updated `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - new `frontend/tests/e2e/settings/settings-all-settings-gui-textblock-resting-text-cluster.spec.ts`

## Focused Browser Inventory

A fresh post-change pair probe recorded:

- `settings-section__gui`:
  - total unique `*-ParamInput` roots: `8`
  - `data-canvas-owned-resting-text="true"` roots: `15`
  - `data-canvas-owned-resting-text-lightweight="true"` roots: `8`
  - `data-canvas-owned-underline="true"` roots: `8`
  - live `input` / `textarea` / `.cm-editor` roots at rest: `0`
- `settings-section__textBlockSectionDefault`:
  - total unique `*-ParamInput` roots: `8`
  - `data-canvas-owned-resting-text="true"` roots: `9`
  - `data-canvas-owned-resting-text-lightweight="true"` roots: `8`
  - `data-canvas-owned-underline="true"` roots: `8`
  - live `input` / `textarea` / `.cm-editor` roots at rest: `0`

Interpretation:

- the full untouched `8`-row gui/text-block pair now rides the shared lightweight resting-text path
- the focused counts show every target `*-ParamInput` root moved onto the lightweight path with no live editors left mounted at rest
- `canvasOwnedRestingTextCount` is higher than the target-row count because it includes other pre-existing canvas-owned text roots elsewhere in the section, not because the target rows stayed live

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `7708`
- Inputs: `2`
- Textareas: `0`
- Buttons: `39`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.7`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.7`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `105.12ms`
- RAF p50: `100ms`
- RAF p95: `216.7ms`
- RAF max: `250ms`
- RAF frames over `16.7ms`: `178`
- RAF frames over `33.3ms`: `156`
- Long-task count: `127`
- Long-task total: `16889ms`
- Long-task max: `259ms`

## Comparison Vs. Prior Dense Report

- Document nodes: down `98` (`7806` -> `7708`)
- Inputs: unchanged (`2`)
- Buttons: unchanged (`39`)
- RAF mean: worse by `2.98ms` (`102.14ms` -> `105.12ms`)
- RAF p95: worse by `33.3ms` (`183.4ms` -> `216.7ms`)
- Long-task total: worse by `422ms` (`16467ms` -> `16889ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `1845` (`9553` -> `7708`)
- Inputs: down `90` (`92` -> `2`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `482` (`521` -> `39`)
- Canvas elements: up `1` (`0` -> `1`)
- RAF mean: better by `99.81ms` (`204.93ms` -> `105.12ms`)
- RAF p95: unchanged (`216.7ms` -> `216.7ms`)
- Long-task total: better by `19448ms` (`36337ms` -> `16889ms`)

## Interpretation

- This pair move reduced the dense mounted row-value surface again: `documentNodeCount` dropped from `7806` to `7708` while the interactive-core plateau stayed flat at `2` inputs / `39` buttons.
- The motion result is not a clean win versus the prior code-like cluster report: `raf.mean`, `raf.p95`, and long-task total all regressed slightly even though mounted DOM dropped.
- That makes this slice valid ownership progress, but not proof that the next same-family harvest will automatically improve pan/zoom feel.
- The next frontier should stay on a real shared primitive, but it should be chosen with the current mixed perf result in mind and not be presented as solved dense-scene motion.

## Verification

- Unit tests:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Lint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-gui-textblock-resting-text-cluster.spec.ts`
- Live Playwright probes:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.3nsxvK/loop-001/run-009/worktree-ai.log -- tests/e2e/settings/settings-all-settings-gui-textblock-resting-text-cluster.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Results:
  - `2 passed (1.0m)` on the live worktree runtime
  - the focused probe confirmed the gui/text-block pair rests as lightweight canvas-owned text and both canonical rows still mount their inline editors on first focus
  - the dense probe emitted the metrics recorded above
