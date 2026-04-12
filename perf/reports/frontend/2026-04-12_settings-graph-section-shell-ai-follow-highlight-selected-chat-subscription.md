# Settings Graph Section Shell AI-follow highlight selected-chat subscription

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`
Owner: mounted section shell chrome

## Goal

Reduce mounted section-shell fan-out by keeping
`useAiSectionHighlight(...)` off unrelated project-state section impl churn
while preserving highlight updates when the selected chat scope actually
changes.

## What changed

- added `getAllowedChatIdsForSelection(...)` in
  `frontend/src/state/aiFollowUtils.ts` so selected chat ids can be merged
  from already-resolved chat ids without resubscribing every shell to the
  full `sectionVariantMap` / `sectionVariants` / `sectionImpls` maps
- updated `frontend/src/components/Section/Container/utils.tsx` so
  `useAiSectionHighlight(...)`:
  - subscribes to AI-follow selection state for the active project
  - resolves chat ids only for the currently selected sections
  - keeps the final section highlight membership check on the existing
    AI-follow store data
- added focused regression coverage in
  `frontend/src/components/Section/Container/utils.test.tsx` to assert:
  - unrelated section-impl updates do not re-commit the mounted highlight
    probe
  - changing the selected chat section's chat id still re-renders and clears
    the highlight after the existing fade-out delay
- extended `frontend/src/state/aiFollowUtils.test.ts` coverage for the new
  selected-chat merge helper

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Container/utils.test.tsx src/state/aiFollowUtils.test.ts`
  - passed (`2` files, `7` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Container/utils.tsx src/components/Section/Container/utils.test.tsx src/state/aiFollowUtils.ts src/state/aiFollowUtils.test.ts`
  - passed
- attempted narrow Playwright smoke on the live `/settings` runtime:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3075/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8075 SETTA_BOOTSTRAP_TOKEN='<run-037 refreshed token>' pnpm -C frontend exec playwright test tests/e2e/settings/settings-view-modes.spec.ts --grep 'settings graph substrate canary preserves the All Settings multi-column spread on first render' --reporter=line --timeout=180000`
  - failed in Playwright global setup before the spec body:
    - bootstrap reached `http://127.0.0.1:3075/?__setta_backend_origin=http%3A%2F%2F127.0.0.1%3A8075`
    - `page.waitForURL(...)` timed out waiting for the post-bootstrap route
- fresh-context headless CDP smoke on worktree `/settings`
  - `/settings` mounted successfully
  - the settings surface filled the viewport and showed the overview header,
    section list, section editor area, and bottom view-mode tabs
  - no obvious blank graph region, layout collapse, or missing section shell
    surface was observed

## Reading

- this is a mounted section-shell selector reduction with wider fan-out than
  another edge/control micro-split because every shell previously subscribed
  to whole section maps just to resolve selected chat ids for AI-follow
  highlighting
- the next bounded frontier should stay attribution-led and use existing
  canary instrumentation plus focused profiler/render-count evidence to name
  the next larger mounted section-body/chrome subscriber or shared write
  fan-out before taking another reduction slice
