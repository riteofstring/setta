# Settings Graph Main-Reference Probe After Pixi Resolution Identity Reuse

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Rerun the canonical main-reference perf lane after the Pixi drawable
resolution identity-reuse slice to see whether
`pixiDrawableModelResolve` still dominates the worktree canary motion path.

## Verification

- `BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-014/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-014/main-ai.log`
  - completed the normalized `rotaryParamCodeObjDefault` probe on both
    read-only `main` and the worktree canary
  - moved past the previous `capture initial pane state` worktree stall
  - emitted numeric perf payload before failing on the existing perf
    assertions

## Result

- reference (`main`, legacy):
  - average frame duration: `319.14ms`
  - max frame duration: `883.20ms`
  - slow frames over `50ms`: `30`
- worktree (canary):
  - average frame duration: `46.37ms`
  - max frame duration: `400ms`
  - slow frames over `50ms`: `6`
  - dominant canary motion attribution owner:
    `interactionReactFlowStateSync`
- worktree attribution totals:
  - `interactionReactFlowStateSync`: `4.10ms` across `11` samples
  - `pixiDrawableModelResolve`: `2.00ms` across `36` samples
  - `presentedSceneSectionVisibilityFilter`: `0.60ms` across `40` samples
  - `presentedSceneBodyMountFilter`: `0.20ms` across `40` samples

## Reading

- The latest Pixi resolver reuse slice changed the measured worktree owner:
  `pixiDrawableModelResolve` is no longer dominant on this canonical lane.
- The next product frontier should target
  `interactionReactFlowStateSync`, not reopen the Pixi drawable resolver
  path without fresh contrary evidence.
- The probe still fails its perf thresholds because:
  - read-only `main` average frame duration is far above the test threshold
    (`319.14ms` vs `<40ms`)
  - the worktree canary average and max frame durations also remain above
    threshold (`46.37ms` and `400ms`)
