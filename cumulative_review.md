## 2026-03-13 23:31:18 PDT

### Scope

Consolidated and implemented the findings from the top-level `review*.md` docs. The work focused on state-machine correctness, linked prompt consistency, API cleanup, and missing regression coverage.

### Implemented fixes

- Share-session run isolation:
  - State machine run lookup, signal reporting, reset, and websocket update routing now consistently include `shareSessionId`.
  - Share-scoped runs now fail fast when request scope is missing or mismatched instead of silently falling back to global state.
  - MCP signal reporting now threads `runId` and `share_session_id` correctly through request metadata.

- Prompt source-of-truth cleanup:
  - Linked prompt validation now resolves the live linked prompt template during state-machine edge validation instead of relying on stale section snapshots.
  - Prompt preview rendering now uses the same resolution/rendering pathway as runtime, including missing-variable and render-error handling.
  - Updating a prompt template now refreshes all linked prompt sections in loaded project configs so preview state stays synchronized.

- Signal gate correctness:
  - Signal-filtered edges remain viable while a signal-capable child chat run is still active.
  - Mixed completion/signal gate analysis no longer prematurely blocks and fails workflows while a matching signal could still arrive.

- Reset semantics:
  - Machine runs now track which chat sections they touched.
  - Reset clears machine-owned chat bindings before returning the machine to idle so reruns start from a clean thread state.

- Route/error cleanup:
  - `setPromptTemplateLink` now uses the same structural-write HTTP error translation as the other project-manager routes.
  - Linking a non-prompt section now returns a deterministic client error instead of mutating invalid state.

- Dead surface removal:
  - Removed the obsolete `setPromptInputs` write route and its generated frontend/backend surfaces.
  - Updated affected tests to stop depending on that dead path.

### Code shape improvements

- Simplified run identity handling in the state-machine runner by centralizing share-session resolution and comparison.
- Kept prompt resolution logic in focused helpers instead of duplicating rendering decisions in the UI and backend validation paths.
- Simplified the Playwright workflow control test so graph-editing coverage and run-control coverage are both deterministic.

### Tests added or updated

- Backend:
  - Added prompt-template-link route coverage for missing template ids, non-prompt sections, and linked preview refresh.
  - Added state-machine tests for:
    - share-session isolation
    - linked prompt runtime dispatch against live template content
    - signal-gate waiting while source chat runs
    - reset clearing machine-owned chat state
  - Added validation coverage proving send-prompt edges validate against live linked prompt templates.
  - Added MCP tool coverage for run-id and share-session propagation in signal reporting.

- Frontend:
  - Updated prompt preview component tests to assert missing-variable UI and no-rendered-output fallback behavior.
  - Updated Playwright coverage for linked prompt preview refresh after prompt template updates.
  - Updated workflow Playwright coverage to remove dependence on the deleted prompt-input route and to keep run-control assertions deterministic.

### Verification

- `source activate.sh && ./scripts/run_backend_tests.sh tests/types/test_helpers_lvl2.py tests/types/test_state_machine_edges.py tests/routers/test_state_machine_run_routes.py tests/routers/test_mcp_tools_call_agentic_scope_enforcement.py tests/routers/test_prompt_template_link_routes.py`
  - Result: `107 passed`

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/PromptArea.test.tsx`
  - Result: passed

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/prompt-section.spec.ts frontend/tests/e2e/sections/state-machine-sections.spec.ts`
  - Result: `8 passed`

- CDP visual verification:
  - Verified on an isolated dev instance because the existing shared dev instance was serving stale code.
  - Confirmed that a linked Jinja prompt preview shows `Missing variables: name` and `No prompt rendered yet.`
  - Confirmed that updating the linked template to `Hello there.` updates the preview immediately.

### Notes

- The existing dev instance on `3099/8099` was stale during visual verification and did not reflect the new prompt preview behavior. An isolated instance on `62112/62111` was used for the final CDP check instead.
