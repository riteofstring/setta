# Settings All Settings Mounted-Hidden Motion Body Experiment

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior whole-scene checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`
Focused motion probe: `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Test whether the current canvas-shell motion-hidden body lane can avoid the start/end subtree remount/GC cost by keeping hidden section bodies mounted under the existing `display: none` wrapper during viewport interaction.

## Temporary implementation

This experiment was intentionally temporary and was reverted after verification.

- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - kept `AreaSwitch` mounted while `data-canvas-owned-motion-body-hidden="true"` was active
  - memoized the area switch so motion-state wrapper rerenders would not immediately force a fresh subtree render from that boundary
- focused tests were temporarily updated to assert that hidden wrappers still retained mounted children while `display: none` remained active

## Verification

- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
  - result: passed
- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: `1 passed`, `11` tests
- `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-015/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.0m)`

## Live result

Canonical target section:

- `settings-section__browserSectionDefault`

Sibling proof sections:

- `settings-section__promptSectionDefault`
- `settings-section__languageServer`

The focused overlay probe confirmed the temporary behavior:

- before motion, all three sections reported `display: block` and `childElementCount: 2`
- during one checked zoom interaction, all three sections reported:
  - `data-canvas-owned-motion-body-hidden="true"`
  - `display: none`
  - `childElementCount: 2`
- after settle, all three sections restored to `display: block`

The dense motion rerun on the same runtime recorded:

- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `raf.meanMs: 60.78`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 99.9`
- `raf.maxMs: 1533.3`
- `longTasks.count: 18`
- `longTasks.totalMs: 5947`
- `longTasks.maxMs: 1018`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

## Interpretation

- This experiment did remove the unmount/remount behavior from the checked motion-hidden wrappers, but it did not improve the dense `All Settings` canary.
- Compared with the current whole-scene checkpoint (`raf.meanMs: 42.58`, `raf.p95Ms: 50`, `longTasks.totalMs: 5844`), the mounted-hidden variant regressed frame-time spread sharply (`60.78` / `99.9`) while only keeping long-task total in the same broad band (`5947`).
- The most credible explanation is that preserving the hidden subtree also preserves too much live motion-time work inside those mounted section bodies, so the branch trades boundary churn for worse continuous interaction cost.
- Because the dense lane regressed on the primary metric, this variant was reverted and is not a viable next default step.
- Do not reopen the mounted-hidden-body idea unless a later product slice can also freeze or otherwise suppress the hidden subtree's live motion-time updates.

## CDP visual check

- not run
- reason: the experiment was rejected and reverted after the dense motion canary regressed, so it was not a candidate for a kept UI change
