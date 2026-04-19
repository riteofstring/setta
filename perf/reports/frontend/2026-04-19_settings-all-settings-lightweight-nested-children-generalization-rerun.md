# Settings All Settings Lightweight Nested Children Generalization Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior product slice: `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-color-input-value-shell-rerun.md`
Row-shell hotspot reference: `perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-lightweight-nested-children-generalization.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Reduce real `ParamContainer` row-structure DOM on the current canvas-owned settings boundary by generalizing the existing lightweight nested-children path beyond the old `sectionSizingPolicy` / `languageServer` canaries, while intentionally keeping the shell-canary sections on their legacy nested wrapper path.

This slice is motivated by the existing row-shell benchmark: the largest remaining pan/zoom cliff is the real nested param-row structure, not widget logic or `ParamInput` plumbing.

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
  - each probe used a fresh one-shot bootstrap token via `./scripts/run-playwright-against-runtime.sh`

## Implementation Shape

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now treats every canvas-owned resting-text settings section except the shell canaries as lightweight nested-children owners.
  - effective rule: `isCanvasOwnedSectionRestingTextSection(sectionId) && !isCanvasOwnedSectionShell(sectionId)`
- The slice stays on the existing retained-canvas primitive:
  - `frontend/src/components/Params/ParamContainer.tsx` already removes the extra `div.section-args-nested...` wrapper whenever `isCanvasOwnedSectionLightweightNestedChildren(...)` returns `true`
  - `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` already measures and paints lightweight nested-guide boxes for `article[data-canvas-owned-nested-guide-lightweight="true"]`
- Focused proof was added in:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `frontend/src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-lightweight-nested-children-generalization.spec.ts`

## Focused Runtime Proof

Canonical target section: `settings-section__codeSectionDefault`

Sibling proof sections checked in the same bounded slice:

- `settings-section__stateMachineGateSectionDefault`
- `settings-section__browserSectionDefault`

Negative control kept on the legacy wrapper path:

- `settings-section__callableSectionDefault`

Focused live worktree proof:

- `settings-section__codeSectionDefault`
  - `rowCount: 16`
  - `legacyNestedWrapperCount: 0`
  - `lightweightGuideRootCount: 2`
- `settings-section__stateMachineGateSectionDefault`
  - `rowCount: 14`
  - `legacyNestedWrapperCount: 0`
  - `lightweightGuideRootCount: 2`
- `settings-section__browserSectionDefault`
  - `rowCount: 15`
  - `legacyNestedWrapperCount: 0`
  - `lightweightGuideRootCount: 1`
- `settings-section__callableSectionDefault`
  - `rowCount: 16`
  - `legacyNestedWrapperCount: 1`
  - `lightweightGuideRootCount: 0`
- Whole-scene lightweight-guide ownership after the slice now covers `25` settings sections:
  - `browserSectionDefault`
  - `chartSectionDefault`
  - `chatSectionDefault`
  - `chatWindowing`
  - `codeSectionDefault`
  - `drawSectionDefault`
  - `genPythonCodeSectionDefault`
  - `genPythonMetadataSectionDefault`
  - `groupSectionDefault`
  - `iFrameSectionDefault`
  - `imageSectionDefault`
  - `languageServer`
  - `listRootSectionDefault`
  - `metaControlSectionDefault`
  - `pluginSectionDefault`
  - `promptSectionDefault`
  - `sectionSizingPolicy`
  - `socialSectionDefault`
  - `spreadsheetSectionDefault`
  - `stateMachineEndSectionDefault`
  - `stateMachineGateSectionDefault`
  - `stateMachineStartSectionDefault`
  - `taskBoardSectionDefault`
  - `terminalSectionDefault`
  - `textBlockSectionDefault`

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `6679`
- Inputs: `4`
- Textareas: `1`
- Buttons: `52`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `92.64ms`
- RAF p50: `83.3ms`
- RAF p95: `183.2ms`
- RAF max: `216.7ms`
- RAF frames over `16.7ms`: `176`
- RAF frames over `33.3ms`: `157`
- Long-task count: `127`
- Long-task total: `14696ms`
- Long-task max: `231ms`

## Comparison Notes

Versus the prior color-input row-body/value-shell rerun at `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-color-input-value-shell-rerun.md`:

- `documentNodeCount`: `6709 -> 6679`
- `raf.meanMs`: `94.6 -> 92.64`
- `raf.p95Ms`: `183.3 -> 183.2`
- `longTasks.totalMs`: `15114 -> 14696`
- `inputCount`: `4 -> 4`
- `buttonCount`: `53 -> 52`

Versus the durable `go-rewrite` baseline:

- `documentNodeCount`: `9553 -> 6679`
- `inputCount`: `92 -> 4`
- `buttonCount`: `521 -> 52`
- `raf.meanMs`: `204.93 -> 92.64`
- `longTasks.totalMs`: `36337 -> 14696`

## Interpretation

- This is a real row-structure reduction slice, not another value-leaf cleanup.
- The existing lightweight nested-children primitive was already sufficient to remove legacy nested wrapper DOM across a broad retained-text section family with no new renderer branch.
- The focused proof shows the broader boundary landed where intended and that the shell canary stayed out of scope on purpose.
- The dense rerun moved in the right direction, but the branch goal remains open:
  - `All Settings` pan/zoom is still far above the `33.3ms` budget
  - the next pass should continue attacking real row-body/container structure or a stronger inactive-row overlay/body primitive rather than reopening closed value-leaf lanes

## Verification

- Unit coverage:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx`
- Lint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx tests/e2e/settings/settings-all-settings-lightweight-nested-children-generalization.spec.ts`
- Focused Playwright probe:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-002/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-nested-children-generalization.spec.ts --reporter=line --workers=1`
- Dense baseline probe:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-002/worktree-ai.log -- tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe produced the ownership summary recorded above
  - the dense probe emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
