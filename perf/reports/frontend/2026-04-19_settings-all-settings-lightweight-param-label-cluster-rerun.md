# Settings All Settings Lightweight Param Label Cluster Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Best clean dense checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-gen-python-resting-text-cluster-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-lightweight-param-label-cluster.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Land one bounded shared-primitive slice by collapsing the legacy `.section-key` leading-content wrapper on the already measured canvas-owned settings sections, so the param label root itself occupies the key column on the retained-canvas path instead of paying an extra DOM wrapper per owned row.

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
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-003/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-param-label-cluster.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Focused Cluster Summary

Canonical target section and row:

- section: `settings-section__shortcuts`
- row: `Advanced Search Shortcut`
- target input: `#settings-section__shortcuts-settings-codeobj__shortcuts__shortcuts__advancedSearchShortcut-ParamInput`

Post-change cluster summary:

- `settings-section__shortcuts`
  - `rowCount: 62`
  - `labelCount: 62`
  - `legacyLeadingContentWrapperCount: 0`
  - `lightweightParamLabelCount: 62`
- `settings-section__gui`
  - `rowCount: 22`
  - `labelCount: 22`
  - `legacyLeadingContentWrapperCount: 0`
  - `lightweightParamLabelCount: 22`
- `settings-section__chatSectionDefault`
  - `rowCount: 24`
  - `labelCount: 21`
  - `legacyLeadingContentWrapperCount: 0`
  - `lightweightParamLabelCount: 21`

The focused probe also confirmed that the canonical hidden label root still acts as the interaction handoff target:

- the retained canvas paints visible label pixels for `Advanced Search Shortcut`
- the hidden `.section-key` root carries `data-canvas-owned-param-label-lightweight="true"`
- forcing a pointer click on that label root surfaces the inline editor in the same section with no blank or detached jump

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `7350`
- Inputs: `4`
- Textareas: `1`
- Buttons: `53`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `99.07ms`
- RAF p50: `83.4ms`
- RAF p95: `216.7ms`
- RAF max: `233.4ms`
- RAF frames over `16.7ms`: `178`
- RAF frames over `33.3ms`: `155`
- Long-task count: `128`
- Long-task total: `15896ms`
- Long-task max: `242ms`

## Comparison Vs. Best Clean Dense Checkpoint

- Document nodes: down `320` (`7670` -> `7350`)
- Inputs: up `2` (`2` -> `4`)
- Textareas: up `1` (`0` -> `1`)
- Buttons: up `14` (`39` -> `53`)
- RAF mean: better by `3.53ms` (`102.6ms` -> `99.07ms`)
- RAF p95: worse by `33.3ms` (`183.4ms` -> `216.7ms`)
- Long-task total: better by `614ms` (`16510ms` -> `15896ms`)

## Interpretation

- This is a real shared row-shell/value primitive move, not another section-local text-family harvest:
  - one repeated leading-content wrapper disappeared across the already measured retained-canvas sections instead of only one untouched family
  - the top post-change cluster now shows `0` legacy leading wrappers across the checked `shortcuts`, `gui`, and `chat` sections
- The dense surface moved again in the intended direction:
  - `documentNodeCount` dropped to `7350`, which is materially below the prior best clean `7670`
- The current runtime still carries non-target workspace chrome noise:
  - document-level `input` / `button` totals remain worse than the earlier best clean checkpoint, so do not treat this report as a new clean global interactive-core benchmark
  - the authoritative proof for this slice is the focused cluster summary plus the dense `documentNodeCount` reduction
- The main branch goal is still open:
  - `All Settings` motion remains far above the `33.3ms` target budget
  - the remaining default frontier is still the dense resting row/body DOM that moves under viewport transforms, not another section-local ownership pass

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx src/components/Params/ParamContainer.lightweightLeadingContent.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamContainer.tsx src/components/Params/ParamContainer.lightweightLeadingContent.test.tsx src/components/Params/ParamItems/ParamTextLabel.tsx src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-lightweight-param-label-cluster.spec.ts`
- Playwright focused probe + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.6AqE8d/loop-001/run-003/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-param-label-cluster.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe proved the cluster counts recorded above
  - the dense probe emitted the metrics recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
