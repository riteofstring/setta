# Project Mutation Latency

## Context
- Date: 2026-03-24
- Goal: reduce latency for `New Project`, top-level section creation, and list incrementer/decrementer interactions on the Go rewrite branch.
- Branch/commit baseline: `go-rewrite @ 88cf75eba` plus the working-tree refactor in this session.
- Code paths:
  - `internal/projectstate/runtime.go`
  - `internal/projectstate/runtime_deferred_persistence.go`
  - `internal/projectstate/project_lifecycle.go`
  - `internal/projectstate/top_level_section_creation.go`
  - `internal/projectstate/child_section_creation.go`
  - `internal/projectstate/child_section_incrementer_creation.go`
  - `internal/projectstate/child_section_decrementer_deletion.go`
  - `internal/projectstate/layout_presentation.go`
  - `internal/projectstate/view_modes.go`
  - `internal/projectstate/effective_section_payload.go`
  - `internal/httpapi/project_routes.go`
  - `frontend/src/state/actions/sections/createSections.ts`

## Scenario
- Entry points:
  - Home page `http://127.0.0.1:3019/home`
  - Project page `http://127.0.0.1:3019/<project-name>`
- Repro steps:
  - Click `New Project`.
  - Create a top-level `Callable`.
  - Create a `ListRoot`, add one child with the incrementer, then remove it with the decrementer.
- Data set:
  - Fresh generated project plus one callable and one list root.
- Environment:
  - Dev frontend `127.0.0.1:3019`
  - Dev backend `127.0.0.1:8019`
  - Chrome DevTools MCP / Chrome 146 on macOS 10.15.7
  - No CPU or network throttling

## Before (baseline)
- Measurement method:
  - Same-machine backend request timings from `backend.log` on the pre-refactor worktree state.
  - Baseline CDP trace was not captured before the code change; baseline for request latency comes from the backend log that reproduced the slow paths.
- Key metrics:
  - `createProjectConfig`: `267.0 ms`
  - `createTopLevelSection`: `36.6-37.4 ms`
  - Follow-up `getLatestProjectState` after top-level create: `0.8-1.7 ms`
  - `setActiveIds` after create: `30.7-35.5 ms`
  - `setTopLevelSectionLayout` after create: `41.9-43.9 ms`
  - `createChildSectionsViaIncrementer`: `42.8-55.0 ms`
  - `deleteChildSectionsViaDecrementer`: `36.2-47.3 ms`
- Observations:
  - Top-level section creation always paid an extra frontend-triggered `getLatestProjectState` round-trip after the create mutation.
  - Interactive mutations were synchronously running the full persistence pipeline before returning.
  - Incrementer/delete flows were materially slower than the Python main branch despite touching very small parts of project state.

## After
- Measurement method:
  - Backend request timings from `chrome_mcp_backend.log` while driving the app through Chrome DevTools MCP.
  - One DevTools Performance trace for the `New Project` interaction on the home page.
- Key metrics:
  - `createProjectConfig`: `4.0 ms`
  - `loadProjectConfig`: `0.4-1.1 ms`
  - `createTopLevelSection`: `2.7-4.1 ms`
  - No `getLatestProjectState` request after top-level create.
  - `setActiveIds` after create: `0.5-6.3 ms`
  - `setTopLevelSectionLayout` after create: `0.3-0.4 ms`
  - `createChildSectionsViaIncrementer`: `4.7-10.0 ms`
  - `deleteChildSectionsViaDecrementer`: `2.3-7.5 ms`
  - DevTools trace on `New Project` click:
    - INP: `75 ms`
    - Input delay: `1 ms`
    - Processing: `54 ms`
    - Presentation delay: `20 ms`
- Observations:
  - The hot mutations are now returning from in-memory state first, while persistence and materialization run behind them.
  - Top-level create no longer performs the extra `getLatestProjectState` fetch; the websocket broadcast is now authoritative.
  - Incrementer and decrementer backend time dropped by roughly an order of magnitude.
  - Project boot after `New Project` still has secondary follow-up work (`plugins/runtime` around `453-471 ms`, `setProjectChatWindowingState` around `29-45 ms`), so page-load feel is not purely gated by `createProjectConfig` anymore.
  - During verification, deleting the last child exposed a separate `children: null` payload bug; that was fixed in the same pass so empty child lists now stay `[]` and the page remains stable.

## Automated guardrails
- Go:
  - `./scripts/go.sh test ./internal/projectstate -run 'Test(EffectiveSectionPayloadMaterializesLegacySectionImplDefaults|SectionImplPayloadNormalizesNullChildrenToEmptyArray|RuntimeMutateAndPersistLaterReturnsBeforeSaveHooksFinish|RuntimeMutateAndPersistLaterCoalescesPendingSnapshots|RuntimeCreateProjectRunsPythonCodegenSectionReconcilerWhenConfigured|RuntimeCreateTopLevelSectionReconcilesGeneratedPythonSectionsWhenConfigured|RuntimeCreateChildSectionsViaIncrementerReconcilesGeneratedPythonSectionsWhenConfigured)' -count=1`
  - `./scripts/go.sh test ./internal/app -run 'TestApp(ChildSectionIncrementerRoutesBroadcastProjectStateUpdate|CreateTopLevelSectionRouteBroadcastsProjectStateUpdate|ServesProjectShellLifecycleRoutes|CreateProjectConfigRouteIgnoresLSPInitializationFailure|ProjectRuntimeCreateProjectDefaultScaffold|ProjectRuntimeCreateProjectDefaultScaffoldOnRepoWorkspace)' -count=1`
  - `./scripts/go.sh test ./internal/httpapi -run 'TestRegisterProjectRoutes(CreateTopLevelSection.*|CreatesTopLevelPluginLanguageSection)' -count=1`
  - `./scripts/go.sh test ./internal/projectshell -run TestServiceCreateProjectConfigSeedsSingleViewModeAndFlushesPersistenceOnRuntimeClose -count=1`
  - `./scripts/go.sh test ./internal/projectstate ./internal/httpapi ./internal/app ./internal/projectshell -run '^$' -count=1`
- Frontend:
  - `pnpm -C frontend exec vitest run src/state/actions/sections/createSections.test.ts`

## Conclusion
- Improved:
  - `New Project`, top-level section creation, incrementer, and decrementer backend request times all dropped substantially.
  - Top-level create no longer burns an extra authoritative refresh request.
  - Empty list-root child payloads now stay array-shaped and do not crash the frontend after deleting the last child.
- Remaining follow-up:
  - Project page boot still does expensive post-load work (`plugins/runtime`, project chat windowing sync) that can dominate perceived latency after the initial create call has been made fast.
