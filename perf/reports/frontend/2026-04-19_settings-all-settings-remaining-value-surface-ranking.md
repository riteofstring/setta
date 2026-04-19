# Settings All Settings Remaining Value Surface Ranking

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Best clean dense checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-gen-python-resting-text-cluster-rerun.md`
Prior noisy dense reference: `perf/reports/frontend/2026-04-19_settings-all-settings-untouched-resting-text-trio-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Refresh the whole-scene `settings` -> `All Settings` ranking for the remaining non-lightweight value surface so the next product slice comes from current dense-scene evidence instead of another section-local resting-text hop.

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
  - probes used fresh one-shot bootstrap tokens via `./scripts/run-playwright-against-runtime.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-006/worktree-ai.log -- tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Whole-Scene Ranking Summary

Focused inventory totals:

- mounted settings sections: `46`
- total param rows across mounted sections: `759`
- rows with remaining non-lightweight value DOM: `273`
- visible remaining value-subtree elements across those rows: `570`

Top remaining sections by visible non-lightweight value-element count:

1. `settings-section__languageServer`
   - `remainingValueElementCount: 48`
   - `remainingValueRowCount: 7`
   - `lightweightRestingTextRowCount: 0`
   - dominant surviving rows are the nested `Basedpyright` / `Analysis` / `Diagnostic Severity Overrides` text-value chain
2. `settings-section__stateMachineEndSectionDefault`
   - `remainingValueElementCount: 34`
   - `remainingValueRowCount: 11`
   - `lightweightSwitchRowCount: 4`
   - dominant surviving rows are shared text-value rows such as `Size`, `Height`, `Width`, `Style Color`, and `Tag Color`
3. `settings-section__listRootSectionDefault`
   - `remainingValueElementCount: 30`
   - `remainingValueRowCount: 11`
   - `lightweightSwitchRowCount: 4`
   - dominant surviving rows are `Size`, `Height`, `Width`, `Style Color`, `Tag Color`, and `Default Child Section Type`
4. `settings-section__chartSectionDefault`
   - `remainingValueElementCount: 30`
   - `remainingValueRowCount: 10`
   - `lightweightSwitchRowCount: 4`
   - dominant surviving rows are `Size`, `Height`, `Width`, `Style Color`, and `Tag Color`
5. `settings-section__groupSectionDefault`
   - `remainingValueElementCount: 29`
   - `remainingValueRowCount: 12`
   - `lightweightSwitchRowCount: 6`
   - dominant surviving rows are `Size`, `Height`, `Width`, `Style Color`, `Tag Color`, and `Default Child Section Type`

Other top-ten sections continue the same shared survivor shape:

- `settings-section__terminalSectionDefault`
- `settings-section__imageSectionDefault`
- `settings-section__socialSectionDefault`
- `settings-section__metaControlSectionDefault`
- `settings-section__iFrameSectionDefault`
- `settings-section__rotaryParamCodeObjDefault`
- `settings-section__sliderParamCodeObjDefault`

Common observed remaining row kinds:

- `div.section-value.peer/textinput`
- `div.cm-line`
- `span.section-value`

Interpretation:

- the ranking no longer justifies another random untouched-text hop
- `settings-section__languageServer` is the only clear section-specific outlier from this fresh dense-scene read
- most of the remaining mounted value surface is now spread across a broader repeated text-value family shared by many sections:
  - `Size`
  - `Height`
  - `Width`
  - `Style Color`
  - `Tag Color`
  - in some sections, `Default Child Section Type`
- the next product pass should prefer a shared resting-body/value primitive or ownership seam that can remove that repeated family across multiple sections at once, with `languageServer` only worth choosing if the broader primitive is not viable

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `7088`
- Inputs: `4`
- Textareas: `1`
- Buttons: `52`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `94.69ms`
- RAF p50: `83.4ms`
- RAF p95: `166.7ms`
- RAF max: `249.9ms`
- RAF frames over `16.7ms`: `174`
- RAF frames over `33.3ms`: `153`
- Long-task count: `128`
- Long-task total: `15112ms`
- Long-task max: `229ms`

## Comparison Notes

- Versus the prior noisy untouched-trio rerun (`7093 / 4 / 53`):
  - this rerun is effectively flat and should be treated as runtime smoke, not as a new product win
- Versus the best clean checkpoint (`7670 / 2 / 39` with `raf.meanMs 102.6`):
  - document-level counts are still lower on this runtime family
  - `input` / `button` totals remain noisy because non-target workspace chrome is still present
  - the authoritative output of this iteration is the new whole-scene ranking, not the small global-count delta

## Interpretation

- This iteration deliberately followed the handoff guardrail instead of continuing the recent resting-text commit pattern:
  - no product lane was chosen before a fresh whole-scene ranking existed
  - the new evidence shows the remaining dense value cost is now partly distributed rather than dominated by one untouched text cluster
- The next bounded product slice should come from one of these two options:
  - a broader shared resting-text/value primitive covering the repeated `Size` / `Style Color` / `Tag Color` family across multiple sections
  - the isolated `languageServer` outlier only if the broader shared primitive is not viable on the current ownership boundary
- The main branch goal remains open:
  - `All Settings` motion is still far above the `33.3ms` budget
  - this report is a decision aid for the next product slice, not a success claim

## Verification

- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts`
- Playwright focused ranking probe + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-006/worktree-ai.log -- tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe produced the ranking recorded above
  - the dense probe emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
