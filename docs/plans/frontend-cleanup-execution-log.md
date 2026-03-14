# Frontend Cleanup Execution Log

Append-only log for autonomous frontend cleanup slices.

## 2026-03-12 10:32:04 PDT

- What changed: Added a frontend module map and placement rules doc covering ownership boundaries, allowed patterns, file-size guidance, and fast navigation guidance for authored frontend code. Also created the append-only execution log and linked both docs from the docs overview.
- Key files touched: `docs/reference/frontend-module-map.md`, `docs/plans/frontend-cleanup-execution-log.md`, `docs/README.md`
- Tests/verification run: `pnpm -C frontend exec prettier --check ../docs/reference/frontend-module-map.md ../docs/plans/frontend-cleanup-execution-log.md ../docs/README.md`
- Perf/CDP notes: not applicable for this non-visual documentation slice
- Commit hash: `fdb40066f`
- Next highest-value unblocked slice: split the mixed `frontend/src/utils/constants.ts` surface into smaller domain modules and move core shared-state/page callers onto those boundaries

## 2026-03-12 10:41:50 PDT

- What changed: Split the mixed shared `frontend/src/utils/constants.ts` module into domain-owned modules under `frontend/src/utils/constants/` for panes, routes, DOM/app chrome, section measurement keys, project-search mode, preview colors, and environment flags. Kept `utils/constants.ts` as a compatibility barrel, moved core page/pane/state/plugin callers to direct domain imports, replaced the generic constants test with focused `panes` and `routes` tests, and updated the frontend module map to point future work at the new boundary.
- Key files touched: `frontend/src/utils/constants.ts`, `frontend/src/utils/constants/panes.ts`, `frontend/src/utils/constants/routes.ts`, `frontend/src/utils/constants/dom.ts`, `frontend/src/utils/constants/measurements.ts`, `frontend/src/state/definitions.ts`, `frontend/src/components/Pages/router.tsx`, `frontend/src/components/Panes/Overview/Overview.tsx`, `frontend/src/plugins/runtime.ts`, `docs/reference/frontend-module-map.md`
- Tests/verification run: `pnpm exec vitest run src/utils/constants/panes.test.ts src/utils/constants/routes.test.ts src/components/Panes/paneLayout.test.ts src/state/actions/localStorage.test.ts src/state/hooks/project.test.tsx`; `pnpm exec vitest run src/plugins/runtime.test.ts src/components/Panes/Overview/Overview.test.tsx src/state/actions/backendLogEvents.test.ts src/state/hooks/sectionSizes.test.tsx`; `git diff --check`
- Perf/CDP notes: not applicable for this non-visual refactor; no UI behavior change intended
- Commit hash: `fe0cb302e`
- Next highest-value unblocked slice: split `frontend/src/state/definitions.ts` into domain store modules while keeping a thin compatibility index for existing imports
