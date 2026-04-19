# Settings All Settings Resting-Text Switch Value-Shell Boundary Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior product slice: `perf/reports/frontend/2026-04-19_settings-all-settings-shared-switch-value-shell-flattening-rerun.md`
Focused proof: `frontend/tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts`
Whole-scene ranking probe: `frontend/tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Move lightweight switch value-shell flattening to the retained resting-text ownership boundary so the remaining repeated switch wrappers stop requiring section-by-section expansion, while keeping `backend` outside that boundary.

## Slice

- canonical target section: `settings-section__browserSectionDefault`
- sibling proof section: `settings-section__promptSectionDefault`
- expanded proof sections on the same boundary:
  - `settings-section__gui`
  - existing retained-text sections already covered by the prior switch-shell slice
- negative control that must stay outside the boundary:
  - `settings-section__backend`
- implementation notes:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now resolves `isCanvasOwnedSectionLightweightSwitchValueShell(...)` from the existing retained resting-text section boundary instead of a narrow shared-family set
  - the existing `frontend/src/components/Params/ParamUIs/ParamUI.tsx` switch path picks up that broader boundary without a new renderer branch
  - focused ownership/unit proof now covers `browser`, `gui`, and `backend` in:
    - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`

## Focused Proof

The focused browser probe now checks the real ownership boundary instead of the older chat/spreadsheet family:

- `settings-section__browserSectionDefault` `Aspect Ratio`: lightweight switch root is the `.section-value` shell and no extra non-lightweight wrapper remains
- `settings-section__promptSectionDefault` `Aspect Ratio`: same flattened lightweight switch root with zero extra wrapper
- `settings-section__gui` `Left Side Pane Shifts Map`: same flattened lightweight switch root with zero extra wrapper
- `settings-section__backend` `Auto Backup`: remains outside the boundary, so one non-lightweight `.section-value` wrapper still surrounds the lightweight switch
- callable canvas-track switch rows still remain present on the retained path
- the browser `Aspect Ratio` switch still toggles on first click and restores cleanly

## Whole-Scene Ranking Summary

Focused inventory totals on the live rerun:

- mounted settings sections: `46`
- total param rows across mounted sections: `759`
- rows with remaining non-lightweight value DOM: `28`
- visible remaining value-subtree elements across those rows: `87`

Compared against `perf/reports/frontend/2026-04-19_settings-all-settings-shared-switch-value-shell-flattening-rerun.md`:

- `totalRemainingValueRowCount`: `119 -> 28`
- `totalRemainingValueElementCount`: `178 -> 87`

The retained resting-text boundary closes the repeated switch-wrapper family decisively:

- `settings-section__browserSectionDefault`, `settings-section__promptSectionDefault`, `settings-section__pluginSectionDefault`, `settings-section__genPythonCodeSectionDefault`, `settings-section__genPythonMetadataSectionDefault`, `settings-section__stateMachineStartSectionDefault`, and the previously landed switch sections all drop out of the rerun survivor list
- `settings-section__gui` falls from `15` remaining elements to `8`, and its remaining surface is now color-input wrapper/icon chrome rather than switch shells
- `settings-section__drawSectionDefault` falls from `6` remaining elements to `2`, leaving only the color-input wrapper/icon pair
- the main remaining outliers are now:
  - `settings-section__languageServer` (`48`)
  - `settings-section__backend` (`21`)
  - `settings-section__gui` (`8`)
  - `settings-section__nestedParamCodeObjDefault` (`6`)

## Dense Metrics

Captured on the same runtime family:

- `documentNodeCount`: `6728`
- `inputCount`: `4`
- `textareaCount`: `1`
- `buttonCount`: `52`
- `canvasCount`: `1`
- `raf.meanMs`: `94.6`
- `raf.p95Ms`: `166.8`
- `longTasks.totalMs`: `15117`

Compared against the prior shared switch-family rerun:

- `documentNodeCount`: `6819 -> 6728`
- `raf.meanMs`: `94.97 -> 94.6`
- `raf.p95Ms`: `166.8 -> 166.8`
- `longTasks.totalMs`: `15265 -> 15117`

Compared against the durable `go-rewrite` baseline:

- `documentNodeCount`: `9553 -> 6728`
- `inputCount`: `92 -> 4`
- `buttonCount`: `521 -> 52`
- `raf.meanMs`: `204.93 -> 94.6`
- `longTasks.totalMs`: `36337 -> 15117`

## Interpretation

- This is a real product-boundary slice, not another section-list follow-up: the switch value-shell lane now aligns with the retained resting-text ownership seam instead of a hand-maintained family list.
- The ranking shows the repeated switch-wrapper family is effectively closed at this boundary.
- The next highest-payoff product frontier is no longer another switch-shell expansion. It is now the single-section nested text-value outlier at `settings-section__languageServer`, with `backend` plain text-value rows as the next fallback.
- The branch goal remains open because dense `All Settings` motion is still far above the `33.3ms` budget.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-012/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused browser/prompt/gui/backend probe stayed on the intended boundary
  - the whole-scene ranking and dense probe produced the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
