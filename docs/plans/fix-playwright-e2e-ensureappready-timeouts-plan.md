# Fix Playwright E2E ensureAppReady timeouts

## Context
- `tests.log` shows 11 Playwright failures, all throwing from `frontend/tests/e2e/helpers.ts::ensureAppReady()`:
  - `tests/e2e/sections/section-sizing.spec.ts` (3 tests)
  - `tests/e2e/settings/*.spec.ts` (8 tests)
- The error-context snapshots only show the header logo link to `/home`, which strongly suggests the project page never finishes loading (stuck in `projectIsLoading`), so `.react-flow__pane` never appears.

## Working Hypotheses
1. **Project state bloat**: repeated create/delete cycles leave behind unused code objs / variants / impls, making `/api/loadProjectConfig` progressively heavier until the UI load exceeds `ensureAppReady`’s timeout.
2. **Invalid early backend writes**: the frontend can send viewport/layout updates while `projectConfig.id === "null"`, producing backend 500s and potentially degrading stability/perf.
3. (Lower confidence) **Auth/session drift**: auth cookie is present but invalid mid-run; would usually show up as 401s.

## Plan
1. Reproduce the failure locally
   - Run `./scripts/run-playwright-e2e.sh tests/e2e/sections/section-sizing.spec.ts` to confirm the “passes then ensureAppReady starts failing” pattern.
   - Inspect the generated backend logs to see whether the project load stalls around `/api/loadProjectConfig` (and whether follow-up calls like listener coverage / diagnostics stop happening).
2. Stop sending backend ops with the placeholder project id
   - Add guards in frontend state actions so `route_set_viewport` and `route_set_top_level_section_layout` do not fire when `projectConfigId === NULL_PROJECT_CONFIG_ID`.
3. Garbage-collect unused code objs when sections are deleted
   - In `backend/setta/types/helpers_lvl2.py::delete_sections`, after removing sections/variants/impls, compute the set of reachable code objs and delete all unused code objs via `delete_code_obj`.
   - Add a focused backend unit test under `tests/project_state/` that:
     - Creates a section that allocates code objs (e.g. `Dict` + `add_kwarg`)
     - Deletes the section
     - Asserts code obj counts return to baseline (no unbounded growth).
4. Verification
   - Run the new backend test (and `./scripts/run_backend_tests.sh` if needed).
   - Re-run the failing Playwright specs:
     - `tests/e2e/sections/section-sizing.spec.ts`
     - `tests/e2e/settings/autobackup-default.spec.ts`
     - `tests/e2e/settings/new-config-initial-view.spec.ts`
     - `tests/e2e/settings/settings-tab-persistence.spec.ts`
     - `tests/e2e/settings/settings-view-modes.spec.ts`
     - `tests/e2e/settings/titlebar-theme-color.spec.ts`
     - `tests/e2e/settings/view-mode-url-sync.spec.ts`
5. If timeouts persist
   - Decouple non-critical “post-load” fetches (listener coverage / AI follow snapshot / LSP diagnostics) from the blocking project-load path so the editor renders as soon as the project state is available.

