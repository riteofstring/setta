# Frontend Page Loading Refactor

## Summary
- Discovered Settings view failed to load when launched from the Edit menu inside a project.
- Root cause was a missing `pageLoadType` flag when navigating to the `/settings` route, allowing stale project state to override the Settings layout.
- Resolved by ensuring all navigation paths into Settings pass `state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}`, reusing existing loading logic to reset project-specific stores.

## Affected Areas
- `frontend/src/components/AppHeader/EditMenu.tsx`
- `frontend/src/components/Pages/Home/HomePage.tsx`

## Verification
- Manual: Navigated to Settings from within a project; page now renders correctly.

## Follow-Ups
- Consider adding a regression test for route state handling once frontend testing harness is expanded.
