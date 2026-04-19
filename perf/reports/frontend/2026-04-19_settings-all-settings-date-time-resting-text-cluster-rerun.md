# Settings All Settings Date/Time Resting-Text Cluster Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior dense reference: `perf/reports/frontend/2026-04-19_settings-all-settings-chat-windowing-dropzone-plugin-resting-text-cluster-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-date-time-resting-text-cluster.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Land one bounded date/time-specific product slice by moving `settings-section__dateParamCodeObjDefault` and `settings-section__timeParamCodeObjDefault` onto the shared canvas-owned resting-text path, then rerun the normalized `All Settings` baseline to capture the post-slice dense metrics.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3070/`
  - backend: `http://127.0.0.1:8070`
- Browser + OS:
  - focused probe: Playwright Chromium, headless Linux
  - dense probe: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Canonical target sections:
  - `settings-section__dateParamCodeObjDefault`
  - `settings-section__timeParamCodeObjDefault`
- Canonical target rows:
  - `settings-section__dateParamCodeObjDefault`:
    - input id: `settings-section__dateParamCodeObjDefault-settings-codeobj__dateParamCodeObjDefault__dateParamCodeObjDefault__dateDisplayFormat-ParamInput`
  - `settings-section__timeParamCodeObjDefault`:
    - input id: `settings-section__timeParamCodeObjDefault-settings-codeobj__timeParamCodeObjDefault__timeParamCodeObjDefault__timeDisplayFormat-ParamInput`
- Authentication:
  - probes used fresh one-shot bootstrap tokens via `./scripts/run-playwright-against-runtime.sh`

## Implementation Summary

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now treats `settings-section__dateParamCodeObjDefault` and `settings-section__timeParamCodeObjDefault` as shared resting-text-owned sections and gives both sections lightweight underline ownership.
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures both sections directly so the retained scene can paint their resting text and underline primitives without opening a new renderer branch.
- Focused coverage now exists at:
  - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - updated `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - new `frontend/tests/e2e/settings/settings-all-settings-date-time-resting-text-cluster.spec.ts`

## Focused Browser Inventory

A fresh post-change pair probe recorded:

- `settings-section__dateParamCodeObjDefault`:
  - total unique `*-ParamInput` roots: `8`
  - `data-canvas-owned-resting-text="true"` roots: `9`
  - `data-canvas-owned-resting-text-lightweight="true"` roots: `8`
  - `data-canvas-owned-underline="true"` roots: `8`
  - live `input` / `textarea` / `.cm-editor` roots at rest: `0`
- `settings-section__timeParamCodeObjDefault`:
  - total unique `*-ParamInput` roots: `8`
  - `data-canvas-owned-resting-text="true"` roots: `9`
  - `data-canvas-owned-resting-text-lightweight="true"` roots: `8`
  - `data-canvas-owned-underline="true"` roots: `8`
  - live `input` / `textarea` / `.cm-editor` roots at rest: `0`

Interpretation:

- the untouched date/time pair now rides the same lightweight resting-text path as the earlier text/value clusters
- the extra non-lightweight `data-canvas-owned-resting-text="true"` root in each section is the pre-existing `args-filter` activator, not a surviving live value editor
- this stayed a date/time-specific ownership decision rather than another generic section-local text harvest: the pair was only added after a fresh live inventory confirmed the untouched cost was still eight DummyCodeMirror-style value rows per section

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `7663`
- Inputs: `4`
- Textareas: `1`
- Buttons: `52`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `115.27ms`
- RAF p50: `100ms`
- RAF p95: `233.4ms`
- RAF max: `300ms`
- RAF frames over `16.7ms`: `179`
- RAF frames over `33.3ms`: `166`
- Long-task count: `129`
- Long-task total: `18504ms`
- Long-task max: `287ms`

## Comparison Vs. Prior Dense Report

- Document nodes: down `38` (`7701` -> `7663`)
- Inputs: unchanged (`4`)
- Textareas: unchanged (`1`)
- Buttons: down `1` (`53` -> `52`)
- RAF mean: worse by `11.74ms` (`103.53ms` -> `115.27ms`)
- RAF p95: worse by `33.3ms` (`200.1ms` -> `233.4ms`)
- Long-task total: worse by `1905ms` (`16599ms` -> `18504ms`)

## Comparison Vs. Durable Go-Rewrite Baseline

- Document nodes: down `1890` (`9553` -> `7663`)
- Inputs: down `88` (`92` -> `4`)
- Textareas: unchanged (`1` -> `1`)
- Buttons: down `469` (`521` -> `52`)
- Canvas elements: up `1` (`0` -> `1`)
- RAF mean: better by `89.66ms` (`204.93ms` -> `115.27ms`)
- RAF p95: worse by `16.7ms` (`216.7ms` -> `233.4ms`)
- Long-task total: better by `17833ms` (`36337ms` -> `18504ms`)

## Interpretation

- This slice moved the dense mounted row-value surface again: the date/time pair now rests as retained-canvas text and the global `documentNodeCount` dropped from the prior smoke checkpoint `7701` to `7663`.
- The dense motion numbers remain noisy and still poor in absolute terms. Treat this as another real DOM-cost reduction prerequisite, not as a solved dense-scene motion result.
- The section-scoped ownership probe is the authoritative proof for this slice. The global `inputCount` / `buttonCount` plateau is still influenced by non-target workspace chrome on this live runtime, so the dense rerun should be used as a checkpoint, not as the only oracle for this product move.
- The next frontier should now re-check the remaining untouched ranking and either:
  - pick the next real date/time-adjacent product move only if it still dominates the inventory
  - or pivot to a broader shared primitive if one now shows clearer global payoff than another family-by-family resting-text reduction

## Verification

- Unit tests:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Lint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-date-time-resting-text-cluster.spec.ts`
- Live Playwright probes:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-002/worktree-ai.log -- tests/e2e/settings/settings-all-settings-date-time-resting-text-cluster.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Results:
  - `2 passed (1.1m)` on the live worktree runtime
  - the focused probe confirmed both canonical date/time rows rest as lightweight canvas-owned text and still mount inline CodeMirror editors on first focus
  - the dense probe emitted the metrics recorded above
