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

## 2026-03-12 10:50:10 PDT

- What changed: Extracted the first store ownership slice from `frontend/src/state/definitions.ts` into `frontend/src/state/stores/` by moving persistence helpers, core project stores, session stores, and UI chrome stores into dedicated modules. Kept `state/definitions.ts` as a compatibility index, moved a few direct callers onto the new store modules, updated the frontend module map to point contributors at `state/stores/`, and removed the now-stale root `frontend/src/utils/constants.test.ts` file that was superseded by the focused constants tests.
- Key files touched: `frontend/src/state/definitions.ts`, `frontend/src/state/stores/projectStores.ts`, `frontend/src/state/stores/sessionStores.ts`, `frontend/src/state/stores/uiStores.ts`, `frontend/src/state/stores/persistStorage.ts`, `frontend/src/components/Pages/router.tsx`, `frontend/src/components/Pages/GlobalWrapper.tsx`, `frontend/src/state/actions/project/loadProject.ts`, `frontend/src/state/actions/contextMenus.ts`, `docs/reference/frontend-module-map.md`
- Tests/verification run: `pnpm exec vitest run src/components/Pages/router.test.tsx src/state/hooks/project.test.tsx src/state/actions/localStorage.test.ts src/state/definitionsProjectChatDictationMode.test.ts`; `git diff --check`
- Perf/CDP notes: not applicable for this non-visual refactor; no UI behavior change intended
- Commit hash: `54fe6ed1e`
- Next highest-value unblocked slice: continue shrinking `frontend/src/state/definitions.ts` by moving the persisted local-storage and AI store clusters into domain-owned store modules

## 2026-03-12 10:59:35 PDT

- What changed: Extracted the persisted local-storage and AI store clusters from `frontend/src/state/definitions.ts` into `frontend/src/state/stores/localStorageStore.ts` and `frontend/src/state/stores/aiStore.ts`, re-exported them through `state/definitions.ts` for compatibility, moved direct callers onto the new modules where it improved ownership clarity, and updated the module map to point future contributors at the new persisted store owners. `frontend/src/state/definitions.ts` is now down to 682 lines instead of carrying those persisted clusters inline.
- Key files touched: `frontend/src/state/definitions.ts`, `frontend/src/state/stores/localStorageStore.ts`, `frontend/src/state/stores/aiStore.ts`, `frontend/src/state/actions/localStorage.ts`, `frontend/src/components/Pages/GlobalWrapper.tsx`, `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`, `frontend/src/state/aiStorePersistence.test.ts`, `docs/reference/frontend-module-map.md`
- Tests/verification run: `pnpm exec vitest run src/state/aiStorePersistence.test.ts src/state/definitionsProjectChatDictationMode.test.ts src/state/actions/localStorage.test.ts src/components/Pages/router.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx`; `git diff --check`
- Perf/CDP notes: not applicable for this non-visual refactor; no UI behavior change intended
- Commit hash: `b8424f6d9`
- Next highest-value unblocked slice: split the remaining active-section/node-internals publication cluster and the diagnostics/misc store cluster out of `frontend/src/state/definitions.ts`
