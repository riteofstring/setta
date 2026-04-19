# Settings All Settings Row-Body Surface Ranking

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline reference: `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`
Latest value-surface reference: `perf/reports/frontend/2026-04-19_settings-all-settings-lightweight-switch-resting-visual-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts`

## Goal

Replace the now-misleading remaining-value inventory with a whole-scene ranking of the visible `ParamContainer` row-body surface that still moves under `All Settings` pan/zoom, so the next product slice targets the real hot path instead of another nearly-closed value leaf.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Authentication: fresh one-shot bootstrap tokens from `./scripts/run-playwright-against-runtime.sh`
- Commands:
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-004/worktree-ai.log -- tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts --reporter=line --workers=1`
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-004/worktree-ai.log -- tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`

## Measurement Method

The focused probe normalizes to `settings` -> `All Settings`, clicks shared `fit view`, waits for more than `20` visible nodes, then ranks each mounted `article[id^="ParamContainer-"]` by visible descendants that are still outside the current lightweight/canvas-owned value primitives.

Ignored from the row-body count:

- `[data-canvas-owned-resting-text-lightweight="true"]`
- `[data-canvas-owned-resting-dropdown-lightweight="true"]`
- `[data-canvas-owned-lightweight-switch="true"]`
- `[data-canvas-owned-lightweight-color-input="true"]`
- `[data-canvas-owned-lightweight-filter-activator="true"]`
- `[data-canvas-owned-underline="true"]`

What remains in the ranking is the visible row/article surface that still rides the DOM transform during motion: row chrome, resize scaffolding, label text that still stays DOM-visible, and any leftover non-lightweight value roots.

## Focused Ranking

- Whole-scene totals on the live worktree surface:
  - `mountedSectionCount: 46`
  - `totalRowCount: 759`
  - `totalRemainingRowCount: 755`
  - `totalRemainingVisibleElementCount: 2934`
  - `totalRemainingVisibleChromeElementCount: 2713`
  - `totalRemainingVisibleLabelElementCount: 215`
  - `totalRemainingVisibleValueElementCount: 6`
- The latest value-surface inventory had already fallen to only `6` visible value elements across `3` rows.
- The new evidence shows why the dense hotspot stayed bad anyway:
  - the moving graph surface still carries `2934` visible row-body descendants even after the value surface was almost entirely flattened
  - only `6` of those descendants are value roots
  - the dominant remaining cost is broad row chrome and article scaffolding, not the last visible value leaves

Top sections from the new row-body ranking:

1. `settings-section__sectionSizingPolicy`
   - `rowCount: 211`
   - `remainingVisibleElementCount: 868`
   - `remainingVisibleChromeElementCount: 868`
   - dominant rows are nested size/meta-control groups such as `byType` and `metaControlByType`
2. `settings-section__shortcuts`
   - `rowCount: 62`
   - `remainingVisibleElementCount: 186`
   - almost entirely repeated row chrome and resize scaffolding
3. `settings-section__chatSectionDefault`
   - `rowCount: 24`
   - `remainingVisibleElementCount: 71`
   - nested `Size` plus ordinary key/value rows still carry the same row chrome
4. `settings-section__spreadsheetSectionDefault`
   - `rowCount: 15`
   - `remainingVisibleElementCount: 67`
   - includes `16` still-visible label descendants on top of repeated row chrome
5. `settings-section__gui`
   - `rowCount: 22`
   - `remainingVisibleElementCount: 66`
   - repeated row chrome dominates even though the visible value surface is already flattened there

Additional top-ranked sections stayed in the same broad shape rather than forming a tiny survivor family:

- `settings-section__codeSectionDefault`
- `settings-section__dictSectionDefault`
- `settings-section__globalVariablesSectionDefault`
- `settings-section__backend`
- `settings-section__groupSectionDefault`

Common remaining kinds across the whole mounted surface:

1. `div.section-center.group-hover/arg-group:bg-setta-500/15` (`544`)
2. `div.group/resize` (`544`)
3. `div` (`543`)
4. `div.section-center.group-hover/arg-group:before:bg-setta-500/15.group-hover/arg-group:after:bg-setta-200.group-hover/arg-group:dark:after:bg-setta-500` (`211`)
5. `p.section-key` (`203`)

## Fresh Dense Metrics

- `documentNodeCount: 6679`
- `inputCount: 4`
- `textareaCount: 1`
- `buttonCount: 52`
- `canvasCount: 1`
- `raf.meanMs: 101.3`
- `raf.p95Ms: 183.4`
- `longTasks.totalMs: 16263`

## Interpretation

- The remaining-value ranking is no longer sufficient to choose the next product slice on this branch.
- After the latest switch visual pass, the value surface was already nearly gone, but the row-body ranking shows `2934` visible descendants still moving with the DOM graph surface.
- The strongest repeated survivors are not value widgets. They are:
  - row center chrome
  - resize scaffolding
  - row/article wrappers
  - a smaller but still broad tail of DOM-visible labels
- `settings-section__sectionSizingPolicy` is a genuine outlier by mounted row-body surface, but the repeated common kinds show that the next product slice should target a shared row-body/body-overlay primitive rather than another section-local value cleanup.
- The next bounded production decision should come from this ranking:
  - either move shared row chrome / resize/article decoration off the moving DOM surface
  - or land a stronger inactive-row overlay/body primitive on the highest-payoff repeated row-body family
- Do not treat `settings-section__nestedParamCodeObjDefault` or the last few visible value roots as the default frontier anymore. They no longer explain the dense-motion result.

## Verification

- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts`
- Playwright focused probe:
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-004/worktree-ai.log -- tests/e2e/settings/settings-all-settings-row-body-surface-ranking.spec.ts --reporter=line --workers=1`
- Playwright dense probe:
  - `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-001/run-004/worktree-ai.log -- tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line --workers=1`
- Result:
  - all commands above passed locally on 2026-04-19
  - the ranking probe produced the row-body totals and top sections recorded above
  - the dense probe confirmed the branch still sits at roughly `101ms` mean / `183ms` p95 despite the near-zero remaining value surface
- CDP visual check:
  - required for this frontend slice; see handoff/history for the per-iteration summary
