# Settings All Settings Lightweight Nested Group Row-Body Flattening Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior row-body checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-nested-leaf-row-body-flattening-rerun.md`
Prior dense checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-nested-leaf-row-body-flattening-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-resting-text.spec.ts`
Row-body probe: `frontend/tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Flatten the remaining neutral lightweight nested-group row wrappers on the shared canvas-owned nested-children lane so `All Settings` stops paying for the surviving `sectionSizingPolicy` and `languageServer` group-row `article` boxes after the nested leaf wrappers are already lightweight.

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

- `frontend/src/components/Params/ParamSwitch.tsx` now resolves a shared neutral-row predicate for lightweight row-body flattening and uses it for:
  - the existing nested leaf-row case
  - nested group rows with child params
- `frontend/src/components/Params/ParamContainer.tsx` now applies `display: contents` to neutral lightweight nested group rows on the shared lightweight nested-children lane for both:
  - nested-root rows
  - nested-child rows
- `frontend/src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx` now covers both lightweight nested group layouts in addition to the earlier leaf-row coverage.
- `frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-resting-text.spec.ts` now proves the surviving `byType` and `metaControlByType` parent rows are flagged as lightweight row bodies and compute as `display: contents` while the canonical `Max Height` editor still focuses inline.

## Focused Runtime Proof

Canonical target section and row:

- target section: `settings-section__sectionSizingPolicy`
- parent row family: `byType` / `metaControlByType`
- canonical editor handoff row: `settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType__Browser__maxHeight`

Focused proof on the live worktree surface:

- the existing `sectionSizingPolicy` resting-text probe still focused the canonical `Max Height` row inline on the first interaction
- the `byType` and `metaControlByType` parent rows now report:
  - `data-canvas-owned-lightweight-row-body="true"`
  - computed `display: contents`
  - zero-width / zero-height retained row box

Interpretation from the focused proof:

- the surviving `sectionSizingPolicy` group-row wrappers are no longer paid as visible row-body boxes during motion
- first-click inline editing on the canonical `Max Height` row still works after the group-row flattening

## Row-Body Surface Summary

Fresh whole-scene rerank after the product slice:

- `mountedSectionCount: 46`
- `totalRowCount: 759`
- `totalRemainingRowCount: 6`
- `totalRemainingVisibleElementCount: 18`
- `totalRemainingVisibleChromeElementCount: 9`
- `totalRemainingVisibleLabelElementCount: 3`
- `totalRemainingVisibleValueElementCount: 6`
- strongest common remaining kinds are now:
  - `div.section-args-nested.section-key-value` (`3`)
  - `article.section-key-value.group/arg-group.section-min-rows` (`3`)
  - `p.section-key` (`3`)
  - `span.section-value` (`2`)

Compared with the prior row-body checkpoint:

- `totalRemainingRowCount: 10 -> 6`
- `totalRemainingVisibleElementCount: 61 -> 18`
- `totalRemainingVisibleChromeElementCount: 52 -> 9`
- `totalRemainingVisibleLabelElementCount: 3 -> 3`
- `totalRemainingVisibleValueElementCount: 6 -> 6`
- `settings-section__sectionSizingPolicy.remainingRowCount: 2 -> 0`
- `settings-section__sectionSizingPolicy.remainingVisibleElementCount: 40 -> 0`

Interpretation from the rerank:

- this closes the shared lightweight nested-group wrapper lane on the shared resting-text settings boundary
- the remaining row-body surface is now outside `sectionSizingPolicy` and concentrated in:
  - the shared `Size` wrappers on `callable`, `dict`, and `GlobalVariables`
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
- RAF mean: `70.95ms`
- RAF p50: `66.7ms`
- RAF p95: `116.7ms`
- RAF max: `150.1ms`
- RAF frames over `16.7ms`: `179`
- RAF frames over `33.3ms`: `165`
- Long-task count: `140`
- Long-task total: `10979ms`
- Long-task max: `155ms`

## Comparison Vs. Prior Dense Checkpoint

Compared with `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-nested-leaf-row-body-flattening-rerun.md`:

- `documentNodeCount: 5653 -> 5653`
- `buttonCount: 52 -> 52`
- `raf.meanMs: 69.46 -> 70.95`
- `raf.p95Ms: 116.7 -> 116.7`
- `longTasks.totalMs: 10364 -> 10979`

Interpretation:

- the row-body surface moved materially, but this single dense rerun did not beat the prior checkpoint on the same noisy runtime
- treat this slice as confirmed global row-body reduction plus a dense-measurement checkpoint, not as a new best motion checkpoint
- the next pass should stay on the remaining shared row-body primitives (`Size` wrappers or a stronger overlay decision), not reopen the closed `sectionSizingPolicy` lane

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ParamSwitch.tsx src/components/Params/ParamContainer.tsx src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx tests/e2e/settings/settings-all-settings-section-sizing-policy-resting-text.spec.ts`
- Playwright focused + row-body + dense probes:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-009/worktree-ai.log -- tests/e2e/settings/settings-all-settings-section-sizing-policy-resting-text.spec.ts tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe preserved first-click inline editing on the canonical `Max Height` row
  - the row-body and dense probes emitted the totals recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
