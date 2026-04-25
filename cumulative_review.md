# Cumulative Review

## Recurring Subsystem Invariant Matrix

### Watch Code Plugin Mutations
- Invariant: Watch Code plugin routes and backend UI settings may keep plugin-owned public surfaces, but live project-state mutations must write through the app-owned Go runtime so persisted state, live snapshots, websocket updates, frontend op status, Watch Code service config, and ignored-root policy share one canonical writer.
- Last finding commit: 0317ff3f3ff9a601f43097511f5a85e0b32337c0
- Proof tests: `TestAppWatchCodePluginRouteMutatesLiveRuntimeAndPreservesDataAcrossSave`; `TestBuildPluginBackendRuntimeEntryReturnsBackendNormalizedValue`
- Still unverified: Browser/CDP flow not run; no UI behavior changed.

### Watch Code Provider Registry
- Invariant: When an active Watch Code provider exists, project mutations that can change callable membership must update the provider's pluginData registry in the same document revision; providerless project paths must not recreate core Watch Code fields.
- Last finding commit: 0317ff3f3ff9a601f43097511f5a85e0b32337c0
- Proof tests: `TestAppSetCallableRouteSyncsActiveWatchCodeProviderRegistry`; `TestRuntimeDeleteSectionVariantPrunesWatchCodeProviderRegistryMembership`; `TestRuntimeDeleteSectionVariantKeepsWatchCodeProviderRegistryMembershipForRemainingVariant`
- Still unverified: No separate negative no-provider callable test was added in this iteration.

### Watch Code Provider Service Lifecycle
- Invariant: Watch Code service lifecycle has one mutable owner, `watchCodeServiceRef`; provider unavailability must stop the service without fallback raw pointers or stored-data processing.
- Last finding commit: 0317ff3f3ff9a601f43097511f5a85e0b32337c0
- Proof tests: Existing app tests updated to assert `app.watchCodeRef.Current()` across startup, enable, no-provider, launcher, and core-route absence paths.
- Still unverified: No new dedicated shutdown-count test was added in this iteration.

### Generic Plugin Canvas Controls
- Invariant: Canvas-control ordering has one shared comparator for placement, order, label, plugin ID, and control ID so registration-time and runtime-store sorting cannot drift.
- Last finding commit: 0317ff3f3ff9a601f43097511f5a85e0b32337c0
- Proof tests: `frontend/src/plugins/runtime.test.ts`
- Still unverified: Browser/CDP visual check not run; comparator behavior is non-visual and covered by unit tests.

### Extracted Watch Code Surface Contracts
- Invariant: After Watch Code extraction, docs and tests target plugin-owned routes, DOM IDs, and `plugin::<provider>::*` settings; stale core route names, core selectors, and compatibility aliases stay deleted.
- Last finding commit: 0317ff3f3ff9a601f43097511f5a85e0b32337c0
- Proof tests: `frontend/tests/e2e/overview/layout/watch-code-pane.spec.ts`; `plugins/setta-watch-code/frontend/tests/register.test.ts`
- Still unverified: Updated Playwright spec was not rerun in this iteration because no UI behavior changed.

### Codex Plan Loop Tooling
- Invariant: Post-merge Codex loop tooling keeps generic reusable entrypoints and does not retain branch-specific wrapper scripts after their implementation branch.
- Last finding commit: 0317ff3f3ff9a601f43097511f5a85e0b32337c0
- Proof tests: `tests/start/test_codex_plan_loop_scripts.py`
- Still unverified: None.

## 2026-04-25 20:50:34 PDT

Fixes applied:
- Moved Watch Code plugin route and backend UI-setting writes onto the app-owned runtime path while keeping the plugin-owned `/plugins/<provider>/watch-code/*` surface.
- Made provider-aware callable and section-variant mutations sync Watch Code registry membership in provider plugin data.
- Removed split raw Watch Code service ownership, stale Watch Code caret/old route references, duplicated canvas-control sorting, and the branch-specific Codex loop wrapper.
- Returned backend UI-setting `normalizedValue` from the owner-normalized accepted value.

Tests added or upgraded:
- Added app integration coverage for live Watch Code plugin route writes, persistence across later app saves, ignored-root baselining, and setCallable provider registry sync.
- Added projectstate runtime variant-deletion registry membership tests.
- Added backend UI-setting normalization coverage.
- Updated Watch Code E2E expectations and Codex plan-loop script coverage for removed stale surfaces.

Verification run:
- `./scripts/go.sh test ./internal/projectstate -run 'TestRuntimeDeleteSectionVariant(PrunesWatchCodeProviderRegistryMembership|KeepsWatchCodeProviderRegistryMembershipForRemainingVariant)'`
- `./scripts/go.sh test ./internal/uisettings -run TestBuildPluginBackendRuntimeEntryReturnsBackendNormalizedValue`
- `./scripts/go.sh test ./internal/app -run 'TestApp(WatchCodePluginRouteMutatesLiveRuntimeAndPreservesDataAcrossSave|SetCallableRouteSyncsActiveWatchCodeProviderRegistry|PluginEnableStartsWatchCodeService|IDEStartupSyncsWatchCodeServiceFromSavedProjectState|SetWatchCodeEnabledCoreRouteIsAbsent|MainRuntimeSaveSyncsWatchCodeServiceConfigs)'`
- `./scripts/go.sh test ./internal/httpapi -run 'TestRegisterPluginRootRoutes'`
- `./scripts/go.sh test ./internal/uisettings`
- `./scripts/go.sh test ./internal/projectstate -run 'TestRuntimeDeleteSectionVariant|TestProjectDeleteSectionVariant'`
- `pnpm -C frontend exec vitest run src/plugins/runtime.test.ts`
- `source activate.sh && pytest tests/start/test_codex_plan_loop_scripts.py`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- `git diff --check`

Residual risks / verification gaps:
- Browser/CDP visual verification was not run; no UI behavior changed.
- The updated Playwright Watch Code spec was not rerun.
- `pnpm -C frontend gcf` emitted existing generated Python Ruff TC002/TC003 type-checking import diagnostics but completed successfully, and `./check_quality.sh` passed.
