# Settings All Settings Code-Like Resting-Text Cluster Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior dense reference: `perf/reports/frontend/2026-04-19_settings-all-settings-browser-resting-text-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-code-like-resting-text-cluster.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Land one bounded dense-scene product slice on the top untouched `9`-row cluster by moving `settings-section__buttonParamCodeObjDefault`, `settings-section__codeSectionDefault`, and `settings-section__promptSectionDefault` onto the shared canvas-owned resting-text path, then rerun the normalized `All Settings` baseline to see whether that clustered move reduces the mounted row-value DOM surface.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - focused probe: Playwright Chromium, headless Linux
  - dense probe: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Canonical target section: `settings-section__buttonParamCodeObjDefault`
- Sibling sections landed in the same shared slice:
  - `settings-section__codeSectionDefault`
  - `settings-section__promptSectionDefault`
- Canonical target rows:
  - `settings-section__buttonParamCodeObjDefault`:
    - input id: `settings-section__buttonParamCodeObjDefault-settings-codeobj__buttonParamCodeObjDefault__buttonParamCodeObjDefault__label-ParamInput`
  - `settings-section__codeSectionDefault`:
    - input id: `settings-section__codeSectionDefault-settings-codeobj__codeSectionDefault__codeSectionDefault__codeLanguage-ParamInput`
  - `settings-section__promptSectionDefault`:
    - input id: `settings-section__promptSectionDefault-settings-codeobj__promptSectionDefault__promptSectionDefault__format-ParamInput`
- Authentication:
  - probes used fresh one-shot bootstrap tokens via `./scripts/run-playwright-against-runtime.sh`

## Implementation Summary

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now includes the button/code/prompt cluster in the shared resting-text-owned section set and gives that same cluster lightweight underline ownership.
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures all three sections directly so the retained scene can paint their resting text and underline primitives without opening a new renderer branch.
- Focused coverage now exists at:
  - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - updated `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - new `frontend/tests/e2e/settings/settings-all-settings-code-like-resting-text-cluster.spec.ts`

## Focused Browser Inventory

A fresh post-change cluster probe recorded:

- `settings-section__buttonParamCodeObjDefault`:
  - total unique `*-ParamInput` roots: `9`
  - `data-canvas-owned-resting-text="true"` roots: `10`
  - `data-canvas-owned-resting-text-lightweight="true"` roots: `9`
  - `data-canvas-owned-underline="true"` roots: `9`
  - live `input` / `textarea` / `.cm-editor` roots at rest: `0`
- `settings-section__codeSectionDefault`:
  - total unique `*-ParamInput` roots: `9`
  - `data-canvas-owned-resting-text="true"` roots: `10`
  - `data-canvas-owned-resting-text-lightweight="true"` roots: `9`
  - `data-canvas-owned-underline="true"` roots: `9`
  - live `input` / `textarea` / `.cm-editor` roots at rest: `0`
- `settings-section__promptSectionDefault`:
  - total unique `*-ParamInput` roots: `9`
  - `data-canvas-owned-resting-text="true"` roots: `10`
  - `data-canvas-owned-resting-text-lightweight="true"` roots: `9`
  - `data-canvas-owned-underline="true"` roots: `9`
  - live `input` / `textarea` / `.cm-editor` roots at rest: `0`

Interpretation:

- the full untouched `9`-row button/code/prompt cluster now rides the shared lightweight resting-text path
- each section still carries one extra non-lightweight `data-canvas-owned-resting-text="true"` root for its pre-existing `args-filter` activator, not for a surviving live text editor
- this was a broader shared-family move than the recent one-section browser/chat passes, so it closes the immediate “repeat the same section hop” risk while still targeting the top untouched dense surface from the current handoff

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `7806`
- Inputs: `2`
- Textareas: `0`
- Buttons: `39`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.7`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.7`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `102.14ms`
- RAF p50: `100ms`
- RAF p95: `183.4ms`
- RAF max: `250ms`
- RAF frames over `16.7ms`: `176`
- RAF frames over `33.3ms`: `155`
- Long-task count: `127`
- Long-task total: `16467ms`
- Long-task max: `257ms`

## Comparison Vs. Prior Browser Dense Report

- Document nodes: down `67` (`7873` -> `7806`)
- Inputs: unchanged (`2`)
- Buttons: unchanged (`39`)
- RAF mean: better by `2.6ms` (`104.74ms` -> `102.14ms`)
- RAF p95: better by `33.2ms` (`216.6ms` -> `183.4ms`)
- Long-task total: better by `470ms` (`16937ms` -> `16467ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `1747` (`9553` -> `7806`)
- Inputs: down `90` (`92` -> `2`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `482` (`521` -> `39`)
- Canvas elements: up `1` (`0` -> `1`)
- RAF mean: better by `102.79ms` (`204.93ms` -> `102.14ms`)
- RAF p95: better by `33.3ms` (`216.7ms` -> `183.4ms`)
- Long-task total: better by `19870ms` (`36337ms` -> `16467ms`)

## Interpretation

- This clustered move reduced the dense mounted row-value surface again: `documentNodeCount` dropped from `7873` to `7806` while the interactive-core plateau stayed flat at `2` inputs / `39` buttons.
- The current rerun is materially better than the prior browser-only pass, especially on `raf.p95` and long-task total, so this slice did more than just reshuffle ownership locally.
- Dense-scene motion is still far from the `33.3ms` target, so this remains prerequisite work, not a claim that the rewrite has solved `All Settings`.
- The next frontier should keep following the untouched dense mounted sections from the latest ranking rather than reopening closed kwargs/filter/menu/dropdown/color/browser/chat micro-lanes.

## Verification

- Unit tests:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Lint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-code-like-resting-text-cluster.spec.ts`
- Live Playwright probes:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.3nsxvK/loop-001/run-008/worktree-ai.log -- tests/e2e/settings/settings-all-settings-code-like-resting-text-cluster.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Results:
  - `2 passed (57.6s)` on the live worktree runtime
  - the focused probe confirmed the button/code/prompt cluster rests as lightweight canvas-owned text and each canonical row still mounts its inline editor on first focus
  - the dense probe emitted the metrics recorded above
