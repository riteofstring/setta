# Settings All Settings Lightweight Nested Leaf Row-Body Flattening Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior row-body checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-resize-handle-rest-opacity-rerun.md`
Prior dense checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-resize-handle-rest-opacity-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-resting-text.spec.ts`
Row-body probe: `frontend/tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Flatten neutral lightweight nested leaf-row wrappers inside the shared canvas-owned nested-child lane so `All Settings` stops paying for repeated nested `article` boxes after the visible text, underline, switch, dropdown, color-input, label, nested-guide, and resize-handle primitives are already lightweight.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - focused probe: Playwright Chromium, headless Linux
  - row-body probe: Playwright Chromium, headless Linux
  - dense probe: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication:
  - each probe used a fresh one-shot bootstrap token via `./scripts/run-playwright-against-runtime.sh`

## Implementation

- `frontend/src/components/Params/GetParamSwitch.tsx` now threads a lightweight nested leaf-row flag only for rows rendered inside the shared lightweight nested-children path.
- `frontend/src/components/Params/ParamSwitch.tsx` now enables that flattening only for neutral leaf rows:
  - no nested children
  - not kwarg-editable
  - not in a drag-enabled list
  - no selected/search/error chrome
- `frontend/src/components/Params/ParamContainer.tsx` now marks those neutral rows with `data-canvas-owned-lightweight-row-body="true"` and renders the row wrapper as `display: contents`, keeping the existing DOM ordering and interaction children while dropping the extra nested box from the moving surface.
- `frontend/src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx` now covers the new lightweight row-body marker.

## Focused Runtime Proof

Canonical target section and row:

- target section: `settings-section__sectionSizingPolicy`
- target row family: `byType` / `metaControlByType`
- canonical editor handoff row: `settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType__Browser__maxHeight`

Focused proof on the live worktree surface:

- the existing `sectionSizingPolicy` resting-text probe still focused the canonical `Max Height` row inline on the first interaction
- the row-body ranking now shows only the parent nested-group wrappers left in `settings-section__sectionSizingPolicy`
  - `remainingRowCount: 2`
  - `remainingVisibleElementCount: 40`
  - `remainingVisibleChromeElementCount: 40`
  - `byType` row: `25` remaining chrome elements, with only `article.section-args-nested.section-lg-value.group/arg-group.section-min-rows` left
  - `metaControlByType` row: `15` remaining chrome elements, with only `article.section-args-nested.section-lg-value.group/arg-group.section-min-rows` left

Interpretation from the focused proof:

- the lightweight nested leaf-row wrappers are gone from the live `sectionSizingPolicy` subtree
- first-click inline editing on the canonical `Max Height` row still works after the flattening
- the remaining `sectionSizingPolicy` cost is now the parent nested-group wrapper itself rather than its repeated lightweight leaf children

## Row-Body Surface Summary

Fresh whole-scene rerank after the product slice:

- `mountedSectionCount: 46`
- `totalRowCount: 759`
- `totalRemainingRowCount: 10`
- `totalRemainingVisibleElementCount: 61`
- `totalRemainingVisibleChromeElementCount: 52`
- `totalRemainingVisibleLabelElementCount: 3`
- `totalRemainingVisibleValueElementCount: 6`
- strongest common remaining kinds are now:
  - `article.section-args-nested.section-lg-value.group/arg-group.section-min-rows` (`4`)
  - `div.section-args-nested.section-key-value` (`3`)
  - `article.section-key-value.group/arg-group.section-min-rows` (`3`)
  - `p.section-key` (`3`)
  - `span.section-value` (`2`)

Compared with the prior row-body checkpoint:

- `totalRemainingRowCount: 77 -> 10`
- `totalRemainingVisibleElementCount: 457 -> 61`
- `totalRemainingVisibleChromeElementCount: 448 -> 52`
- `totalRemainingVisibleLabelElementCount: 3 -> 3`
- `totalRemainingVisibleValueElementCount: 6 -> 6`
- repeated nested leaf `article.section-key-value.group/arg-group.section-min-rows`: `74 -> 3`
- `settings-section__sectionSizingPolicy.remainingRowCount: 43 -> 2`
- `settings-section__sectionSizingPolicy.remainingVisibleElementCount: 370 -> 40`

Interpretation from the rerank:

- this is a real row-body/layout reduction rather than another text/value cleanup
- the shared lightweight nested-child lane now removes the repeated leaf wrapper boxes instead of only hiding their internal content
- the remaining row-body frontier is now small and specific:
  - parent nested-group wrappers in `sectionSizingPolicy` and `languageServer`
  - the shared `Size` wrappers on callable/dict/GlobalVariables
  - the still-live `nestedParamCodeObjDefault` label/value rows

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `5653`
- Inputs: `4`
- Textareas: `1`
- Buttons: `52`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `69.46ms`
- RAF p50: `66.7ms`
- RAF p95: `116.7ms`
- RAF max: `166.8ms`
- RAF frames over `16.7ms`: `179`
- RAF frames over `33.3ms`: `160`
- Long-task count: `128`
- Long-task total: `10364ms`
- Long-task max: `158ms`

## Comparison Vs. Prior Dense Checkpoint

Compared with `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-resize-handle-rest-opacity-rerun.md`:

- `documentNodeCount: 5658 -> 5653`
- `buttonCount: 53 -> 52`
- `raf.meanMs: 75.6 -> 69.46`
- `raf.p95Ms: 133.3 -> 116.7`
- `longTasks.totalMs: 11495 -> 10364`

Interpretation:

- the branch finally converted the row-body rerank into a matching dense-scene motion improvement
- this is still well above the `33.3ms` target, so the lane is not done
- the next pass should stay on the remaining parent nested-group / shared size wrapper body primitive instead of reopening closed value/text lanes

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/GetParamSwitch.tsx src/components/Params/ParamSwitch.tsx src/components/Params/ParamContainer.tsx src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx`
- Playwright focused + row-body + dense probes:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-008/worktree-ai.log -- tests/e2e/settings/settings-all-settings-section-sizing-policy-resting-text.spec.ts tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe preserved first-click inline editing on the canonical `Max Height` row
  - the row-body and dense probes emitted the totals recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
