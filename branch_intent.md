# Branch Intent Summary

Scope used for this summary:
- `git diff --name-status main...HEAD`
- `git diff $(git merge-base main HEAD)..HEAD`

This branch is not a narrow refactor. It is a coordinated product shift around chat windowing, standalone surfaces, saved floating layouts, and agentic chat-to-chat behavior. The items below focus on intentional behavior changes that follow-up reviews should preserve.

## Features

### 1. Project AI chat moved out of the Overview pane and into a persistent window manager
- What changed: before this branch, the live project chat surface was effectively tied to the Overview pane. After this branch, the workspace always renders `ProjectChatBottomDock`, and project chat instances can be bottom-docked, floating, maximized, hidden, or reopened from a manager view. The Overview `ProjectAIChat` tab now acts as a manager/control surface instead of the primary live chat UI.
- Why the change appears intentional: the branch adds a dedicated runtime state model (`projectChatWindowing`), a backend persistence route, a new dock/window host component, new manager UI, a detailed implementation plan/checklist, and broad Vitest/Playwright coverage around this new flow.
- Files/endpoints/components involved: `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.tsx`, `frontend/src/components/Pages/MainContainerCore.tsx`, `frontend/src/state/actions/projectChatWindowing.ts`, `frontend/src/state/actions/project/loadProject.ts`, `frontend/src/state/actions/projectChatWindowingPersistence.ts`, `backend/setta/types/project_state.py`, `backend/setta/routers/project_manager.py`, route `/api/setProjectChatWindowingState`.
- Default-value changes, moved flows, relocated logic: `chatWindowing.autoCreateInitialChat` defaults to `true`; `+` creates a new immediately-open docked chat; runtime window placement/visibility/z-order moved into `projectChatWindowing` instead of living only in component state; the live chat surface is no longer the Overview pane source of truth.
- Reviewer guardrail: do not move the live project chat surface back into `#OverviewPane`, and do not treat the `ProjectAIChat` overview tab as an embedded chat pane again unless there is a new product decision.

### 2. Section chat and project chat now share one unified chat surface, and chat sections can move between canvas and window hosts
- What changed: before this branch, section chat had its own rendering path. After this branch, `UnifiedChatSurface` powers project chat, section chat, standalone chat pages, and git-graph-backed window mode. Chat sections can be booted from a project chat window onto the canvas, switched back to floating, and leave a translucent on-canvas placeholder when externalized.
- Why the change appears intentional: the branch adds `UnifiedChatSurface`, `SectionWindowPlaceholder`, `SectionWindowSurface`, `SectionWindowToggleButton`, explicit implementation notes saying legacy section-chat compatibility is intentionally not preserved, and new tests/E2E flows around canvas boot/undock/placeholder behavior.
- Files/endpoints/components involved: `frontend/src/components/ChatWindowing/UnifiedChatSurface.tsx`, `frontend/src/components/Section/Layouts/ChatArea.tsx`, `frontend/src/components/Section/Container/SectionWindowPlaceholder.tsx`, `frontend/src/components/Section/Container/SectionWindowSurface.tsx`, `frontend/src/components/Section/Header/SectionWindowToggleButton.tsx`, `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`, `docs/plans/chat-windowing/implementation-notes.md`.
- Default-value changes, moved flows, relocated logic: section settings for windowed chat moved to the right pane (`ChatAreaSettings`) instead of staying inline inside every section host; in-chat thread actions (`History`, `New Chat`) remain inside the unified surface; canvas-section host state is now tied to the same `projectChatWindowing` record as floating/docked chat instances.
- Reviewer guardrail: do not reintroduce a separate legacy section-chat implementation path or inline compatibility fallback for old pane-embedded section chat without a new decision.

### 3. Floating/maximized chat and section windows now have full window-management behavior
- What changed: before this branch, there was no unified window manager for chat/section surfaces. After this branch, floating/maximized windows support focus-driven z-order, drag, resize on all edges/corners, viewport guardrails, drag ghost snapping, keyboard snapping, maximize/unmaximize with prior-placement restore, and a global canvas visibility toggle when overlays obscure the canvas.
- Why the change appears intentional: the branch adds dedicated layout helpers, viewport helpers, state transitions, settings-backed shortcuts, drag-batching performance notes, and extensive E2E coverage for floating/maximized/snap behaviors.
- Files/endpoints/components involved: `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, `frontend/src/components/ChatWindowing/projectChatSnapLayout.ts`, `frontend/src/components/ChatWindowing/projectChatViewport.ts`, `frontend/src/state/actions/projectChatWindowing.ts`, `backend/setta/types/settings_state.py`, `perf/reports/frontend/2026-03-07_window-drag-batching.md`.
- Default-value changes, moved flows, relocated logic: `chatWindowing.restorePriorStateOnUnmaximize` defaults to `true`; shortcut defaults now exist for canvas toggle, maximize, minimize, and snap directions; floating windows are intentionally allowed partial off-screen placement as long as a title bar and at least `120px` stay reachable; drag preview work was moved off the raw pointer-move path onto animation-frame batching.
- Reviewer guardrail: do not collapse these window states back into a simpler overlay model, remove prior-placement restore, or undo the visibility/snap/guardrail behavior as incidental UI churn.

### 4. Saved window spaces and standalone deep-link routes were added as first-class product flows
- What changed: before this branch, frontend deep links were mainly project/view-mode routes, and there was no saved floating-window layout concept. After this branch, the app supports dedicated routes for project chat, a specific project chat thread, a saved window space, and a canonical section surface. The Overview View Modes pane also gained a `Window Spaces` block for save/restore/rename/delete/open-in-new-tab flows.
- Why the change appears intentional: the branch adds new route constants/config, standalone page components, backend CRUD routes and request types, path resolver utilities, route documentation, and large Playwright coverage for isolated standalone surfaces.
- Files/endpoints/components involved: `frontend/src/components/Pages/router.tsx`, `frontend/src/components/Pages/routeConfig.ts`, `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`, `frontend/src/components/Pages/Project/StandaloneWindowSpaceSurface.tsx`, `frontend/src/components/Panes/Overview/WindowSpacesPane.tsx`, `frontend/src/state/actions/windowSpaces.ts`, `frontend/src/utils/sectionSlugPaths.ts`, `frontend/src/utils/windowSpacePaths.ts`, `backend/setta/project_state/base_project_manager.py`, `backend/setta/project_state/project_manager_types.py`, `backend/setta/types/project_config.py`, routes `/api/createWindowSpace`, `/api/setWindowSpaceName`, `/api/setWindowSpaceSortOrder`, `/api/deleteWindowSpace`, `/api/setWindowSpaceState`.
- Default-value changes, moved flows, relocated logic: section standalone routes are now namespaced under `/section/...`; window spaces are namespaced under `/windowspace/...`; project chat thread deep links use `/:projectConfigName/chat/:chatId`; standalone surfaces intentionally render without the normal Overview/UI Editor panes.
- Reviewer guardrail: do not fold these routes back into the generic project page, and do not make standalone surfaces share the same chrome or mutable workspace state assumptions as the main workspace route.

### 5. Git graph now uses the same windowing system instead of its own graph overlay path
- What changed: before this branch, git overlay state could be `overlay.kind === "graph"`. After this branch, diff overlay remains separate, but opening the git graph creates or reuses a tracked maximized `git_graph_mode` window inside the chat/windowing layer. That graph window can optionally show the Git pane as an embedded sidebar and can be saved inside window spaces.
- Why the change appears intentional: the branch removes graph from the overlay union, adds dedicated `graph` state, adds `GitGraphWindowContent`, threads git-graph mode through chat window titles/icons/state, and updates tests around the new embedded sidebar behavior.
- Files/endpoints/components involved: `frontend/src/state/git.ts`, `frontend/src/state/actions/git.ts`, `frontend/src/components/Git/GitGraphOverlay.tsx`, `frontend/src/components/Git/GitGraphWindowContent.tsx`, `frontend/src/components/Panes/Overview/Git/GitPane.tsx`, `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, `frontend/src/components/Pages/Project/StandaloneWindowSpaceSurface.tsx`.
- Default-value changes, moved flows, relocated logic: the `Graph` button in the Git pane no longer opens a separate overlay state machine; it opens a tracked maximized window that participates in chat/window focus and can expose the overview Git pane inline.
- Reviewer guardrail: do not reintroduce the old graph-overlay path as a default implementation detail, and do not drop `git_graph_mode` from the shared windowing model.

### 6. Direct chat-to-chat invocation became an explicit MCP tool-call feature
- What changed: before this branch, `chat_chat` edges were only relationship metadata. After this branch, direct linked chats are surfaced in agentic context and invokable through `invoke_linked_chat`, which runs the target managed chat as a bounded tool endpoint, reuses or creates its chat thread, and returns structured output.
- Why the change appears intentional: the branch adds a new backend module just for linked chat invocation, registers the tool, threads linked-chat metadata through MCP headers/payloads and runner setup, and adds focused route-level/backend tests for success, unsupported targets, cycle detection, and depth limits.
- Files/endpoints/components involved: `backend/setta/agentic/linked_chat_invocation.py`, `backend/setta/mcp/tools/agentic_tools.py`, `backend/setta/routers/mcp_tools.py`, `backend/setta/mcp/server.py`, `backend/setta/mcp/agentic_context_headers.py`, `backend/setta/agentic/agentic_context.py`, `backend/setta/agentic/external_agent_runner.py`, `backend/setta/llm/agent_runner.py`, route `POST /__setta__/tools/call`, tool name `invoke_linked_chat`.
- Default-value changes, moved flows, relocated logic: linked invocation depth and caller chain are now first-class context fields; target replies are intentionally bounded to `4000` chars; the tool persists the target `chatId` back onto the chat section when a run succeeds or is launched.
- Reviewer guardrail: do not turn linked chats into unconstrained recursive chat hops or silent heuristic delegation; this branch intentionally makes them explicit, typed, and bounded.

## Bug Fixes

### 1. Section-mode scope now respects edge direction instead of accidentally granting scope from incoming links
- What changed: before this branch, incoming `section_chat` and incoming `chat_chat` edges could still influence scope/context semantics. After this branch, read/write/context access comes only from direct outgoing `chat_section` edges from the current chat section, and peer chat access comes only from direct outgoing `chat_chat` edges.
- Why the change appears intentional: both backend and frontend scope resolvers were updated in the same direction, UI copy now explicitly says `No outgoing scope links = no access`, and new tests cover incoming-only, update, and delete cases.
- Files/endpoints/components involved: `backend/setta/agentic/agentic_scope.py`, `backend/setta/agentic/agentic_context.py`, `frontend/src/state/agenticScopeUtils.ts`, `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`, `frontend/src/components/Section/Layouts/ChatArea.tsx`, `tests/agentic/test_agentic_scope.py`, `tests/agentic/test_agentic_context_payload.py`.
- Reviewer guardrail: do not add back any incoming-edge fallback or mixed-direction scope inference without an explicit new rules change.

### 2. Route namespacing and slug resolution now fail closed instead of depending on reserved section names
- What changed: before this branch, standalone routing risked conflicts with bare route segments and section names had to defend against route-like slugs. After this branch, standalone routes are explicitly namespaced (`/chat`, `/section`, `/windowspace`), section names like `Chat_` are allowed again, window space names get their own validation, and slug resolution returns `not_found` or `ambiguous` rather than guessing.
- Why the change appears intentional: frontend/backend validation changed together, the route docs were updated, and new tests explicitly assert that namespaced routes mean `chat`/`windowspace` are no longer reserved section slug concepts.
- Files/endpoints/components involved: `frontend/src/utils/constants.ts`, `frontend/src/utils/nameValidation.ts`, `frontend/src/utils/sectionSlugPaths.ts`, `frontend/src/utils/windowSpacePaths.ts`, `backend/setta/utils/name_validation.py`, `docs/reference/urls-and-routes.md`, `frontend/src/components/Pages/router.tsx`.
- Reviewer guardrail: do not re-reserve `chat` or `windowspace` as section slugs, and do not pick an arbitrary section/window space when slug resolution is ambiguous.

### 3. Window-space data is now validated, filtered, and remapped instead of persisting stale section references
- What changed: before this branch, there was no window-space data model to clean up or copy. After this branch, project-state validation drops saved section windows whose sections no longer exist, normalizes saved order, filters inaccessible saved windows out of summaries, and remaps saved section-window references during project-config copy operations.
- Why the change appears intentional: the branch adds typed `windowSpaces` config models, project-state validation hooks, copy/filter helpers, and tests that assert stale section windows are removed and copied section IDs are remapped.
- Files/endpoints/components involved: `backend/setta/types/project_config.py`, `backend/setta/types/project_state.py`, `backend/setta/types/helpers_lvl3.py`, `tests/types/test_project_state_window_spaces.py`.
- Reviewer guardrail: do not treat window spaces as opaque JSON blobs that bypass project validation, copying, summary filtering, or section ID remapping.

### 4. Supporting UI fixes were added so the new window layer actually behaves correctly
- What changed: explicit z-index bands were introduced for panes, app chrome, menus, modals, and the floating box; terminal sections stopped sizing themselves from raw section width/height math when rendered inside window hosts; the minimap now offsets from either the overview pane or the UI editor, depending on selected side.
- Why the change appears intentional: these changes are spread across multiple chrome/layout files and are backed by new tests because the new window layer needs them to keep menus/modals/panes visible and avoid clipped content.
- Files/endpoints/components involved: `frontend/src/utils/constants.ts`, `frontend/src/components/AppHeader/Header.tsx`, `frontend/src/components/AppHeader/EditMenu.tsx`, `frontend/src/components/AppHeader/FollowAIToggleButton.tsx`, `frontend/src/components/Modals/ModalContainer.tsx`, `frontend/src/components/Utils/PaneContainer.tsx`, `frontend/src/components/Utils/FloatingBox.tsx`, `frontend/src/components/Section/Layouts/TerminalArea.tsx`, `frontend/src/components/Pages/Project/ResponsiveMiniMap.tsx`.
- Reviewer guardrail: do not flatten these z-index/layout changes as superficial styling cleanup; they support the intentional window-layer behavior introduced in this branch.

## Intentional Behavior Changes To Preserve

### 1. The Overview `ProjectAIChat` tab is now a manager, not the live project chat surface
- Preserve: the real project chat UI lives in `ProjectChatBottomDock` and related floating/maximized hosts; the overview tab should remain focused on reopen/focus/canvas/float management.
- Do not revert unless a new decision is made: wiring the live project chat surface back into the overview pane, or assuming tests/manual flows should interact with `#OverviewPane` for day-to-day project chat.

### 2. Runtime chat/window state is first-class project state, with settings JSON limited to defaults and shortcuts
- Preserve: `projectChatWindowing` is persisted through project state and `/api/setProjectChatWindowingState`, while `settings.chatWindowing` only carries defaults like `autoCreateInitialChat`, `restorePriorStateOnUnmaximize`, and shortcut bindings.
- Do not revert unless a new decision is made: pushing runtime placement/visibility/z-order back into settings JSON or ephemeral component-only state.

### 3. Chat instance lifecycle semantics changed deliberately
- Preserve: `+` creates a new open docked chat; `close` hides a window without deleting its thread/state; `reopen` restores the same instance; zero visible chats is allowed; unmaximize restores to the prior placement.
- Do not revert unless a new decision is made: treating close as thread deletion, forcing one always-visible chat after close, or dropping `lastPlacementBeforeMaximize` restore behavior.

### 4. Canvas-section chat behavior is deliberately unified and placeholder-based
- Preserve: moving a chat to canvas binds/reuses a section, switching back to floating leaves a visual-only placeholder on canvas, and section chat mode can switch between `section_mode` and `project_ai_mode` without splitting implementations.
- Do not revert unless a new decision is made: removing the placeholder, making it interactive in v1, or creating separate host-specific chat components again.

### 5. Section settings ownership moved to the right pane for windowed chat
- Preserve: section chat settings and mode controls live in `ChatAreaSettings` in the right pane, while the chat body keeps thread history/new-chat controls and zero-scope messaging.
- Do not revert unless a new decision is made: reintroducing inline permissions/settings controls into every section-chat rendering host as a compatibility fallback.

### 6. Section-mode scope is intentionally narrower than project chat
- Preserve: direct outgoing edges only; no incoming-edge access; no multi-hop traversal; zero-scope chats can still send messages but get no project access; `project_ai_mode` remains the explicit full-project escape hatch.
- Do not revert unless a new decision is made: broadening section scope with heuristics, incoming edges, or hidden fallback access.

### 7. Window spaces intentionally snapshot and restore only floating windows
- Preserve: saving a window space captures only currently open floating windows; restoring a window space into the workspace preserves non-floating windows and merges the restored floating set into current order/state; standalone window-space tabs hydrate a local copy and do not mutate workspace windowing state.
- Do not revert unless a new decision is made: making window spaces overwrite docked/maximized/canvas state or making standalone window-space tabs directly edit the workspace runtime state.

### 8. Standalone routes intentionally use canonical slugs and isolated chrome
- Preserve: `/:projectConfigName/chat`, `/:projectConfigName/chat/:chatId`, `/:projectConfigName/windowspace/:windowSpaceSlug`, and `/:projectConfigName/section/:sectionSlug` stay as dedicated surfaces with no overview/UI editor panes. Section routes resolve against canonical full-path slugs and fail closed on ambiguity.
- Do not revert unless a new decision is made: collapsing these routes into the main workspace route or silently resolving duplicate slugs to one arbitrary match.

### 9. Git graph belongs in the shared windowing model now
- Preserve: the graph should keep using `git_graph_mode` in tracked project chat windows, with diff overlay remaining separate and optional embedded Git pane support available inside the graph window.
- Do not revert unless a new decision is made: restoring `overlay.kind === "graph"` as the default graph path or disconnecting git graph windows from saved window spaces.

### 10. Linked chats are intentionally explicit, direct, and bounded
- Preserve: only direct `chat_chat` targets are callable; only managed targets with valid engines are supported; linked-chat recursion depth is capped at `1`; cycle detection blocks loops; output is bounded and returned as structured tool content.
- Do not revert unless a new decision is made: allowing recursive linked-chat chains, implicit target discovery, or unmanaged/scriptable chat targets to run through the same tool path.

### 11. This branch intentionally does not preserve legacy section-chat compatibility/migration behavior
- Preserve: the branch documentation explicitly calls out a break from the old pane-embedded section-chat model and says migration shims/backward compatibility are out of scope for v1.
- Do not revert unless a new decision is made: adding hidden migration code or compatibility branches that reintroduce the old section-chat architecture under the new windowing model.
