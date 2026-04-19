# Settings All Settings Post Param-Codeobj Remaining Value Surface Ranking

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior product slice: `perf/reports/frontend/2026-04-19_settings-all-settings-param-codeobj-resting-text-cluster-rerun.md`
Prior ranking reference: `perf/reports/frontend/2026-04-19_settings-all-settings-post-size-style-tag-remaining-value-surface-ranking.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Refresh the whole-scene `settings` -> `All Settings` ranking after the shared param-codeobj retained-text slice so the next product pass comes from the current mounted survivor surface instead of continuing the just-closed text/value family by inertia.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - focused probe: Playwright Chromium, headless Linux
  - dense probe: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication:
  - both probes used fresh one-shot bootstrap tokens via `./scripts/run-playwright-against-runtime.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-010/worktree-ai.log -- tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Whole-Scene Ranking Summary

Focused inventory totals:

- mounted settings sections: `46`
- total param rows across mounted sections: `759`
- rows with remaining non-lightweight value DOM: `176`
- visible remaining value-subtree elements across those rows: `235`

Compared against the prior whole-scene ranking at `perf/reports/frontend/2026-04-19_settings-all-settings-post-size-style-tag-remaining-value-surface-ranking.md`, the mounted remaining value surface moved materially again:

- `totalRemainingValueRowCount`: `220 -> 176`
- `totalRemainingValueElementCount`: `357 -> 235`

Top remaining sections by visible non-lightweight value-element count:

1. `settings-section__languageServer`
   - `remainingValueElementCount: 48`
   - `remainingValueRowCount: 7`
   - dominant surviving rows are still the nested `Basedpyright` / `Analysis` / `Diagnostic Severity Overrides` text-value chain
2. `settings-section__backend`
   - `remainingValueElementCount: 21`
   - `remainingValueRowCount: 12`
   - dominant surviving rows are plain text-value rows such as `Auto Backup Freq`, `Auto Backup Keep Last N`, and `Default Terminal Shell`, plus already-lightweight switch shells
3. `settings-section__gui`
   - `remainingValueElementCount: 15`
   - `remainingValueRowCount: 11`
   - dominant surviving rows are color-input wrapper/icon chrome plus already-lightweight switch shells
4. `settings-section__chatSectionDefault`
   - `remainingValueElementCount: 8`
   - `remainingValueRowCount: 8`
   - every listed survivor row is already `lightweightSwitch`, with only `div.section-value` still visible
5. `settings-section__spreadsheetSectionDefault`
   - `remainingValueElementCount: 7`
   - `remainingValueRowCount: 7`
   - every listed survivor row is already `lightweightSwitch`, with only `div.section-value` still visible

Broader repeated survivor shape from the current top 12:

- `settings-section__chatSectionDefault`
- `settings-section__spreadsheetSectionDefault`
- `settings-section__dictSectionDefault`
- `settings-section__globalVariablesSectionDefault`
- `settings-section__callableSectionDefault`
- `settings-section__codeSectionDefault`
- `settings-section__textBlockSectionDefault`
- `settings-section__stateMachineGateSectionDefault`
- `settings-section__groupSectionDefault`

Those nine sections account for `57` visible remaining value elements in the top-12 subset alone, and the dominant remaining kind is the same in each case:

- rows already marked `lightweightSwitch`
- one visible `div.section-value` shell still left in DOM per row

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `6874`
- Inputs: `4`
- Textareas: `1`
- Buttons: `52`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `96.55ms`
- RAF p50: `83.4ms`
- RAF p95: `183.4ms`
- RAF max: `250ms`
- RAF frames over `16.7ms`: `177`
- RAF frames over `33.3ms`: `155`
- Long-task count: `127`
- Long-task total: `15347ms`
- Long-task max: `246ms`

## Comparison Notes

Versus the immediately prior param-codeobj dense rerun at `perf/reports/frontend/2026-04-19_settings-all-settings-param-codeobj-resting-text-cluster-rerun.md`:

- `documentNodeCount`: `6879 -> 6874`
- `inputCount`: `4 -> 4`
- `buttonCount`: `53 -> 52`
- `raf.meanMs`: `97.2 -> 96.55`
- `raf.p95Ms`: `183.3 -> 183.4`
- `longTasks.totalMs`: `15552 -> 15347`

Versus the durable `go-rewrite` baseline:

- `documentNodeCount`: `9553 -> 6874`
- `inputCount`: `92 -> 4`
- `buttonCount`: `521 -> 52`
- `raf.meanMs`: `204.93 -> 96.55`
- `longTasks.totalMs`: `36337 -> 15347`

## Interpretation

- This rerank confirms the shared param-codeobj text/value lane is no longer the next frontier.
- `settings-section__languageServer` remains the single-section outlier worth keeping as a fallback.
- `settings-section__backend` and `settings-section__gui` are still visible local survivors, but they do not represent the broadest next shared ownership win.
- Inference from the ranking: the broader remaining shared frontier is now a switch-row value-shell cleanup, not another resting-text lane, because the repeated survivors are already `lightweightSwitch` rows whose only remaining visible DOM is `div.section-value`.
- The next default product lane should therefore prefer a shared switch-shell/value-shell primitive with:
  - canonical target section: `settings-section__chatSectionDefault`
  - first sibling proof: `settings-section__spreadsheetSectionDefault`
  - broader follow-on family: `dictSectionDefault`, `globalVariablesSectionDefault`, `callableSectionDefault`, `codeSectionDefault`, `textBlockSectionDefault`, `stateMachineGateSectionDefault`, and `groupSectionDefault`
- Only fall back to the `languageServer` outlier if that broader shared switch-shell primitive is blocked on the current ownership boundary.
- The main branch goal remains open:
  - `All Settings` motion is still far above the `33.3ms` budget
  - this report is for next-slice selection, not a success claim

## Verification

- Playwright focused ranking probe + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-010/worktree-ai.log -- tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe produced the ranking recorded above
  - the dense probe emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
