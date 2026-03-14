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

## 2026-03-14 00:40:23 PDT

### Scope

Implemented the remaining review-driven fixes across the workflow runner, prompt-template linkage rules, workflow authoring UI, and stale `/getLLMResponse` helper surface. This pass also added the missing regression coverage and verified the affected workflow UI states in Playwright and CDP.

### Implemented fixes

- Workflow snapshot execution:
  - State-machine runs now serialize and persist an execution snapshot at start time.
  - Refresh, child completion processing, signal routing, and workflow event labelling now resolve against that snapshot instead of the live draft.
  - Editing the draft after a run starts no longer changes the graph that the active run executes.

- Reset ownership semantics:
  - Removed the old `touchedChatSectionIds` bookkeeping.
  - Runs now record `ownedChatBindingsBySectionId`, which only tracks chat ids the workflow actually created or rebound.
  - Reset clears only chat bindings that still match the workflow-owned thread, so manually-switched or reused chat bindings are preserved.

- Signal scope hardening:
  - `report_state_machine_signal` now requires an active child run and rejects calls that only provide `machineRunId`.
  - Child-run context is now the authoritative source for signal origin, with `machineRunId` used only as a consistency check.
  - This closes the path where unrelated chats or tools could inject workflow signals.

- Gate and liveness correctness:
  - Draft validation now counts only real `StateMachineEnd` sections as workflow ends; gates no longer mask missing-end warnings.
  - Runtime liveness analysis no longer treats already-consumed terminal child outcomes as future progress.
  - Blocked-gate state is preserved correctly after the run fails, and the runner now distinguishes deterministic `run_blocked` from `run_stalled`.
  - Cancelled child runs are now included in terminal analysis so workflows do not stay `running` forever with no reachable next step.

- Prompt-template source of truth:
  - State-machine send-prompt edges now validate `promptTemplateId` existence at write time.
  - Linked prompt section resolution no longer falls back to stale section snapshots when the template is missing; it fails fast instead.
  - Prompt template deletion is now rejected when a workflow edge still references that template.
  - The prompt UI now shows a broken-link message with empty source text instead of rendering stale prompt content.

- Share-session workflow isolation:
  - Frontend workflow run selection and polling now include `shareSessionId`.
  - Deployment/share surfaces now resolve workflow badges and latest-run state from the correct share session only.

- Dead AI router path removal:
  - Removed the obsolete router-local helper stack from `backend/setta/routers/ai.py`.
  - Helper tests were moved onto `ManagedChatDispatcher`, which is now the single runtime path for managed chat dispatch behavior.

### Code shape improvements

- Simplified the runner around explicit snapshot models and section-kind enums instead of repeatedly reaching back into live project state during execution.
- Replaced broader “touched section” reset behavior with narrower, explicit ownership tracking that matches the user-visible contract.
- Reduced duplicated AI routing logic by deleting the superseded helper layer rather than maintaining parallel implementations.
- Kept the new validation paths explicit: missing prompt links now error directly instead of hiding the inconsistency behind fallback behavior.

### Tests added or updated

- Backend:
  - Added state-machine runner coverage for:
    - preserving manual chat switches on reset
    - preserving reused current-thread bindings on reset
    - using the start-time workflow snapshot after later draft edits
    - failing stalled workflows with no reachable future path
    - keeping valid `Gate -> Chat` flows alive after gate activation
    - rejecting signal reports without an active child run
  - Added prompt-template route and resolution coverage for:
    - blocking template deletion while referenced by workflow edges
    - rejecting missing prompt-template ids during workflow edge writes
    - raising on missing linked templates during dependency-graph and agentic-context resolution
  - Updated AI helper tests to target `ManagedChatDispatcher` helpers instead of the deleted router-local copies.

- Frontend:
  - Added draft-validation coverage proving `Start -> Gate` without any `End` still warns.
  - Added workflow run selector coverage proving deployment mode filters by the active `shareSessionId`.
  - Added prompt-area coverage proving broken linked templates clear stale editor text and show the repair message.

- Playwright:
  - Extended workflow section coverage to assert that a `Start -> Gate` workflow still shows the draft warning before any real `End` section is configured.

### Verification

- `source activate.sh && pytest tests/routers/test_state_machine_run_routes.py tests/routers/test_prompt_template_link_routes.py tests/code_gen/test_dependency_graph_prompt.py tests/agentic/test_agentic_context_payload.py tests/routers/test_mcp_tools_call_agentic_scope_enforcement.py tests/routers/test_ai_agent_run_chats.py tests/routers/test_ai_app_generation_mode.py`
  - Result: `148 passed`

- `pnpm -C frontend exec vitest run src/state/actions/stateMachineDraftValidation.test.ts src/state/actions/stateMachineRuns.test.ts src/components/Section/Layouts/PromptArea.test.tsx src/components/Section/Layouts/StateMachineNodeArea.test.tsx`
  - Result: `26 passed`

- `./scripts/run-playwright-e2e.sh tests/e2e/sections/state-machine-sections.spec.ts`
  - Result: `7 passed`

- `source activate.sh && ruff check backend/setta/agentic/state_machine_runner.py backend/setta/agentic/agentic_context.py backend/setta/agentic/managed_chat_dispatch.py backend/setta/code_gen/dependency_graph.py backend/setta/mcp/tools/agentic_tools.py backend/setta/project_state/base_project_manager.py backend/setta/routers/agentic.py backend/setta/routers/ai.py backend/setta/types/helpers_lvl2.py backend/setta/types/prompt_section_resolution.py tests/agentic/test_agentic_context_payload.py tests/code_gen/test_dependency_graph_prompt.py tests/routers/test_ai_agent_run_chats.py tests/routers/test_ai_app_generation_mode.py tests/routers/test_mcp_tools_call_agentic_scope_enforcement.py tests/routers/test_prompt_template_link_routes.py tests/routers/test_state_machine_run_routes.py`
  - Result: all checks passed

- `pnpm -C frontend exec prettier --write src/state/actions/stateMachineRuns.ts src/state/actions/stateMachineRuns.test.ts src/state/actions/stateMachineDraftValidation.test.ts src/state/actions/stateMachineDraftValidation.ts src/components/Section/Layouts/PromptArea.test.tsx src/components/Section/Layouts/PromptArea.tsx src/components/Panes/UiEditor/StateMachineEdgeInspector.tsx src/components/Panes/UiEditor/SectionConfig/PromptSettings.tsx src/utils/promptSectionSource.ts tests/e2e/sections/state-machine-sections.spec.ts`
  - Result: formatting applied cleanly

- CDP visual verification:
  - Verified on the live dev instance at `3099/8099`.
  - Created a temporary `Start -> Gate` workflow graph against the running backend and confirmed the draft-warning badge renders on both the start and gate nodes while no `End` exists in the machine group.
  - Removed the temporary project after verification.
