## Summary

Land one bounded attribution seam on the canonical `rotaryParamCodeObjDefault`
lane so the next product slice can target real remaining canary motion owners
 instead of reopening the now-negligible
`presentedSceneSectionVisibilityFilter` path.

## What changed

- Added `presentedSceneBodyMountFilter` motion attribution around the DOM
  section-body mount decision in
  `settingsGraphSubstrateCanarySectionsLayer.tsx`.
- Added `pixiDrawableModelResolve` motion attribution around the Pixi drawable
  model build in `settingsGraphSubstrateCanarySectionShellPixiLayer.tsx`.
- Updated focused unit tests and the canonical main-reference Playwright
  allowlist so these owners are recognized when they appear in live motion
  capture.

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx`
  - passed (`3` files, `23` tests)
- `cd frontend && pnpm exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
  - passed
- `scripts/run-settings-graph-main-reference-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-002/worktree-ai.log --main-worktree /home/ubuntu/dev/setta --main-runtime-log /tmp/codex-supervisor.txhNpj/loop-001/run-002/main-ai.log`
  - resolved fresh worktree `3075/8075`, main `3087/8087`, and
    `/usr/bin/google-chrome`
  - failed before the spec body could capture live motion metrics:
    `Timed out after 30000ms during settings graph probe phase: reference: open settings.`

## Reading

- This pass intentionally does not claim a new live dominant owner yet because
  the canonical read-only `main` probe is still blocked at the same
  reference-side `open settings` phase described in the handoff.
- The new attribution seam is ready for the next fresh probe run to tell us
  whether remaining cost is coming from DOM body-mount filtering, Pixi drawable
  model building, or another still-uninstrumented owner.
