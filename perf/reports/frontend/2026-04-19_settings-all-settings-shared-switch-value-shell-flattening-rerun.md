# Settings All Settings Shared Switch Value-Shell Flattening Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior ranking reference: `perf/reports/frontend/2026-04-19_settings-all-settings-post-param-codeobj-remaining-value-surface-ranking.md`
Focused proof: `frontend/tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts`
Whole-scene ranking probe: `frontend/tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Remove the repeated `div.section-value` wrapper that still survived around already-lightweight switch rows in the current shared settings family, while keeping first-click switch interaction intact.

## Slice

- canonical target section: `settings-section__chatSectionDefault`
- sibling proof section: `settings-section__spreadsheetSectionDefault`
- broader shared family landed in the same bounded pass:
  - `settings-section__dictSectionDefault`
  - `settings-section__globalVariablesSectionDefault`
  - `settings-section__callableSectionDefault`
  - `settings-section__codeSectionDefault`
  - `settings-section__textBlockSectionDefault`
  - `settings-section__stateMachineGateSectionDefault`
  - `settings-section__groupSectionDefault`
- implementation notes:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now names the shared switch value-shell family explicitly instead of widening the change to every settings switch row
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx` now flattens only that family onto the lightweight switch root on the `canvas-shell-underlay` path
  - `frontend/src/components/Params/ParamUIs/SwitchInput.tsx` now supports an opt-in lightweight-root class path so the redundant wrapper disappears only for the targeted family

## Focused Proof

- `settings-section__chatSectionDefault` `Aspect Ratio` row still exposes one lightweight switch root and toggles on first click
- `settings-section__spreadsheetSectionDefault` `Aspect Ratio` row now uses the same flattened lightweight switch root
- both proof rows report zero non-lightweight `.section-value` wrappers after the change
- callable shell-owned switch rows still keep canvas-owned track rendering on the retained path

## Whole-Scene Ranking Summary

Focused inventory totals on the live rerun:

- mounted settings sections: `46`
- total param rows across mounted sections: `759`
- rows with remaining non-lightweight value DOM: `119`
- visible remaining value-subtree elements across those rows: `178`

Compared against `perf/reports/frontend/2026-04-19_settings-all-settings-post-param-codeobj-remaining-value-surface-ranking.md`:

- `totalRemainingValueRowCount`: `176 -> 119`
- `totalRemainingValueElementCount`: `235 -> 178`

The named shared switch family is no longer the top whole-scene survivor after this pass:

- `settings-section__chatSectionDefault` and `settings-section__spreadsheetSectionDefault` no longer appear in the rerun top-12 ranking
- the previous shared-family members `dict`, `globalVariables`, `callable`, `code`, `textBlock`, `stateMachineGate`, and `group` also dropped out of the rerun top-12
- the remaining top survivors are now led by:
  - `settings-section__languageServer` (`48`)
  - `settings-section__backend` (`21`)
  - `settings-section__gui` (`15`)
  - then smaller repeated switch-wrapper families such as `drawSectionDefault`, `browserSectionDefault`, `metaControlSectionDefault`, `promptSectionDefault`, `pluginSectionDefault`, `genPythonCodeSectionDefault`, `genPythonMetadataSectionDefault`, and `stateMachineStartSectionDefault`

## Dense Metrics

Captured on the same runtime family:

- `documentNodeCount`: `6819`
- `inputCount`: `4`
- `textareaCount`: `1`
- `buttonCount`: `52`
- `canvasCount`: `1`
- `raf.meanMs`: `94.97`
- `raf.p95Ms`: `166.8`
- `longTasks.totalMs`: `15265`

Compared against the prior post-param-codeobj ranking rerun:

- `documentNodeCount`: `6874 -> 6819`
- `raf.meanMs`: `96.55 -> 94.97`
- `raf.p95Ms`: `183.4 -> 166.8`
- `longTasks.totalMs`: `15347 -> 15265`

Compared against the durable `go-rewrite` baseline:

- `documentNodeCount`: `9553 -> 6819`
- `inputCount`: `92 -> 4`
- `buttonCount`: `521 -> 52`
- `raf.meanMs`: `204.93 -> 94.97`
- `longTasks.totalMs`: `36337 -> 15265`

## Interpretation

- This is a real product slice, not another harness-only rerank: the shared switch value-shell family now pays one less DOM node per targeted visible row while preserving the existing lightweight switch interaction path.
- The whole-scene ranking confirms the named shared switch family is effectively closed at this ownership boundary.
- `settings-section__languageServer` remains the single-section outlier, but the next broader repeated family is now another switch-wrapper/value-shell cluster rather than the just-closed chat/spreadsheet family.
- The branch goal remains open because dense `All Settings` motion is still far above the `33.3ms` budget.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Params/ParamUIs/SwitchInput.test.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ParamUIs/SwitchInput.tsx src/components/Params/ParamUIs/SwitchInput.test.tsx src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-011/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-switches.spec.ts tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused switch-family probe kept first-click toggle behavior intact
  - the whole-scene ranking and dense probe produced the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
