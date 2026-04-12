# Settings Graph Section Entry Owner Attribution

Date: 2026-04-15
Lane: `rotaryParamCodeObjDefault`

## Goal

Split the remaining `SettingsGraphSubstrateCanarySectionsLayer` entry work into
separate shell-entry and body-gate owners so the next product slice does not
guess inside the broad `presentedSceneSectionSubtreeReactRender` bucket again.

## Change

- added two new motion-attribution owners in
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts`:
  - `presentedSceneSectionEntryShellReactRender`
  - `presentedSceneSectionEntryBodyGateReactRender`
- wrapped `SettingsGraphSubstrateCanarySectionEntry` with a profiler for the
  shell-entry path and wrapped `SettingsGraphSubstrateCanarySectionEntryBody`
  with a separate profiler for the body-mount gate path
- updated focused tests so the shared instrumentation snapshot recognizes the
  new owners and the sections-layer fanout regression proves a small
  threshold-edge pan still re-enters the shell owner while keeping the body
  gate and mounted body subtree out of that rerender
- added the new owners to the shared Playwright allowlists for the worktree and
  main-reference perf probes

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx`
  - passed (`2` files, `13` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx tests/e2e/settings/settings-view-modes.spec.ts tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
  - passed
- fresh-context CDP smoke on `http://127.0.0.1:3053/settings`
  - route reached the app shell, but the settings graph surface did not mount
    during the smoke check
  - visible state was the top navigation plus a centered loading spinner
  - no obvious blank-card or detached-body artifact was visible because the
    canary surface itself was not yet mounted

## Reading

- this is a bounded attribution seam inside the active production owner, not a
  new harness lane
- the focused threshold-edge regression now shows the remaining entry-level
  rerender is on the shell path, not the body-gate path and not the mounted DOM
  body subtree
- live motion totals are still pending because the trusted worktree Playwright
  probe remains unavailable in this loop and the CDP smoke only reached startup
  loading state
- the next product slice should target shell-entry work above the mounted body
  gate unless a trusted live probe becomes available as part of that same pass
