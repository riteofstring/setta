# Settings All Settings Untouched Resting-Text Trio Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior dense reference: `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-param-label-generalization-rerun.md`
Best clean dense checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-gen-python-resting-text-cluster-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-untouched-resting-text-trio.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Move the top untouched text-value trio from the fresh whole-scene ranking onto the retained-canvas resting-text path without reopening actual label-text ownership on those sections.

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
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-005/worktree-ai.log -- tests/e2e/settings/settings-all-settings-untouched-resting-text-trio.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Focused Cluster Summary

Canonical target section and row:

- section: `settings-section__stateMachineStartSectionDefault`
- row: `Label`
- target input id: `settings-section__stateMachineStartSectionDefault-settings-codeobj__stateMachineStartSectionDefault__stateMachineStartSectionDefault__label-ParamInput`
- target editor id: `CodeMirror-settings-section__stateMachineStartSectionDefault-settings-codeobj__stateMachineStartSectionDefault__stateMachineStartSectionDefault__label`

Sibling sections landed in the same slice:

- `settings-section__spreadsheetSectionDefault`
- `settings-section__taskBoardSectionDefault`

Post-change focused inventory:

- `settings-section__spreadsheetSectionDefault`
  - `uniqueParamInputCount: 7`
  - `canvasOwnedRestingTextCount: 8`
  - `lightweightRestingTextCount: 7`
  - `underlineCount: 7`
  - `liveInputCount: 0`
- `settings-section__taskBoardSectionDefault`
  - `uniqueParamInputCount: 7`
  - `canvasOwnedRestingTextCount: 8`
  - `lightweightRestingTextCount: 7`
  - `underlineCount: 7`
  - `liveInputCount: 0`
- `settings-section__stateMachineStartSectionDefault`
  - `uniqueParamInputCount: 7`
  - `canvasOwnedRestingTextCount: 8`
  - `lightweightRestingTextCount: 7`
  - `underlineCount: 7`
  - `liveInputCount: 0`

Interpretation:

- each target section now has every visible `*-ParamInput` root on the lightweight retained-text path
- the extra `canvasOwnedRestingTextCount` root on each section is expected retained text already present elsewhere in the section, not a surviving live editor
- the canonical `Label` input root is `opacity: 0`, carries `data-canvas-owned-resting-text-lightweight="true"`, still paints distinct retained-canvas text pixels, and still surfaces the inline editor on first focus

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `7093`
- Inputs: `4`
- Textareas: `1`
- Buttons: `53`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `94.97ms`
- RAF p50: `83.4ms`
- RAF p95: `183.3ms`
- RAF max: `233.4ms`
- RAF frames over `16.7ms`: `175`
- RAF frames over `33.3ms`: `157`
- Long-task count: `132`
- Long-task total: `15184ms`
- Long-task max: `221ms`

## Comparison Vs. Prior Dense Reference

- Document nodes: down `62` (`7155` -> `7093`)
- Inputs: unchanged (`4`)
- Textareas: unchanged (`1`)
- Buttons: unchanged (`53`)
- RAF mean: better by `1.39ms` (`96.36ms` -> `94.97ms`)
- RAF p95: unchanged (`183.3ms`)
- Long-task total: better by `301ms` (`15485ms` -> `15184ms`)

## Comparison Vs. Best Clean Dense Checkpoint

- Document nodes: down `577` (`7670` -> `7093`)
- Inputs: up `2` (`2` -> `4`)
- Textareas: up `1` (`0` -> `1`)
- Buttons: up `14` (`39` -> `53`)
- RAF mean: better by `7.63ms` (`102.6ms` -> `94.97ms`)
- RAF p95: better by `0.1ms` (`183.4ms` -> `183.3ms`)
- Long-task total: better by `1326ms` (`16510ms` -> `15184ms`)

## Interpretation

- This slice followed the fresh whole-scene ranking instead of reopening a closed micro-lane:
  - the top untouched value trio (`spreadsheet`, `taskBoard`, `stateMachineStart`) all moved onto the existing retained resting-text + lightweight underline path
  - actual label text on those sections intentionally stayed DOM-visible, so this remained a value-surface reduction slice rather than another label-ownership follow-up
- The dense mounted surface moved again:
  - `documentNodeCount` dropped from `7155` to `7093`
  - `raf.meanMs` and `longTasks.totalMs` also improved on the same runtime family
- This is still not a clean global interactive-core benchmark:
  - document-level `input` / `button` totals remain at the same noisy `4 / 53` plateau as the prior smoke rerun
  - the authoritative proof for this slice is the focused trio summary plus the dense `documentNodeCount` drop
- The main branch goal remains open:
  - `All Settings` motion is still far above the `33.3ms` target budget
  - the next default pass still needs a fresh whole-scene ranking of the remaining mounted row/body/value surface rather than another tidy local follow-up

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-untouched-resting-text-trio.spec.ts`
- Playwright focused probe + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-005/worktree-ai.log -- tests/e2e/settings/settings-all-settings-untouched-resting-text-trio.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe proved the trio counts recorded above and preserved first-focus inline editing on the canonical `Label` row
  - the dense probe emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
