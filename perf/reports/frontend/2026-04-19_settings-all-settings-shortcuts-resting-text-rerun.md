# Settings All Settings Shortcuts Resting-Text Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `ee179acf6` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior dense reference: `perf/reports/frontend/2026-04-19_settings-all-settings-post-gate-type-dense-hotspot-report.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Land one bounded dense-scene product slice on the highest-payoff remaining text family by moving `settings-section__shortcuts` onto the shared canvas-owned resting-text path, then rerun the normalized `All Settings` baseline to see whether that section materially reduces the moving row-value DOM surface.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - focused probe: Playwright Chromium, headless Linux
  - dense probe: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Canonical target section: `settings-section__shortcuts`
- Canonical target row:
  - id: `ParamContainer-settings-section__shortcuts-settings-codeobj__shortcuts__shortcuts__advancedSearchShortcut`
  - input id: `settings-section__shortcuts-settings-codeobj__shortcuts__shortcuts__advancedSearchShortcut-ParamInput`
- Authentication:
  - both probes used fresh one-shot bootstrap tokens via `./scripts/run-playwright-against-runtime.sh` or `./scripts/dev-runtime-info.sh`

## Implementation Summary

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now treats `settings-section__shortcuts` as a shared resting-text-owned section and also gives that lane lightweight underline ownership.
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures `settings-section__shortcuts` directly so the retained scene can paint its resting text and underline primitives instead of leaving those rows fully live in DOM.
- Focused coverage now exists at:
  - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - updated `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - new `frontend/tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts`

## Focused Shortcuts Inventory

A fresh post-change inventory probe on `settings-section__shortcuts` recorded:

- section present: `true`
- total `*-ParamInput` roots: `62`
- `data-canvas-owned-resting-text="true"` roots: `62`
- `data-canvas-owned-resting-text-lightweight="true"` roots: `62`
- total `.cm-line span` highlight nodes across that section: `0`

Interpretation:

- the dominant untouched shortcuts text family is no longer mounting syntax-highlight span trees at rest
- the whole section now rides the same lightweight resting-text path already proven on the earlier canary sections

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `7981`
- Inputs: `2`
- Textareas: `0`
- Buttons: `39`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-51.7`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-51.7`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `99.34ms`
- RAF p50: `100ms`
- RAF p95: `183.4ms`
- RAF max: `233.4ms`
- RAF frames over `16.7ms`: `175`
- RAF frames over `33.3ms`: `155`
- Long-task count: `127`
- Long-task total: `15984ms`
- Long-task max: `242ms`

## Comparison Vs. Prior Post-Gate-Type Dense Report

- Document nodes: down `182` (`8163` -> `7981`)
- Inputs: unchanged (`2`)
- Buttons: unchanged (`39`)
- RAF mean: better by `1.49ms` (`100.83ms` -> `99.34ms`)
- RAF p95: unchanged (`183.4ms`)
- Long-task total: better by `277ms` (`16261ms` -> `15984ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `1572` (`9553` -> `7981`)
- Inputs: down `90` (`92` -> `2`)
- Textareas: down `1` (`1` -> `0`)
- Buttons: down `482` (`521` -> `39`)
- Canvas elements: up `1` (`0` -> `1`)
- RAF mean: better by `105.59ms` (`204.93ms` -> `99.34ms`)
- RAF p95: better by `33.3ms` (`216.7ms` -> `183.4ms`)
- Long-task total: better by `20353ms` (`36337ms` -> `15984ms`)

## Interpretation

- This slice materially moved the dense mounted graph-surface body/value cost instead of reopening a closed activator family: the section with the largest untouched resting-text inventory (`62` roots) now rides the retained-canvas path and the global `documentNodeCount` dropped again.
- The move is meaningful but not sufficient. `All Settings` still sits far above the branch goal with `raf.meanMs 99.34`, `raf.p95Ms 183.4`, and `longTasks.totalMs 15984`.
- The next frontier should stay on the same class of problem:
  - another highest-payoff remaining dense text/value section family if current evidence still shows one section dominating the untouched inventory
  - or a broader shared row-value primitive if fresh evidence now shows the remaining cost is distributed rather than section-dominated
- Do not reopen the closed kwargs/menu/filter/color/gate-type activator lanes from here.

## Verification

- Unit tests:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Lint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts`
- Live Playwright probes:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.3nsxvK/loop-001/run-004/worktree-ai.log -- tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Results:
  - `2 passed (57.3s)` on the live worktree runtime
  - the focused probe confirmed the canonical `Advanced Search Shortcut` row rests as lightweight canvas-owned text and still activates the inline CodeMirror editor on first focus
  - the dense probe emitted the metrics recorded above
