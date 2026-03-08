# Window Spaces Plan

Date: 2026-03-07
Worktree: `setta.chat-windowing`

## Requested Outcome

Add named "window spaces" so a saved arrangement of snapped floating windows can be reopened by URL:

- create/save a window space from the current floating-window arrangement
- open it at `/:projectConfigName/windowspace/:windowSpaceSlug`
- reuse the existing standalone project/chat/section route work already present in this worktree
- defer the in-route add/remove-window chooser until after save/load-by-URL is solid

Examples:

- `http://localhost:3000/my_project/chat`
- `http://localhost:3000/my_project/chat/6e3f8d3d-3f59-4d2a-a7f8-3af7a8d6b90f`
- `http://localhost:3000/my_project/section/blue_star`
- `http://localhost:3000/my_project/windowspace/research_board`

## Existing Implementation To Leverage

This worktree already has most of the standalone-route foundation:

- `frontend/src/components/Pages/router.tsx` already routes `/:projectConfigName/chat`, `/:projectConfigName/chat/:chatId`, and `/:projectConfigName/section/:sectionSlug`
- `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` already renders standalone project chat and standalone section pages
- `frontend/src/utils/sectionSlugPaths.ts` already resolves section standalone slugs from canonical full-path section names
- `frontend/src/components/ChatWindowing/UnifiedChatSurface.tsx` and `frontend/src/components/Section/Container/SectionWindowSurface.tsx` already support standalone rendering
- `projectChatWindowing` already tracks floating windows for both project chat and externalized sections
- `frontend/src/components/ChatWindowing/projectChatSnapLayout.ts` already contains the snap-boundary math that should be reused for layout serialization

Window spaces should extend that system, not create a parallel routing model.

## Core Constraint

Window spaces should use a dedicated static namespace:

- `/:projectConfigName/windowspace/:windowSpaceSlug`

That is the cleaner contract. It avoids overloading the section standalone namespace and removes the need for section/window-space slug collision handling.

The main routing requirement becomes:

- preserve existing `chat`, `view`, section, and project routes
- add the `windowspace` namespace without breaking them
- treat `windowspace` as a reserved static route segment in the standalone routing layer

## Locked Decisions

- Window spaces are named, persistent project-config assets, not transient runtime window state.
- Window spaces live under the explicit namespace `/:projectConfigName/windowspace/:windowSpaceSlug`.
- V1 save captures floating windows only. Bottom-docked, maximized, closed, minimized, and canvas-section placements are not part of the saved window-space snapshot.
- Loading a window space must not mutate `projectChatWindowing` in the main workspace tab just to render the route.
- Window-space pages must render from a dedicated window-space runtime state hydrated from the saved config.
- Route resolution must stay source-of-truth driven. No fallback by display title, callable name, or approximate slug matching.

## Data Model

Add persistent window-space state to `ProjectConfig`, alongside but separate from `viewModes`.

Suggested shape:

- `windowSpaces: dict[ID, WindowSpaceConfig]`
- `WindowSpaceConfig`
- fields: `id`, `name`, `sortIndex`, `windowsById`, `order`
- `WindowSpaceWindow`
- fields: `instanceId`, `surfaceKind`, `sectionIdOrNull`, `mode`, `title`, `chatId`, `zIndex`, and normalized floating layout data

Important boundary:

- do not persist full `ProjectChatWindowInstance` objects into `windowSpaces`
- exclude runtime-only fields like `isClosed`, `isMinimized`, `isMaximized`, `lastPlacementBeforeMaximize`, `dockMetrics`, and `lastFocusedAt`

Layout serialization should be viewport-relative, not raw pixels:

- save normalized `x`, `y`, `width`, and `height` against the same floating boundary rect logic used by `projectChatSnapLayout.ts`
- on load, denormalize against the current window-space viewport
- this preserves snapped layouts and custom split ratios across monitor sizes without guessing

## Route Contract

Keep the current route shapes:

- `/:projectConfigName/chat`
- `/:projectConfigName/chat/:chatId`
- `/:projectConfigName/windowspace/:windowSpaceSlug`
- `/:projectConfigName/section/:sectionSlug`

Router precedence should be:

1. `/:projectConfigName/chat/:chatId` -> specific project chat thread
2. `/:projectConfigName/chat` -> project chat
3. `/:projectConfigName/windowspace/:windowSpaceSlug` -> saved window space
4. `/:projectConfigName/view/:viewModeName` -> existing view-mode route
5. `/:projectConfigName/section/:sectionSlug` -> standalone section
6. `/:projectConfigName` -> full project workspace

Validation requirements are now narrower:

- reserve `windowspace` as a static route segment at the router level
- validate window-space names against the standard slug rules
- do not add section/window-space cross-collision checks, because the namespace removes that need

## Save / Load Flow

### Save Current Floating Layout

Initial authoring should happen in the main workspace, not inside the standalone route.

V1 flow:

- add a small `Window Spaces` manager in the Overview area near `View Modes`
- add `Save current floating windows as window space`
- snapshot visible floating windows from `projectChatWindowing.instancesById`
- include both project-chat windows and externalized section windows
- ignore non-floating instances entirely instead of coercing them into the saved layout

This is the shortest path to "save what I have now and reopen it later at a URL."

### Load By URL

Opening `/:project/windowspace/:windowSpaceSlug` should:

- load the named `WindowSpaceConfig`
- render a minimal standalone shell containing only its floating windows
- avoid mounting the full main workspace chrome, overview pane, UI editor, bottom dock, and view-mode tabs

Rendering split:

- project-chat windows use `UnifiedChatSurface`
- section windows use `SectionWindowSurface`

### Edit Behavior Inside the Window-Space Page

Phase 1 does not need the in-route add/remove-window chooser.

If the shared floating-window renderer naturally brings drag/resize/focus behavior along, that is fine, but persistence must be explicit:

- either debounce autosave to a dedicated window-space update endpoint
- or gate route-side edits behind an explicit save action

The primary phase-1 acceptance bar is still save + URL load.

## Implementation Plan

### 1. Add Persistent Window-Space Types And Endpoints

Backend:

- extend `ProjectConfig` with `windowSpaces`
- add request models for create, rename, delete, reorder, and update-window-space-state
- add helper functions and project-manager methods following the existing view-mode lifecycle style
- expose generated endpoints and regenerate frontend types

### 2. Add A Namespaced Window-Space Route

- add a dedicated window-space route constant and route entry
- resolve `windowSpaceSlug` only inside the `windowspace` namespace
- keep the existing section standalone slug resolver for `/:projectConfigName/section/:sectionSlug`
- do not merge section and window-space resolution paths

### 3. Add A Window-Space Manager UI In The Overview Pane

- create a small `Window Spaces` pane/component, likely alongside `ViewingEditingMode`
- actions:
  - create from current floating layout
  - rename
  - delete
  - open in current tab
  - open in new tab
- keep this intentionally small for v1

### 4. Extract A Reusable Floating-Window Renderer

Current floating rendering lives inside `ProjectChatBottomDock.tsx`.

To avoid duplicating drag/resize/snap logic, extract a host-agnostic floating-window canvas that can render:

- hydrated window-space windows
- `UnifiedChatSurface` for project chat
- `SectionWindowSurface` for section windows

This extracted renderer must not depend on the bottom dock or the global `projectChatWindowing` slice.

### 5. Extend `StandaloneProjectSurfacePage` To Render Window Spaces

- add support for `windowSpaceSlug` route params alongside the existing section route behavior
- add `window_space` as a third standalone target kind
- render a `StandaloneWindowSpaceSurface` host for that target
- keep the document title deterministic: `<project> · <window space name>`

### 6. Add Isolated Window-Space Runtime State

- introduce a local window-space store or reducer for the standalone page
- hydrate it from the saved `WindowSpaceConfig`
- do not read/write the main workspace `projectChatWindowing` slice during standalone window-space rendering
- if route-side edits are enabled, persist back through dedicated window-space endpoints

### 7. Wire Validation On Both Frontend And Backend

- frontend name validation should use the standard slug rules for window-space names
- backend validation should enforce the same rules authoritatively
- no section/window-space cross-collision validation is needed with the namespaced route

### 8. Add Add/Remove-Window Authoring As Phase 2

After save/load works:

- add a lightweight chooser inside the standalone window-space page
- start with a minimal list of project chat + sections, not the full overview pane
- allow add-to-space and remove-from-space operations that update the saved config

## Suggested File Touch List

Backend:

- `backend/setta/types/project_config.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/routers/project_manager.py`

Frontend:

- `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx`
- `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
- `frontend/src/components/Section/Container/SectionWindowSurface.tsx`
- `frontend/src/components/ChatWindowing/UnifiedChatSurface.tsx`
- `frontend/src/components/Pages/router.tsx`
- `frontend/src/utils/constants.ts`
- new window-space manager UI under `frontend/src/components/Panes/Overview/`
- new window-space runtime state/actions under `frontend/src/state/`

Generated:

- `frontend/src/utils/generatedTypes.ts`
- `frontend/src/utils/generatedEndpoints.ts`

## Test Plan

Vitest:

- router resolves `/:projectConfigName/windowspace/:windowSpaceSlug` to the window-space surface without affecting `chat`, `view`, or section routes
- window-space name validation follows the standard slug rules
- snapshotting current floating windows serializes only supported floating instances
- normalized layout serialization round-trips across viewport sizes
- standalone window-space page renders the expected mix of project-chat and section windows without mounting full workspace chrome

Playwright:

- save a current snapped floating layout as a window space
- open its URL and verify the correct windows render
- verify main workspace `projectChatWindowing` state is not polluted just by opening the route
- after phase 2, verify add/remove-window operations update the saved space

CDP / DevTools:

- visually verify a saved quarter-snap layout and a resized split layout
- profile initial window-space render with at least 4-8 windows before and after renderer extraction
- record results under `perf/` if renderer extraction meaningfully changes performance

## Recommended Delivery Order

1. Backend model + endpoints for persistent window spaces.
2. Add the namespaced window-space route and route-specific loading.
3. Overview manager with "save current floating windows as window space".
4. Standalone window-space route rendering.
5. Reusable floating-window host extraction.
6. Route-side editing persistence.
7. Add/remove-window chooser.

## Acceptance Criteria

- A named window space can be created from the current floating-window arrangement.
- Visiting `/:projectConfigName/windowspace/:windowSpaceSlug` opens that saved space.
- Window-space URLs do not rely on `projectChatWindowing` state in the main workspace tab.
- Opening a window space does not break existing `/:projectConfigName/chat`, `/:projectConfigName/chat/:chatId`, `/:projectConfigName/view/:viewModeName`, or `/:projectConfigName/section/:sectionSlug` behavior.
- Phase 1 can ship without the in-route add/remove-window chooser, as long as save + URL load are solid.
