# Fix Full Test Suite Failures (2026-02-09)

## Context
`tests.log` shows:
- Backend `pytest`: 7 failures (plus warnings).
- Frontend `vitest`: all passing.
- Playwright E2E: fails during `global-setup.ts` with `page.waitForURL` timing out.

## Goals
1. Make the backend `pytest` suite green again.
2. Make Playwright E2E global setup robust to bootstrap redirects (query params).
3. Keep behavior aligned with production expectations (especially path normalization + session detection).

## Plan
### 1) Fix backend pytest failures
#### A. Add `deployment_mode` to test state stubs
Problem:
- Several tests create `app.state.setta = SimpleNamespace(share_mode=...)`.
- Production `SettaFastAPIState` now requires/uses `deployment_mode`; stubs missing it raise `AttributeError`.

Edits:
- Update the following tests/helpers to include `deployment_mode`:
  - `tests/auth/test_auth_bootstrap_integration.py` (IDE mode: `deployment_mode=False`)
  - `tests/routers/test_launch_share_mode_block.py` (share mode implies deployment: `deployment_mode=True`)
  - `tests/routers/test_detached_workspace_root_paths.py` (`_ide_runtime_context`: `deployment_mode=False`)

Verification:
- Run the failing tests directly (3 files above).

#### B. Fix `TestArtifactWatchPaths::test_includes_valid_paths`
Problem:
- Test currently uses a workspace-relative string (`"setta_files/artifacts/test.png"`), but `Artifacts` normalizes paths and returns a normalized/absolute `Path`.
- Assertion expects a relative `Path`, causing mismatch (and also exposes a duplicated `setta_files/` join when mixed semantics are used).

Edits:
- Update `tests/project_state/test_artifacts_watch_paths.py` to:
  - Use `temporary_setta_paths(setta_files_root=...)` so the test never references the real workspace `setta_files/`.
  - Use an absolute artifact id rooted at `C.ARTIFACTS_FOLDER` and assert against that resolved `Path`.

Verification:
- Run `pytest tests/project_state/test_artifacts_watch_paths.py -k includes_valid_paths`.

#### C. Fix `backups restore` session-running check
Problem:
- `backups_restore` checks for running sessions using `resolve_sessions_root(Path.cwd())`, which ignores the configured `C.RUNTIME_SESSIONS_FOLDER`.
- The test patches `C.RUNTIME_SESSIONS_FOLDER` and expects restore to refuse; current code checks the wrong directory and proceeds.

Edits:
- In `backend/setta/start.py` `backups_restore`:
  - Use `SessionRegistry()` so the registry uses the configured sessions root (`C.RUNTIME_SESSIONS_FOLDER`).
  - Use `get_setta_paths().workspace_root` when calling `find_sessions_by_workspace(...)` so the lookup respects `SETTA_WORKSPACE_ROOT`.

Verification:
- Run `pytest tests/start/test_start_backups.py -k refuses_when_session_running_unless_forced`.

### 2) Fix Playwright E2E global setup timeout
Problem:
- Bootstrap redirects to the frontend with a query parameter `?__setta_backend_origin=...`.
- `global-setup.ts` calls `page.waitForURL(PROJECT_URL)` where `PROJECT_URL` is usually the bare base URL; strict URL matching fails when query params are present.

Edits:
- Update `frontend/tests/e2e/global-setup.ts` to wait for:
  - Same `origin` + `pathname` as `PROJECT_URL`, ignoring `search`/`hash`.
  - A React-mount signal that is not present in static `index.html` (wait for `.setta-titlebar-offset`).
  - Capture browser `pageerror` + console `error` output on failures so E2E bootstrap issues are actionable.

### 2b) Ensure the frontend actually mounts in E2E
Problem:
- The E2E "app ready" checks are failing across many specs when the React app never mounts (no `.react-flow__pane`).
- `frontend/index.html` is the dev-server entrypoint; if it points at the wrong module, Playwright will only see the static `<main class="app-shell" ...>` skeleton.

Edits:
- Fix `frontend/index.html` to load the real entry module (`/src/index.tsx`).
- Export the missing `normalizeBrowserPath` helper from `frontend/src/utils/browserPaths.ts` (runtime ESM import failure prevented React from mounting).
- Hardening:
  - Make `ensureAppReady` always include `__setta_backend_origin` on initial navigation to remove dependence on storage/session persistence.
  - Improve `ensureAppReady` error output by capturing `pageerror` + console `error` logs.

### 2c) Fix the remaining Playwright failure (image file open)
Problem:
- After E2E started running, one test still failed:
  - `browser opens image files in image sections on double click`
- The file browser API returns absolute `fullPath` values, so `openFileInImageSection` persists absolute `imagePath` values; the test incorrectly expected a workspace-relative string.

Edits:
- Update `frontend/tests/e2e/file-browser/browser-filters.spec.ts` to:
  - Expect absolute paths, and compare paths using the existing `normalizePathForComparison` helper (handles `/private` prefix + separator normalization).

Verification:
- Run Playwright via `./scripts/run-playwright-e2e.sh` (or the same command used by `./t.sh`).

### 3) Final verification
- Re-run the previously failing pytest set:
  - `pytest tests/auth/test_auth_bootstrap_integration.py tests/routers/test_detached_workspace_root_paths.py tests/routers/test_launch_share_mode_block.py tests/project_state/test_artifacts_watch_paths.py tests/start/test_start_backups.py`
- Then run Playwright E2E again.

## Results (Completed)
- Backend: `./scripts/run_backend_tests.sh` -> `1484 passed, 70 skipped` (2 warnings).
- Frontend unit tests: `pnpm -C frontend exec vitest run` -> all passing.
- Playwright: `./scripts/run-playwright-e2e.sh` -> `127 passed`.
