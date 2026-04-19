# Settings All Settings Browser Shell Lightweight Nested Children Cluster Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior guide: `perf/reports/frontend/2026-04-19_settings-all-settings-row-body-surface-ranking.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-lightweight-nested-children-generalization.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Widen the existing shell-owned `lightweight nested children` primitive to the dense browser shell family so `browserSectionDefault` no longer keeps the last legacy nested wrapper path at rest, while keeping one remaining shell canary out of the widened family as a negative control.

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`
  - added `browserSectionDefault`, `codeSectionDefault`, and `promptSectionDefault` to the shell-owned lightweight nested-child allowlist
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - updated the ownership matrix so the browser/code/prompt shell family now expects lightweight nested children while `buttonParamCodeObjDefault` remains outside the widened family
- `frontend/tests/e2e/settings/settings-all-settings-lightweight-nested-children-generalization.spec.ts`
  - retargeted the live browser-family proof lane to:
    - canonical target: `settings-section__browserSectionDefault`
    - sibling proofs: `settings-section__promptSectionDefault`, `settings-section__codeSectionDefault`
    - negative control: `settings-section__buttonParamCodeObjDefault`

## Focused Result

The focused Playwright rerun reported:

- `browserSectionDefault`
  - `rowCount: 15`
  - `legacyNestedWrapperCount: 0`
  - `lightweightGuideRootCount: 1`
- `promptSectionDefault`
  - `rowCount: 15`
  - `legacyNestedWrapperCount: 0`
  - `lightweightGuideRootCount: 2`
- `codeSectionDefault`
  - `rowCount: 16`
  - `legacyNestedWrapperCount: 0`
  - `lightweightGuideRootCount: 2`
- negative control `buttonParamCodeObjDefault`
  - `rowCount: 10`
  - `legacyNestedWrapperCount: 0`
  - `lightweightGuideRootCount: 0`

Interpretation:

- this slice closed the concrete browser/code legacy nested-wrapper gap on the current runtime
- the widened family is limited to the intended dense browser/code/prompt shell cluster and did not spill into the remaining button-param shell canary

## Fresh Dense Metrics

- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 43.42`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1183.2`
- `longTasks.count: 8`
- `longTasks.totalMs: 5916`
- `longTasks.maxMs: 3481`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

## Interpretation

- this is a real shared row-body ownership step on the canonical `browserSectionDefault` lane, not another selector-cache or trace-only pass
- the dense canary stayed in the current `~43ms` / `~5.9s` band, so record this as architecture progress rather than a new whole-scene perf checkpoint
- the next default pass should keep targeting shared row-body/article-chrome survivors on already shell-owned dense families instead of reopening the closed micro-reducer or stale-hotspot lanes

## Verification

- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-lightweight-nested-children-generalization.spec.ts`
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamContainer.lightweightNestedChildren.test.tsx`
- Playwright focused probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-032/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-lightweight-nested-children-generalization.spec.ts --reporter=line --workers=1`
- Playwright dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-032/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

All commands above passed locally on 2026-04-20.

CDP visual check:

- required for this frontend slice; see the refreshed handoff/history entry for the per-iteration summary
