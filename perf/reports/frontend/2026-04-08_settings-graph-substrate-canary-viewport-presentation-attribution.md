# Settings Graph Substrate Canary Viewport Presentation Attribution

Date: 2026-04-08
Canonical lane: `rotaryParamCodeObjDefault`
Surface: `settings` -> `All Settings`

## Summary

- Goal: add one bounded attribution seam on the canary-owned viewport
  presentation path after the `reactFlowViewportPublish` removal so the next
  remaining per-frame owner is not guessed blindly.
- Product slice:
  - `SettingsGraphSubstrateCanary.tsx` now measures
    `presentedSceneSectionsResolve`
  - `settingsGraphSubstrateCanarySectionShellPixiLayer.tsx` now measures
    `pixiViewportPresent`
- The shared cross-worktree perf lane did not yield a fresh numeric verdict on
  this slice; the blocker stayed in verifier/runtime behavior rather than
  showing a renderer failure.

## Landed

- Added `presentedSceneSectionsResolve` and `pixiViewportPresent` to
  `settingsGraphSubstrateCanaryInstrumentation.ts`.
- Wrapped the shared presented-section subset resolve in
  `SettingsGraphSubstrateCanary.tsx`.
- Wrapped the Pixi viewport-present path in
  `settingsGraphSubstrateCanarySectionShellPixiLayer.tsx`.
- Updated focused tests in:
  - `SettingsGraphSubstrateCanary.test.tsx`
  - `settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx`
- Expanded the canonical Playwright probe allowlist in
  `settings-view-modes-main-reference.spec.ts` so the new non-React-Flow owners
  are treated as expected attribution candidates rather than unexpected noise.

## Verification

Passed:

```bash
pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx

pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.tsx src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx tests/e2e/settings/settings-view-modes-main-reference.spec.ts
```

Blocked / failed verification:

- Canonical cross-worktree perf probe:
  - launched with fresh runtime-info-derived bootstrap URLs/tokens for worktree
    `3076/8076` and read-only `main` `3087/8087`
  - reached the test banner, then re-entered the known post-banner stall shape
    without producing a pass/fail verdict
- Narrower worktree-only canary E2E:
  - re-minted a fresh worktree token via `./scripts/dev-runtime-info.sh`
  - global setup succeeded, but the test timed out at `120000ms` and then
    reported `page.evaluate: Target page, context or browser has been closed`
    while `normalizeSettingsGraphComparePaneState(...)` was running

CDP:

- `CDP visual check: done (direct /settings render comparison on worktree 3076 and main 3087; both rendered the All Settings graph surface and no gross worktree drift was seen at smoke level)`
- Note: the worktree bootstrap token was rejected immediately in the browser, so
  the smoke check verified the `/settings` route directly rather than opening a
  fresh bootstrap page first.

## Reading

- The next likely non-React-Flow motion owners are now instrumented in product
  code:
  - `presentedSceneSectionsResolve`
  - `pixiViewportPresent`
- There is still no fresh live numeric verdict naming which of those owners, if
  either, dominates the canonical lane after item `300`.
- The immediate next blocker is therefore verifier/runtime recovery on the same
  `rotaryParamCodeObjDefault` lane, not another product hypothesis on closed
  React Flow, persistence, host-size, or pointer-suppression paths.
