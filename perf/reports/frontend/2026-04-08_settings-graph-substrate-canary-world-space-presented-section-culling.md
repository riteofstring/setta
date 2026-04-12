# Settings Graph Substrate Canary World-Space Presented-Section Culling

Date: 2026-04-08
Canonical lane: `rotaryParamCodeObjDefault`
Surface: `settings` -> `All Settings`

## Summary

- Goal: land one bounded product reduction on the current
  `presentedSceneSectionsResolve` hotspot by removing the per-section
  screen-space projection work from presented-section and body-mount culling.
- Product slice:
  - resolve the visible viewport once in world space
  - intersect section world rects against that world-space viewport
  - reuse the same world-space viewport rect for section-body mount thresholds
- Result: the product slice landed with focused tests and a fresh CDP smoke
  check, but the canonical cross-worktree motion probe re-entered the known
  post-banner stall shape before yielding a new numeric verdict.

## Landed

- Updated
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.ts`
  so presented-section culling no longer projects every section into screen
  space on each resolve pass.
- Added
  `resolveSettingsGraphSubstrateCanaryVisibleViewportWorldRect(...)` and reused
  it for both:
  - presented subset filtering
  - section body mount threshold checks
- Updated
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx`
  to compute the visible world rect once per render and pass it into body-mount
  checks.
- Added focused threshold coverage in
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.test.ts`.

## Verification

Passed:

```bash
pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.test.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.test.tsx

pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx
```

Blocked verification:

- Canonical cross-worktree motion probe:
  - launched with fresh `./scripts/dev-runtime-info.sh` bootstrap data for the
    current `run-020` worktree/reference runtimes
  - reached the Playwright test banner and entered the spec body
  - then reproduced the known post-banner stall shape without printing a
    pass/fail verdict or a timeout
  - after it exceeded recent healthy runtimes by a wide margin, the orphaned
    Playwright processes were terminated manually so the loop could continue

CDP:

- `CDP visual check: done (fresh-context sub-agent confirmed both worktree 3076 and main 3087 /settings pages rendered graph content instead of a spinner or blank shell; worktree remained visually sparser than main at smoke level)`

## Reading

- The world-space culling reduction is now landed on the canonical
  `presentedSceneSectionsResolve` lane.
- Because the shared motion probe did not produce a fresh verdict, the last
  trustworthy numeric baseline for this hotspot is still item `302`.
- The next bounded pass should restore one trustworthy automated verdict for
  this landed slice before opening another hotspot or reopening any closed
  React Flow / persistence / host-size / pointer-suppression lane.
