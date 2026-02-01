# App Mode Test Plan

## Summary
Add backend, frontend unit, and Playwright coverage for the existing App mode surface, plus optional TDD-style tests for missing features (data bindings, policy enforcement, routing). This plan favors minimal, actionable tests that mirror existing patterns in the repo and avoid reliance on `setta_files`.

## Goals
- Validate app spec storage and deployment snapshotting on the backend.
- Validate core App renderer behavior (empty spec, run gating) on the frontend.
- Validate App Config pane flow and preview in IDE mode with Playwright.
- Provide clear TDD targets for remaining gaps (bindings, policy enforcement, routing).

## Non-Goals
- Implement new App mode features (bindings/actions/routing) in this plan.
- Add UI redesign or new catalog components.

## Proposed Tests (Should Pass Now)

### 1) Backend: App spec storage unit tests
- **File:** `tests/app/test_spec_store.py`
- **Targets:** `backend/setta/app/spec_store.py`
- **Examples:**
  - `write_app_spec` + `read_app_spec` round-trip with `app_specs/<config>.json`.
  - `normalize_app_spec_path` returns a project-relative `app_specs/...` path.
  - Writing outside `app_specs` raises `ValueError`.
- **Notes:** use `TemporaryDirectory` and `DBE` for isolated file ops.

### 2) Backend: App deployment publish integration tests
- **File:** `tests/routers/test_app_deployments.py`
- **Targets:** `backend/setta/routers/app_deployments.py`
- **Examples:**
  - Missing `appConfig` or `appSpecPath` returns 400.
  - App spec file is copied into `<deploymentRoot>/app_specs/...`.
  - `project.json` has rebased `appSpecPath`.
  - `manifest.json` has `deploymentType == app`.
  - `share_policy.json` reflects overrides.
- **Notes:** pattern after `tests/routers/test_share_deployments.py`.

### 3) Frontend: AppRenderer unit tests
- **File:** `frontend/src/components/App/AppRenderer.test.tsx`
- **Targets:** `frontend/src/components/App/AppRenderer.tsx`
- **Examples:**
  - `appSpec = null` shows “No app spec found”.
  - Minimal UITree renders a `Run` button.
  - `allowRun=false` disables run button and shows disabled reason.
- **Notes:** mock `route_run_code` like other unit tests.

### 4) Playwright: App Config pane + preview
- **File:** `frontend/tests/e2e/overview/app-config-pane.spec.ts`
- **Targets:** `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`
- **Flow:**
  - `ensureAppReady(page)`
  - Navigate to Overview → App tab.
  - Click `Create Default` then `Save`.
  - Assert notification “App spec saved.”
  - Toggle preview and assert App UI elements appear.
- **Notes:** uses IDE mode and existing auth flow.

## TDD Targets (Expected to Fail Until Implemented)

### A) Data bindings via JSON Pointer
- **File:** `frontend/src/components/App/AppRenderer.dataBindings.test.tsx`
- **Target behavior:**
  - `appConfig.dataBindings` maps JSON Pointer paths to Setta params.
  - UI components bound by `dataPath` read/write values.

### B) Policy enforcement beyond run
- **File:** `frontend/src/components/App/AppRenderer.policy.test.tsx`
- **Target behavior:**
  - `allowParamChanges=false` disables ParamInput.
  - `allowExternalLinks=false` blocks link navigation.
  - `allowFileDownloads=false` disables download actions.

### C) Multi-page app routing
- **File:** `frontend/tests/e2e/app/app-mode-routing.spec.ts`
- **Target behavior:**
  - `appConfig.routes` maps `/results` to a different UITree root.
  - Navigating to `/results` renders the correct page.

### D) App-mode deployment smoke test
- **File:** `frontend/tests/e2e/app/app-mode-load.spec.ts`
- **Target behavior:**
  - App deployment loads at `/` with “App Mode” header.
  - Run gating works in app deployment runtime.
- **Notes:** requires running `setta app` against a prepared deployment.

## Test Execution
- Backend: `./scripts/run_backend_tests.sh`
- Frontend unit: `pnpm -C frontend exec vitest run <path>`
- Playwright: `./scripts/run-playwright-e2e.sh`

## Open Questions
- Should TDD tests be committed as skipped (`test.skip`/`test.fixme`) or only when implementation begins?
- Do we want a dedicated Playwright helper for app deployments (since `ensureAppReady` waits for the IDE canvas)?
