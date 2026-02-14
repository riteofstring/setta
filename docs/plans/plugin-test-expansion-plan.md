# Plugin Test Expansion Plan (Fixture-First Coverage + Manual DX)

Last updated: February 14, 2026

## Status snapshot (implemented)
- Fixture catalog expanded to 20 standalone plugin-root fixtures plus 1 multi-root archive failure fixture.
- Added backend coverage for metadata identity/version mismatch install errors.
- Added backend coverage for ambiguous plugin-root archive error (`PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT`).
- Added backend coverage for static-router fixture activation and route checks.
- Added backend coverage for multi-tool MCP fixture registration.
- Added backend coverage for handshake/timeout/transport failure fixtures.
- Added CLI integration tests for `setta plugins lock write/apply`.
- Added Playwright coverage for top-nav fixture click side effects.
- Added Playwright coverage for schema-backed plugin config editor flow in `/settings`.
- Added Playwright coverage for a large plugin-section scenario (100+ sections) with interaction guard.
- Added manual DX tooling scripts: `scripts/plugin-fixtures/link.sh`, `scripts/plugin-fixtures/unlink.sh`, `scripts/plugin-fixtures/reset.sh`, `scripts/plugin-fixtures/smoke.sh`.
- Added manual guide: `docs/guides/plugin-fixture-manual-smoke.md`.

## Goals
- Reach broad, explicit test coverage for plugin features across backend unit tests, backend integration tests, frontend unit tests, and Playwright E2E.
- Use a single canonical fixture plugin catalog so the same plugins are used by tests and by manual verification.
- Make manual plugin testing fast and repeatable for day-to-day development.
- Turn plugin regressions into obvious failures with deterministic error assertions.

## Non-goals
- Redesigning plugin architecture.
- Introducing marketplace/discovery workflows.
- Implementing Phase 4 content export/import behavior in this plan (we only prepare coverage scaffolding where possible).

## Why this plan
Current coverage is strong but uneven. We already test many golden paths and key failures, but coverage is not yet guaranteed feature-by-feature with a clear matrix and a repeatable manual workflow tied to the same fixtures.

## Coverage policy (new baseline)
- Every plugin feature must have at least one automated test in its primary layer.
- Every user-visible plugin feature must have at least one Playwright test.
- Every capability gate must test both allowed and blocked behavior (`ide` vs `share`/`app`).
- Every deterministic error code introduced by plugin runtime/installer/worker must be asserted in tests.
- Every fixture plugin must be documented with: purpose, capabilities, expected UI surfaces, and manual smoke commands.

## Canonical fixture strategy

### Source of truth
- Keep all reusable plugin fixtures under `tests/fixtures/plugins/`.
- Treat these fixtures as production-like assets: valid manifests, real entrypoints, real built frontend artifacts.
- Keep a large and diverse catalog: minimum 15 fixtures spanning success and failure scenarios.

### Existing fixtures (retain and expand usage)
- `backend/`
- `frontend/`
- `content/`
- `full/`
- `backend-codegen/`
- `backend-language-server/`
- `backend-language-server-e2e/`
- `backend-external-agent/`
- `backend-mcp-tools/`
- `backend-static-router/`
- `backend-worker-failure-api-version/`
- `backend-worker-failure-missing-method/`
- `frontend-topnav/`
- `metadata-mismatch-id/`
- `metadata-mismatch-version/`
- `scope-shadowing/`

### New fixtures added
- `frontend-errors/`: intentionally invalid frontend registrations (duplicate ids, bad payloads) for deterministic validation assertions.
- `backend-worker-failure-transport/`: worker transport-loss fixture for deterministic transport error assertions.
- `backend-worker-failure-timeout-startup/`: startup timeout fixture.
- `backend-worker-failure-timeout-register/`: register timeout fixture.
- `metadata-mismatch-layout/`: archive-layout ambiguity fixture for `PLUGIN_SOURCE_AMBIGUOUS_PLUGIN_ROOT`.

### Fixture contract rules
- Each fixture gets a short `README.md` with:
- purpose
- capability list
- expected behavior in `ide`
- expected blocked behavior in `share`/`app`
- one manual smoke command block
- Keep fixture ids stable so tests and manual docs do not drift.
- Maintain category coverage in the fixture set:
- backend success (`registerRouter`, `registerStaticDir`, `registerMcpTools`, `registerLanguageServer`, `registerExternalAgentAdapter`, `registerCodegenTarget`)
- frontend success (sections, panes, commands, top-nav)
- content-only success
- full-stack success
- deterministic failure fixtures (metadata mismatch, frontend registration invalid, worker handshake/timeout/transport)
- scope/precedence fixtures (`workspace`, `environment`, `global`, shadowing)

## Test matrix (feature -> required coverage)

### Discovery, scope, precedence, and state
- Unit: manager discovery ordering, shadowing, enablement precedence, `pending_restart` transitions.
- Integration: `/api/plugins/list`, `/api/plugins/status`, and CLI `setta plugins list` consistency.
- Playwright: Plugins pane shows scope/source/shadowing diagnostics.
- Manual: link same id into multiple scopes and verify active source selection.

### Install lifecycle (`install`, `uninstall`, `update`, `rollback`, `link`, `unlink`, `pin`)
- Unit: source parsing, atomic install behavior, history metadata, rollback unavailable paths.
- Integration: router + CLI commands across scopes and installer backends (`auto|pip|uv`).
- Playwright: source-based install form, install confirmation, update/rollback buttons, package-manager managed disabling.
- Manual: run fixture install/update/rollback loop from CLI and UI.

### Restart semantics
- Unit: backend mutation -> `pending_restart`, cleared after load.
- Integration: `/api/plugins/restart-capability`, `/api/plugins/restart`, CLI `restart-required`.
- Playwright: banner and Plugins pane manual/programmatic restart paths.
- Manual: backend plugin link, verify pending state, restart, verify active.

### Backend worker RPC and dependency runtime
- Unit: handshake validation, required method checks, timeout mapping, runtime marker/dependency setup.
- Integration: load backend fixture plugin that registers router/MCP/LSP/codegen/external agent.
- Playwright: end-to-end surface checks for deeper integrations.
- Manual: inspect status entries and call registered behaviors.

### Capability gating by mode
- Unit: requested/effective/blocked capability derivation.
- Integration: blocked host API calls emit `PLUGIN_CAPABILITY_DENIED`.
- Playwright: Share-mode status/UX shows blocked capability reasons.
- Manual: run same fixture in `ide` and `share` and compare.

### Frontend runtime registration and lazy loading
- Unit: registration validation errors, API version mismatch, duplicate id handling.
- Integration: list/status payloads feed runtime store correctly.
- Playwright: pane/command/top-nav/section registration visible in UI.
- Manual: reload/runtime rescan and verify plugin JS/CSS updates.

### Plugin sections
- Unit: create-menu section kind projection, fallback reason selection.
- Integration: backend/frontend type roundtrip for `SectionType.Plugin`.
- Playwright: render plugin section, disable plugin, verify fallback card actions.
- Manual: add plugin section from UI and edit data.

### Config schema UX
- Unit: schema validation and invalid config errors.
- Integration: `/api/plugins/config` with schema and persistence.
- Playwright: settings-project config editor flow.
- Manual: save invalid/valid config and verify diagnostics.

### Deeper integrations (Phase 5 scope)
- LSP:
- Unit/integration: registration payload validation and duplicate handling.
- Playwright: diagnostics/completions/settings flow.
- External agents:
- Unit/integration: adapter schema validation and availability in runner routes.
- Playwright: adapter visible/selectable in AI settings.
- Codegen:
- Unit/integration: target registration and generation payload validation.
- Playwright: target visible in run instructions and selectable.

### Lockfile workflows
- Unit: write/apply/check planning correctness.
- Integration: CLI `setta plugins lock write/apply` behavior.
- Manual: generate lockfile and apply in clean workspace.

### Provenance/trust/digest
- Unit: digest generation and metadata persistence.
- Integration: list/status/install response fields.
- Playwright: install confirmation trust/provenance summary.
- Manual: inspect plugin card/source digest after install.

## Frontend performance coverage (new requirement)
- Add plugin-section large DOM guardrails:
- Vitest: structural checks for renderer mount/update churn where feasible.
- Playwright: scenario with 100+ plugin sections and assertions on responsiveness-safe signals (bounded update fanout, no crashes, deterministic interactions).
- DevTools profiling protocol for refactors touching plugin render path:
- baseline trace
- post-change trace
- append report to `perf/`

## Manual testing workflow (fixture-driven)

### Developer workflow objective
A developer should be able to manually test plugin features in under 10 minutes without creating ad hoc plugins.

### Implemented helper scripts
- `scripts/plugin-fixtures/link.sh <fixture> [--scope workspace|environment|global]`
- `scripts/plugin-fixtures/unlink.sh <plugin-id> [--scope ...]`
- `scripts/plugin-fixtures/reset.sh` (clears linked fixture plugins from all scopes in the active test workspace)
- `scripts/plugin-fixtures/smoke.sh`:
- links core fixture set
- runs `setta plugins rescan`
- prints direct checklist URLs/routes and expected UI checks

### Manual smoke checklist (first version)
- Backend fixture linked, shows `pending_restart`, then active after restart.
- Frontend fixture pane/command/top-nav/section all visible and functional.
- Share-mode blocked capability messaging visible for backend-only capabilities.
- LSP fixture: settings save + diagnostics + completion.
- External-agent fixture: adapter visible/selectable.
- Codegen fixture: target visible/selectable.
- Disable frontend plugin and verify section fallback card appears.

## Test organization and ownership
- Backend manager/worker tests remain under `tests/plugins/`.
- Backend API/CLI/MCP integration tests remain under:
- `tests/routers/`
- `tests/start/`
- `tests/mcp/`
- Frontend runtime/component tests remain colocated (`*.test.tsx` / `*.test.ts`).
- Playwright plugin flows remain under `frontend/tests/e2e/overview/` with a shared `plugins/` helper module.
- Fixture documentation ownership: plugin-platform maintainers update `tests/fixtures/plugins/README.md` plus per-fixture READMEs.

## Implementation phases

### Phase A: Fixture catalog hardening
- Add missing fixtures listed above.
- Add per-fixture READMEs with manual commands and expected behavior.
- Add shared helper utilities for linking/unlinking fixtures in tests.

### Phase B: Backend coverage completion
- Fill unit/integration gaps called out in matrix:
- metadata mismatch assertions
- static dir/router explicit tests
- MCP multi-tool registration tests
- lockfile CLI integration coverage
- Ensure deterministic assertions for all plugin error codes currently emitted.

### Phase C: Frontend and Playwright coverage completion
- Add top-nav-focused Playwright flow.
- Add config-editor Playwright flow in settings project context.
- Add digest cache-busting test coverage.
- Add large-DOM plugin section performance guard tests.

### Phase D: Manual smoke tooling
- Implement fixture helper scripts.
- Add `docs/guides/plugin-fixture-manual-smoke.md` that uses helper scripts and expected checks.

### Phase E: CI gates and enforcement
- Add a plugin coverage checklist to PR template (or CI summary) requiring touched feature -> updated test mapping.
- Add a lightweight test index document mapping feature -> exact test file(s).

## Completion gates
- Every plugin capability has explicit automated coverage for allowed/blocked behavior.
- Every user-visible plugin feature has at least one Playwright test.
- Manual smoke can be run from fixture scripts without custom setup.
- New plugin bugs should require adding a reproducing fixture test before merge.
- Coverage map document exists and is kept current with fixture catalog.

## Future work
- Add digest cache-busting coverage (unit + Playwright) for frontend plugin asset refresh behavior.
- Add CI/PR enforcement for plugin coverage mapping (feature touched -> tests updated).
- Add a lightweight coverage index document mapping plugin features to exact test files.
- Expand per-fixture README contract to include explicit `ide` vs `share`/`app` behavior blocks for every fixture.
- Add DevTools performance baseline/post-change trace workflow documentation with append-only reports under `perf/`.
