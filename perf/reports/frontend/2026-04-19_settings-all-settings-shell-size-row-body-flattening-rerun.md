# Settings All Settings Shell Size Row-Body Flattening Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior row-body checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-nested-group-row-body-flattening-rerun.md`
Prior dense checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-nested-group-row-body-flattening-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-shell-size-row-body.spec.ts`
Row-body probe: `frontend/tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Flatten the last shared shell-section `Size` parent row bodies on the callable, dict, and GlobalVariables canaries so `All Settings` stops paying for those repeated nested `article` and `div.section-args-nested` wrappers during motion.

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

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now exposes an explicit param-specific lightweight nested row-body helper for only:
  - `settings-codeobj__callableSectionDefault__callableSectionDefault__size`
  - `settings-codeobj__dictSectionDefault__dictSectionDefault__size`
  - `settings-codeobj__globalVariablesSectionDefault__globalVariablesSectionDefault__size`
- `frontend/src/components/Params/ParamContainer.tsx` now resolves the lightweight nested/body path from that helper, so the shell sections themselves stay on the existing section-wide boundary while those three `Size` rows alone use the lightweight nested-children/body lane.
- Focused proof now exists in:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `frontend/src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-shell-size-row-body.spec.ts`

## Focused Runtime Proof

Canonical target section and row:

- target section: `settings-section__callableSectionDefault`
- sibling proof sections:
  - `settings-section__dictSectionDefault`
  - `settings-section__globalVariablesSectionDefault`
- canonical editor handoff row: `settings-codeobj__callableSectionDefault__callableSectionDefault__size__height`

Focused proof on the live worktree surface:

- the callable, dict, and GlobalVariables `Size` parent rows now report:
  - `data-canvas-owned-lightweight-row-body="true"`
  - `data-canvas-owned-nested-guide-lightweight="true"`
  - computed `display: contents`
  - zero retained nested `div.section-args-nested.section-key-value` wrappers
- each `Height` and `Width` child row in those sections now reports:
  - `data-canvas-owned-lightweight-row-body="true"`
  - computed `display: contents`
- the canonical callable `Height` input still reports:
  - `data-canvas-owned-resting-text-lightweight="true"`
  - `opacity: "0"` at rest
  - inline CodeMirror editor becomes visible on focus with no extra interaction

Interpretation from the focused proof:

- the remaining repeated shell `Size` row-body family now uses the lightweight nested/body path without widening the whole shell canaries
- first-interaction inline editing remains intact on the canonical callable `Height` row

## Row-Body Surface Summary

Fresh whole-scene rerank after the product slice:

- `mountedSectionCount: 46`
- `totalRowCount: 759`
- `totalRemainingRowCount: 3`
- `totalRemainingVisibleElementCount: 9`
- `totalRemainingVisibleChromeElementCount: 0`
- `totalRemainingVisibleLabelElementCount: 3`
- `totalRemainingVisibleValueElementCount: 6`
- remaining visible row-body surface is now concentrated entirely in:
  - `settings-section__nestedParamCodeObjDefault`
- strongest common remaining kinds are now:
  - `p.section-key` (`3`)
  - `span.section-value` (`2`)
  - `div.section-value.peer/textinput` (`1`)
  - `div.cm-line` (`1`)
  - `span.section-value.peer/textinput` (`1`)
  - `div.section-value` (`1`)

Compared with the prior row-body checkpoint:

- `totalRemainingRowCount: 6 -> 3`
- `totalRemainingVisibleElementCount: 18 -> 9`
- `totalRemainingVisibleChromeElementCount: 9 -> 0`
- `totalRemainingVisibleLabelElementCount: 3 -> 3`
- `totalRemainingVisibleValueElementCount: 6 -> 6`
- the old repeated shell wrapper kinds dropped out entirely:
  - `div.section-args-nested.section-key-value` (`3 -> 0`)
  - `article.section-key-value.group/arg-group.section-min-rows` (`3 -> 0` for the shell size family)
- `settings-section__callableSectionDefault.remainingRowCount: 1 -> 0`
- `settings-section__dictSectionDefault.remainingRowCount: 1 -> 0`
- `settings-section__globalVariablesSectionDefault.remainingRowCount: 1 -> 0`

Interpretation from the rerank:

- this closes the shared shell `Size` wrapper row-body lane as product code rather than another `sectionSizingPolicy` continuation
- the row-body frontier is no longer the callable/dict/GlobalVariables shell canary family
- the remaining row-body work is now concentrated in the smaller `nestedParamCodeObjDefault` lane rather than a repeated whole-scene primitive

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `5583`
- Inputs: `2`
- Textareas: `0`
- Buttons: `40`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `70.11ms`
- RAF p50: `66.6ms`
- RAF p95: `116.7ms`
- RAF max: `166.6ms`
- RAF frames over `16.7ms`: `179`
- RAF frames over `33.3ms`: `163`
- Long-task count: `137`
- Long-task total: `10834ms`
- Long-task max: `158ms`

## Comparison Vs. Prior Dense Checkpoint

Compared with `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-nested-group-row-body-flattening-rerun.md`:

- `documentNodeCount: 5653 -> 5583`
- `inputCount: 4 -> 2`
- `textareaCount: 1 -> 0`
- `buttonCount: 52 -> 40`
- `raf.meanMs: 70.95 -> 70.11`
- `raf.p95Ms: 116.7 -> 116.7`
- `longTasks.totalMs: 10979 -> 10834`

Interpretation:

- this dense rerun moved in the right direction on the same noisy runtime family while also clearing the repeated row-body primitive from the rerank
- the branch still misses the `33.3ms` motion budget badly, so this is a structural reduction checkpoint, not a success claim
- with the shell `Size` wrapper family closed, the next default frontier should prefer the remaining `nestedParamCodeObjDefault` row-body/value seam or the next earlier visual gate blocker rather than reopening shell wrapper churn

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamContainer.tsx src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx tests/e2e/settings/settings-all-settings-shell-size-row-body.spec.ts`
- Playwright focused + row-body + dense probes:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-010/worktree-ai.log -- tests/e2e/settings/settings-all-settings-shell-size-row-body.spec.ts tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe preserved inline editing on the canonical callable `Height` row
  - the row-body and dense probes emitted the totals recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
