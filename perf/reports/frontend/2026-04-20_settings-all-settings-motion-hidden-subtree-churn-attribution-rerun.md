# Settings All Settings Motion Hidden Subtree Churn Attribution Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`
Focused dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Attribute the remaining dense `settings` -> `All Settings` `~43ms / ~6s` band on the canonical `settings-section__browserSectionDefault` lane to one concrete live path without reopening the now-closed backdrop observer timing lane.

This slice specifically checks whether one normalized viewport gesture still tears down and restores a large inactive motion-hidden section-body forest even though the visible row-body frontier is already zero on the current runtime.

## Implementation

- `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
  - the dense probe now observes each `[data-canvas-owned-motion-body-root="true"]` wrapper during the gesture
  - the probe records:
    - attribute-driven hide / restore transitions by section id
    - child-list mutation count on the wrapper roots
    - total element descendants removed from and re-added to those wrappers

The probe only watches the motion-body roots themselves. It does not add full-document subtree observers, and it should be treated as attribution instrumentation rather than as a replacement for the clean perf checkpoint.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__browserSectionDefault`

## Dense Probe Result

Fresh dense rerun on the current runtime recorded:

- blank pane point: `x=24`, `y=60`
- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 44.96`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1233.2`
- `longTasks.count: 7`
- `longTasks.totalMs: 6299`
- `longTasks.maxMs: 3805`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`
- `motionHiddenSubtreeChurn.observedRootCount: 45`
- `motionHiddenSubtreeChurn.hiddenTransitionSectionCount: 45`
- `motionHiddenSubtreeChurn.restoredTransitionSectionCount: 45`
- `motionHiddenSubtreeChurn.childListMutationCount: 180`
- `motionHiddenSubtreeChurn.subtreeRemovedElementCount: 4230`
- `motionHiddenSubtreeChurn.subtreeAddedElementCount: 4230`

Representative transition samples captured by the probe:

- hidden:
  - `settings-section__backend`
  - `settings-section__browserSectionDefault`
  - `settings-section__buttonParamCodeObjDefault`
  - `settings-section__callableSectionDefault`
  - `settings-section__chartSectionDefault`
  - `settings-section__chatSectionDefault`
  - `settings-section__chatWindowing`
  - `settings-section__codeParamCodeObjDefault`
- restored:
  - `settings-section__backend`
  - `settings-section__browserSectionDefault`
  - `settings-section__buttonParamCodeObjDefault`
  - `settings-section__callableSectionDefault`
  - `settings-section__chartSectionDefault`
  - `settings-section__chatSectionDefault`
  - `settings-section__chatWindowing`
  - `settings-section__codeParamCodeObjDefault`

## Interpretation

- One normalized dense gesture still hides and restores every motion-hidden section-body root on the canary surface.
- That gesture also removes and re-adds `4230` element descendants across those roots, so the remaining band is not just a retained-canvas observer-timing story anymore.
- This makes motion-hidden subtree orchestration a concrete live product frontier again, but now with better attribution:
  - the problem is not merely that wrappers become hidden
  - the current path still tears down and rebuilds a large inactive section-body forest per interaction cycle
- Keep `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md` as the clean comparison checkpoint. This instrumentation rerun is evidence for the next slice, not the new canonical perf baseline.

## Verification

- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.Tkw5gG/loop-001/run-003/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

Result:

- both checks passed locally on 2026-04-20
- the dense probe now emits the subtree-churn counters above on the live canary runtime
- CDP visual check: see `docs/worktrees/go-rewrite-pixijs/handoff.md` and `docs/worktrees/go-rewrite-pixijs/log.md`

## Follow-up

- The next bounded product slice should attack motion-hidden subtree reuse or another way to avoid full inactive body detach / restore churn during viewport interaction on the canonical browser lane.
- Do not reopen the backdrop observer timing lane unless a future product slice proves it is active again.
