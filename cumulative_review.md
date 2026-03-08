## 2026-03-11 08:22:43 PDT

Implemented the remaining current review fixes for MCP run-start reservation scoping, project-chat thread rebinding under share/deployment permissions, standalone window-space same-layout hydration, git-graph canvas admission, and project-chat surface state authority. Verified the affected paths with backend pytest, frontend Vitest, focused Playwright, and live CDP checks.

Request-scoped MCP run-start authorization:
- Replaced the single pending MCP run-start reservation per session with request-scoped pending authorization keyed by `request_id`.
- `authorize_pending_mcp_run_start(...)`, `commit_pending_mcp_run_start(...)`, `rollback_pending_mcp_run_start(...)`, and pending-state lookup now all operate on the exact request that reserved the slot.
- Concurrent `startsRun` MCP calls sharing one session can no longer commit or roll back each other's reservation state.

Project-chat thread rebinding and permission separation:
- Added a dedicated backend/frontend route pair for project-chat window `chatId` rebinding instead of sending thread switches through the full layout snapshot mutation.
- The new `setProjectChatWindowChatId` path is guarded by `allowLLM`, while full layout mutations remain guarded by layout-edit permissions.
- Refactored the frontend project-chat windowing mutation queue so each optimistic mutation carries its own send function, which keeps the chat-id path and the layout path explicit instead of branching deep inside one generic persistence routine.

Standalone hydration and git-graph canvas invariants:
- Simplified same-layout standalone window-space hydration so it starts from the freshly hydrated authoritative window and preserves local fields only when the local standalone tab actually diverged from the previously hydrated value.
- Added explicit `zIndex` merge behavior: saved z-order wins unless the standalone tab itself restacked that window locally.
- Prevented git-graph windows from entering canvas state in both the state helpers and the dock/maximized UI affordances. Git graph no longer exposes `Show in canvas`, and internal helpers now return early instead of creating an unsupported canvas representation.

Project-chat persisted UI state cleanup:
- Removed local shadow state for aux-view and thread-visibility preferences in `ProjectChat`.
- `projectChatAuxView`, thread visibility, and large-width thread-closure preference now read from and write back to the existing stores directly, so remounts and multi-surface views use one authoritative state source.
- This removes the stale remount behavior where toggles appeared to work locally but snapped back to older persisted values later.

UX before vs after:
- Before: two concurrent MCP tool invocations in one session could interfere with the same pending run reservation. After: each invocation owns its own reservation lifecycle.
- Before: read-only/share deployments could allow chat access but still route thread switches through a layout-protected endpoint, causing chat rebinding to fail or revert. After: thread switching follows chat permission, while drag/resize/layout mutations remain blocked separately.
- Before: already-open standalone window-space tabs could ignore updated saved z-order during same-layout hydration. After: saved stacking changes appear unless the local standalone tab intentionally diverged.
- Before: git graph surfaced a canvas action that the canvas renderer did not support. After: the unsupported action is not representable in the UI or helper path.
- Before: project-chat aux/thread UI state had split local-vs-persisted authority and could restore stale values on remount. After: remount and reload behavior matches the stored state.

DX before vs after:
- Before: MCP run-start bookkeeping mixed session scope and request scope, which made concurrency reasoning brittle. After: pending authorization data matches the actual request lifecycle.
- Before: project-chat thread rebinding was entangled with layout persistence. After: chat-intent mutations and layout-intent mutations are separate routes with separate permission boundaries.
- Before: standalone hydration rules were partial and field-specific in a way that obscured why saved values sometimes lost to local ones. After: the merge rule is explicit: hydrate first, then preserve only true local divergence.
- Before: `ProjectChat` duplicated persisted state locally, which made ownership unclear in tests and in code. After: state authority is explicit and easier to follow.

Verification:
- `source activate.sh && pytest tests/routers/test_share_policy_routes.py tests/routers/test_mcp_tools_call_runtime_policy.py tests/project_state/test_project_chat_windowing_persistence.py tests/mcp/test_run_start_authorization.py tests/types/test_project_chat_windowing.py` passed: 66 tests.
- `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/projectChatWindowing.test.ts src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx` passed: 75 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/layout/project-chat-layout-permissions.spec.ts frontend/tests/e2e/git/git-graph-overlay-core.spec.ts frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "read-only deployments keep visible project chat windows focusable without layout controls|git graph does not expose a canvas move action|standalone window spaces adopt same-layout saved chat and git updates without navigation"` passed: 3 tests.
- CDP verification on the running dev app confirmed that the live git-graph maximized window no longer exposes a canvas action and that a live standalone `/windowspace/:slug` route rendered saved windows with the expected saved `z-index` ordering.

## 2026-03-11 01:33:01 PDT

Implemented the remaining consolidated fixes from the current top-level reviews for transport-independent MCP runtime policy, project-state summary filtering, standalone saved window-space rehydration, and dead project-chat API cleanup, then verified the affected paths with backend pytest, Vitest, Playwright, and a live CDP browser check.

Shared MCP runtime-policy enforcement:
- Centralized `requiresLLM` and `startsRun` enforcement inside the shared Setta MCP tool dispatch path instead of splitting policy between the native MCP server and the `/__setta__/tools/call` router.
- Native MCP clients and HTTP bridge callers now go through the same admission contract for deployment/share `allowLLM`, `allowRun`, single-run-slot exhaustion, and pending-run reservation rollback.
- Added an explicit pending-run authorization query helper and moved reservation commit/rollback timing into one place. A tool that never actually starts a run no longer leaves the session in a reserved state.
- Removed the route-local duplicate policy wrapper from `backend/setta/routers/mcp_tools.py`, so the backend now has one authoritative dispatch path instead of two partially overlapping implementations.

Project-state summary and dead API cleanup:
- Fixed scoped project-state summaries so non-section saved windows are preserved verbatim. Section windows are still filtered by the allowed section ids, but project chat and git-graph windows no longer disappear from summaries just because the current scope excludes section content.
- Removed the dead specialized `/setProjectChatWindowChatId` backend endpoint and the associated request/helper types instead of carrying a second persistence contract for project-chat thread updates.
- Regenerated frontend and backend endpoint bindings after removing that route so the generated client/server surface matches the live API set.

Standalone window-space hydration correctness:
- Simplified same-layout standalone hydration so it explicitly compares the current local window against the previous hydrated window. Local state is only preserved when the local window actually diverged from the last hydrated value.
- Saved `chatId` updates now flow through to standalone project-chat windows when the user has not locally changed that window, and saved `embeddedGitPaneVisible` updates now do the same for standalone git-graph windows.
- Added a stable remount key for standalone project-chat surfaces keyed by the authoritative saved thread id, so React does not preserve stale nested chat state when the saved layout switches the window to another thread.

UX before vs after:
- Before: MCP runtime policy depended on transport. A deployment could block LLM or run access on the HTTP bridge while a native MCP client still executed the same tool. After: both transports fail closed under one shared policy boundary.
- Before: project-scoped summaries could report that a saved layout had no windows even when it still contained valid project-chat or git-graph windows. After: summaries keep those windows and only trim disallowed section-backed entries.
- Before: a standalone `/windowspace/:slug` tab could keep showing a stale project-chat thread or stale git-pane visibility after the same saved layout changed elsewhere. After: authoritative saved state rehydrates into that already-open tab unless the local standalone window intentionally diverged.
- Before: the codebase carried an unused chat-id persistence endpoint that suggested a second source of truth for project-chat thread syncing. After: the full windowing sync path is the only supported persistence contract.

DX before vs after:
- Before: understanding MCP tool admission required checking both route code and native server code, plus tool-local behavior. After: the runtime policy boundary is attached to tool metadata and enforced once in shared dispatch.
- Before: project-state summary rules disagreed with persisted window-space validity, which made tests and downstream consumers reason about two different models. After: summary filtering and persisted state follow the same window validity rules.
- Before: standalone hydration behavior was implicit and partial, with some fields refreshed and others accidentally preserved. After: the merge rules are field-aware and explicit, which makes the behavior easier to read and extend without reintroducing stale-state bugs.
- Before: generated endpoint code still reflected a superseded backend route. After: the generated bindings only expose the surviving contract.

Verification:
- `source activate.sh && pytest tests/routers/test_mcp_tools_call_runtime_policy.py` passed: 14 tests.
- `source activate.sh && pytest tests/routers/test_mcp_linked_chat_tool.py -k 'native_mcp_invoke_linked_chat_denials_are_transport_independent or tools_call_invoke_linked_chat_denies_deployment_runs_when_allow_run_is_false or tools_call_invoke_linked_chat_denies_second_deployment_run_when_multiple_runs_are_disabled or tools_call_invoke_linked_chat_rolls_back_reserved_deployment_run_when_binding_persistence_fails or tools_call_invoke_linked_chat_denies_managed_runs_when_llm_is_disallowed'` passed: 7 selected tests.
- `source activate.sh && pytest tests/types/test_project_state_summary_filter.py tests/mcp/test_mcp_agentic_project_state_summary_filtering.py tests/types/test_project_chat_windowing.py tests/routers/test_share_policy_routes.py -k 'test_filter_project_state_summary_trims_window_spaces_to_allowed_sections or test_get_latest_project_state_summary_filtered_by_scope_meta or section_chat_thread_binding_allowed_when_llm_allowed_and_layout_blocked'` passed: 3 selected tests.
- `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx src/state/actions/projectChatWindowing.permissions.test.ts` passed: 22 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep 'saved window spaces preserve distinct project chat threads per window in both workspace and standalone views|standalone window spaces adopt same-layout saved chat and git updates without navigation|standalone git graph windows keep git-pane visibility local to the standalone surface'` passed: 3 tests.
- CDP verification used the running dev app to open a live saved standalone window-space route, confirm both the standalone project-chat and git-graph windows rendered, and verify the affected standalone surface path directly in-browser.

## 2026-03-11 00:37:13 PDT

Implemented the remaining top-level review fixes for standalone managed-chat scoping, project-scoped project-chat stop/hydration, restore collision ownership, and MCP linked-chat runtime-policy centralization, then verified the changed paths with frontend unit/integration tests, backend pytest, Playwright, and CDP.

Standalone route authority and managed-chat gating:
- Standalone `llm_disallowed` state is now keyed by the full owning surface identity instead of a loose route bucket. The standalone project chat route, thread route, section route, and window-space route each derive a concrete owner key from `projectConfigId` plus the exact surface owner (`project-chat`, `chatId`, `sectionId`, or `windowSpaceId`).
- Same-tab navigation across projects no longer carries a stale blocked state into another project that happens to reuse the same thread id or route shape. The stale block clears automatically when the owner key changes, and reopens correctly when policy or hydration state allows it.
- Standalone `/windowspace/:slug` no longer applies managed-chat denial as an all-or-nothing page gate. Mixed window spaces now filter blocked managed windows individually while keeping scriptable section windows and git graph windows visible. The full-page `Managed Chat Unavailable` surface only appears when the saved window space contains windows but none remain renderable under the active managed-chat policy.

Project-chat stop/hydration scoping and restore ownership:
- External project-chat stop now resolves the active `projectConfigId` and threads that through run lookup and fallback hydration, instead of widening the lookup with `projectConfigId: null`. Reused project-chat ids in another project can no longer be stopped or rehydrated accidentally from the wrong project boundary.
- Floating window-space restore now treats restore collisions as logical-owner conflicts rather than raw `instanceId` conflicts. Restore supersession only happens when the restored floating window and an existing floating window represent the same owner, such as the same project-chat thread or the same section binding. If two layouts reuse an `instanceId` but point at different owners, the restored window is remapped to a fresh id instead of evicting the live one.
- Removed the dead `showProjectChatWindowForModeInState(...)` helper rather than keeping a second unused windowing API surface alive.

MCP runtime-policy cleanup and contract alignment:
- `invoke_linked_chat` now publishes `ToolRuntimePolicyMetadata(requiresLLM=True, startsRun=True)` so the tool definition is the source of truth for both LLM access and run-start requirements.
- Linked-chat execution now relies on the central pending MCP run-start contract that `/__setta__/tools/call` applies before dispatch. Tool-local admission code for `allowLLM`, `allowRun`, and rollback/commit timing was removed, and the tool now only commits or rolls back the centrally reserved run slot.
- Removed dead frontend `run_sub_agent` aliases from active tool classification and tests so the frontend runtime taxonomy matches the live backend contract instead of advertising a deleted tool path.

UX before vs after:
- Before: a standalone thread or project-chat route could keep showing `Managed Chat Unavailable` after same-tab navigation into another project that reused the same thread id, because the blocked state was stored too loosely. After: the blocked state belongs to the exact owning project/surface pair, so navigating to another project or owner clears the stale denial and rehydrates the new surface independently.
- Before: one managed project-chat window inside a standalone saved layout could collapse the entire standalone window-space page under `allowLLM=false`, hiding unrelated scriptable section chat and git graph content. After: only the blocked managed windows disappear; the remaining allowed windows stay visible and interactive.
- Before: stopping a project chat or resolving fallback hydration could cross project boundaries when two projects reused the same project-chat id. After: stop and hydration stay fail-closed to the active project.
- Before: restoring a saved floating layout could evict an unrelated live floating window just because both layouts reused the same `instanceId`. After: only true owner collisions supersede; unrelated live floating windows survive and the restored window gets a fresh instance id when needed.
- Before: MCP linked chat split policy knowledge between route metadata and tool-local checks, which made policy widening or refactors easy to get wrong. After: runtime policy is declared once on the tool and enforced centrally before dispatch.

DX before vs after:
- Before: standalone route correctness depended on a page-level blocked flag that did not encode enough ownership information to be trustworthy across route transitions. After: owner keys are explicit and local, which makes state reset behavior directly testable.
- Before: restore semantics mixed raw ids and logical ownership, so reasoning about whether a window should supersede or remap required following incidental `instanceId` reuse. After: restore collision behavior is expressed in owner-key terms that match the product model.
- Before: linked-chat policy enforcement lived partly in the route and partly in the tool body, and the frontend still carried dead sub-agent identifiers. After: the policy boundary is centralized and the frontend runtime labels only live tool ids, which makes future policy changes and debugging materially simpler.

Verification:
- `pnpm -C frontend exec vitest run src/components/Chat/sharePolicyChatAccess.test.ts src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/windowSpaces.test.ts` passed: 7 files, 190 tests.
- `source activate.sh && pytest tests/routers/test_mcp_linked_chat_tool.py -k 'denies_deployment_runs_when_allow_run_is_false or denies_second_deployment_run_when_multiple_runs_are_disabled or rolls_back_reserved_deployment_run_when_binding_persistence_fails or denies_managed_runs_when_llm_is_disallowed or denies_external_agent_managed_runs_when_llm_is_disallowed'` passed: 5 tests.
- `source activate.sh && pytest tests/mcp/test_tool_runtime_policy_metadata.py` passed: 1 test.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts -g 'same-tab standalone project chat navigation keeps llm_disallowed state scoped to the owning project config|deployment allowLLM=false keeps scriptable section and git graph surfaces available while blocking managed project chat windows'` passed: 2 tests.
- CDP verification created a disposable project on the live dev instance, seeded a mixed standalone window space under deployment mode with `allowLLM=false`, and confirmed the managed project-chat window was absent while the scriptable section window and git graph window remained visible with no full-page blocked fallback.

## 2026-03-10 23:39:37 PDT

Implemented the remaining consolidated review fixes for MCP HTTP tool runtime-policy enforcement, removed the superseded sub-agent wrapper path, and locked the policy boundary down with focused metadata and router coverage.

MCP tools-call policy authority:
- Added explicit runtime-policy metadata for discoverable Setta MCP tools. Tool annotations now carry `requiresLLM` and `startsRun`, so the tool definition itself is the source of truth for deployment/share policy requirements instead of the `/__setta__/tools/call` route guessing from tool names or relying on ad hoc tool-local checks.
- `/__setta__/tools/call` now enforces runtime policy centrally before dispatch. `requiresLLM` tools go through the same deployment/share LLM gate as the canonical HTTP routes, and `startsRun` tools go through the same run-start and single-run-slot enforcement path used by linked chat.
- Added pending MCP run-start authorization bookkeeping so run-start reservations are committed only after a tool actually starts a run, and rolled back automatically if the tool fails before start. This keeps session run counts correct for both normal multi-run deployments and single-run deployments that reserve a slot up front.

Agent-profile MCP tool cleanup:
- Marked `list_agent_profiles` and `get_agent_profile` as `requiresLLM`, closing the policy hole where `allowLLM=false` deployments could still enumerate profiles and read full profile definitions, including system prompts, through `/__setta__/tools/call`.
- Marked `run_agent_profile` as both `requiresLLM` and `startsRun`, so it now obeys the same `allowRun`, `allowMultipleRuns`, and `allowLLM` contract as the supported run-start surfaces.
- Simplified `run_agent_profile` to an explicit `start_run(...)` followed by `wait_for_run(...)`, with the MCP run-start authorization committed exactly when the run starts. Removed the now-dead `AgentRunner.run_sub_agent(...)` wrapper instead of leaving a second overlapping start/wait API behind.

UX before vs after:
- Before: deployment/share operators could disable LLM access or run access on the documented product surfaces, but the same session could still use `/__setta__/tools/call` to read agent profiles or start agent-profile runs through a less-protected path. After: those MCP HTTP calls fail closed with the same policy boundary as the canonical HTTP routes.
- Before: single-run deployments could end up with route-dependent behavior because the MCP path did not share the same run-start admission contract. After: a tool that starts runs is admitted or rejected by the same central policy path regardless of entrypoint.

DX before vs after:
- Before: runtime policy for MCP tools depended on scattered tool-local behavior and implicit route knowledge, which made it easy to widen `/__setta__/tools/call` without realizing a tool lacked the corresponding policy checks. After: the policy contract is attached to the tool definition and enforced centrally at dispatch.
- Before: the agent runner exposed both `start_run(...)` and a separate `run_sub_agent(...)` wrapper that encoded a second start/wait pattern. After: the MCP tool uses the same explicit start/wait flow as the rest of the runtime, which removes dead surface area and makes run-count commit timing easier to reason about.

Verification:
- `source activate.sh && ./scripts/run_backend_tests.sh tests/mcp/test_tool_runtime_policy_metadata.py tests/mcp/test_tool_access_metadata_completeness.py tests/routers/test_mcp_tools_call_runtime_policy.py tests/routers/test_mcp_linked_chat_tool.py -q` passed: 41 tests.
- Added `tests/mcp/test_tool_runtime_policy_metadata.py` to lock the metadata contract on the affected MCP tools.
- Added `tests/routers/test_mcp_tools_call_runtime_policy.py` to cover denied deployment/share reads, denied run starts under `allowRun=false`, denied single-run overflow, successful run-start bookkeeping, and rollback when run start fails before commit.
- No Playwright or CDP verification was needed for this change because it does not alter a browser-visible UI path; the fix is backend runtime-policy enforcement only.

## 2026-03-10 20:01:34 PDT

Implemented the remaining consolidated fixes from the latest top-level reviews for managed linked-chat admission and authoritative git-graph window-space restore behavior, then verified the updated paths with backend tests, frontend unit tests, Playwright, and CDP.

Managed linked-chat admission:
- `invoke_linked_chat(...)` now enforces the deployment/share `allowLLM` policy before branching between `setta_llm` and `external_agent` runners.
- This removes the engine-specific hole where managed linked-chat invocations backed by `external_agent` could still run under `allowLLM=false` even though the normal managed chat routes and frontend surface gating already treated those runs as blocked.
- Added a backend regression that exercises the `external_agent` managed linked-chat path under `allowLLM=false` and asserts the request fails with `403` and leaves no runner calls, chat binding writes, or lingering linked-chat reservations behind.

Authoritative git-pane restore and rollback:
- Window-space restore now passes the intended embedded git-pane visibility set through the same optimistic `projectChatWindowing` write path as the restored layout instead of mutating git-pane ephemera afterward.
- The project-chat windowing store now captures the prior per-project embedded git-pane visibility set, applies the next set inside the optimistic transaction, and restores the prior set on rollback. A failed restore is now a true no-op for both layout and embedded git-pane state.
- Removed the global restore-time git-pane reset and changed ephemera reconciliation to preserve foreign-project visibility keys during same-project mutations. Project A restoring a window space no longer wipes project B's embedded git-pane state.
- Full project hydration keeps the previously intended cross-project cleanup by clearing embedded git-pane visibility for other projects before reconciling the newly loaded project. That preserves the existing load behavior while making restore and local windowing mutations project-scoped.

UX before vs after:
- Before: deployment/share `allowLLM=false` blocked managed chat in the main UI but still allowed managed linked-chat MCP execution when the target engine was `external_agent`. After: all managed linked-chat entrypoints obey the same `allowLLM` boundary regardless of engine type.
- Before: restoring a saved git-graph layout could reset or overwrite embedded git-pane state outside the authoritative layout transaction, so a failed restore or read-only restore attempt could still leave the workspace visually out of sync. After: denied or rejected restores leave both the layout and git-pane visibility exactly as they were before the action.
- Before: restoring a window space in one project could erase unrelated projects' git-pane visibility because the restore path cleared the whole ephemera map. After: restore only changes the active project's intended git-pane state.

DX before vs after:
- Before: managed linked-chat permission logic diverged by engine type, so developers had to reason about `setta_llm` and `external_agent` separately even though the product policy was "managed chat requires `allowLLM`". After: the shared admission path is the single source of truth.
- Before: window-space restore split one user action across two state mutations, which made rollback behavior partial and hard to reason about in tests. After: restore-side git-pane state is carried in the same optimistic write contract as `projectChatWindowing`, with explicit rollback coverage.
- Before: project-scoped git-pane ephemera was effectively global during restore and local windowing replacement. After: helper behavior matches the keyed state model, and project-load cleanup is explicit where cross-project pruning is actually intended.

Verification:
- `./scripts/run_backend_tests.sh tests/routers/test_mcp_linked_chat_tool.py -q -k 'llm_is_disallowed'` passed: 2 tests.
- `pnpm -C frontend exec vitest run src/state/actions/windowSpaces.test.ts src/state/actions/project/loadProject.test.ts src/state/actions/projectChatWindowing.permissions.test.ts` passed: 38 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "failed workspace restore rolls back git-pane visibility with the layout"` passed: 1 test.
- CDP verification seeded a live read-only `Window Spaces` scenario on the running app, confirmed the restore control stayed disabled, and confirmed a direct restore invocation left both the floating git-graph window bounds and embedded git-pane visibility unchanged.

## 2026-03-10 18:09:50 PDT

Implemented the consolidated top-level review fixes for authoritative managed-chat surface admission, project-scoped chat hydration, and truthful layout-permission affordances, then verified the changed paths with Vitest, Playwright, and CDP.

Managed-chat surface authority:
- Replaced proxy/type-based admission checks with effective runtime section authority. Standalone section routes, standalone window-space routes, and workspace chat windowing now all determine managed-chat eligibility from the effective section impl plus chat mode instead of `SectionType.Chat` shortcuts or `sections[*].type` lookups.
- `project_ai_mode` remains managed-chat gated, `section_mode` is gated only when the effective section impl is managed, and `git_graph_mode` is never treated as managed chat. This fixes the deployment/share regressions where `allowLLM=false` could wrongly hide scriptable section chat or git graph surfaces, or inconsistently block/allow saved window spaces.
- Workspace window filtering now removes only the blocked managed surfaces instead of collapsing the entire shared host. Scriptable section windows and git graph windows remain available in deployment mode even when managed chat is disallowed.

Project-chat hydration scoping:
- `ProjectChatCore` now preserves `projectConfigId` through runtime hydration and fallback probing instead of broadening lookup scope with `null`.
- Missing-provenance fallback continues to work, but it now stays inside the current project boundary. Reused `chatId`s in another project can no longer hydrate the wrong external transcript into a `/:project/chat/:chatId` route.
- Added a focused runtime helper test to lock the project-scoped hydration contract in place.

Layout-permission affordance cleanup:
- The overview Git pane now disables the `Graph` launcher when layout edits are blocked, matching the reducer/backend policy instead of exposing a button that silently no-ops.
- The section chat-mode control now disables under `allowLayoutChanges=false`, so deployment/share sessions no longer advertise a mutating control that downstream state logic rejects.
- This keeps UI affordances aligned with the actual layout-permission boundary instead of relying on reducer-level rejection alone.

UX before vs after:
- Before: deployment/share sessions with `allowLLM=false` could hide the whole chat windowing host, deny scriptable standalone chat incorrectly, allow/block saved standalone window spaces inconsistently, and show layout actions that did nothing when clicked. After: only truly managed chat surfaces fail closed, scriptable section chat and git graph remain usable where intended, and blocked layout actions render as disabled instead of deceptively clickable.
- Before: a standalone project-chat route could broaden fallback hydration beyond the current project and display another project's transcript when `chatId`s overlapped. After: project chat hydrates only within the active project and fails deterministically if the scoped runtime cannot satisfy the request.

DX before vs after:
- Before: permission behavior was duplicated across route parsing, workspace windowing, and share-policy helpers, with brittle proxy checks that were easy to regress when adding a new surface. After: the managed-chat admission logic is centralized around authoritative runtime metadata and reused consistently.
- Before: project-chat hydration undermined route ownership with a silent client-side scope broadening. After: project scope is explicit in the hydration path and directly testable.
- Before: UI permission correctness depended on remembering that reducers would reject layout mutations later. After: the control layer reflects the same permission model as the state layer.

Verification:
- `pnpm -C frontend exec vitest run src/components/Chat/sharePolicyChatAccess.test.ts src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Panes/Overview/Git/GitPane.test.tsx src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationRuntime.test.ts` passed: 5 files, 26 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts -g "deployment allowLLM=false"` passed: 2 tests.
- CDP verification confirmed a live sharing-mode workspace kept scriptable section chat and git graph surfaces visible while suppressing managed project-chat windows under `allowLLM=false`, and confirmed the blocked/disabled affordance state matched the updated permission model.

## 2026-03-10 13:04:27 PDT

Implemented the remaining consolidated review fixes for managed section-chat thread ownership and strict separation between read scope and peer-chat scope, then verified the behavior at backend, frontend, Playwright, and CDP layers.

Managed chat permission enforcement:
- `route_set_chat_section_chat_id(...)` now enforces `allowLLM` instead of leaving section-chat thread rebinding outside the deployment/share LLM gate.
- Shared managed-chat UI now derives a single `canUseManagedChat` decision from deployment mode plus `sharePolicy.allowLLM`, and uses that to block all thread mutation paths for section-backed managed chat.
- In restricted share/deployment mode, managed section chat no longer renders `History` or `New Chat`, no longer exposes `/new` or `/resume`, and disables composer submission and message editing instead of allowing a partial thread-management surface.
- Section config settings now apply the same gate to their managed `New Chat` action, so the settings pane cannot bypass the main chat surface restriction.

Agentic scope model cleanup:
- `chat_chat` edges now grant only peer-chat access; they no longer bleed into generic read scope via `effective_read_section_ids()`.
- Unscoped/project chat resolution now keeps full read/write/context access where intended while setting `peer_chat_section_ids` to empty, so project chat stops advertising linked-chat capability it cannot actually execute.
- Missing-edge guidance now distinguishes read access from peer-chat access correctly, pointing users toward `chat_section` for reads instead of suggesting `chat_chat` as a generic fallback.

UX before vs after:
- Before: a share/deployment user with `allowLLM=false` could still hit managed section-chat thread mutation paths from parts of the UI, including thread switching and new-thread creation affordances. After: those controls are consistently hidden or disabled across the managed section-chat surfaces, and the composer/edit paths fail closed.
- Before: linked-chat-only sections could inherit read-oriented tool visibility and filtered data access from `chat_chat` edges, and project chat could surface linked-chat affordances that later failed at runtime. After: peer-chat-only scope exposes only peer-chat behavior, read-only outputs require actual read scope, and unscoped project chat no longer advertises dead-end linked-chat actions.

DX before vs after:
- Before: thread ownership was gated by one rule for project chat and a different rule for section chat, which made share-policy reasoning inconsistent and easy to regress. After: managed thread mutation follows the same `allowLLM` invariant everywhere.
- Before: scope classification differed across resolution, tool filtering, and runtime admission because peer-chat and read access were partially conflated. After: read scope and peer-chat scope are separate concepts with matching enforcement and clearer tests.

Verification:
- `source activate.sh && ./scripts/run_backend_tests.sh tests/agentic/test_agentic_scope.py tests/llm/test_agent_runner.py tests/mcp/test_mcp_agentic_project_state_summary_filtering.py tests/mcp/test_mcp_agentic_lsp_diagnostics_filtering.py tests/routers/test_share_policy_routes.py tests/routers/test_mcp_linked_chat_tool.py` passed: 110 tests.
- `pnpm -C frontend exec vitest run src/components/Chat/sharePolicyChatAccess.test.ts src/state/actions/projectChatWindowing.permissions.test.ts` passed: 2 files, 7 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/chat-composer-controls.spec.ts --grep "managed chat sections hide thread controls when deployment policy disallows LLM access"` passed: 1 test.
- CDP verification mounted a managed section-chat preview on the live app with deployment mode enabled and `allowLLM=false`, confirmed `History` and `New Chat` were absent, confirmed the composer was disabled, and saved a screenshot to `perf/cdp-managed-chat-share-policy-check.png`.

## 2026-03-10 01:10:58 PDT

Implemented the remaining top-level review fixes for linked-chat admission safety, managed linked-chat runtime typing, canonical chat-surface remounting, authoritative window-space persistence, and layout-permission gating.

Linked-chat lifecycle and continuity:
- Managed linked-chat runs now persist `runType="llm_chat"` before execution so follow-up history lookup, title generation, and continuity reuse all see the same typed runtime contract as normal managed chat.
- Linked-chat section binding persistence moved behind the launch preflight for both managed and external runners. A failed start no longer leaves an orphaned `chatId` reserved on the target section.
- Added backend regressions for managed typed-history reuse plus both managed and external runner-unavailable cases to prove failed admissions are side-effect free.

Window-space authority and persistence:
- Saving a window space now snapshots from the authoritative post-sync windowing state after `set_project_chat_windowing_state` succeeds, instead of persisting a stale pre-sync client snapshot.
- Frontend save/restore flows now collapse duplicate section bindings deterministically before persistence or hydration, and standalone window-space hydration applies the same one-section-one-window rule.
- Backend window-space validation now enforces that same invariant at persistence time, preferring one deterministic binding for duplicate saved section windows and normalizing saved order against authoritative state.
- `create_window_space(...)` now validates the stored window-space payload before broadcasting it so saved layouts cannot drift from the backend-normalized model.

Surface ownership and window reuse:
- `UnifiedChatSurface` now remounts project-chat and section-chat surfaces by canonical `surfaceId` ownership rather than reused window `instanceId`, so local UI state does not leak when a host is rebound.
- `ProjectChat` itself now wraps its stateful internals in a keyed `ProjectChatSurface`, which fixes the same leakage even when callers render `ProjectChat` directly without adding their own remount key.
- Removed the dead standalone snap-resize `lastBoundsByInstanceId` cache while tightening standalone window-space hydration to dedupe duplicate section windows.

Layout permissions and UI behavior:
- `WindowSpacesPane` now uses `canEditLayout` consistently instead of structure-edit capability for save, restore, rename, delete, and reorder actions.
- When layout edits are blocked in deployment/share mode, the pane now renders the non-edit row variant rather than disabled editing rows. That removes drag handles and delete affordances instead of leaving mutating controls visible but inert.
- `ViewingEditingMode` now passes the layout permission straight through, so frontend gating matches the backend share-policy model.

UX before vs after:
- Before: linked-chat failures could still mutate the target section into a phantom thread, managed linked chats could lose continuity because they were missing `runType`, reused windows could inherit another surface's draft/history-pane state, and blocked deployment sessions still exposed editing-shaped window-space rows. After: failed linked-chat starts leave no residue, managed linked chats reuse history like normal managed chat, reused chat hosts remount cleanly by owner, and blocked layout sessions show only the non-mutating window-space controls.
- Before: saved window spaces could preserve stale or duplicate section bindings that later reopened inconsistently across workspace and standalone routes. After: save, restore, standalone hydration, and backend validation all enforce the same deterministic one-section-one-binding contract.

DX before vs after:
- Before: linked-chat correctness depended on timing, window-space persistence used different authority rules on the frontend and backend, and UI permission bugs required reasoning about `canEditStructure` versus `canEditLayout` plus row-mode rendering details. After: admission is atomic with persistence timing, window-space normalization is shared across save/restore/persistence paths, and layout capability gates the entire window-space mutation surface with matching tests at unit, integration, and E2E layers.

Verification:
- `source activate.sh && ./scripts/run_backend_tests.sh tests/routers/test_mcp_linked_chat_tool.py tests/types/test_project_state_window_spaces.py` passed: 15 tests.
- `pnpm -C frontend exec vitest run src/state/actions/windowSpaces.test.ts src/components/Panes/Overview/WindowSpacesPane.test.tsx src/components/Panes/Overview/ViewingEditingMode.test.tsx src/components/Panes/Overview/ViewingEditingMode.integration.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/components/ChatWindowing/UnifiedChatSurface.remount.test.tsx` passed: 8 files, 54 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/layout/window-space-layout-permissions.spec.ts` passed: 2 tests.
- CDP verification confirmed the overview window-spaces pane on a disposable project at `http://127.0.0.1:3098/branch_playing` in both share-mode permission states. With layout edits allowed, save/restore/delete/reorder affordances rendered correctly; with layout edits blocked, the pane switched to disabled non-edit rows with no drag/delete controls. A narrower 1100px viewport check showed the allowed state still laid out cleanly without overlap or clipped controls.

## 2026-03-10 00:09:16 PDT

Implemented the remaining consolidated fixes from the top-level reviews for project-scoped surface ownership, section-binding restore authority, linked-chat concurrency, and copied-layout persistence, then verified the touched flows end to end.

Surface ownership and chat lifecycle:
- Project-chat surface ids now include `projectConfigId` everywhere they are constructed, including workspace windows, standalone `/chat` routes, standalone window-space windows, overview project chat, and workspace/standalone section-backed surfaces.
- Removed the legacy global `pendingChatDetails` pathway from the AI store. Draft, stop, edit, and finalize flows now require an explicit owning `surfaceId`, so transient chat state cannot collide across projects or across two live hosts that happen to reuse the same local window id.
- Section-mode `ChatArea` now receives the host `surfaceId`, and section-backed project-ai surfaces keep their own pending/edit state instead of falling back to a shared null-surface bucket.
- Project-level edit flows now pass the owning `pendingSurfaceId` through redo/edit requests and set the initiating surface's `chatId` to the new branch result, so branch ownership stays with the surface that created it.

Windowing, ephemera, and persistence:
- Project-chat git-pane ephemera is now keyed by `{projectConfigId}::{instanceId}` and reconciled on both full project loads and websocket/backend authoritative updates. Reused instance ids from another project no longer keep stale embedded-pane or tracked-maximized-graph state alive.
- Restoring a saved window space now dedupes same-section bindings before merging into workspace state, and restore collisions prefer one deterministic authoritative host instead of leaving two live bindings for the same section.
- Backend `normalize_project_chat_windowing(...)` now enforces the same one-section-one-binding invariant for persisted state, so invalid duplicate section bindings are removed even outside the frontend restore path.
- `save_as_new_project_config(..., withRefs=False)` now copies the authoritative `projectChatWindowing` model, remaps `sectionIdOrNull`, preserves layout/order/bounds, and clears copied `chatId`s instead of dropping the persisted chat/window layout entirely.

Linked-chat concurrency:
- `invoke_linked_chat(...)` now reserves and persists the target section `chatId` before agent execution begins, and both overlapping invocations reuse that already-reserved thread id instead of racing to create separate target chats.
- Updated the linked-chat router test harness to track the real backend project-state merge path plus revision metadata, so the concurrency regression is covered under the same authoritative state contract as production MCP execution.

UX before vs after:
- Before: pending drafts, edited-message branches, and stop/retry state could leak between projects or between two hosts showing the same logical window id. After: each live surface owns only its own transient state.
- Before: restoring a saved layout could leave two live windows bound to the same section, producing inconsistent focus, placeholder, and thread ownership behavior. After: restore collapses to one deterministic authoritative binding.
- Before: `Save As` without refs discarded the saved project chat/window layout, and overlapping linked-chat runs could fork the target thread. After: copied configs preserve layout structure with fresh thread ids, and concurrent linked-chat runs converge on one thread.

DX before vs after:
- Before: chat isolation depended on callers remembering hidden context, the state model had a legacy global pending path, and restore semantics were split between frontend heuristics and backend tolerance. After: ownership is encoded in canonical surface ids, pending APIs require an explicit surface, and backend/frontend normalization enforce the same section-binding invariant.
- Before: linked-chat correctness depended on execution timing. After: the target chat is reserved before runtime work starts, so both managed invocations follow the same single-thread contract under concurrency.

Verification:
- `pnpm -C frontend exec vitest run src/components/ChatWindowing/projectChatSurfaceIds.test.ts src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx src/components/Git/GitGraphWindowContent.test.tsx src/state/actions/aiSubmitMessage.test.ts src/state/actions/aiEditedMessage.test.ts src/state/actions/aiChatPromotion.test.ts src/state/actions/aiAppSpecPatchPreview.test.ts src/state/actions/project/loadProject.test.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/sectionInfos.projectChatWindowingSync.test.ts src/state/actions/windowSpaces.test.ts` passed: 12 files, 104 tests.
- `source activate.sh && ./scripts/run_backend_tests.sh tests/types/test_project_chat_windowing.py tests/project_state/test_project_chat_windowing_persistence.py tests/routers/test_mcp_linked_chat_tool.py` passed: 18 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/project-chat-routing-isolation.spec.ts frontend/tests/e2e/chat/project-chat-pending-promotion.spec.ts` passed: 2 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts -g "keeps standalone project chat draft state isolated across project configs"` passed: 1 test.
- CDP verification confirmed the workspace project-chat window at `http://127.0.0.1:3098/wild_hot` and the standalone project-chat route at `http://127.0.0.1:3098/wild_hot/chat` both rendered the expected chat chrome and composer layout without cross-surface leakage.

## 2026-03-09 21:36:20 PDT

Implemented the consolidated review fixes for deterministic chat hydration, per-surface project-chat state ownership, and async windowing rebasing.

Hydration authority:
- Reworked fallback hydration in `frontend/src/state/actions/ai.ts` so both managed and external runtimes are probed without side effects before any store mutation happens.
- If both runtimes answer for the same `chatId`, hydration now fails closed with the explicit blocked error `chat_runtime_ambiguous` instead of mixing transcripts, tool-call arguments, or waiting-state metadata from both runtimes.
- `ProjectChatCore` now surfaces a concrete blocked banner for that ambiguity state, and standalone `/:projectConfigName/chat/:chatId` routes rely on the same path instead of rendering whichever runtime happened to win a race.

Per-surface chat ownership:
- Added `pendingChatDetailsBySurfaceId` to the AI store and threaded surface-scoped draft lifecycle helpers through project-chat submit/stop/finalize flows.
- `ProjectChat`, `ProjectChatCore`, `ProjectChatHistory`, and `UnifiedChatSurface` now treat each chat surface as the owner of its own draft thread, thread-pane visibility, aux-pane visibility, and selected engine state.
- Workspace docked/floating/maximized chat windows, standalone window-space surfaces, standalone project-chat routes, and section-backed chat surfaces all pass a stable `surfaceId`, so “continue in new thread” and other draft-local operations no longer overwrite another surface’s state.
- The global project-chat engine selection remains only as a default seed for new surfaces; changing one live window no longer silently reconfigures another live window.

Async windowing correctness:
- Fixed `bootProjectChatWindowToCanvasSection(...)` so it re-reads authoritative `projectChatWindowing` state after async section creation completes, verifies the target instance still exists, and applies the canvas move onto fresh state.
- This prevents slow canvas boot flows from clobbering concurrent window edits such as focus, bounds, minimize/maximize, close, or peer-window changes that occurred while section creation was in flight.

UX before vs after:
- Before: missing-provenance thread hydration could merge two runtimes into one visible thread, separate project-chat windows could leak engine and draft state into each other, and slow “move to canvas” flows could revert unrelated window changes.
- After: a thread hydrates from exactly one authoritative runtime or shows an explicit ambiguity banner, each chat surface behaves like an isolated window with its own live state, and async windowing actions preserve concurrent edits instead of overwriting them.

DX before vs after:
- Before: engineers had to reason about side-effecting hydration probes, global pending-draft state shared by unrelated surfaces, and stale pre-`await` windowing snapshots.
- After: authority is explicit, surface-local state is keyed and testable, and async windowing updates compose against fresh store state rather than incidental timing.

Verification:
- `pnpm -C frontend exec vitest run src/state/actions/aiStopProjectChat.test.ts src/state/actions/projectChatWindowing.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.test.ts` passed: 4 files, 118 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone thread routes fail closed when multiple runtimes answer the same chat id"` passed.
- CDP verification confirmed two independent project-chat windows render as separate surfaces in the live workspace, and a forced standalone ambiguous-runtime route shows the blocked banner without rendering either competing transcript.

## 2026-03-09 15:45:22 PDT

Implemented the branch-blocking review fixes rather than layering more local-state patches on top.

Frontend state and rendering:
- Per-window `chatId` is now authoritative for project chat windows. Workspace windows and standalone window-space windows pass `chatId` through `UnifiedChatSurface` into `ProjectChat`, and new-thread creation writes back to the owning window instead of only updating the global active chat.
- Removed the browser-local shadow persistence for `projectChatWindowing`. Backend snapshots are authoritative again, with optimistic frontend ops replayed only while still pending.
- Fixed window-space restore semantics so saved floating windows replace existing floating workspace windows in place, while collisions with live non-floating windows get remapped to fresh ids.
- Removed stale slug caches in `windowSpacePaths` and `sectionSlugPaths`; route resolution now reflects live project state without requiring reload.
- Added a save-flow sync step for window spaces so the current workspace layout is persisted before a window-space snapshot is created. This was required after removing the local shadow because the backend model had been dropping project chat windowing during merge.

Backend/state-model fixes:
- Added shared chat continuity validation in `backend/setta/agentic/chat_continuity.py` and reused it from both linked-chat invocation and standard AI-run startup, preventing mixed engine/project histories on reused `chatId`s.
- Changed MCP retry behavior to be metadata-driven. `invoke_linked_chat` stays scope-compatible as a read tool but explicitly opts out of retry-on-disconnect, preventing duplicate side effects after reconnects.
- Fixed the backend project-state persistence model so `projectChatWindowing` survives `merge_single_config_into_backend()` / `convert_backend_to_single_config()` round trips by storing it per project config in backend state. Before this, backend-authoritative loading looked correct in some code paths but windowing writes were silently discarded on merge.

Verification:
- Frontend Vitest coverage added/updated for per-window chat identity, standalone window-space hydration, backend-authoritative project-windowing sync, restore-collision behavior, save-flow ordering, and slug invalidation.
- Backend pytest coverage added for project-chat-windowing backend round-trips, MCP retry metadata, linked-chat disconnect retry behavior, and managed/external chat continuity conflicts.
- Playwright coverage added for distinct project chat threads per saved window-space window and verified the full standalone window-space spec passes.
- CDP visual verification completed against workspace floating chat windows and standalone window-space rendering at desktop and smaller viewport sizes; no clipping or overlap regressions observed in the checked flows.

## 2026-03-09 16:54:17 PDT

Implemented the remaining review-driven fixes for backend-authoritative windowing sync, share-policy enforcement, standalone window-space hydration, and the touched DX regressions.

Backend/state behavior:
- `processProjectStateUpdateFromBackend()` now includes `projectChatWindowing` in the comparable project-state payload, so backend-only windowing changes are no longer ignored during reconciliation.
- Repaired the broken frontend regression fixture for project-windowing sync so the test exercises the real single-config/project-config factories instead of invalid partial state.
- Window-space mutation routes now go through a shared layout-policy helper. In share mode this honors `allowLayoutChanges`; outside share mode the existing deployment-mode deny behavior stays intact.
- Added backend tests covering both denied and allowed window-space route behavior under share policy.

Frontend/runtime behavior:
- Standalone window-space tabs now keep local per-window `chatId` and user-resized bounds when the saved layout is rehydrated due to viewport or title changes. Only derived presentation fields are refreshed from the persisted snapshot.
- Kept the saved-window-space browser coverage on the stable path: distinct project chat threads remain preserved per window in both workspace and standalone views.
- Removed a runtime regression uncovered during E2E verification where `CustomResizable` referenced an undefined `zIndexClass` and prevented project pages from mounting.

DX and type-safety cleanup:
- Removed touched-file fallbacks that fabricated missing `windowSpaces` or `projectChatWindowing` state locally; the changed code now relies on the canonical required project-state shape.
- Narrowed standalone route booleans, window-space lookups, and `ProjectChat` prop wiring so the touched frontend surfaces are type-safe again.
- Replaced the slug-path helper dependency on broader store helpers with narrower local helpers, and fixed the Radix passthrough mock typing in the header test.

Verification:
- `pnpm -C frontend exec vitest run src/state/actions/sectionInfos.projectChatWindowingSync.test.ts src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/utils/windowSpacePaths.test.ts src/utils/sectionSlugPaths.test.ts src/components/AppHeader/FollowAIToggleButton.test.tsx src/state/actions/windowSpaces.test.ts` passed: 7 files, 44 tests.
- `source activate.sh && ./scripts/run_backend_tests.sh tests/routers/test_share_policy_routes.py -q` passed: 20 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts -g 'saved window spaces preserve distinct project chat threads per window in both workspace and standalone views'` passed.
- CDP verification confirmed the project page and `Window Spaces` pane render correctly in a disposable project on the live dev instance.

Residual baseline:
- The branch still has broader pre-existing TypeScript errors in `frontend/src/state/actions/sectionInfos.ts` and `frontend/src/components/Utils/Resizable/CustomResizable.tsx`. The fixes here were kept local and verified by tests, but this turn did not attempt a full-file type cleanup of those baseline-red modules.

## 2026-03-09 17:40:08 PDT

Implemented the consolidated review fixes for section-window authority, standalone window-space hydration, backend project-chat-windowing normalization, route error handling, and manager title consistency.

Section-backed window correctness:
- Section-backed chat windows now render from their owning window instance instead of ambient workspace-derived mode state. `SectionWindowSurface` and `AreaSwitch` accept explicit `chatModeOverride`, `projectChatId`, and `setProjectChatId` props, and the workspace dock/floating/maximized surfaces plus standalone window-space surfaces now pass those through.
- This fixes the branch-blocking bug where a section window saved in `project_ai_mode` could reopen in `section_mode` or attach to the global active project-chat thread instead of its persisted `chatId`.
- The same authority path now applies to standalone window-space section windows, so saved section-backed project-chat threads survive restore even when the live workspace no longer has a matching section-window binding.

Standalone window-space hydration:
- Reworked standalone hydration into an identity-aware merge flow. Same-layout rehydration now preserves local thread selection and local resize state, while switching to a different `windowSpace.id` still performs a hard reset to the saved snapshot.
- Added an exported helper to make the same-layout-vs-layout-switch behavior directly testable without relying on a browser-local `jsdom` test environment.

Backend/state-model cleanup:
- Added canonical `projectChatWindowing` normalization in a dedicated backend helper module and wired it into `ProjectStateSingleConfig` validation, `set_project_chat_windowing_state()`, and `delete_sections()`.
- Missing/deleted section-bound live windows are now removed from `instancesById`, `order` is compacted and de-duplicated, and non-section windows remain untouched.
- This closes the previous backend/frontend mismatch where deleted section windows remained as hidden dead state in the authoritative project model.

API and manager DX:
- Window-space mutation routes now consistently translate missing ids to `404` and validation failures to `422` using shared router helpers rather than leaking uncaught `KeyError`s as `500`s.
- `ProjectChatManager` now uses the shared `buildProjectChatWindowTitle()` helper, so renamed chats and git-graph windows display the same authoritative title as the actual window chrome.

Regression coverage and verification:
- Added frontend tests for standalone section-window authority and standalone hydration behavior, plus focused tests for `SectionWindowSurface` and `ProjectChatManager` title reuse.
- Added backend tests for project-chat-windowing normalization on validation and section deletion, and route tests for missing window-space ids returning `404`.
- Added Playwright coverage for the saved section-window/project-ai-thread restore path with no live workspace binding.
- Verified the touched frontend paths with Vitest, the touched backend paths with pytest, and the standalone section-window restore flow with Playwright.
- Completed CDP visual verification against the live app by creating a section-backed floating chat window, saving it into a window space, clearing live workspace windowing, reopening the standalone window-space route, and confirming the saved thread marker rendered in a `project_ai_mode` surface without falling back to the global active thread.

## 2026-03-09 18:25 PDT

Implemented the final review-driven cleanup around strict backend authority, stale linked-chat recovery, host-independent chat-mode control, and standalone git-pane isolation.

Backend and state-model changes:
- Removed the touched frontend-side compatibility behavior that had been fabricating missing `projectConfig.windowSpaces` and `projectChatWindowing` on load. `loadProject.ts` now validates both fields as required and hard-fails immediately when the backend contract is broken.
- Hardened `invoke_linked_chat` so stale `chat_chat` edges no longer surface as an uncaught `500` when the linked section’s active variant stops being a chat. The tool now returns a structured `unsupported_target_type` result instead.
- Added stale-edge pruning to `set_section_variant(...)`, so changing a section’s active variant away from chat removes now-invalid `chat_chat` links from authoritative project state instead of leaving broken references behind.

Frontend behavior changes:
- Chat sections no longer need an existing host window binding before the user can control Chat Mode. The Section Config UI now always exposes the mode selector, and switching an unbound section to `project_ai_mode` creates a canonical `canvas_section` project-chat window binding.
- Fixed project-chat authority so only unscoped `project_ai_mode` windows update the global `useAIStore.activeChatId`. Section-backed project-chat windows now keep their `chatId` local to the owning window instead of hijacking the main project-chat thread.

## 2026-03-10 19:17:34 PDT

Implemented the final consolidated fixes from the top-level review documents for MCP linked-chat authority, deployment policy enforcement, project-scoped standalone hydration, and exact frontend/backend window-binding parity, then verified the affected paths with backend pytest, frontend Vitest, Playwright, Ruff, and CDP.

MCP linked-chat authority and deployment policy:
- Removed caller-controlled `shareSessionId` authority from the synthetic MCP tools-call context. `route_call_mcp_tool(...)` now injects the validated HTTP/share-session identity into the internal MCP request context, so MCP linked-chat execution is always bound to the authenticated deployment session rather than payload-supplied session metadata.
- Added shared MCP run-start authorization helpers in `backend/setta/mcp/run_start_authorization.py` and wired them into linked-chat invocation. Deployment/share `allowRun`, `allowMultipleRuns`, and `allowLLM` are now enforced before linked-chat execution starts, including managed linked-chat runs that resolve to the built-in LLM engine.
- Tightened failure handling around linked-chat startup so reserved single-run slots are rolled back on all pre-start failures and only committed after a successful managed or external linked-chat launch.
- Adjusted the tools-call router to use the non-launcher guard and to unwrap `ToolError` causes that are already `HTTPException`s, so deployment policy denials come back as truthful 4xx responses instead of route-level 500 masking.

Project-scoped hydration and standalone route ownership:
- Project-chat hydration cache keys, provenance-probe keys, cache eviction, and missing-provenance fallback probing now all carry `projectConfigId`, eliminating the previous ambient fallback that could hydrate the wrong project when a `chatId` was reused across configs.
- Standalone `/:projectConfigName/chat/:chatId` thread-missing state is now owned by `{projectConfigId, chatId}` rather than `chatId` alone. The standalone thread route clears stale `chat_not_found` state when the same thread id is opened in a different project config, instead of pinning the old not-found result across route changes.
- `useLoadProjectConfig()` now treats project-route identity as authoritative even on same-document router navigations without explicit `pageLoadType` state. It waits for in-flight project loads to settle, marks matching already-loaded routes complete, and reliably reloads when the route project config changes in the same tab.

Windowing parity and deterministic selection:
- Frontend duplicate section-binding winner selection now matches backend normalization exactly by falling through to `instanceId` ordering on exact ties. This removes the last frontend/backend disagreement where equal `zIndex` and `lastFocusedAt` values could make the UI act on one bound window while persistence kept another.
- Backend coverage now locks the same authoritative tie-break on persisted state validation, keeping restore/save/load behavior deterministic across both sides of the model.

UX before vs after:
- Before: MCP linked-chat could escape the validated deployment session, start runs through policy paths the rest of the product blocked, and return misleading 500s when share/deployment policy should have denied the action explicitly. After: linked-chat execution uses the authenticated request session, obeys the same deployment gates as other run-starting surfaces, and returns deterministic authorization failures.
- Before: standalone project-chat routes could hold onto a stale “Thread Not Found” result when the same `chatId` was opened under a different project config in the same tab, and fallback hydration could broaden into the wrong project when ids overlapped. After: standalone routes rehydrate per-project correctly, thread-missing state resets on project changes, and fallback probing stays inside the current project boundary.
- Before: duplicate section-bound chat windows could diverge between frontend selection and backend normalization on exact ties, producing disappearing or inconsistent authoritative bindings after persistence. After: both layers choose the same winning window deterministically.

DX before vs after:
- Before: MCP tools-call admission and linked-chat launch policy were split across loosely related code paths, with request identity partially reconstructed from payload context. After: request-scoped share-session authority and deployment run-start policy live in one explicit pathway that is directly testable.
- Before: project-route hydration correctness depended on a mix of cache keys, ambient current-project lookups, and navigation-state conventions that were easy to bypass during same-tab navigation. After: route identity is explicit in the loader and hydration paths, and the behavior is covered by unit, integration, E2E, and CDP checks.
- Before: frontend/backend duplicate-binding reconciliation relied on “should never tie” assumptions. After: the parity rule is explicit, centralized, and enforced in tests.

Verification:
- `source activate.sh && python -m pytest tests/routers/test_mcp_linked_chat_tool.py tests/types/test_project_chat_windowing.py tests/routers/test_full_runtime_router_policy.py tests/routers/test_full_runtime_mode_guards.py -q` passed: 69 tests.
- `source activate.sh && python -m ruff check backend/setta/routers/mcp_tools.py backend/setta/agentic/linked_chat_invocation.py backend/setta/mcp/run_start_authorization.py tests/routers/test_mcp_linked_chat_tool.py tests/routers/test_full_runtime_router_policy.py tests/types/test_project_chat_windowing.py` passed.
- `pnpm -C frontend exec vitest run src/state/hooks/project.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/state/actions/aiStopProjectChat.test.ts src/state/actions/projectChatWindowing.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.test.ts src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationAuthority.integration.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.test.tsx` passed: 7 files, 141 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "re-hydrates the same standalone thread id when navigating across project configs"` passed.
- CDP verification used a clean live tab on the running dev instance to route from `rough_playing/chat/shared-cdp-thread` showing `Thread Not Found` to `pike_tank/chat/shared-cdp-thread` via the app router, and confirmed the standalone thread surface rehydrated with `Hydrated independently for project B.` and no remaining not-found state.
- Standalone git-graph windows now own their embedded git-pane visibility locally. The previous shared `useMisc` pathway caused git-pane toggles to leak between workspace and standalone surfaces when ids collided or a saved layout reused the same window instance id.

UX before/after:
- Before: missing backend state silently rendered as empty/defaulted window layouts and chat bindings, so users could unknowingly save over valid state after a backend regression. After: the app fails at load time with the real contract violation.
- Before: a canvas-created chat section looked artificially incomplete until it had first been externalized into a window. After: the Chat Mode control is available immediately from the section config, so the workflow matches user intent regardless of host surface.
- Before: section-backed project-chat windows could pollute the main project-chat thread, and standalone git-pane toggles could change UI state somewhere else. After: those surfaces behave as isolated owners of their own state.

DX before/after:
- Before: engineers had to debug local fallback behavior that obscured backend bugs, plus stale agentic edges that failed later and far away from the state mutation that created them. After: state ownership is explicit, backend contract breaks are immediate, and invalid edges are removed at the mutation point.
- Before: chat mode had two authority paths, one dependent on host/window binding presence. After: chat-mode behavior is consistent for canvas, docked, floating, maximized, and standalone surfaces.
- Before: the review suggestion to remove `toggleMiniMapSide` looked plausible from a quick scan, but the control still had a live runtime caller. After validation, only the truly unused private setter was removed and the public toggle remains intact.

Verification:
- `source activate.sh && ./scripts/run_backend_tests.sh tests/routers/test_mcp_linked_chat_tool.py tests/types/test_agentic_edges.py` passed.
- `pnpm -C frontend exec vitest run src/state/actions/project/loadProject.test.ts src/state/actions/projectChatWindowing.test.ts src/components/Git/GitGraphWindowContent.test.tsx src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx` passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/chat-composer-controls.spec.ts frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "canvas-created chat sections|standalone git graph windows"` passed.
- CDP verification confirmed that a newly created canvas chat section shows the `Chat Mode` control before any window binding exists, and that the standalone git-graph surface kept its pane state isolated from the workspace view.

## 2026-03-09 19:06 PDT

Implemented the last consolidated review fixes for backend windowing authority, copied-window-space chat ownership, standalone route authority, and workspace git-pane state leakage.

What changed:
- Removed the remaining load-time compatibility fallback in `convert_backend_to_single_config(...)`. Backend project loads now require an authoritative `projectChatWindowingByProjectConfigId[projectConfigId]` entry and raise immediately if it is missing.
- Fixed the legitimate creation boundary that the stricter backend contract exposed: `save_as_new_project_config(..., withRefs=True)` now seeds a fresh empty `ProjectChatWindowingState()` for the new config instead of relying on a load-time fallback.
- Normalized copied window spaces so saved window `chatId`s do not cross project-config boundaries anymore. `copy_project_config(...)` / `remap_window_spaces(...)` now clear `chatId` for both project-chat and section windows while still remapping section ids when needed.
- Reworked standalone `/:projectConfigName/chat/:chatId` ownership so the route is the single source of truth for project-chat thread identity. `StandaloneProjectSurfacePage` now passes a controlled `projectChatId` plus setter into `UnifiedChatSurface`, and thread changes navigate the URL instead of mutating `useAIStore.activeChatId`.
- Removed the standalone page’s old “repair” effect and loading interstitial that depended on global `activeChatId` catching up to the route thread.
- Tightened workspace git-graph embedded-pane state so stale per-instance visibility cannot leak across restore/reuse. Windowing updates now prune visibility entries for removed, closed, or non-git windows, and full workspace window-space restores clear the ephemeral visibility map before applying the restored layout.
- Updated the temp project-manager fixture seed data so test fixtures obey the same backend-authoritative windowing contract as production state.

UX before vs after:
- Before: missing backend windowing state could still degrade into an empty-looking but valid layout, allowing users to overwrite real persisted state after a backend regression. After: the app fails at the real contract boundary, making state corruption visible immediately.
- Before: copying a project config could preserve foreign saved-chat ids inside window spaces, so copied layouts reopened “valid” chat windows that failed on first send with a project-config mismatch. After: copied layouts reopen with fresh local chat state and no foreign thread ownership.
- Before: standalone chat routes were only partially standalone; thread navigation still depended on and could interfere with the global workspace chat selection. After: the URL fully owns standalone thread identity, deep links are stable, `New Chat` navigates to `/chat`, and workspace selection remains untouched.
- Before: workspace git-graph sidebars could reopen from stale `instanceId`-keyed state after a restore or lifecycle reuse. After: embedded git-pane visibility is explicitly ephemeral and scoped to the currently live graph windows only.

DX before vs after:
- Before: there was still a hidden dual-path backend model where missing authoritative state was silently synthesized on load. After: there is a single backend-authoritative path, and missing initialization has to be fixed at write/copy/fixture boundaries.
- Before: debugging copied window spaces required following a delayed failure from frontend restore into backend chat continuity checks. After: copy-time normalization removes the invalid state at the source.
- Before: standalone thread behavior required reasoning about a router/store tug-of-war. After: ownership is explicit in the route layer, and the controlled chat surface behaves the same way as other window-owned chat surfaces.
- Before: stale git-pane leakage depended on incidental `instanceId` reuse. After: the cleanup policy is deterministic and attached to windowing lifecycle changes.

## 2026-03-10 08:18:49 PDT

Implemented the remaining consolidated fixes from the top-level review docs for linked-chat start atomicity, scoped-summary window-space filtering, atomic project-chat move-to-canvas binding, and section-backed title authority cleanup.

Linked-chat admission and failure safety:
- `invoke_linked_chat(...)` no longer persists `section.chatId` before runner startup completes. Both managed and external linked-chat flows now start first and only bind the target section after the run has been admitted successfully.
- This removes the failure residue where `run_start_failed` could still mutate the target section into a phantom linked thread and poison retries or later ownership checks.
- Added backend regression coverage for both managed and external startup-failure paths to prove failed admissions leave no persisted section binding behind.

Scoped summary filtering and persistence authority:
- Scoped project summaries now filter saved window-space payloads with the same section boundary as the rest of the summary. Saved `project_chat` windows are dropped entirely from scoped summaries, section-backed saved windows are kept only when their `sectionIdOrNull` remains in scope, `order` is recomputed, and empty window spaces are removed.
- This closes the metadata leak where a section-scoped summary could still expose saved window-space structure for out-of-scope sections or project-chat surfaces.
- Added helper-level and MCP-level backend tests covering window-space filtering, order compaction, and empty-space removal.

Atomic move-to-canvas and section creation:
- `bootProjectChatWindowToCanvasSection(...)` no longer creates a section and then renames it in a second mutation. The frontend now passes the intended title as the initial section name, and the backend applies that name as part of the create path after validating it against the authoritative project state.
- If name validation fails, the section creation is rejected without leaving a partially created section behind. If creation succeeds, the returned section is already correctly named before the window is rebound to it.
- Added backend tests for valid and invalid initial-name creation behavior, frontend tests for the create-and-bind flow, and a Playwright regression showing that a failed move leaves the source window as the only live host and that a retry succeeds cleanly.

Section-backed title authority:
- Section-backed project-chat windows now normalize custom `title` state to `null` across backend validation, frontend state updates, and window-space snapshot/restore flows.
- This removes the split-authority bug where the UI could persist a custom title even though rendering always preferred the owning section name, leaving users with a visible no-op and saved layouts with inert data.
- Removed the now-unused `WindowSpaceSortableItem` alias as part of the same cleanup and added unit coverage for title normalization in both backend and frontend persistence paths.

UX before vs after:
- Before: linked-chat startup failures could silently reserve a section thread that never actually started, forcing later retries to interact with stale hidden state. After: failed starts are side-effect free, and the section remains unchanged until a run exists.
- Before: section-scoped summaries could still leak saved layout metadata for out-of-scope sections or project-chat windows. After: scoped summaries now behave like a real boundary and include only in-scope saved section windows.
- Before: moving a project chat to canvas could leave a duplicate host behind if the follow-up rename failed between section creation and window rebinding. After: section creation, initial naming, and rebinding follow one atomic authority path, so failures leave the original host intact.
- Before: users could rename section-backed windows through state that the UI would never actually render, creating confusing no-op edits. After: section naming has a single source of truth and saved layouts no longer accumulate dead per-window titles.

DX before vs after:
- Before: linked-chat correctness depended on subtle persistence timing across multiple startup paths. After: start admission and section binding now follow one explicit atomic contract.
- Before: scoped-summary filtering and saved window-space state applied different authority rules, so engineers had to reason about which payloads were actually trustworthy. After: the scoped summary enforces the same section boundary all the way through saved layouts.
- Before: move-to-canvas correctness depended on sequencing two separate mutations and thinking through partial failure cleanup. After: the initial section name is part of the create contract, so the code path is shorter, transactional, and easier to test.
- Before: section-backed title behavior had dead persisted state with no rendered effect. After: section-window naming is canonicalized at validation and persistence boundaries, which removes inert state and test ambiguity.

Verification:
- `source activate.sh && ./scripts/run_backend_tests.sh tests/routers/test_mcp_linked_chat_tool.py tests/mcp/test_mcp_agentic_project_state_summary_filtering.py tests/types/test_project_state_summary_filter.py tests/types/test_project_state_window_spaces.py tests/types/test_project_chat_windowing.py tests/project_state/test_project_config_view_modes.py` passed.
- `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.test.ts src/state/actions/windowSpaces.test.ts` passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts --grep "project chat move-to-canvas failure leaves the source window as the only live host and retries cleanly"` passed.
- CDP verification on the running dev instance confirmed that moving a project chat to canvas cleared the dock/floating hosts and left a single canvas-bound host with the expected manager actions.

Verification:
- `./scripts/run_backend_tests.sh tests/project_state/test_project_chat_windowing_persistence.py tests/types/test_project_state_window_spaces.py` passed.
- `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/state/actions/project/loadProject.test.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/windowSpaces.test.ts` passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "keeps standalone project surfaces isolated from workspace selection and windowing state"` passed.
- CDP verification confirmed the standalone `/chat` surface rendered without workspace panes while the workspace page stayed on its own route and project view.
- During verification, this worktree’s frontend install was missing `jsdom` even though it was declared in `frontend/package.json`; installing frontend deps restored the test environment and allowed the new standalone route unit test to run.

## 2026-03-09 20:36 PDT

Implemented the remaining consolidated review fixes for runtime-safe chat continuity, authoritative standalone thread hydration, external-window binding semantics, project-scoped git graph state, dead route cleanup, and no-op slug validation removal.

Backend/runtime fixes:
- Hardened chat continuity in `backend/setta/agentic/chat_continuity.py` so managed project-chat reuse now treats persisted `scriptable_chat` runs as incompatible history instead of silently reusing the same `chatId` across runtimes.
- Reused that stricter continuity behavior in both the main managed-chat entry path and linked-chat invocation tests, so mixed-runtime reuse now fails fast with the same `409` mismatch contract rather than splitting or corrupting history.
- Removed the unused `set_window_space_state` backend route and request model, then removed the matching generated listener/frontend endpoint surface so the repo no longer advertises a write path with no real product caller.
- Removed the dead reserved-standalone-slug scaffolding from backend/frontend validation. Names remain governed by the actual namespaced route model rather than an empty “reserved” set that could never trigger.

Frontend behavior fixes:
- Share-mode standalone routes for project chat, project chat thread, section, and window space now render the real standalone surface via `ShareStandaloneProjectSurfacePage` instead of redirecting users back to the project root and losing the deep-link target.
- Standalone `/:project/chat/:chatId` no longer declares “Thread Not Found” from stale local history. The route now mounts the standalone chat surface first, listens for authoritative blocked-error callbacks, and only renders not-found UI after a real backend `chat_not_found`.
- Filled the remaining hydration gap for missing-provenance standalone chats: `ProjectChatCore` now probes both managed and external hydration endpoints when local provenance is absent and prefers authoritative backend success over client-side warning state. This fixes valid standalone threads that existed only on the backend.
- Externalized section rendering now keys off authoritative non-canvas binding, not window visibility. Minimized or closed external windows keep their placeholder on the canvas until the section is explicitly returned to canvas, preserving the single-host invariant.
- The placeholder “Focus window” action now reopens minimized/closed windows before focusing them, so the recovery path matches user intent instead of focusing a hidden window record.
- Git graph overlay state now carries `projectConfigId`, reloads when the active project changes, and discards stale async graph responses when project identity changes mid-request. This prevents saved/standalone graph windows from rendering another project’s repo.

Test and fixture fixes:
- Fixed the linked-chat pytest fixture to construct backend state through the real merge pathway so `projectChatWindowingByProjectConfigId` exists just like production state.
- Updated share-mode backend fixture writers to seed authoritative `projectChatWindowingByProjectConfigId`, which was required after removing the old backend fallback behavior.
- Added backend regression coverage for scriptable-history rejection in managed chat continuity, linked-chat continuity rejection, and share-policy behavior after the dead route removal.
- Added Vitest coverage for minimized/closed external-window placeholders, non-chat section placeholder rendering under hidden external binding, standalone thread not-found gating, share standalone route rendering, git graph project reload behavior, and fallback chat hydration behavior.
- Added Playwright coverage for standalone thread hydration when local history is empty and for minimized floating section windows preserving their canvas placeholder.
- Updated E2E helper API-error allowlists so expected `404`s from cross-runtime hydration probes do not abort browser verification.

UX before vs after:
- Before: standalone share links could land on the generic project page, valid backend-only chats could false-404, externalized sections could pop back into the canvas when hidden, and git graph windows could show a different project’s history. After: standalone URLs stay canonical, backend hydration decides thread existence, placeholders persist while a section is externally bound, and git graph state is scoped to the current project.
- Before: a reused `chatId` could silently cross from `scriptable_chat` into managed project chat. After: runtime mismatch is explicit and immediate, and the user is forced onto a new thread instead of inheriting incompatible history.

DX before vs after:
- Before: the repo still had a few misleading surfaces, including a generated but unused window-space overwrite API and reserved-slug validation that could never fire. After: the endpoint/type surface is smaller and the validation logic reflects the real routing model.
- Before: E2E and backend fixtures could pass with older, non-authoritative backend state shapes. After: the touched tests seed the same backend windowing contract that production code now requires, so regressions fail where the real app would fail.

Verification:
- `pnpm -C frontend exec vitest run src/state/actions/aiStopProjectChat.test.ts src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Pages/Project/ShareStandaloneProjectSurfacePage.test.tsx src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/state/actions/projectChatWindowing.test.ts src/state/actions/git.test.ts src/utils/sectionSlugPaths.test.ts` passed: 8 files, 98 tests.
- `source activate.sh && ./scripts/run_backend_tests.sh tests/agentic/test_chat_continuity.py tests/routers/test_mcp_linked_chat_tool.py tests/routers/test_share_policy_routes.py tests/routers/test_ai_agent_run_chats.py::TestAgentRunChatRoutes::test_managed_engine_rejects_scriptable_history_on_reused_chat_id -q` passed: 30 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts` passed: 11 tests.
- `./scripts/run-playwright-e2e.sh --grep "minimized floating section windows keep their canvas placeholder" frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts` passed.
- CDP verification completed on a disposable local app instance. The standalone `/sample_project/chat/cdp-visual-thread` route rendered hydrated thread content with no workspace panes, and a minimized floating section preserved the canvas placeholder with the expected recovery actions visible.

## 2026-03-09 22:14:51 PDT

Implemented the review-requested fixes for backend state invariants, route-scoped standalone thread blocking, multi-host section-chat isolation, and backend-authoritative git-pane cleanup, then normalized direct backend test fixtures to match the stricter contract.

Backend model and fixture authority:
- `ProjectStateBackend` now validates that every `projectConfigs` entry has a matching `projectChatWindowingByProjectConfigId` entry at construction time instead of letting request handlers discover missing windowing state later.
- Updated direct backend test constructors and helper fixtures across MCP, router, websocket, agentic, share, and database tests so they seed authoritative per-project windowing state instead of depending on a lazy fallback that no longer exists.
- This removes the request-time `500` class where MCP `/__setta__/tools/call` scope resolution could crash while trying to slice backend state for an otherwise valid request.

Frontend state ownership and reconciliation:
- Standalone `/:projectConfigName/chat/:chatId` routes now track blocked hydration state by the active `chatId`, so a prior `chat_not_found` verdict cannot poison later valid navigation in the same mounted tab.
- Section-backed chat surfaces now receive host-specific `surfaceId`s when rendered from standalone pages, saved window spaces, or live floating/docked/maximized windows, while canvas-hosted section chat keeps the section-owned id. This isolates draft thread state, pending transcript state, and other surface-local ownership even when two live hosts show the same section.
- Backend project-state reconciliation now runs the same git-pane ephemeral cleanup used by local authoritative windowing writes. Reused or repurposed instance ids no longer keep stale `projectChatGitGraphEmbeddedPaneVisibleByInstanceId` or tracked maximized-git-window state alive after a backend restore/rebase/update.
- Removed the dead `UnifiedChatSurface` git-graph rendering path. Git graph windows now have a single supported rendering path through `GitGraphWindowContent(instanceId=...)`, and unsupported uses surface an explicit warning instead of silently doing the wrong thing.

UX before vs after:
- Before: one invalid standalone thread URL could leave the tab stuck on `Thread Not Found` until refresh; after, same-tab navigation to a valid thread immediately hydrates the requested route.
- Before: the same chat section rendered in two live hosts could leak draft/new-thread state between them; after, each host owns its own local project-chat surface state.
- Before: backend-authoritative windowing updates could resurrect stale git sidebar state on a reused instance id; after, authoritative updates prune that ephemeral state consistently.
- Before: MCP tools-call flows could fail with opaque `500`s for backend states that should have been rejected earlier; after, invalid project-state shape fails at construction and valid runtime requests keep their intended behavior.

DX before vs after:
- Before: state authority was split between model construction, route-local error state, and host-agnostic section surface ids; after, ownership is explicit at the model boundary, route boundary, and surface boundary.
- Before: git-pane cleanup behavior depended on whether the layout change came from a local setter or a backend reconciliation path; after, both paths share the same cleanup helper.
- Before: many direct backend fixtures were constructing partial state that production code no longer tolerated; after, the touched fixtures encode the real authoritative backend shape and fail closer to the real contract.

Verification:
- `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx src/state/actions/sectionInfos.projectChatWindowingSync.test.ts src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/components/Section/Container/SectionWindowSurface.test.tsx src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx` passed: 6 files, 33 tests.
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_project_chat_windowing_persistence.py tests/routers/test_mcp_tools_call_agentic_scope_enforcement.py tests/routers/test_share_policy_routes.py -q` passed: 38 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "same-tab SPA navigation"` passed.
- `source activate.sh && python -m compileall backend tests` completed successfully after the backend fixture updates.
- Follow-up spot-check: `tests/mcp/test_mcp_agentic_scope_cache_invalidation.py::test_mcp_agentic_scope_cache_invalidates_on_history_coalesce` is still failing on pre-existing expectation drift unrelated to the reviewed regressions; this turn did not retune that cache test.
- CDP verification on the live dev instance confirmed the same-tab standalone invalid-thread -> valid-thread flow now clears the stale not-found state and renders the valid transcript on the requested route.

## 2026-03-09 23:03 PDT

Implemented the remaining consolidated fixes for section-backed project-chat authority, host-qualified draft-surface ownership, full-load git-pane reconciliation, and project-scoped git detail requests, then locked the behavior down with targeted unit, integration, browser, and CDP verification.

What changed:
- Added canonical project-chat surface id builders in `frontend/src/components/ChatWindowing/projectChatSurfaceIds.ts` and rewired live workspace windows, standalone window-space windows, standalone `/chat` routes, and workspace canvas sections to use those host-qualified ids instead of reusing bare `instanceId`s.
- Updated `UnifiedChatSurface` so section-backed `project_ai_mode` hosts resolve their authoritative thread from `projectChatWindowing.instancesById[*].chatId` and write back through `setProjectChatWindowChatId(...)`. Canvas sections and standalone section routes no longer fall back to `useAIStore.activeChatId`.
- Exported the section-binding getter from `frontend/src/state/actions/projectChatWindowing.ts` so section hosts and tests consume the same authoritative binding lookup used by the rest of the windowing model.
- Routed full project loads through git-window ephemeral reconciliation in `frontend/src/state/actions/project/loadProject.ts`, so tracked maximized git windows and embedded-pane visibility are pruned against the incoming authoritative layout on initial/full loads, not only websocket reconciliation updates.
- Scoped `selectGitCommit(...)` and `selectGitCommitFile(...)` in `frontend/src/state/actions/git.ts` to the owning `projectConfigId`, matching the already-correct git-log/load-more guard behavior and rejecting stale detail/diff responses after project switches.
- Fixed a broken tracked-git-window cleanup call site in `frontend/src/state/actions/projectChatWindowing.ts` that Playwright surfaced while driving the shared window-resize/window-space flows.

UX before/after:
- Before: a canvas chat section or standalone section route in `project_ai_mode` could read and mutate the workspace-global project chat thread. After: each section-backed host always reopens and mutates its bound section thread.
- Before: workspace windows and standalone window-space windows that intentionally reused the same saved `instanceId` could share pending draft/new-thread state. After: each live host owns its own draft bucket via a host-qualified surface id.
- Before: switching projects on a full load could preserve stale git-pane visibility or tracked maximized graph state when instance ids were reused. After: git-pane ephemera is reconciled on every authoritative project load.
- Before: slow commit-detail or file-diff responses from project A could still paint into project B if the user switched projects during the request. After: all git-graph async branches honor the same project boundary.

DX before/after:
- Before: section-backed `project_ai_mode` still had two authority paths, one through `projectChatWindowing` and one through ambient `activeChatId`. After: thread identity for section-backed project chat comes from a single authoritative binding record.
- Before: surface-local chat state was only “local” if every caller remembered not to reuse a raw window id across hosts. After: the host namespace is encoded directly in the surface id builder, so call sites do not need ad hoc rules.
- Before: initial project load and backend reconciliation followed different git-window cleanup rules. After: both authoritative publish paths share the same cleanup invariant.
- Before: a hidden bad helper reference in windowing cleanup was easy to miss because most unit tests did not exercise the exact browser-driven resize/save path. After: the affected browser flow is covered and the shared helper reference is correct again.

Verification:
- `pnpm -C frontend exec vitest run src/components/ChatWindowing/projectChatSurfaceIds.test.ts src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChat.multiSurface.integration.test.tsx src/state/actions/project/loadProject.test.ts src/state/actions/git.test.ts` passed: 7 files, 62 tests.
- `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.test.ts` passed after the Playwright-discovered helper fix: 34 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone section routes stay bound to their section thread and keep workspace project chat isolated|saved window spaces preserve distinct project chat threads per window in both workspace and standalone views|standalone section windows keep their saved project-ai thread even without a live workspace binding"` passed: 3 tests.
- CDP verification on the live dev instance confirmed that a canvas chat section switched into `project_ai_mode` rendered its bound section transcript on the workspace canvas, and the standalone `/:projectConfigName/section/:sectionSlug` route rendered the standalone host chrome against that same section binding instead of inheriting workspace-global chat selection.

## 2026-03-10 09:15:31 PDT

Implemented the remaining consolidated review fixes for backend-authoritative window-space persistence, layout permissions in read-only share/deployment sessions, and first-run linked-chat concurrency, then tightened the API contract and backfilled the missing browser-level regression coverage.

What changed:
- `BaseProjectManager.set_project_chat_windowing_state(...)` now returns the normalized authoritative `ProjectChatWindowingState`, and `create_window_space(...)` now returns the authoritative `WindowSpaceConfig` instead of only an id. The frontend save path in `windowSpaces.ts` now persists from those backend responses rather than re-reading the local store and assuming optimistic reconciliation already matches server normalization.
- Added manager-side linked-chat section reservation methods that serialize “resolve or reserve” behavior for section chat ids. `invoke_linked_chat(...)` now reserves the section binding before runner startup, marks the reservation authoritative only after a successful start, and releases only still-pending reservations on failure paths.
- Centralized layout-edit gating in `projectChatWindowing.ts` using share capabilities, blocked project-chat layout mutations when `allowLayoutChanges` is false, and added rollback when optimistic layout writes are rejected.
- Updated the overview Project AI manager, the bottom dock, and the section window toggle button so read-only share/deployment sessions no longer expose mutating layout affordances or auto-create project chat windows.
- Tightened the router surface by restoring explicit return types for `route_set_project_chat_windowing_state(...)` and `route_create_window_space(...)` so generated/frontend contracts stay aligned with the new authoritative backend responses.
- Browser verification exposed a real runtime regression from the permission-gating work: `MinimizedPillStrip` referenced `canEditLayout` without receiving it as a prop. That bug is now fixed and covered by the browser path that actually renders the minimized-pill strip.

UX before/after:
- Before: saving a window space could persist a locally reconstructed layout that still included floating section bindings the backend had already normalized away. After: save/restore is derived from the backend-normalized layout, so reloads and saved spaces match the real authoritative state.
- Before: read-only deployment/share sessions could still auto-create chat windows, show `New chat` or window-host actions, and then drift locally after a `403`. After: those sessions present the layout as non-editable from the start and rejected writes roll back cleanly.
- Before: overlapping first linked-chat invocations for the same section could race and fork the section onto different threads or leave last-writer-wins binding. After: concurrent first-run invocations deterministically reuse one reserved section chat id.

DX before/after:
- Before: the frontend save test for window spaces relied on a mock that mutated local state in a way production transport never did. After: the save path and its tests both consume the actual backend response contract.
- Before: layout permission checks were fragmented between individual UI surfaces and optimistic writes could leave local windowing state dirty after a rejected request. After: one shared gate controls layout mutation entry points and the optimistic path has an explicit rollback contract.
- Before: linked-chat tests did not exercise the real queue boundary where section chat binding races occur. After: the manager exposes explicit reservation lifecycle methods and the affected backend tests assert pending reuse and failure cleanup behavior directly.

Verification:
- `pnpm -C frontend exec vitest run src/state/actions/windowSpaces.test.ts src/state/actions/projectChatWindowing.permissions.test.ts src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.test.tsx src/components/Section/Header/SectionWindowToggleButton.test.tsx` passed: 4 files, 23 tests.
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_project_chat_windowing_persistence.py tests/routers/test_mcp_linked_chat_tool.py tests/routers/test_share_policy_routes.py` passed: 44 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/layout/project-chat-layout-permissions.spec.ts` passed.
- CDP verification on the live dev instance confirmed that seeding a read-only share state with empty project chat windowing produced no project-chat surface, no bottom-dock create control, no `New chat` action, and no mutating Project AI manager controls.

## 2026-03-10 10:12:41 PDT

Implemented the remaining consolidated fixes from the three review documents, covering atomic linked-chat admission on the backend, consistent optimistic rollback on frontend windowing writes, non-destructive window-space restore semantics, and project-config-scoped standalone window-space identity.

What changed:
- Added `LinkedChatSectionAdmission` and `LinkedChatAdmissionError` in `backend/setta/project_state/linked_chat_admission.py`, then moved linked-chat target validation, engine/profile resolution, permission/search/thinking capture, and chat-id reservation into the queued manager method `admit_linked_chat_section_invocation(...)`.
- Updated `BaseProjectManager` so linked-chat reservation is manager-local until a run actually starts. `reserve_linked_chat_section_chat_id(...)` now only reserves, `mark_linked_chat_section_chat_start_succeeded(...)` is the only pathway that persists `section.chatId`, and `release_linked_chat_section_chat_start_failure(...)` only clears the authoritative binding when the failed start had already claimed that exact chat id.
- Rewired `invoke_linked_chat(...)` to consume the admission snapshot instead of preflighting stale state and then starting with different runtime settings. The linked-chat tool now fails closed when the target changes between request receipt and queued admission, and it uses the latest authoritative engine/profile/permission/search settings when the target still exists.
- Tightened the generic optimistic mutation helper in `frontend/src/state/actions/sectionInfos.ts` so any non-`200` response, including `{ hasResponse: false }`, or a rejected promise removes the pending op and applies rollback.
- Updated `projectChatWindowing.ts` so focus/chat-id mutations roll `activeChatId` together with the authoritative windowing snapshot. Rejected focus/chat reassignment writes no longer leave a split-brain UI where the layout reverts but the selected project chat does not.
- Added a shared optimistic window-space mutation helper in `windowSpaces.ts` and moved rename/delete/sort-order persistence through that path, so all overview window-space mutations snapshot and restore the same store slice on failure.
- Changed workspace restore semantics so saved floating section windows lose to an existing live non-floating host for the same section. Restoring a saved floating layout now preserves canvas/docked/maximized section ownership instead of ripping a section off its current host.
- Scoped standalone window-space hydration by `${projectConfigId}:${windowSpace.id}` and keyed the standalone page surface with the same composite identity. Same-tab navigation between copied configs that intentionally reuse the same saved `windowSpace.id` now resets local bounds/chat/draft state to the copied config’s own saved layout instead of inheriting the previously viewed config’s local edits.

UX before/after:
- Before: linked-chat startup could reserve or persist a thread too early, then race against target edits and start with stale settings or leave a ghost binding behind on failure. After: linked chat admission is atomic from authoritative state and the section only becomes bound once startup succeeds.
- Before: rejected reorder/delete/focus/chat-id writes could leave the UI showing a layout or active project chat that the backend never accepted. After: failed optimistic writes roll back the full relevant frontend state slice, including `activeChatId` when it depends on the rejected window mutation.
- Before: opening a saved floating window space could evict a section from a live canvas/docked/maximized host if the saved layout contained the same section as a floating window. After: restore is non-destructive for existing non-floating hosts and only reintroduces compatible floating windows.
- Before: same-tab standalone navigation across copied project configs could leak resized bounds or local chat selection because the route reused `windowSpace.id` as the only hydration identity. After: copied configs hydrate from their own saved state and ignore local edits from previously viewed configs.

DX before/after:
- Before: linked-chat invariants were split across preflight, reservation, and run-start code paths, which made race behavior hard to reason about and harder to test. After: there is one queued admission entry point with a clear reservation lifecycle and explicit failure modes.
- Before: rollback behavior depended on each mutation site remembering what counted as failure and which secondary stores also needed to be restored. After: the shared optimistic helpers enforce a consistent rollback contract for both project chat windowing and window-space overview mutations.
- Before: standalone window-space hydration implicitly assumed `windowSpace.id` was globally unique across project configs, which copied-config workflows violate by design. After: the identity boundary is explicit in both the hydration helper and the mounted React subtree.
- Before: restore semantics conflicted with the branch’s backend-authoritative, single-host section model. After: the restore helper encodes that model directly, which makes the intended behavior easier to explain and cover in tests.

Verification:
- `source activate.sh && ./scripts/run_backend_tests.sh tests/project_state/test_project_chat_windowing_persistence.py tests/routers/test_mcp_linked_chat_tool.py` passed: 26 tests.
- `pnpm -C frontend exec vitest run src/state/actions/windowSpaces.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Panes/Overview/WindowSpacesPane.test.tsx` passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "same-tab standalone navigation isolates copied project configs even when the window-space id is reused|restoring a saved floating section window does not evict a live canvas section host"` passed: 2 tests.
- CDP verification on a disposable local dev instance confirmed two browser-level outcomes: resizing the source config’s standalone saved window space to `630px` did not leak into the copied config, which rehydrated the same window at its saved `550px` width, and restoring a saved floating collision layout preserved the live canvas section host without spawning a duplicate floating section window.

## 2026-03-10 11:14:16 PDT

Implemented the final set of fixes from the top-level review documents, centered on making linked-chat invocation semantics deterministic for both fresh and already-bound targets, aligning the tool capability model with its actual mutating behavior, and preventing standalone window-space routes from carrying stale owner-local UI state across owner rebinding.

What changed:
- Introduced an explicit `peer_chat` tool access type in `backend/setta/mcp/tool_metadata.py` and rewired the linked-chat tool metadata in `backend/setta/mcp/tools/agentic_tools.py` to use that capability instead of `read`.
- Updated scope evaluation and tool filtering in `backend/setta/agentic/agentic_scope.py` and `backend/setta/llm/agent_runner.py` so linked-chat availability is controlled by peer-chat edges rather than by the generic non-mutating read path.
- Reworked linked-chat admission in `backend/setta/project_state/base_project_manager.py` so every target section, including sections already bound to a `chatId`, gets one exclusive busy claim while a linked invocation is active. Competing invocations now receive a structured `target_busy` admission failure instead of racing on the same chat.
- Tightened linked-chat failure cleanup in `backend/setta/agentic/linked_chat_invocation.py` so every post-admission pre-start failure path releases the in-memory reservation, newly created bindings are only persisted after a successful start, and the busy claim is only released after `wait_for_run(...)` finishes.
- Added a distinct `missing_external_config` error path for external-engine linked-chat startup, instead of misclassifying that condition as an invalid engine configuration.
- Removed the now-dead linked-chat helper seam that only supported the earlier partial reservation model, along with the unused linked-chat tool-name constant.
- Changed standalone window-space hydration in `frontend/src/components/Pages/Project/StandaloneWindowSpaceSurface.tsx` so reusing the same saved `instanceId` no longer preserves prior owner-local thread/git state when the owner identity tuple changes. Owner rebinding now remounts from the new owner’s saved state.

UX before/after:
- Before: a linked chat targeting an already-bound section could overlap with another linked invocation on the same thread, making prompt ordering and resulting transcript state ambiguous. After: every linked-chat target follows the same single-run admission contract, regardless of whether the section is being bound for the first time or already has a chat.
- Before: failed linked-chat startups could leave hidden reservation residue behind, so retries could be blocked or behave inconsistently after runner/config validation failures. After: failed starts are cleanly released and retries begin from a truly idle target state.
- Before: permission metadata advertised `invoke_linked_chat` as `read`, even though it starts runs and can persist section ownership. After: the tool appears only when peer-chat capability is present, matching what the operation actually does.
- Before: a standalone saved window reusing the same `instanceId` could visually rebind to a different owner while still showing stale local chat selection or embedded git-pane state from the previous owner. After: owner rebinding resets owner-scoped local state and the route rehydrates from the new owner’s persisted data instead of leaked local residue.

DX before/after:
- Before: linked-chat concurrency rules differed between first-run and already-bound targets, which made the backend contract difficult to explain and easy to mis-test. After: there is one admission model and one busy-state story for every target section chat.
- Before: startup cleanup was spread across multiple partial failure branches, which made it easy to miss a release path when engine/profile/config checks evolved. After: admission, start success, start failure, and run completion each have explicit manager methods with clearer lifecycle boundaries.
- Before: scope reasoning around linked chat was muddy because the tool was surfaced through `read`, weakening the meaning of both tooling metadata and agent-scope graphs. After: capability classification, scope checks, and runtime behavior now agree.
- Before: standalone hydration implicitly treated `instanceId` as enough identity even when the saved window was rebound to a different owner, so local UI state could outlive its actual owner. After: owner identity is explicit in the merge logic, which makes the remount/reset rule easier to reason about and to cover in tests.

Verification:
- `source activate.sh && pytest tests/agentic/test_agentic_scope.py tests/llm/test_agent_runner.py tests/mcp/test_tool_access_metadata_completeness.py tests/project_state/test_project_chat_windowing_persistence.py tests/routers/test_mcp_linked_chat_tool.py` passed: 80 tests.
- `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx` passed: 12 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts -g "standalone window-space owner rebinding resets stale local section thread state"` passed: 1 test.
- CDP verification on the live dev instance confirmed that after clearing a standalone window’s local section thread and rebinding the same saved window id to a different section owner, the route rendered the new owner’s saved reply instead of preserving stale local thread state from the prior owner.

## 2026-03-10 12:07:24 PDT

Implemented the last consolidated review fixes for read-only project-chat authority and standalone `section_mode` thread restore, then added backend, frontend, and browser regressions around both paths.

What changed:
- Added a dedicated backend mutation for project-chat window thread ownership: `set_project_chat_window_chat_id(...)` in the manager layer plus `/setProjectChatWindowChatId` in the router/types/endpoints. This path is explicitly gated by `allowLLM`, not by `allowLayoutChanges`, so it matches the actual permission boundary for chat access rather than layout editing.
- Kept the existing layout mutation route for true layout edits only. Create/move/resize/minimize/maximize/close/save still flow through `set_project_chat_windowing_state(...)`, while per-window `chatId` reassignment now persists independently.
- Changed frontend project-chat windowing actions so read-only deployments still update local focus/z-order and can persist thread selection through the dedicated chat-id route. Rejected chat-id writes now roll back through the existing optimistic mutation path without coupling that rollback to layout permission checks.
- Threaded controlled chat ownership through the shared managed section-chat surface. `UnifiedChatSurface` now passes owner-local `projectChatId` control into `ChatArea`, and `ChatArea`/`ManagedChatArea` use that controlled `chatId` when present instead of always reading and writing the workspace section binding.
- This makes standalone saved window-space section windows authoritative over their own saved `window.chatId` in `section_mode`, the same way they already were in `project_ai_mode`, so reopening a saved layout no longer falls back to the live workspace section thread.
- Regenerated frontend/backend endpoint and type bindings after adding the new route so the transport layer stays source-of-truth aligned with the backend.

UX before/after:
- Before: a read-only share or deployment session could render an existing project-chat window, but the first thread selection/send could fail behind a layout `403`, and overlapping chat windows could refuse to come to the front because focus was treated as a forbidden layout edit. After: read-only sessions still block real layout mutations, but existing chat windows can select/create threads and be focused normally.
- Before: reopening a standalone saved section window in `section_mode` could silently show the live workspace section conversation instead of the saved thread, so the same saved layout reopened to different content depending on external workspace state. After: standalone restore uses the saved window-owned `chatId`, so the reopened section window reliably shows the thread that was saved with that layout.

DX before/after:
- Before: layout authority, chat-thread authority, and focus behavior were entangled in one project-chat windowing mutation path, which made permission failures look arbitrary and made the bug hard to isolate. After: the permission model is split along actual ownership boundaries, so layout writes, chat ownership, and local focus each have a clear contract.
- Before: `window.chatId` was persisted through standalone window-space state, but the managed section-chat renderer ignored it in `section_mode`, so state inspection suggested the right thread would restore even though the UI used a different owner at render time. After: workspace-backed surfaces still use canonical section state, while standalone hosts can intentionally override that with their own controlled saved thread id.

Verification:
- `source activate.sh && ./scripts/run_backend_tests.sh tests/types/test_project_chat_windowing.py tests/routers/test_share_policy_routes.py` passed: 29 tests.
- `pnpm -C frontend exec vitest run src/components/ChatWindowing/UnifiedChatSurface.test.tsx src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx src/state/actions/projectChatWindowing.permissions.test.ts src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/projectChatWindowing.test.ts src/state/actions/windowSpaces.test.ts` passed: 6 files, 92 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/layout/project-chat-layout-permissions.spec.ts -g "read-only deployments keep visible project chat windows focusable"` passed: 1 test.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts -g "standalone section windows keep their saved section-mode thread when the workspace thread changes"` passed: 1 test.
- CDP verification was attempted but could not run because `chrome-devtools-mcp` could not connect to Chrome on `127.0.0.1:9320`. The automated Playwright regressions above cover the affected browser flows until the debug Chrome session is available again.

## 2026-03-10 13:54:24 PDT

Implemented the remaining consolidated fixes from the three top-level review documents for linked-chat executability, read-scope correctness, read-only project-chat layout gating, and backend rejection of impossible project-chat/window-space ownership state.

What changed:
- Added `backend/setta/agentic/linked_chat_targets.py` as the single source of truth for whether a linked chat target is actually executable. This now validates managed chat type, agent profile existence, engine-config existence, external-agent config wiring, and resolvable LLM/external engine config before a target can be surfaced or executed.
- Reused that executable-target check from `build_agentic_context_payload(...)` and the manager mutation paths. Context payload generation now omits non-executable linked-chat targets, while `create_agentic_edge(...)`, `update_agentic_edge(...)`, and `set_agentic_edges(...)` fail fast with `422` instead of allowing stale or impossible `chat_chat` edges to persist.
- Added pruning after chat-section settings changes so an already-saved linked edge is removed when a target chat stops being executable because its profile or engine settings become invalid.
- Updated the frontend linked-agent picker in `ChatAreaSettings.tsx` to apply the same executability contract before offering linked chat targets, rather than advertising targets that the backend/runtime would later reject.
- Removed linked chats from read-scope summaries and read-highlighting. Read scope now comes only from actual `readSectionIds`, while linked chats stay in their own linked-agent/peer-chat lane instead of leaking into generic read semantics.
- Introduced a shared layout-mutation gate on `ProjectChatWindowSurface` and threaded it through the dock/floating/maximized project-chat window host. When `allowLayoutChanges=false`, existing windows still render and can be focused, but they no longer expose drag handles, resize handles, close/dock/minimize/maximize/show-in-canvas buttons, or title editing.
- Added explicit backend validation for invalid owner/mode combinations in both `projectChatWindowing` and `windowSpaces`, then wired those failures through the write routes as `422` responses. Invalid project-chat `section_mode` windows without a section binding, git-graph windows carrying a section id, and project-chat window-space entries with section owners are now rejected at persistence time instead of rehydrating as broken frontend state.

UX before/after:
- Before: the linked-agent picker could show chat targets that looked selectable but were guaranteed to fail later because the target was unmanaged, missing an engine, or missing external-agent configuration. After: only executable linked-chat targets are shown and preserved.
- Before: linked chats appeared in read-oriented summaries and highlight maps, which implied ordinary read access even when the actual capability was only peer chat. After: read access and linked-chat access are presented as separate concepts with matching runtime behavior.
- Before: read-only share/deployment sessions still showed existing project-chat windows with drag, resize, title-edit, and window-action affordances that no longer had permission to persist. After: the windows remain usable for focus and chat, but the mutating layout affordances are removed from the chrome.
- Before: malformed persisted window payloads could save successfully and later reopen as warning-only dead state. After: invalid owner/mode combinations fail immediately at the backend write boundary with `422`.

DX before/after:
- Before: linked-chat executability rules were split across frontend filtering, context generation, and runtime admission, which made regressions easy whenever engine/profile rules changed. After: one backend resolver defines the contract and both backend and frontend tests target that contract.
- Before: read-scope highlighting and linked-chat capability reused overlapping state, which made the agentic model harder to reason about. After: read scope, peer chat, and linked-agent surfacing are explicit and independently testable.
- Before: layout permission enforcement was scattered across different project-chat hosts and still allowed false affordances in already-visible windows. After: the shared surface takes `allowLayoutMutations` and strips mutating UI in one place.
- Before: the frontend warning UI was effectively tolerating backend-invalid window ownership state. After: persistence validation lives with the backend types/routes and the frontend only renders states that satisfy the backend model.

Verification:
- `source activate.sh && ./scripts/run_backend_tests.sh tests/types/test_project_chat_windowing.py tests/types/test_project_state_window_spaces.py tests/agentic/test_agentic_context_payload.py tests/routers/test_share_policy_routes.py` passed: 49 tests.
- `pnpm -C frontend exec vitest run src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.test.tsx src/state/hooks/agenticScopeHighlights.test.ts src/components/ChatWindowing/ProjectChatWindowSurface.test.tsx src/state/agenticScopeUtils.test.ts src/state/actions/projectChatWindowing.permissions.test.ts src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx` passed: 6 files, 25 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/layout/project-chat-layout-permissions.spec.ts` passed: 2 tests.
- CDP verification on the live dev instance at `http://127.0.0.1:3098/bronze_calm` seeded two floating project-chat windows under share mode with `allowLayoutChanges=false`, confirmed that no layout controls or resize handles rendered, confirmed title editing did not appear, and confirmed a background window could still come to the front by updating local z-order.

## 2026-03-10 14:40:59 PDT

Implemented the remaining consolidated review fixes for standalone managed-chat admission, additive window-space restore semantics, and minimized-window recovery from the Overview manager.

What changed:
- Added standalone managed-chat admission helpers in `frontend/src/components/Chat/sharePolicyChatAccess.ts` so standalone page targets can answer one question from source-of-truth state: whether a route would mount managed chat at all. This now distinguishes project chat, chat-backed section routes, project-chat window-space entries, and non-chat standalone surfaces such as git graph or ordinary section content.
- Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` to use the same `canUseManagedChatLLM(...)` gate as the rest of the product before rendering standalone managed-chat targets. `/:project/chat`, `/:project/chat/:chatId`, standalone chat sections, and standalone window spaces that contain managed-chat windows now fail closed with a blocked surface when deployment policy disallows LLM access.
- Threaded standalone blocked-error reporting through `SectionWindowSurface` and `AreaSwitch` so standalone section routes and standalone window-space section hosts can also surface terminal managed-chat denials, instead of only top-level standalone project-chat routes participating in blocked-state handling.
- Changed chat hydration classification in `frontend/src/state/actions/ai.ts` so backend `403` chat hydration failures are terminal `llm_disallowed` errors rather than transient failures. This closes the mid-session policy-change hole where a denied standalone route could still render a dead-end chat shell after backend refusal.
- Added blocked-copy handling for `llm_disallowed` in `ProjectChatCore.tsx`, keeping the blocked-state taxonomy explicit instead of collapsing policy denial into the generic terminal hydration bucket.
- Reworked workspace restore in `frontend/src/state/actions/windowSpaces.ts` so restoring a saved window space is additive for unrelated live floating windows. Restore now computes which current floating windows are actually superseded by the saved layout, reserves ids against all surviving live windows, keeps unrelated floating work intact, still preserves non-floating authoritative section hosts, and still replaces conflicting floating owners deterministically.
- Updated `ProjectChatManager.tsx` so minimized windows use the same hidden-state recovery path as closed windows. Hidden rows now show `Reopen`, visible rows show `Hide`, and stable `data-testid` hooks were added for browser verification.

UX before/after:
- Before: denied deployments could still deep-link into standalone managed-chat shells and only fail after backend hydration/send requests. After: the standalone route layer blocks those surfaces up front and uses the same access rule as the Overview/workspace managed-chat UI.
- Before: a restored saved layout could silently drop unrelated live floating chats because restore rebuilt workspace windowing from `non-floating + restored`. After: restore keeps unrelated floating windows visible and only replaces windows that intentionally collide with the restored layout's ownership.
- Before: the Overview manager listed minimized windows but offered `Hide`, which was a no-op for already minimized rows, so the manager could not actually recover one of the hidden states it displayed. After: minimized rows show `Reopen` and restore the same window instance back into view.

DX before/after:
- Before: standalone admission reasoning was split across route shape, managed-chat rendering, and backend failures, which made deployment-policy regressions easy to reintroduce on new standalone targets. After: the standalone target is classified once and compared against the same managed-chat capability gate used elsewhere.
- Before: restore semantics mixed id collision handling with an implicit assumption that all current floating windows were disposable. After: superseded floating owners are explicit, id reservation is done against the full surviving live set, and the merge contract is easier to read and test.
- Before: the manager UI modeled `isClosed` and `isMinimized` differently even though both states are hidden and both need a recovery action. After: the action model matches the reducer contract, which simplifies both unit assertions and browser tests.

Verification:
- `pnpm -C frontend exec vitest run src/components/Chat/sharePolicyChatAccess.test.ts src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.test.tsx src/components/Panes/Overview/ProjectLevelAI/projectChatExecutionSettings.test.ts src/state/actions/aiStopProjectChat.test.ts src/state/actions/windowSpaces.test.ts` passed: 6 files, 120 tests.
- `pnpm -C frontend exec vitest run src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx src/components/Section/Container/SectionWindowSurface.test.tsx` passed: 2 files, 14 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "restoring a saved window space preserves unrelated live floating windows"` passed: 1 test.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts --grep "the Project AI manager reopens minimized windows"` passed: 1 test.
- CDP verification on the live dev instance at `http://127.0.0.1:3098/having_winning` confirmed two concrete outcomes: minimizing the default Project AI manager row changed its action from `Hide` to `Reopen`, and clicking `Reopen` restored the same docked window; separately, after scripting a saved floating layout plus an unrelated live floating window, restoring the saved layout kept both floating windows visible while returning the restored window to its saved bounds.
- Browser automation coverage for the standalone share deep-link fail-closed route was left at unit/component level in this change. The route-level gate itself is covered in `StandaloneProjectSurfacePage.test.tsx`, while the added Playwright coverage targets the persisted restore and minimized-manager flows that do not rely on mutating in-memory share-session state across reload boundaries.

## 2026-03-10 15:49:45 PDT

Implemented the remaining consolidated review fixes for linked-chat executability on the real session-backed manager stack and for authoritative saved window-space persistence of git-graph window state.

What changed:
- Removed the hidden `self.agent_runner` dependency from `backend/setta/project_state/base_project_manager.py` and replaced it with a manager-safe LLM-config loader sourced from `dbe`. Linked-chat admission, linked-edge validation, and linked-edge pruning now all resolve executability through the same canonical config path, so `SessionProjectManager` and share-session managers use the same contract as server-state-backed paths.
- Tightened window-space owner validation in `backend/setta/types/project_chat_windowing.py` and moved that check onto the `WindowSpaceWindow` model in `backend/setta/types/project_config.py`. Invalid persisted tuples such as `surfaceKind="section"` plus `mode="git_graph_mode"` or project-chat windows carrying a section owner now fail at model construction instead of being accepted and failing later during restore.
- Added persisted `embeddedGitPaneVisible` state to `WindowSpaceWindow` and regenerated frontend/backend bindings so save/restore now carries that bit as real persisted layout state instead of dropping it into purely ephemeral workspace misc state.
- Updated `frontend/src/state/actions/windowSpaces.ts` so saving a floating git-graph window snapshots the current embedded-pane visibility, workspace restore remaps that visibility across any instance-id collision handling, and unrelated live git-graph windows keep their current visibility state when a saved layout is restored additively.
- Updated `frontend/src/components/Pages/Project/StandaloneWindowSpaceSurface.tsx` so standalone window-space hydration consumes the persisted `embeddedGitPaneVisible` field and reopens standalone git-graph windows exactly as saved instead of always forcing the pane closed.

UX before/after:
- Before: real linked-chat invocation on `SessionProjectManager` could crash with `AttributeError: 'SessionProjectManager' object has no attribute 'agent_runner'` during admission, edge CRUD, or chat-settings pruning. After: linked-chat flows either admit or fail with structured target-resolution errors on the real manager stack.
- Before: users could save impossible git-graph window-space ownership state or save a git-graph window with the Git pane visible and later reopen it with the pane forcibly hidden. After: invalid layouts are rejected at the model/API boundary and valid git-graph window spaces reopen with the same sidebar visibility that was saved.

DX before/after:
- Before: linked-chat executability depended on whether code happened to run under a manager subtype with runtime-only runner state attached, which made the project-state contract inconsistent and easy to regress. After: executability resolution depends only on manager-owned persistence collaborators, so every concrete manager satisfies the same interface.
- Before: window-space state was not an authoritative serialization of visible git-graph layout state, and some invalid owner/mode records only failed after deeper restore logic. After: the persistence model itself encodes the valid owner contract and the saved graph-pane visibility, so tests can assert round-trip behavior directly against source-of-truth state.

Verification:
- `source activate.sh && pytest tests/project_state/test_project_chat_windowing_persistence.py tests/types/test_project_state_window_spaces.py tests/routers/test_agentic_edge_routes.py tests/routers/test_mcp_linked_chat_tool.py -q` passed: 43 tests.
- `source activate.sh && pytest tests/routers/test_share_policy_routes.py -k "window_space_routes_reject_invalid_window_owners" -q` passed: 1 test.
- `pnpm -C frontend exec vitest run src/state/actions/windowSpaces.test.ts src/components/Pages/Project/StandaloneWindowSpaceSurface.test.tsx src/state/actions/sectionInfos.projectChatWindowingSync.test.ts src/state/actions/project/loadProject.test.ts` passed: 48 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts -g "standalone git graph windows keep git-pane visibility local to the standalone surface"` passed: 1 test.
- CDP verification on the live dev instance at `http://127.0.0.1:3098/writing_happy` injected a saved standalone git-graph window-space record with `embeddedGitPaneVisible=true`, navigated to the standalone route, and confirmed the route rendered with the `Hide git pane sidebar` toggle already pressed at both narrow and wide viewport sizes.

## 2026-03-10 20:59:20 PDT

Implemented the remaining consolidated review fixes for legacy project migration, linked-chat validation scope, linked-edge persistence, and standalone section-slug caching.

What changed:
- Added `normalize_project_state_backend_payload(...)` in `backend/setta/types/project_state.py` and wired `DBE.read_project()` / `read_project_required()` through a normalization path in `backend/setta/database/db_objs.py`. Legacy backends that predate `projectChatWindowingByProjectConfigId` now backfill an empty authoritative `ProjectChatWindowingState()` per project config and persist the upgraded backend JSON once, after which the strict invariant still applies.
- Removed destructive linked-chat edge pruning from `BaseProjectManager.set_chat_section_settings(...)`. Changing a target chat from managed to scriptable-only no longer mutates `projectConfig.agenticEdges`; the explicit `chat_chat` topology remains the source of truth.
- Narrowed `_validate_executable_linked_chat_edges(...)` so LLM-config loading only happens for actual `chat_chat` edges. This removes the branch regression where malformed persisted `llm_config` data could block unrelated `chat_section` / `section_chat` edge edits.
- Relaxed agentic-context construction so `build_agentic_context_payload_with_temporary_ids(...)` only loads persisted LLM config when the current chat section actually has outgoing linked-chat edges. Non-linked scoped external-agent runs now stay independent from linked-chat admission metadata and continue to build context successfully even if persisted LLM config is malformed.
- Removed dead helper `_collect_chat_section_ids(...)` from `backend/setta/agentic/agentic_scope.py`, which no longer had production callers.
- Restored shared frontend slug-index memoization in `frontend/src/utils/sectionSlugPaths.ts`, keyed by the authoritative project-state reference set used to derive full slug paths. Repeated rename validation and standalone slug resolution now reuse the derived slug index when the relevant state references have not changed.
- Added a standalone browser regression so a renamed section’s stale slug fails closed and the new slug resolves the renamed section route, covering the user-visible path that depends on the restored slug-index caching.

UX before/after:
- Before: opening an existing workspace created on `main` could fail immediately because the backend now required `projectChatWindowingByProjectConfigId` before load-time upgrade had happened. After: legacy workspaces load, backfill empty authoritative windowing state once, and continue under the strict new schema.
- Before: setting a linked target chat to scriptable-only silently deleted incoming `chat_chat` edges, so restoring the target later still left the user with a broken graph they had to rebuild manually. After: the link remains visible and persisted, but invocation fails closed with `unsupported_scriptable_target` until the target is executable again.
- Before: malformed saved LLM config could unexpectedly break plain scope-edge edits and scoped external-agent runs even when no linked chats were involved. After: only linked-chat-specific paths depend on linked-chat executability inputs.
- Before: rename validation and standalone route resolution rebuilt the entire slug index repeatedly on unchanged state, which made large-project typing and section-route lookups less responsive. After: unchanged lookups reuse the cached derived index, while real rename updates invalidate it and recompute the correct new slug.

DX before/after:
- Before: backend schema strictness was correct in principle but happened too early, at raw payload validation time, which made upgrade behavior depend on whether callers happened to run an out-of-band migration first. After: backend reads own the one-time normalization step, so every consumer sees post-migration state without adding permanent fallback logic to higher layers.
- Before: linked-chat executability leaked across edge editing, chat settings, context building, and runtime invocation in different ways, including destructive mutation and unrelated config coupling. After: user-authored linked edges persist, admission still validates at the point of use, and non-linked flows no longer pay the linked-chat validation cost.
- Before: the frontend had a helper named like a cached selector but it rebuilt the slug index each call, which made behavior and performance assumptions diverge. After: the helper once again behaves like a shared cached derivation, and the tests lock both cache reuse and rename invalidation.

Verification:
- `source activate.sh && pytest tests/database/test_dbe_project_payload_validation.py tests/project_state/test_project_chat_windowing_persistence.py tests/routers/test_agentic_edge_routes.py tests/agentic/test_agentic_context_payload.py tests/agentic/test_external_agent_runner.py tests/routers/test_mcp_linked_chat_tool.py` passed: 166 tests.
- `pnpm -C frontend exec vitest run src/utils/sectionSlugPaths.test.ts src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/components/Pages/router.test.tsx` passed: 3 files, 28 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "renamed slug"` passed: 1 test.
- CDP verification on the live dev instance at `http://127.0.0.1:3098` created a disposable standalone text section route, confirmed the old slug rendered `Section Not Found` after rename, and confirmed the new slug rendered the renamed standalone section surface.

## 2026-03-10 21:18:36 PDT

Implemented the follow-up fix that removes loader-side project-state repair and restores strict authoritative backend validation for per-project chat windowing.

What changed:
- Removed `normalize_project_state_backend_payload(...)` from `backend/setta/types/project_state.py`. The backend model no longer synthesizes `projectChatWindowingByProjectConfigId` entries for missing project configs during reads.
- Simplified `DBE.read_project()` and `DBE.read_project_required()` in `backend/setta/database/db_objs.py` so they validate the payload as-is and never rewrite `project.json` during a read.
- Replaced the prior backfill tests with fail-fast contract tests covering three boundaries: direct `ProjectStateBackend.model_validate(...)`, `DBE.read_project_required()`, and manager reload via `load_initial_state()`.
- Added a canonical-writer non-regression test proving `create_project_config(...)` still seeds and persists an empty authoritative `ProjectChatWindowingState()` for newly created project configs.

UX before/after:
- Before: a malformed or legacy project missing `projectChatWindowingByProjectConfigId` could appear to load successfully because the backend fabricated empty windowing state and wrote the repaired payload back to disk during read.
- After: malformed persisted state fails immediately with the real missing-windowing error, and the original payload remains unchanged for diagnosis or explicit migration.
- Before: a broken saved layout could be silently collapsed into an empty persisted layout as a side effect of opening the workspace.
- After: opening the workspace is side-effect free with respect to schema repair, so invalid state stays visible until corrected at an intentional write or migration boundary.

DX before/after:
- Before: engineers had to reason about two competing sources of truth: strict backend validation and a hidden loader upgrade path that could mutate persisted state during reads.
- After: there is one contract. Canonical writers seed required windowing state; readers validate and fail fast.
- Before: tests codified repair-on-read behavior, which made it easy to reintroduce backward-compatibility shims under the guise of harmless normalization.
- After: the regression tests lock the desired invariant directly and assert that failed reads do not modify `project.json`.

Verification:
- `source activate.sh && ./scripts/run_backend_tests.sh tests/database/test_dbe_project_payload_validation.py tests/project_state/test_project_chat_windowing_persistence.py -q` passed: 17 tests.
- `source activate.sh && python -m ruff check backend/setta/types/project_state.py backend/setta/database/db_objs.py tests/database/test_dbe_project_payload_validation.py tests/project_state/test_project_chat_windowing_persistence.py` passed.
- No Playwright or CDP verification was added for this change because it only affects backend persistence validation and has no direct UI surface.

## 2026-03-10 21:59:52 PDT

Implemented the three remaining consolidated regressions from the transient top-level review docs: replay-safe optimistic rollback for project chat windowing and saved window spaces, authoritative standalone managed-chat admission recovery, and exception-safe linked-chat start promotion.

What changed:
- Updated `frontend/src/state/actions/sectionInfos.ts` so optimistic failure handling no longer just removes a failed pending op and restores stale local state. Failed ops now remove themselves, run their rollback, and immediately replay later surviving optimistic reducers in original order.
- Reworked `frontend/src/state/actions/projectChatWindowing.ts` so persisted project-chat windowing writes are reducer-based instead of full-snapshot replacements. Pending windowing ops now recompute from the latest base state during replay, with stable created window ids carried through create/show flows so out-of-order failures do not resurrect stale earlier mutations.
- Added explicit out-of-order rollback regressions in `frontend/src/state/actions/projectChatWindowing.rollback.test.ts` and `frontend/src/state/actions/windowSpaces.test.ts` covering the concrete failure mode from review: mutation A fails after mutation B already succeeded, and only mutation A should disappear.
- Replaced the sticky standalone managed-chat denial latch in `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` with current-surface blocked-error tracking keyed by active standalone identity plus current deployment policy. The standalone route now clears `llm_disallowed` state when the mounted surface changes or when policy transitions back to `allowLLM=true`.
- Extended `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx` and `frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts` so the same mounted standalone managed-chat route is proven to reopen when deployment policy changes from denied back to allowed.
- Changed `backend/setta/project_state/base_project_manager.py` so linked-chat reservations are only marked `has_started_run=True` after the section chat binding persistence step succeeds.
- Wrapped the post-`commit_mcp_run_start(...)` linked-chat bind promotion in `backend/setta/agentic/linked_chat_invocation.py` so any exception during binding persistence returns a structured `binding_start_failed` error and always releases the reservation/binding claim before retry.
- Added backend coverage in `tests/routers/test_mcp_linked_chat_tool.py` for the exact partial-start failure case where the run starts, binding persistence throws, the reservation is cleaned up, any temporary chat binding is cleared, and a second invocation is admitted immediately.

UX before/after:
- Before: an earlier failed optimistic focus/layout/window-space mutation could overwrite a later accepted mutation and leave the UI showing stale windowing or saved-space state until backend sync corrected it. After: only the failed mutation is reverted; later accepted local state stays visible immediately.
- Before: standalone managed-chat routes could remain blocked on the same mounted page after policy recovered because the page held onto a stale denial bit. After: the route reopens in place as soon as authoritative policy allows LLM access again.
- Before: one transient post-start persistence failure in linked chat could strand a target in an effectively busy state or leave a ghost thread binding behind. After: failed start promotion fully releases state and the next invocation can run normally.

DX before/after:
- Before: optimistic rollback correctness depended on mutation-specific whole-snapshot bookkeeping, which made overlapping async windowing writes race-prone and difficult to reason about. After: the shared optimistic helper owns ordered replay semantics and project chat windowing writes participate as replay-safe reducers.
- Before: standalone managed-chat admission had two sources of truth, current share policy and a write-only UI denial latch. After: the standalone route reasons from current policy plus current surface error state only.
- Before: linked-chat start semantics crossed admission, reservation, run start, and binding persistence with a non-atomic success flip, which made failure cleanup easy to miss. After: the reservation only becomes “started” after persistence succeeds and the failure path is explicit in both manager and invocation-layer tests.

Verification:
- `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/windowSpaces.test.ts src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx` passed: 43 tests.
- `source activate.sh && ./scripts/run_backend_tests.sh tests/routers/test_mcp_linked_chat_tool.py` passed: 28 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "standalone managed project chat route reopens when deployment policy allows LLM again"` passed: 1 test.
- CDP verification on the live dev instance at `http://127.0.0.1:3098/reef_still/chat` confirmed the same standalone managed-chat route blocked under `allowLLM=false` and reopened in place when `allowLLM=true`, without navigation or reload.

## 2026-03-10 22:27:35 PDT

Implemented the linked-chat atomicity fix from the consolidated review pass and simplified the reservation lifecycle so the persisted binding, run-start marker, and failure cleanup are explicit separate steps.

What changed:
- Reworked `backend/setta/agentic/linked_chat_invocation.py` so linked-chat invocation now persists the target section `chatId` before `runner.start_run(...)`, rolls back MCP run authorization on every failure before launch, and only marks the reservation as started after the runner accepts the run.
- Replaced the old overloaded manager transition methods in `backend/setta/project_state/base_project_manager.py` with three focused methods: `persist_linked_chat_section_binding(...)`, `mark_linked_chat_section_run_started(...)`, and `release_linked_chat_section_start_failure(...)`.
- Removed the hidden "run already escaped but `has_started_run` is still false" state from the lifecycle. A `binding_start_failed` response is now a real no-op with respect to run execution for both managed LLM and external-agent linked chats.
- Updated the route-level linked-chat test harness in `tests/routers/test_mcp_linked_chat_tool.py` so its dummy reservation model matches the real manager contract instead of folding persistence and start into a single method.
- Tightened backend regressions so binding-persistence failure asserts zero runner calls, managed and external `run_start_failed` paths assert binding cleanup, and deployment single-run reservations are rolled back when binding persistence fails before launch.
- Updated the real-manager persistence tests in `tests/project_state/test_project_chat_windowing_persistence.py` to assert the new two-phase state transition directly: binding can be persisted while the reservation is still pre-start, then the run-start marker flips separately.

UX before/after:
- Before: a linked-chat call could report `binding_start_failed` after a real linked run had already started, so retrying the same action could execute the target twice and could spend deployment run quota on a "failed" attempt.
- After: any `binding_start_failed` result means no linked run escaped. Retry behavior is predictable, the target is not secretly running, and deployment run accounting stays accurate.
- Before: a failed launch path for a fresh target could leave the lifecycle semantics ambiguous because binding persistence and run start were treated as one transition.
- After: the target binding is either durably present and owned by the active reservation, or it is explicitly removed as part of the same failed-start cleanup path.

DX before/after:
- Before: linked-chat start semantics were hard to reason about because one method both persisted the binding and declared the run started, which made post-start failure handling brittle and easy to regress.
- After: each lifecycle step has one job, the control flow is shallow, and the tests lock the exact invariant the reviews called out.
- Before: the regression suite encoded the duplicate-run bug as acceptable retry behavior.
- After: the tests assert atomic launch semantics across manager-level persistence, route-level managed runs, route-level external-agent runs, and deployment quota accounting.

Verification:
- `source activate.sh && python -m ruff check backend/setta/agentic/linked_chat_invocation.py backend/setta/project_state/base_project_manager.py tests/routers/test_mcp_linked_chat_tool.py tests/project_state/test_project_chat_windowing_persistence.py` passed.
- `source activate.sh && python -m pytest tests/project_state/test_project_chat_windowing_persistence.py -q` passed: 14 tests.
- `source activate.sh && python -m pytest tests/routers/test_mcp_linked_chat_tool.py -q` passed: 30 tests.
- No Playwright or CDP verification was added for this entry because the change is backend-only and does not alter user-visible UI rendering.

## 2026-03-10 23:04:52 PDT

Implemented the remaining frontend regressions from the transient review pass: project-scoped optimistic rollback, causally ordered project-chat windowing persistence, cross-project window-space save isolation, and fail-closed standalone thread routing for blank chat ids.

What changed:
- Reworked `frontend/src/state/actions/sectionInfos.ts` so `dispatchOptimisticProjectStateUpdate(...)` can be bound to a specific `projectConfigId`. Project-scoped optimistic ops now no-op on apply/replay/rollback when the loaded project has changed, and successful responses from a stale project remove their pending op instead of remaining replayable.
- Added `frontend/src/state/actions/projectChatWindowingAuthoritative.ts` as the single in-memory source for the last authoritative `projectChatWindowing` snapshot per project. The cache is updated from both full project loads and backend websocket/state-sync updates, and reset together with other project stores.
- Reworked `frontend/src/state/actions/projectChatWindowing.ts` so all layout/title/focus/chat-id changes use one serialized `route_set_project_chat_windowing_state(...)` persistence path. Each network write is derived from the last authoritative backend snapshot plus the pending mutations up to that operation, instead of posting a stale whole-state snapshot captured before earlier writes settled.
- Removed the separate `route_set_project_chat_window_chat_id(...)` send path from the frontend windowing action flow. Chat-id changes now participate in the same serialized authoritative write queue as every other project-chat windowing mutation, which keeps reducer replay and persisted state aligned.
- Updated `frontend/src/state/actions/windowSpaces.ts` so optimistic window-space rename/delete/sort mutations are explicitly project-scoped, and `createWindowSpaceFromCurrentFloatingWindows()` carries the originating project/section snapshot through the async save flow. The local `windowSpaces` merge now only happens if the originating project is still loaded.
- Updated `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` so a present-but-blank `/:project/chat/:chatId` parameter resolves to an explicit invalid-thread target instead of falling through to root project chat. The same `Thread Not Found` surface is reused, with copy that distinguishes invalid routes from missing hydrated chats.
- Added focused regression coverage:
  - `frontend/src/state/actions/projectChatWindowing.rollback.test.ts` now covers cross-project rollback isolation, serialized out-of-order writes, and “failed earlier focus must not reappear in later persisted state.”
  - `frontend/src/state/actions/windowSpaces.test.ts` now covers cross-project window-space rollback isolation and “save in project A must not merge into project B after navigation.”
  - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx` now covers blank-thread fail-closed routing.
  - `frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts` now covers both the blank-thread route and the save-window-space/navigation race in a real browser.

UX before/after:
- Before: starting a windowing or window-space write in project A and switching to project B could roll back A’s layout or saved-space state into B, including `activeChatId` and saved window-space rows. After: pending project-A responses no longer mutate project B.
- Before: a failed earlier windowing mutation could still be baked into a later accepted whole-state write, so rejected focus/title/layout changes could reappear after reload. After: later writes are derived from authoritative state plus still-live mutations only, so rejected changes stay rejected.
- Before: saving a window space while navigating away could append the new saved space into the wrong project’s overview list. After: the save still succeeds for the originating project, but the live store is only updated when that same project is still active.
- Before: malformed links like `/:project/chat/%20` opened the root standalone project chat, making an invalid route look valid. After: blank thread ids fail closed with `Thread Not Found`.

DX before/after:
- Before: optimistic correctness for windowing depended on ambient global store state after `await`, and full-state writes were computed too early to be causally trustworthy. After: project-scoped guards and a single authoritative serialized write path make the ordering model explicit and much easier to reason about.
- Before: `setProjectChatWindowChatId(...)` had a special persistence path that behaved differently from the rest of project-chat windowing. After: every windowing mutation uses the same persistence mechanism and test surface.
- Before: route resolution for standalone project chat had an implicit “blank means base route” downgrade that obscured malformed direct links. After: the target-resolution function distinguishes missing params from invalid params directly.

Verification:
- `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowing.rollback.test.ts src/state/actions/windowSpaces.test.ts src/components/Pages/Project/StandaloneProjectSurfacePage.test.tsx src/state/actions/sectionInfos.projectChatWindowingSync.test.ts src/state/actions/project/loadProject.test.ts` passed: 61 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "blank chat ids|saving a window space in one project"` passed: 2 tests.
- CDP verification on the live dev instance at `http://127.0.0.1:3098/sharp_river/chat/%20` confirmed the invalid standalone route rendered `Thread Not Found` with no chat surface at both mobile and desktop viewport sizes.
