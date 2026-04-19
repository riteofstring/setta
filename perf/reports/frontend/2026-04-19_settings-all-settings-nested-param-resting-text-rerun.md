# Settings All Settings Nested Param Resting Text Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior row-body checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-shell-size-row-body-flattening-rerun.md`
Prior dense checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-shell-size-row-body-flattening-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-nested-param-resting-text.spec.ts`
Row-body probe: `frontend/tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Move the last remaining `ParamContainer` row-body/value surface on `All Settings` onto the retained canvas path by adding `settings-section__nestedParamCodeObjDefault` to the existing canvas-owned resting-text boundary.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - focused probe: Playwright Chromium, headless Linux
  - row-body probe: Playwright Chromium, headless Linux
  - dense probe: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication:
  - each probe used a fresh one-shot bootstrap token via `./scripts/run-playwright-against-runtime.sh`

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now adds `settings-section__nestedParamCodeObjDefault` to the shared param-codeobj canvas-owned resting-text boundary, which also enables the existing lightweight switch value-shell/track ownership for that section.
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures and paints the nested-param section on the retained backdrop canvas instead of leaving it outside the backdrop map.
- Focused proof now exists in:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `frontend/src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-nested-param-resting-text.spec.ts`
- `frontend/tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts` now treats zero remaining row-body rows as the success state instead of assuming survivors must always remain.

## Focused Runtime Proof

Canonical target section and row:

- target section: `settings-section__nestedParamCodeObjDefault`
- canonical editor handoff row: `settings-codeobj__nestedParamCodeObjDefault__nestedParamCodeObjDefault__typeAnnotation`

Focused proof on the live worktree surface:

- the `Core Name Type` and `Type Annotation` inputs now report:
  - `data-canvas-owned-resting-text-lightweight="true"`
  - `opacity: "0"` at rest
  - zero retained `.cm-line span` highlight descendants at rest
- the `Core Name Editable` row now reports:
  - exactly one retained `.section-value` root
  - `data-canvas-owned-switch-track="true"` on the lightweight switch root
- the canonical `Type Annotation` input still focuses inline on the first interaction and shows the real CodeMirror editor immediately

Interpretation from the focused proof:

- the last live nested-param resting text/value/switch lane is now on the same retained backdrop path as the rest of the shared param-codeobj family
- first-interaction inline editing remains intact on the canonical `Type Annotation` row

## Row-Body Surface Summary

Fresh whole-scene rerank after the product slice:

- `mountedSectionCount: 46`
- `totalRowCount: 759`
- `totalRemainingRowCount: 0`
- `totalRemainingVisibleElementCount: 0`
- `totalRemainingVisibleChromeElementCount: 0`
- `totalRemainingVisibleLabelElementCount: 0`
- `totalRemainingVisibleValueElementCount: 0`
- strongest common remaining kinds:
  - none

Compared with the prior row-body checkpoint:

- `totalRemainingRowCount: 3 -> 0`
- `totalRemainingVisibleElementCount: 9 -> 0`
- `totalRemainingVisibleChromeElementCount: 0 -> 0`
- `totalRemainingVisibleLabelElementCount: 3 -> 0`
- `totalRemainingVisibleValueElementCount: 6 -> 0`
- `settings-section__nestedParamCodeObjDefault.remainingRowCount: 3 -> 0`
- `settings-section__nestedParamCodeObjDefault.remainingVisibleElementCount: 9 -> 0`

Interpretation from the rerank:

- this closes the `nestedParamCodeObjDefault` row-body/value seam as product code rather than leaving a last survivor family open
- the `ParamContainer` row-body rerank is now fully cleared on the current `All Settings` surface, so another row-body cleanup pass would be churn

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `5578`
- Inputs: `2`
- Textareas: `0`
- Buttons: `40`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `70.29ms`
- RAF p50: `66.7ms`
- RAF p95: `116.7ms`
- RAF max: `166.6ms`
- RAF frames over `16.7ms`: `179`
- RAF frames over `33.3ms`: `165`
- Long-task count: `134`
- Long-task total: `10740ms`
- Long-task max: `160ms`

## Comparison Vs. Prior Dense Checkpoint

Compared with `perf/reports/frontend/2026-04-19_settings-all-settings-shell-size-row-body-flattening-rerun.md`:

- `documentNodeCount: 5583 -> 5578`
- `inputCount: 2 -> 2`
- `textareaCount: 0 -> 0`
- `buttonCount: 40 -> 40`
- `raf.meanMs: 70.11 -> 70.29`
- `raf.p95Ms: 116.7 -> 116.7`
- `longTasks.totalMs: 10834 -> 10740`

Interpretation:

- this slice fully clears the remaining row-body/value surface, but the dense motion result is still far from the branch goal and only moved slightly on the same noisy runtime family
- with the row-body rerank now at zero, the next default frontier must pivot away from `ParamContainer` cleanup and toward the next broader motion blocker, likely a stronger inactive-row overlay/body decision or the next measured whole-scene hotspot

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-nested-param-resting-text.spec.ts tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts`
- Playwright focused + row-body + dense probes:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-002/run-001/worktree-ai.log -- tests/e2e/settings/settings-all-settings-nested-param-resting-text.spec.ts tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe preserved inline editing on the canonical nested-param `Type Annotation` row
  - the row-body and dense probes emitted the totals recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
