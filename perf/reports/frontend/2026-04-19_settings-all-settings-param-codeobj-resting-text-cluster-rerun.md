# Settings All Settings Shared Param-Codeobj Resting-Text Cluster Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior ranking reference: `perf/reports/frontend/2026-04-19_settings-all-settings-post-size-style-tag-remaining-value-surface-ranking.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-param-codeobj-resting-text-cluster.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Move the top shared param-codeobj text/value family onto the existing retained resting-text plus lightweight underline ownership seam, using `settings-section__rotaryParamCodeObjDefault` as the canonical target and `settings-section__sliderParamCodeObjDefault` as the first sibling proof.

## Scope

Landed shared retained-text ownership for these sections:

- `settings-section__rotaryParamCodeObjDefault`
- `settings-section__sliderParamCodeObjDefault`
- `settings-section__colorPickerParamCodeObjDefault`
- `settings-section__dropdownParamCodeObjDefault`
- `settings-section__textParamCodeObjDefault`
- `settings-section__switchParamCodeObjDefault`
- `settings-section__passwordParamCodeObjDefault`
- `settings-section__codeParamCodeObjDefault`
- `settings-section__textAreaParamCodeObjDefault`

This slice intentionally stayed on the existing value seam:

- retained resting text
- lightweight underline chrome

It did not widen:

- param-label text ownership
- switch/button/color-input interactive cores
- shell/header ownership

## Focused Cluster Proof

The focused Playwright probe proved the shared family now uses the lightweight retained-text path on the live surface:

1. `settings-section__rotaryParamCodeObjDefault`
   - canonical row: `Max`
   - `lightweightRestingTextCount: 7`
   - `underlineCount: 7`
   - inline editor still surfaced on first focus
2. `settings-section__sliderParamCodeObjDefault`
   - sibling row: `Step`
   - `lightweightRestingTextCount: 7`
   - `underlineCount: 7`
   - inline editor still surfaced on first focus
3. `settings-section__textParamCodeObjDefault`
   - sibling row: `UI Type`
   - `lightweightRestingTextCount: 5`
   - `underlineCount: 5`
   - inline editor still surfaced on first focus

In each checked case:

- the resting input root was `opacity: 0`
- `data-canvas-owned-resting-text-lightweight="true"` was present
- `liveInputCount` stayed `0` at rest
- retained-canvas pixels differed from the sampled body pixel inside the measured text rect

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `6879`
- Inputs: `4`
- Textareas: `1`
- Buttons: `53`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `97.2ms`
- RAF p50: `83.4ms`
- RAF p95: `183.3ms`
- RAF max: `233.4ms`
- RAF frames over `16.7ms`: `177`
- RAF frames over `33.3ms`: `155`
- Long-task count: `128`
- Long-task total: `15552ms`
- Long-task max: `250ms`

## Comparison Notes

Versus the prior whole-scene ranking checkpoint at `perf/reports/frontend/2026-04-19_settings-all-settings-post-size-style-tag-remaining-value-surface-ranking.md`:

- `documentNodeCount`: `6962 -> 6879`
- `inputCount`: `4 -> 4`
- `buttonCount`: `52 -> 53`
- `raf.meanMs`: `95.62 -> 97.2`
- `raf.p95Ms`: `183.4 -> 183.3`
- `longTasks.totalMs`: `15281 -> 15552`

Versus the durable `go-rewrite` baseline:

- `documentNodeCount`: `9553 -> 6879`
- `inputCount`: `92 -> 4`
- `buttonCount`: `521 -> 53`
- `raf.meanMs`: `204.93 -> 97.2`
- `longTasks.totalMs`: `36337 -> 15552`

## Interpretation

- This was a real shared-family product slice, not another section-local cleanup hop.
- The slice moved the intended dense blocker metric again: `documentNodeCount` dropped by `83` from the prior checkpoint.
- Motion stayed roughly flat on this runtime family, so treat this as a dense DOM-cost reduction slice, not a new motion win.
- The next default pass should not keep extending this family blindly. Re-run the whole-scene remaining-value ranking from the new `6879` checkpoint and pick the next broad survivor from fresh evidence.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-param-codeobj-resting-text-cluster.spec.ts`
- Playwright focused cluster probe + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-009/worktree-ai.log -- tests/e2e/settings/settings-all-settings-param-codeobj-resting-text-cluster.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
