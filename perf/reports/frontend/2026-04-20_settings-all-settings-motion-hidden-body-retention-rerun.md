# Settings All Settings Motion Hidden Body Retention Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Baseline checkpoint: `perf/reports/frontend/2026-04-20_settings-all-settings-viewport-interaction-pending-snapshot-fast-path-rerun.md`
Prior attribution slice: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-hidden-subtree-churn-attribution-rerun.md`
Focused probes:

- `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
- `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`

## Goal

Land one product slice on the canonical `settings-section__browserSectionDefault` lane that stops viewport interaction from detaching and rebuilding inactive motion-hidden section-body subtrees.

This slice keeps the existing motion-hidden root and hidden-shell behavior, but changes the body path from `hidden => unmount subtree` to `hidden => keep subtree mounted under the hidden root`.

## Implementation

- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - `CanvasSectionBody` now always renders `AreaSwitch(...)` when the section is present
  - motion-hidden bodies still set `data-canvas-owned-motion-body-hidden="true"` and `display: none`, but they no longer return `null` for the body subtree during viewport interaction
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - the shared motion-hidden markup tests now assert that the hidden root keeps the representative section body mounted
- `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
  - the browser/prompt/language-server lane now asserts that hidden motion-body roots keep their child subtree while `display: none`
- `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
  - the dense probe now treats zero motion-body subtree add/remove counts as the expected post-fix behavior

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
- `raf.meanMs: 49.16`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 83.3`
- `raf.maxMs: 833.22`
- `longTasks.count: 16`
- `longTasks.totalMs: 4139`
- `longTasks.maxMs: 834`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`
- `motionHiddenSubtreeChurn.observedRootCount: 45`
- `motionHiddenSubtreeChurn.hiddenTransitionSectionCount: 45`
- `motionHiddenSubtreeChurn.restoredTransitionSectionCount: 45`
- `motionHiddenSubtreeChurn.childListMutationCount: 0`
- `motionHiddenSubtreeChurn.subtreeRemovedElementCount: 0`
- `motionHiddenSubtreeChurn.subtreeAddedElementCount: 0`

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

## Overlay Result

The focused resting-text overlay rerun recorded:

- initial browser/prompt/language-server motion-body roots: `childElementCount 2`, `display: block`
- during one checked zoom interaction:
  - `hiddenHeaderControlsCount: 45`
  - `hiddenBodyCount: 45`
  - each checked target kept `childElementCount 2` while `display: none`
- after settle:
  - `hiddenHeaderControlsCount: 0`
  - `hiddenBodyCount: 0`
  - each checked target restored `display: block` with the same `childElementCount 2`

## Interpretation

- This product slice removed the measured subtree detach / restore churn from the motion-hidden body path on the live canary:
  - wrappers still transition into the motion-hidden state
  - hidden and restored section counts still cover all observed motion-body roots
  - subtree add/remove counts on those roots dropped from `4230 / 4230` to `0 / 0`
- The headless dense timing band is still noisy and should not replace the clean whole-scene checkpoint:
  - `raf.meanMs` regressed on this one rerun
  - the long-task profile improved materially on the same run (`totalMs 4139`, `maxMs 834`)
- Treat this as structural product progress on the canonical browser lane, not yet as a new whole-scene baseline.
- The next frontier should attribute the remaining frame-time cost now that motion-hidden subtree rebuilds are gone, rather than reopening body-detach instrumentation or observer-timing cleanup.

## Verification

- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.Tkw5gG/loop-001/run-004/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

Result:

- all three checks passed locally on 2026-04-20
- CDP visual check: see `docs/worktrees/go-rewrite-pixijs/handoff.md` and `docs/worktrees/go-rewrite-pixijs/log.md`

## Follow-up

- Keep the canonical target section on `settings-section__browserSectionDefault`.
- Next pass should inspect the remaining frame-time cost after subtree churn removal, not reopen another harness-only motion-body attribution lane.
