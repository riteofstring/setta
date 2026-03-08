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
