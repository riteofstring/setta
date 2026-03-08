# Standalone Project Chat and Section Route Plan

Date: 2026-03-07
Worktree: `setta.chat-windowing`

## Requested Outcome

Add dedicated URLs so a project chat or a named section can be opened in its own browser tab:

- `/:projectConfigName/chat`
- `/:projectConfigName/chat/:chatId`
- `/:projectConfigName/section/:sectionSlug`

Example:

- `http://localhost:3000/my_project/chat`
- `http://localhost:3000/my_project/chat/6e3f8d3d-3f59-4d2a-a7f8-3af7a8d6b90f`
- `http://localhost:3000/my_project/section/blue_star`

The purpose is a focused single-surface page for multi-monitor workflows, without requiring the full main workspace layout in that tab.

## Scope

This plan covers:

- project chat as a dedicated page
- any named section as a dedicated page
- route resolution rules
- rendering architecture for standalone pages
- state and websocket concerns for multi-tab use
- test coverage

This plan does not assume any heuristic callable-name lookup. Route resolution should use the existing section path slug rules that already exist in the project model.

## Route Contract

### Exact routes

- `/:projectConfigName/chat`
  - reserved for the project-level chat surface
- `/:projectConfigName/chat/:chatId`
  - resolves a single project chat thread by its stable `chatId`
- `/:projectConfigName/section/:sectionSlug`
  - resolves a single section by its canonical section-path slug

### Resolution source of truth

For section routes, the source of truth should be the existing full-path slug logic, not display labels and not ad hoc callable matching.

Use the same canonical slug derivation already implied by:

- backend: `sanitize_slug(get_section_path_full_name(...))`
- frontend: `sanitizeNameForSlug(resolveSectionFullPathName(...))`

That gives deterministic routing for nested sections and matches the repo’s current name-validation model.

### Important implication

If a callable section is named `blue_star`, then `/project/section/blue_star` works because the section’s canonical path slug is `blue_star`. If a callable symbol and the section name diverge, the route should still follow the section slug, because that is the validated, unique, project-level identifier.

## Locked Decisions

- `chat` remains the standalone namespace for project chat and project chat threads.
- Section standalone routing must be deterministic from canonical section-path slug.
- Standalone pages must not depend on shared “active section” UI state.
- Standalone project chat must not create or mutate persisted chat window placements just to render.
- Standalone section chat must render the actual chat surface directly, not the canvas placeholder used for externalized windows.
- Invalid section slugs should render a normal project-scoped not-found state.

## Main Risks To Design Around

### 1. Shared UI state across tabs

The normal project workspace uses shared project state. If the standalone route reuses “active section” as its driver, opening a second tab would hijack the first tab’s selection state. The standalone route must render by explicit route target, not by mutating the shared selected-section state.

### 2. Project chat windowing persistence

Current chat windowing is DB-backed per project. A standalone chat tab should not need to create a docked/floating/maximized window instance, because that would pollute the main workspace state and create cross-tab interference.

### 3. Placeholder logic in `UnifiedChatSurface`

`UnifiedChatSurface` currently swaps section chat for `SectionWindowPlaceholder` when a section chat is externalized into an open window. That behavior is correct for the canvas layout, but wrong for a dedicated standalone page. The standalone host needs its own host mode or an explicit bypass.

### 4. Websocket current-address behavior

`openWebSocket(location.pathname, ...)` currently publishes the browser pathname as the frontend current address. Before implementation, audit whether any backend/frontend behavior assumes existing project path shapes only. If so, introduce explicit normalization for affinity/current-address consumers instead of hoping arbitrary new paths are already safe.

## Implementation Plan

### 1. Add explicit standalone route constants

Add route constants in [constants.ts](/Users/jeff/Documents/_projects/setta.chat-windowing/frontend/src/utils/constants.ts):

- `PROJECT_CHAT_STANDALONE_ROUTER_PATH = "/:projectConfigName/chat"`
- `PROJECT_CHAT_THREAD_STANDALONE_ROUTER_PATH = "/:projectConfigName/chat/:chatId"`
- `SECTION_STANDALONE_ROUTER_PATH = "/:projectConfigName/section/:sectionSlug"`

Keep them explicit rather than deriving them indirectly from the generic project route.

### 2. Add standalone routes ahead of the generic project route

Update [router.tsx](/Users/jeff/Documents/_projects/setta.chat-windowing/frontend/src/components/Pages/router.tsx) so route precedence is:

1. index/home/launch
2. `/:projectConfigName/chat/:chatId`
3. `/:projectConfigName/chat`
4. `/:projectConfigName/view/:viewModeName`
5. `/:projectConfigName/section/:sectionSlug`
6. `/:projectConfigName`
7. catch-all

This preserves view-mode routing and ensures standalone pages do not get swallowed by the generic project route.

### 3. Create a dedicated standalone project page component

Add a new project page component, likely something like:

- `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`

Responsibilities:

- load the project via the same `useLoadProjectConfig()` path used by the normal project page
- read route params and resolve target kind (`project_chat` or `section`)
- render a minimal shell containing only the requested surface
- avoid mounting overview pane, UI editor, bottom dock, view-mode tabs, and other full-workspace chrome

This should be a separate page component instead of branching inside [MainContainerCore.tsx](/Users/jeff/Documents/_projects/setta.chat-windowing/frontend/src/components/Pages/MainContainerCore.tsx), because the standalone page has materially different layout and state constraints.

### 4. Introduce standalone target resolution from canonical section slugs

Add a shared resolver utility that:

- computes section full-path slugs from current project state
- maps slug -> section id
- fails closed if the slug is missing or ambiguous

This should reuse the same slug algorithm already used in section-name validation. Do not implement a fallback like:

- “match callable name if no section found”
- “match display name approximately”
- “match prefix”

Those would violate the repo’s robustness rules.

### 5. Use explicit namespaces for sections and threads

Because sections now live under `/project/section/:sectionSlug`, section slugs no longer need to reserve `chat`.

Plan:

- keep `/project/chat` for the project chat landing surface
- use `/project/chat/:chatId` for direct thread deep links
- use `/project/section/:sectionSlug` for canonical section slugs
- treat the thread route param as the existing stable `chatId`, not a heuristic display label

### 6. Add a standalone render host for unified chat

Update [UnifiedChatSurface.tsx](/Users/jeff/Documents/_projects/setta.chat-windowing/frontend/src/components/ChatWindowing/UnifiedChatSurface.tsx) to support a dedicated standalone host mode, for example:

- `host: "standalone_page"`

That host should:

- render project chat directly in `project_ai_mode`
- render section chat directly in `section_mode`
- bypass canvas externalization placeholder behavior
- use page-appropriate container classes instead of dock/canvas-specific ones

### 7. Render non-chat sections directly by section id

For `/:projectConfigName/section/:sectionSlug`, the standalone page should render the actual section content from the resolved `sectionId`, not by changing the globally selected section.

Likely direction:

- reuse existing section rendering primitives that already accept `sectionId`
- create a focused page wrapper for a single section
- keep only the minimal surrounding chrome needed for the section to function

This is the critical piece that makes multi-tab workflows safe.

### 8. Decide minimal standalone chrome

Recommended standalone page behavior:

- no overview pane
- no UI editor pane
- no bottom chat dock
- no view-mode tab strip
- no project canvas unless the target requires it
- keep global modal infrastructure if needed
- set document title to `<project> Chat` or `<project> · <section name>`

If navigation chrome is still needed, keep it minimal and page-local rather than mounting the full workspace.

### 9. Audit websocket/current-address semantics

Review [websocketReceive.ts](/Users/jeff/Documents/_projects/setta.chat-windowing/frontend/src/state/actions/websocketReceive.ts) and [frontendWebsocketAffinity.ts](/Users/jeff/Documents/_projects/setta.chat-windowing/frontend/src/state/actions/frontendWebsocketAffinity.ts) for any logic that implicitly assumes old path shapes.

Implementation options:

- if current address is informational only, keep the real standalone pathname
- if any behavior depends on canonical project address matching, introduce a helper that derives a canonical project address from the standalone route

This needs an audit before implementation, not a guess.

### 10. Keep standalone pages independent from window-manager persistence

Do not represent a standalone route as another `projectChatWindowing` placement.

Instead:

- standalone project chat page should render the project-level chat surface directly
- standalone section route should render the section surface directly
- persisted chat windowing remains for docked/floating/maximized/canvas-section behavior inside the main workspace only

That separation avoids state pollution and cross-tab surprises.

## Suggested File Touch List

Likely implementation files:

- [frontend/src/utils/constants.ts](/Users/jeff/Documents/_projects/setta.chat-windowing/frontend/src/utils/constants.ts)
- [frontend/src/components/Pages/router.tsx](/Users/jeff/Documents/_projects/setta.chat-windowing/frontend/src/components/Pages/router.tsx)
- [frontend/src/components/ChatWindowing/UnifiedChatSurface.tsx](/Users/jeff/Documents/_projects/setta.chat-windowing/frontend/src/components/ChatWindowing/UnifiedChatSurface.tsx)
- new standalone page component under `frontend/src/components/Pages/Project/`
- new standalone route-target resolver under `frontend/src/state/` or `frontend/src/utils/`
- [frontend/src/state/actions/websocketReceive.ts](/Users/jeff/Documents/_projects/setta.chat-windowing/frontend/src/state/actions/websocketReceive.ts) if pathname normalization is required
- frontend/backend name-validation helpers if route namespace validation changes

## Test Plan

### Vitest

- router tests for route precedence:
  - `/:project/chat` resolves to standalone chat page
  - `/:project/chat/<chatId>` resolves to a specific thread
  - `/:project/view/foo` still resolves to view mode
  - `/:project/section/blue_star` resolves to standalone section page
- slug resolver tests:
  - nested section full-path slug resolves correctly
  - missing slug returns not found
  - ambiguous/conflicting slug fails closed
  - `chat` remains a valid section slug inside the `/section/` namespace
- `UnifiedChatSurface` tests:
  - standalone host renders direct content
  - standalone host does not render `SectionWindowPlaceholder`

### Playwright

- open `/project/chat` in a new tab and verify only the chat surface is present
- open `/project/chat/<chatId>` and verify the requested thread is selected
- open `/project/section/blue_star` and verify only that section is rendered
- verify the main workspace tab keeps its own active selection/layout state
- verify standalone project chat does not create a new docked/floating persisted window
- verify section chat standalone route still renders when the same section is externalized in the main workspace

## Recommended Delivery Order

1. Add route constants and router entries.
2. Build standalone target resolver from canonical slugs.
3. Add standalone page shell.
4. Add standalone host support to unified chat.
5. Render non-chat sections by explicit section id.
6. Audit/fix websocket current-address behavior.
7. Add Vitest coverage.
8. Add Playwright multitab coverage.

## Acceptance Criteria

- Visiting `/:projectConfigName/chat` shows a dedicated project chat page.
- Visiting `/:projectConfigName/chat/:chatId` shows a dedicated page for that thread.
- Visiting `/:projectConfigName/section/:sectionSlug` shows a dedicated page for exactly one section.
- Section resolution is based on canonical section-path slug, with no heuristic fallback.
- Opening standalone pages in extra tabs does not change the active selection or chat window placement in the main workspace.
- Standalone chat routes do not depend on project chat window-manager placement state.
- Route precedence does not break existing `/:projectConfigName` or `/:projectConfigName/view/:viewModeName` behavior.
