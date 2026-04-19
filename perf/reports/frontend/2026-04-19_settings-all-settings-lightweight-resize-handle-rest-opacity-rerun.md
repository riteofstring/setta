# Settings All Settings Lightweight Resize-Handle Rest Opacity Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Prior row-body checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-shared-resting-param-label-ownership-rerun.md`
Prior dense checkpoint: `perf/reports/frontend/2026-04-19_settings-all-settings-shared-resting-param-label-ownership-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-lightweight-resize-handle-generalization.spec.ts`
Row-body probe: `frontend/tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Make the shared lightweight resize-handle root paint-free at rest while keeping the same single-node interaction target and hover reveal, so the remaining repeated `section-center` row-chrome surface stops showing up across the mounted `All Settings` scene.

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

## Focused Runtime Proof

Canonical target and sibling sections:

- target: `settings-section__chatSectionDefault`
- sibling: `settings-section__spreadsheetSectionDefault`
- tertiary: `settings-section__browserSectionDefault`

Focused canary summary on the live worktree surface:

- `settingsLightweightResizeHandleCount: 681`
- `settingsLegacyResizeHandleCount: 0`
- `settings-section__chatSectionDefault`: `rowCount 24`, `lightweightResizeHandleCount 21`, `sampleHandleOpacity "0"`
- `settings-section__spreadsheetSectionDefault`: `rowCount 15`, `lightweightResizeHandleCount 14`, `sampleHandleOpacity "0"`
- `settings-section__browserSectionDefault`: `rowCount 15`, `lightweightResizeHandleCount 14`, `sampleHandleOpacity "0"`
- Playwright then hovered one chat-section param row and the sampled lightweight handle opacity flipped to `"1"`

Interpretation from the focused probe:

- the shared lightweight handle root still exists as the only resize target on the settings surface
- it now stays fully hidden at rest and becomes visible again on row hover without restoring the old nested handle markup

## Row-Body Surface Summary

Fresh whole-scene rerank after the product slice:

- `mountedSectionCount: 46`
- `totalRowCount: 759`
- `totalRemainingRowCount: 77`
- `totalRemainingVisibleElementCount: 457`
- `totalRemainingVisibleChromeElementCount: 448`
- `totalRemainingVisibleLabelElementCount: 3`
- `totalRemainingVisibleValueElementCount: 6`
- strongest common remaining kinds are now:
  - `article.section-key-value.group/arg-group.section-min-rows` (`74`)
  - `article.section-args-nested.section-lg-value.group/arg-group.section-min-rows` (`4`)
  - `div.section-args-nested.section-key-value` (`3`)
  - `p.section-key` (`3`)
  - `span.section-value` (`2`)

Compared with the prior row-body checkpoint:

- `totalRemainingRowCount: 755 -> 77`
- `totalRemainingVisibleElementCount: 1540 -> 457`
- `totalRemainingVisibleChromeElementCount: 1531 -> 448`
- `totalRemainingVisibleLabelElementCount: 3 -> 3`
- `totalRemainingVisibleValueElementCount: 6 -> 6`
- the prior top repeated kind `div.section-center...` dropped out of the common ranking entirely

Interpretation from the rerank:

- this slice materially closes the remaining shared resize-handle root lane rather than another family-local cleanup
- the dominant remaining surface is now nested/article body structure, especially under `settings-section__sectionSizingPolicy`
- the next frontier should stay on article/body primitives and not reopen the handle lane

## Captured Dense Metrics

- View mode: `All Settings`
- Flow nodes: `46`
- Visible flow nodes: `46`
- Document nodes: `5658`
- Inputs: `4`
- Textareas: `1`
- Buttons: `53`
- Canvas elements: `1`
- CodeMirror editors: `0`
- Viewport start: `x=759.9`, `y=-52.1`, `zoom=0.1`
- Viewport end after restore: `x=759.9`, `y=-52.1`, `zoom=0.1`
- RAF frames sampled: `179`
- RAF mean: `75.6ms`
- RAF p50: `66.7ms`
- RAF p95: `133.3ms`
- RAF max: `183.4ms`
- RAF frames over `16.7ms`: `179`
- RAF frames over `33.3ms`: `166`
- Long-task count: `130`
- Long-task total: `11495ms`
- Long-task max: `194ms`

## Comparison Vs. Prior Dense Checkpoint

Compared with `perf/reports/frontend/2026-04-19_settings-all-settings-shared-resting-param-label-ownership-rerun.md`:

- `documentNodeCount: 5658 -> 5658`
- `raf.meanMs: 74.58 -> 75.6`
- `raf.p95Ms: 150 -> 133.3`
- `longTasks.totalMs: 11230 -> 11495`

Interpretation:

- this slice reduces the measured visible moving row-chrome surface much more than it changes raw DOM node count
- dense motion stayed in the same rough range, with a better tail but no new budget-level improvement
- Gate 0 remains healthy, but the next measurable blocker is article/body structure rather than handle chrome

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Params/ResizeHandle.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ResizeHandle.tsx src/components/Params/ResizeHandle.test.tsx tests/e2e/settings/settings-all-settings-lightweight-resize-handle-generalization.spec.ts`
- Playwright focused probe:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-007/worktree-ai.log -- tests/e2e/settings/settings-all-settings-lightweight-resize-handle-generalization.spec.ts --reporter=line --workers=1`
- Playwright row-body + dense probes:
  - `./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-007/worktree-ai.log -- tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all listed checks passed locally on 2026-04-19
  - the focused probe proved the hidden-at-rest / visible-on-hover handle behavior above
  - the row-body and dense probes emitted the totals recorded above
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
