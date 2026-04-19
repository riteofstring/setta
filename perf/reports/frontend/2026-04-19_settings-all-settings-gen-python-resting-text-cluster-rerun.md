# Settings All Settings Gen-Python Resting-Text Cluster Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior dense reference: `perf/reports/frontend/2026-04-19_settings-all-settings-gui-textblock-resting-text-cluster-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-gen-python-resting-text-cluster.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Land one bounded dense-scene product slice on the remaining pure-text `7`-row pair by moving `settings-section__genPythonCodeSectionDefault` and `settings-section__genPythonMetadataSectionDefault` onto the shared canvas-owned resting-text path, then rerun the normalized `All Settings` baseline to see whether that pair reduces the mounted row-value DOM surface.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - focused probe: Playwright Chromium, headless Linux
  - dense probe: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Canonical target section: `settings-section__genPythonCodeSectionDefault`
- Sibling section landed in the same shared slice:
  - `settings-section__genPythonMetadataSectionDefault`
- Canonical target rows:
  - `settings-section__genPythonCodeSectionDefault`:
    - input id: `settings-section__genPythonCodeSectionDefault-settings-codeobj__genPythonCodeSectionDefault__genPythonCodeSectionDefault__size__width-ParamInput`
  - `settings-section__genPythonMetadataSectionDefault`:
    - input id: `settings-section__genPythonMetadataSectionDefault-settings-codeobj__genPythonMetadataSectionDefault__genPythonMetadataSectionDefault__size__width-ParamInput`
- Authentication:
  - probes used fresh one-shot bootstrap tokens via `./scripts/run-playwright-against-runtime.sh`

## Implementation Summary

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now includes `settings-section__genPythonCodeSectionDefault` and `settings-section__genPythonMetadataSectionDefault` in the shared resting-text-owned section set and gives both sections lightweight underline ownership.
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures both sections directly so the retained scene can paint their resting text and underline primitives without introducing a new renderer branch.
- Focused coverage now exists at:
  - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - updated `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - new `frontend/tests/e2e/settings/settings-all-settings-gen-python-resting-text-cluster.spec.ts`

## Focused Browser Inventory

A fresh post-change pair probe recorded:

- `settings-section__genPythonCodeSectionDefault`:
  - total unique `*-ParamInput` roots: `7`
  - `data-canvas-owned-resting-text="true"` roots: `8`
  - `data-canvas-owned-resting-text-lightweight="true"` roots: `7`
  - `data-canvas-owned-underline="true"` roots: `7`
  - live `input` / `textarea` / `.cm-editor` roots at rest: `0`
- `settings-section__genPythonMetadataSectionDefault`:
  - total unique `*-ParamInput` roots: `7`
  - `data-canvas-owned-resting-text="true"` roots: `8`
  - `data-canvas-owned-resting-text-lightweight="true"` roots: `7`
  - `data-canvas-owned-underline="true"` roots: `7`
  - live `input` / `textarea` / `.cm-editor` roots at rest: `0`

Interpretation:

- the full untouched `7`-row gen-python pair now rides the shared lightweight resting-text path
- the focused counts show every target `*-ParamInput` root moved onto the lightweight path with no live editors left mounted at rest
- `canvasOwnedRestingTextCount` is higher than the target-row count because it still includes one pre-existing canvas-owned text root elsewhere in each section, not because the target rows stayed live

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `7670`
- Inputs: `2`
- Textareas: `0`
- Buttons: `39`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.7`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.7`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `102.6ms`
- RAF p50: `100ms`
- RAF p95: `183.4ms`
- RAF max: `250ms`
- RAF frames over `16.7ms`: `178`
- RAF frames over `33.3ms`: `152`
- Long-task count: `127`
- Long-task total: `16510ms`
- Long-task max: `234ms`

## Comparison Vs. Prior Dense Report

- Document nodes: down `38` (`7708` -> `7670`)
- Inputs: unchanged (`2`)
- Buttons: unchanged (`39`)
- RAF mean: better by `2.52ms` (`105.12ms` -> `102.6ms`)
- RAF p95: better by `33.3ms` (`216.7ms` -> `183.4ms`)
- Long-task total: better by `379ms` (`16889ms` -> `16510ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `1883` (`9553` -> `7670`)
- Inputs: down `90` (`92` -> `2`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `482` (`521` -> `39`)
- Canvas elements: up `1` (`0` -> `1`)
- RAF mean: better by `102.33ms` (`204.93ms` -> `102.6ms`)
- RAF p95: better by `33.3ms` (`216.7ms` -> `183.4ms`)
- Long-task total: better by `19827ms` (`36337ms` -> `16510ms`)

## Interpretation

- This pair move reduced the dense mounted row-value surface again: `documentNodeCount` dropped from `7708` to `7670` while the interactive-core plateau stayed flat at `2` inputs / `39` buttons.
- Unlike the prior gui/text-block pair, this slice also improved the immediate dense rerun metrics: `raf.mean`, `raf.p95`, and long-task total all moved in the right direction.
- The gain is still incremental rather than decisive, so this remains ownership progress on the path to a larger dense-scene win, not proof that the branch has solved pan/zoom feel.
- The next frontier should stay on the remaining pure-text `7`-row cluster or another broader shared resting-value primitive that can plausibly move the same dense-scene totals.

## Verification

- Unit tests:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Lint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-gen-python-resting-text-cluster.spec.ts`
- Live Playwright probes:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.3nsxvK/loop-001/run-010/worktree-ai.log -- tests/e2e/settings/settings-all-settings-gen-python-resting-text-cluster.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Results:
  - `2 passed (57.9s)` on the live worktree runtime
  - the focused probe confirmed the gen-python pair rests as lightweight canvas-owned text and both canonical rows still mount their inline editors on first focus
  - the dense probe emitted the metrics recorded above
