# Settings All Settings Post Shared Size Style Tag Remaining Value Surface Ranking

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior ranking reference: `perf/reports/frontend/2026-04-19_settings-all-settings-remaining-value-surface-ranking.md`
Latest shared-family slice: `perf/reports/frontend/2026-04-19_settings-all-settings-shared-size-style-tag-resting-text-cluster-rerun.md`
Best clean dense checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-gen-python-resting-text-cluster-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Refresh the whole-scene `settings` -> `All Settings` ranking after the shared `Size` / `Height` / `Width` / `Style Color` / `Tag Color` retained-text slice so the next product pass comes from the current dense mounted value surface instead of continuing a now-closed family by inertia.

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
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-008/worktree-ai.log -- tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Whole-Scene Ranking Summary

Focused inventory totals:

- mounted settings sections: `46`
- total param rows across mounted sections: `759`
- rows with remaining non-lightweight value DOM: `220`
- visible remaining value-subtree elements across those rows: `357`

Compared against the prior whole-scene ranking at `perf/reports/frontend/2026-04-19_settings-all-settings-remaining-value-surface-ranking.md`, the remaining value surface moved materially:

- `totalRemainingValueRowCount`: `273 -> 220`
- `totalRemainingValueElementCount`: `570 -> 357`

Top remaining sections by visible non-lightweight value-element count:

1. `settings-section__languageServer`
   - `remainingValueElementCount: 48`
   - `remainingValueRowCount: 7`
   - `lightweightRestingTextRowCount: 0`
   - dominant surviving rows are still the nested `Basedpyright` / `Analysis` / `Diagnostic Severity Overrides` text-value chain
2. `settings-section__rotaryParamCodeObjDefault`
   - `remainingValueElementCount: 24`
   - `remainingValueRowCount: 8`
   - `lightweightSwitchRowCount: 1`
   - dominant surviving rows are shared text-value rows `Max`, `Min`, `Step`, `Value`, and `Core Name Type`
3. `settings-section__sliderParamCodeObjDefault`
   - `remainingValueElementCount: 24`
   - `remainingValueRowCount: 8`
   - `lightweightSwitchRowCount: 1`
   - dominant surviving rows are the same `Max`, `Min`, `Step`, `Value`, and `Core Name Type` family
4. `settings-section__backend`
   - `remainingValueElementCount: 21`
   - `remainingValueRowCount: 12`
   - older backend dropdown/switch activator lanes remain closed; the surviving rows are now ordinary text-value rows such as `Auto Backup Freq`, `Auto Backup Keep Last N`, and `Default Terminal Shell`
5. `settings-section__gui`
   - `remainingValueElementCount: 15`
   - `remainingValueRowCount: 11`
   - the remaining visible DOM is mostly color-input wrapper/icon chrome plus already-closed switch rows, so this is not the preferred next lane by inertia
6. `settings-section__colorPickerParamCodeObjDefault`
   - `remainingValueElementCount: 15`
   - `remainingValueRowCount: 6`
   - dominant surviving rows are `Color Choices`, `Core Name Type`, `Default Val`, `Type Annotation`, and `Value`
7. `settings-section__dropdownParamCodeObjDefault`
   - `remainingValueElementCount: 15`
   - `remainingValueRowCount: 6`
   - dominant surviving rows are `Choices`, `Core Name Type`, `Default Val`, `Type Annotation`, and `Value`
8. `settings-section__textParamCodeObjDefault`
   - `remainingValueElementCount: 13`
   - `remainingValueRowCount: 5`
   - dominant surviving rows are `Core Name Type`, `UI Type`, `Default Val`, `Type Annotation`, and `Value`
9. `settings-section__switchParamCodeObjDefault`
   - `remainingValueElementCount: 12`
   - `remainingValueRowCount: 5`
   - dominant surviving rows are `Value`, `Core Name Type`, `Default Val`, and `Type Annotation`
10. `settings-section__passwordParamCodeObjDefault`
    - `remainingValueElementCount: 11`
    - `remainingValueRowCount: 6`
    - dominant surviving rows are `Core Name Type`, `Default Val`, `Type Annotation`, and `Value`

Broader repeated survivor shape:

- `settings-section__rotaryParamCodeObjDefault`
- `settings-section__sliderParamCodeObjDefault`
- `settings-section__colorPickerParamCodeObjDefault`
- `settings-section__dropdownParamCodeObjDefault`
- `settings-section__textParamCodeObjDefault`
- `settings-section__switchParamCodeObjDefault`
- `settings-section__passwordParamCodeObjDefault`
- `settings-section__codeParamCodeObjDefault`
- `settings-section__textAreaParamCodeObjDefault`

That shared param-codeobj family now accounts for `134` visible remaining value elements across `54` rows on the current live surface. The dominant surviving row kinds are still text-like:

- `div.section-value.peer/textinput`
- `div.cm-line`
- `span.section-value`
- for a smaller subset, lightweight-switch rows still leave one visible `div.section-value` shell

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `6962`
- Inputs: `4`
- Textareas: `1`
- Buttons: `52`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `95.62ms`
- RAF p50: `83.3ms`
- RAF p95: `183.4ms`
- RAF max: `250ms`
- RAF frames over `16.7ms`: `177`
- RAF frames over `33.3ms`: `155`
- Long-task count: `128`
- Long-task total: `15281ms`
- Long-task max: `241ms`

## Comparison Notes

- Versus the immediately prior shared-family dense rerun at `perf/reports/frontend/2026-04-19_settings-all-settings-shared-size-style-tag-resting-text-cluster-rerun.md`:
  - `documentNodeCount` stayed flat at `6962`
  - the main new evidence is the updated whole-scene ranking rather than another global-count win
- Versus the earlier remaining-value ranking at `perf/reports/frontend/2026-04-19_settings-all-settings-remaining-value-surface-ranking.md`:
  - the old shared `Size` / `Height` / `Width` / `Style Color` / `Tag Color` family is no longer the dominant survivor
  - the ranking now splits cleanly into:
    - one single-section outlier: `settings-section__languageServer`
    - one broader repeated shared family: param-codeobj text/value rows spread across multiple `*ParamCodeObjDefault` sections
- Versus the best clean dense checkpoint (`7670 / 2 / 39`):
  - document-level counts remain lower on this runtime family
  - `input` / `button` totals still carry workspace-chrome noise, so this report is a decision aid, not a new clean benchmark replacement

## Interpretation

- This iteration followed the handoff guardrail and did not continue the recent closed section-local family by inertia.
- The refreshed whole-scene ranking shows that the next broad value-surface frontier is no longer the earlier shared size/style/tag family.
- `settings-section__languageServer` remains the only single-section outlier worth keeping as a fallback.
- The broader next product lane should prefer a shared param-codeobj resting-text/value primitive or ownership seam, with:
  - canonical target section: `settings-section__rotaryParamCodeObjDefault`
  - first sibling proof: `settings-section__sliderParamCodeObjDefault`
  - likely follow-on proof set: `dropdownParamCodeObjDefault`, `colorPickerParamCodeObjDefault`, `textParamCodeObjDefault`, `switchParamCodeObjDefault`, `passwordParamCodeObjDefault`, `codeParamCodeObjDefault`, and `textAreaParamCodeObjDefault`
- Only fall back to the `languageServer` outlier if that broader shared primitive is not viable on the current ownership boundary.
- The main branch goal remains open:
  - `All Settings` motion is still far above the `33.3ms` budget
  - this rerank is for product-slice selection, not a success claim

## Verification

- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts`
- Playwright focused ranking probe + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-008/worktree-ai.log -- tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe produced the ranking recorded above
  - the dense probe emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
