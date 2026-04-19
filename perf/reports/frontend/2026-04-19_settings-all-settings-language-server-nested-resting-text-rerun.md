# Settings All Settings Language Server Nested Resting Text Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior product slice: `perf/reports/frontend/2026-04-19_settings-all-settings-resting-text-switch-value-shell-boundary-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-language-server-resting-text.spec.ts`
Whole-scene ranking probe: `frontend/tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Move the `settings-section__languageServer` nested diagnostic severity chain onto the existing canvas-owned resting-text path so the section stops carrying duplicate nested text-value DOM through ancestor wrappers, while preserving first-click inline editing.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - focused probe: Playwright Chromium, headless Linux
  - whole-scene ranking probe: Playwright Chromium, headless Linux
  - dense probe: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication:
  - each probe used a fresh one-shot bootstrap token via `./scripts/run-playwright-against-runtime.sh`

## Implementation Shape

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now treats `settings-section__languageServer` as:
  - canvas-owned resting text
  - canvas-owned resting param-label text
  - lightweight nested children
  - lightweight text underline
- The product slice stayed on the current retained-canvas paths:
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx` already routes section-owned text params through the generic resting-text path
  - `frontend/src/components/Params/ParamContainer.tsx` already removes the extra nested-child wrapper when a section is marked for lightweight nested children
- Focused proof was added in:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-language-server-resting-text.spec.ts`

## Focused Runtime Proof

Canonical target section: `settings-section__languageServer`

Focused leaf row:

- `settings-codeobj__languageServer__languageServer__basedpyright__analysis__diagnosticSeverityOverrides__reportUnknownVariableType`

Focused live worktree proof:

- at rest, the section exposes:
  - `lightweightRestingTextCount: 4`
  - `underlineCount: 4`
  - `nestedGuideLightweightCount: 3`
  - `nestedGuideWrapperDivCount: 0`
  - `liveEditorCount: 0`
- first-click activation on the focused leaf row mounted exactly one live CodeMirror editor
- after activation, `remainingLightweightRestingTextCount` dropped from `4` to `3`
- the focused row rect stayed stable within `<= 2px` on `x`, `y`, `width`, and `height`

## Whole-Scene Ranking Summary

Focused inventory totals after the language-server slice:

- mounted settings sections: `46`
- total param rows across mounted sections: `759`
- rows with remaining non-lightweight value DOM: `21`
- visible remaining value-subtree elements across those rows: `39`

Top remaining sections by visible non-lightweight value-element count:

1. `settings-section__backend`
   - `remainingValueElementCount: 21`
   - `remainingValueRowCount: 12`
   - dominant survivors are plain text-value rows such as `Auto Backup Freq`, `Auto Backup Keep Last N`, and `Default Terminal Shell`
2. `settings-section__gui`
   - `remainingValueElementCount: 8`
   - `remainingValueRowCount: 4`
   - survivors are color-input wrapper/icon chrome
3. `settings-section__nestedParamCodeObjDefault`
   - `remainingValueElementCount: 6`
   - `remainingValueRowCount: 3`
   - survivors are plain text-value rows plus one lightweight switch value shell

`settings-section__languageServer` no longer appears in the top whole-scene ranking after this slice.

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `6713`
- Inputs: `4`
- Textareas: `1`
- Buttons: `52`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `94.13ms`
- RAF p50: `83.4ms`
- RAF p95: `166.8ms`
- RAF max: `233.3ms`
- RAF frames over `16.7ms`: `174`
- RAF frames over `33.3ms`: `154`
- Long-task count: `125`
- Long-task total: `14856ms`
- Long-task max: `231ms`

## Comparison Notes

Versus the prior retained-boundary rerun at `perf/reports/frontend/2026-04-19_settings-all-settings-resting-text-switch-value-shell-boundary-rerun.md`:

- `totalRemainingValueRowCount`: `28 -> 21`
- `totalRemainingValueElementCount`: `87 -> 39`
- `documentNodeCount`: `6728 -> 6713`
- `raf.meanMs`: `94.6 -> 94.13`
- `raf.p95Ms`: `166.8 -> 166.8`
- `longTasks.totalMs`: `15117 -> 14856`

Versus the durable `go-rewrite` baseline:

- `documentNodeCount`: `9553 -> 6713`
- `inputCount`: `92 -> 4`
- `buttonCount`: `521 -> 52`
- `raf.meanMs`: `204.93 -> 94.13`
- `longTasks.totalMs`: `36337 -> 14856`

## Interpretation

- This closes the `languageServer` fallback lane as product code, not another ranking-only pass.
- The section-local nested diagnostic chain was a real remaining-value survivor, and the existing retained-text plus lightweight-nested-child seams were sufficient to remove it without a new renderer branch.
- The next default product frontier is now `settings-section__backend` plain text-value rows.
- `settings-section__gui` remains a visible local survivor, but its remaining surface is a different color-input wrapper/icon primitive and should stay secondary until the backend text-value lane is evaluated.
- The branch goal remains open:
  - dense `All Settings` motion is still far above the `33.3ms` budget
  - this rerun is a measured blocker-reduction slice, not a success claim

## Verification

- Unit coverage:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Focused language-server Playwright probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-013/worktree-ai.log -- tests/e2e/settings/settings-all-settings-language-server-resting-text.spec.ts --reporter=line --workers=1`
- Whole-scene ranking + dense baseline probes:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-013/worktree-ai.log -- tests/e2e/settings/settings-all-settings-remaining-value-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe produced the language-server state recorded above
  - the whole-scene ranking and dense probes emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
