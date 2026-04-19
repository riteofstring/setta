# Settings All Settings Shared Resting Param Label Ownership Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior row-body checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-row-body-surface-ranking.md`
Prior dense checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-shared-lightweight-resize-handle-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-lightweight-param-label-generalization.spec.ts`
Row-body probe: `frontend/tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Widen canvas-owned param-label resting text from the old canary subset to the full current resting-text settings boundary, so the retained scene paints those labels and the moving row-body surface stops paying visible `.section-key` text across the shared resting-text cluster.

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

## Focused Cluster Summary

Canonical target section and row:

- section: `settings-section__stateMachineStartSectionDefault`
- row: `Label`
- target row id: `ParamContainer-settings-section__stateMachineStartSectionDefault-settings-codeobj__stateMachineStartSectionDefault__stateMachineStartSectionDefault__label`
- target editor id: `CodeMirror-settings-section__stateMachineStartSectionDefault-settings-codeobj__stateMachineStartSectionDefault__stateMachineStartSectionDefault__label`

Focused runtime proof:

- canonical `Label` root now reports:
  - `canvasOwnedRestingTextFlag: "true"`
  - `lightweightOwnershipFlag: "true"`
  - `opacity: "0"`
  - `distinctPixelCount: 5160`
  - `text: "Label"`
- the focused label click still surfaced the inline CodeMirror editor in place on first interaction
- shared untouched-section proof now reports:
  - `settings-section__spreadsheetSectionDefault`: `rowCount 15`, `labelCount 14`, `canvasOwnedRestingTextCount 14`, `legacyLeadingContentWrapperCount 0`
  - `settings-section__taskBoardSectionDefault`: `rowCount 12`, `labelCount 11`, `canvasOwnedRestingTextCount 11`, `legacyLeadingContentWrapperCount 0`
  - `settings-section__stateMachineStartSectionDefault`: `rowCount 12`, `labelCount 11`, `canvasOwnedRestingTextCount 11`, `legacyLeadingContentWrapperCount 0`

## Row-Body Surface Summary

Fresh whole-scene rerank after the product slice:

- `mountedSectionCount: 46`
- `totalRowCount: 759`
- `totalRemainingRowCount: 755`
- `totalRemainingVisibleElementCount: 1540`
- `totalRemainingVisibleChromeElementCount: 1531`
- `totalRemainingVisibleLabelElementCount: 3`
- `totalRemainingVisibleValueElementCount: 6`
- strongest common remaining kinds are now almost entirely row chrome / article structure:
  - `div.section-center...` (`755`)
  - `article.section-key-value...` (`74`)
  - `article.section-args-nested.section-lg-value...` (`4`)
  - `div.section-args-nested.section-key-value` (`3`)
  - `p.section-key` (`3`)

Compared with the prior row-body checkpoint:

- `totalRemainingVisibleElementCount: 1764 -> 1540`
- `totalRemainingVisibleChromeElementCount: 1543 -> 1531`
- `totalRemainingVisibleLabelElementCount: 215 -> 3`
- `totalRemainingVisibleValueElementCount: 6 -> 6`
- `p.section-key` common-kind count: `203 -> 3`

Interpretation from the rerank:

- the visible label surface is effectively gone across the shared resting-text settings boundary
- the remaining frontier is no longer broad label text; it is the interactive `section-center` root plus the remaining row/article structure in heavy sections like `sectionSizingPolicy`

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `5658`
- Inputs: `4`
- Textareas: `1`
- Buttons: `53`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `74.58ms`
- RAF p50: `66.7ms`
- RAF p95: `150ms`
- RAF max: `200ms`
- RAF frames over `16.7ms`: `179`
- RAF frames over `33.3ms`: `166`
- Long-task count: `129`
- Long-task total: `11230ms`
- Long-task max: `198ms`

## Comparison Vs. Prior Dense Checkpoint

Compared with `perf/reports/frontend/2026-04-19_settings-all-settings-shared-lightweight-resize-handle-rerun.md`:

- `documentNodeCount: 5658 -> 5658`
- `raf.meanMs: 76.81 -> 74.58`
- `raf.p95Ms: 133.4 -> 150`
- `longTasks.totalMs: 11807 -> 11230`

Interpretation:

- this slice did not reduce DOM node count because the label roots stay mounted for interaction handoff
- it did reduce the visible moving row-body surface sharply, and the dense runtime improved on mean frame time and long-task total on the same runtime family
- the p95 tail is still above budget and worse than the resize-handle checkpoint, so the branch remains blocked on broader article/body structure rather than label text

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-lightweight-param-label-generalization.spec.ts`
- Playwright focused probe:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-006/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-param-label-generalization.spec.ts --reporter=json --workers=1`
- Playwright row-body + dense probes:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-006/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-param-label-generalization.spec.ts tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe proved the hidden-label/canvas-text counts recorded above
  - the row-body and dense probes emitted the totals recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
