# Settings All Settings Lightweight Param Label Generalization Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Best clean dense checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-gen-python-resting-text-cluster-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-lightweight-param-label-generalization.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Generalize the lightweight param-label root from the old measured-section allowlist to all `settings` rows, while keeping actual canvas-owned label text restricted to the existing owned sections, so untouched settings sections stop paying the extra leading label wrapper per row.

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
  - focused probe: fresh one-shot bootstrap token via `./scripts/run-playwright-against-runtime.sh`
  - dense probe: fresh one-shot bootstrap token via `./scripts/run-playwright-against-runtime.sh`
- Command:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-004/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-param-label-generalization.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Focused Cluster Summary

Canonical target section and row:

- section: `settings-section__stateMachineStartSectionDefault`
- row: `Label`
- target row id: `ParamContainer-settings-section__stateMachineStartSectionDefault-settings-codeobj__stateMachineStartSectionDefault__stateMachineStartSectionDefault__label`
- target editor id: `CodeMirror-settings-section__stateMachineStartSectionDefault-settings-codeobj__stateMachineStartSectionDefault__stateMachineStartSectionDefault__label`

Post-change cluster summary:

- `settings-section__spreadsheetSectionDefault`
  - `rowCount: 15`
  - `labelCount: 14`
  - `legacyLeadingContentWrapperCount: 0`
  - `lightweightParamLabelCount: 14`
- `settings-section__taskBoardSectionDefault`
  - `rowCount: 12`
  - `labelCount: 11`
  - `legacyLeadingContentWrapperCount: 0`
  - `lightweightParamLabelCount: 11`
- `settings-section__stateMachineStartSectionDefault`
  - `rowCount: 12`
  - `labelCount: 11`
  - `legacyLeadingContentWrapperCount: 0`
  - `lightweightParamLabelCount: 11`

The focused probe also confirmed that the canonical untouched label root still acts as the interaction handoff target:

- the `Label` root carries `data-canvas-owned-param-label-lightweight="true"`
- the label remains visibly rendered by DOM on this non-resting-text-owned section (`opacity: 1`)
- clicking the label root surfaces the inline CodeMirror editor in the same row with no blank or detached jump

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `7155`
- Inputs: `4`
- Textareas: `1`
- Buttons: `53`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `96.36ms`
- RAF p50: `83.4ms`
- RAF p95: `183.3ms`
- RAF max: `250ms`
- RAF frames over `16.7ms`: `179`
- RAF frames over `33.3ms`: `155`
- Long-task count: `131`
- Long-task total: `15485ms`
- Long-task max: `248ms`

## Comparison Vs. Best Clean Dense Checkpoint

- Document nodes: down `515` (`7670` -> `7155`)
- Inputs: up `2` (`2` -> `4`)
- Textareas: up `1` (`0` -> `1`)
- Buttons: up `14` (`39` -> `53`)
- RAF mean: better by `6.24ms` (`102.6ms` -> `96.36ms`)
- RAF p95: better by `0.1ms` (`183.4ms` -> `183.3ms`)
- Long-task total: better by `1025ms` (`16510` -> `15485`)

## Interpretation

- This is a broader shared row-shell reduction than the previous owned-section label pass:
  - the leading label wrapper is now gone across untouched settings sections such as `spreadsheetSectionDefault`, `taskBoardSectionDefault`, and `stateMachineStartSectionDefault`
  - actual canvas-owned label text did not widen with this slice; non-owned settings labels remain DOM-visible while only the extra wrapper disappears
- The dense surface moved again in the intended direction:
  - `documentNodeCount` dropped to `7155`, materially below the earlier best clean `7670` checkpoint
  - `raf.meanMs` and `longTasks.totalMs` also improved on this runtime
- The current runtime still carries non-target workspace chrome noise:
  - document-level `input` / `button` totals remain above the best clean checkpoint, so do not treat this report as a new clean global interactive-core benchmark
  - the authoritative proof for this slice is the focused untouched-section cluster summary plus the dense `documentNodeCount` reduction
- The main branch goal remains open:
  - `All Settings` motion is still far above the `33.3ms` target budget
  - the next default frontier remains broader dense resting row/body/value DOM reduction, not another label-wrapper follow-up

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamContainer.lightweightLeadingContent.test.tsx src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamContainer.lightweightLeadingContent.test.tsx tests/e2e/settings/settings-all-settings-lightweight-param-label-generalization.spec.ts`
- Playwright focused probe + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-004/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-param-label-generalization.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe proved the untouched-section label counts recorded above
  - the dense probe emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
