# Settings Graph Substrate Canary Presented-Scene Visibility Attribution Split

Date: 2026-04-08
Canonical lane: `rotaryParamCodeObjDefault`
Surface: `settings` -> `All Settings`

## Summary

- Goal: split the residual `presentedSceneSectionsResolve` measurement into
  non-overlapping presentation owners before opening another product reduction
  on the canonical canary lane.
- Product slice:
  - time visible viewport world-rect resolution separately as
    `presentedSceneVisibleViewportWorldRectResolve`
  - time the remaining presented-section visibility filter separately as
    `presentedSceneSectionVisibilityFilter`
  - update the canonical perf probe allowlist and focused tests to match the
    new owners
- Result: the attribution split landed with focused coverage, but the canonical
  cross-worktree motion probe on `run-022` re-entered the known post-banner
  stall and never yielded a fresh numeric verdict for the new owners.

## Landed

- Updated
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts`
  so the canary motion-attribution owner list now tracks:
  - `presentedSceneVisibleViewportWorldRectResolve`
  - `presentedSceneSectionVisibilityFilter`
- Moved the presentation-path measurement into
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.ts`
  so the resolver records those two non-overlapping owners directly instead of
  wrapping the full path in one `presentedSceneSectionsResolve` bucket.
- Removed the old top-level wrapper from
  `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx`.
- Updated focused instrumentation expectations in
  `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx`.
- Updated the canonical residual-owner allowlist in
  `frontend/tests/e2e/settings/settings-view-modes-main-reference.spec.ts`.

## Verification

Passed:

```bash
pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.test.ts

pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx tests/e2e/settings/settings-view-modes-main-reference.spec.ts
```

Blocked:

- Canonical cross-worktree motion probe on fresh `run-022` runtime-info data:
  - command launched with fresh `./scripts/dev-runtime-info.sh` worktree and
    main bootstrap data plus the headless loop env prefix
  - reached the Playwright banner and the canonical spec body
  - then reproduced the known post-banner stall shape without printing a
    pass/fail verdict or timeout
  - after it exceeded the recent healthy runtime window by a wide margin, the
    orphaned Playwright processes were terminated manually

CDP:

- `CDP visual check: not run (fresh-context chrome-devtools retries did not reach a trustworthy comparable settings graph surface; direct /settings checks stayed on connected-shell or blank states, and bootstrap retries were inconclusive with the main reference token rejected before graph content loaded)`

## Reading

- The finer attribution seam is now landed, but there is still no trustworthy
  numeric verdict for whether
  `presentedSceneVisibleViewportWorldRectResolve` or
  `presentedSceneSectionVisibilityFilter` is the repeated dominant owner on the
  measured motion burst.
- Because the canonical probe stalled again on this new instrumentation slice,
  the next bounded pass should repair or narrow the verifier path on the same
  `rotaryParamCodeObjDefault` lane before opening another product reduction.
