# View Modes

## Overview
- View modes live in `ProjectConfig.viewModes` and control section visibility and
  layout within a project config.
- `ProjectConfig.activeViewModeId` points to the current view mode; the frontend
  filters sections and layout based on the active mode.
- `isTab` view modes render as tabs. `isUserFacing` gates whether a mode is
  intended for share/user-facing surfaces.
- The Overview `View Modes` pane now also includes the project-config list and
  controls that used to live in the separate `Project Configs` tab.

## ListRoot Section View Modes

- `ListRootSectionImpl` also has a section-local `viewMode`
  (`default`, `task_list`, `kanban`) that controls how that section arranges its
  direct child sections.
- This is separate from `ProjectConfig.viewModes`; changing one does not change the other.
- Section-local updates are sent through `route_set_list_root_view_mode`.
- `ListRoot` and `Group` sections additionally store `defaultChildSectionType`
  (updated via `route_set_parent_default_child_section_type`) for incrementer-created children.

## IDE tab bar + pane rails
- In IDE mode, `isTab` view modes render in `ViewModeTabs` as a dedicated bottom
  row in the main grid (`frontend/src/components/Pages/MainContainerCore.tsx`),
  not inside the React Flow page container.
- The tab bar is only rendered when at least one view mode has `isTab=true`.
- Overview and UI Editor icon rails are fixed (`position: fixed`) and reserve
  the same bottom space used by the tab bar:
  - No tabbed modes: rail bottom offset is `0px`.
  - One or more tabbed modes: rail bottom offset is `36px`.
- This behavior is driven by `useHasViewModeTabs`
  (`frontend/src/state/hooks/viewModes.ts`) so both side rails stay clear of the
  bottom tab bar.
- Stable test hooks for this layout:
  - Tab bar: `data-testid="view-mode-tabs-bar"`
  - Overview rail: `data-testid="overview-icon-rail"`
  - UI Editor rail: `data-testid="ui-editor-icon-rail"`

## Ordering
- `ViewModeConfig.sortIndex` is the primary ordering key for tabs and view mode
  lists.
- Ties fall back to a case-insensitive name sort and then by id (see
  `frontend/src/utils/viewModeOrdering.ts`).
- Drag-reordering view modes persists through `route_set_view_mode_sort_order`
  (`/api/setViewModeSortOrder`) and updates every mode's `sortIndex`.
- The backend requires a full, deduplicated order list (`orderedViewModeIds`)
  and returns:
  - `422` for invalid order payloads (duplicates/length mismatch).
  - `404` when any referenced view mode id is missing.
- Reordering tabs in `ViewModeTabs` only reorders the tabbed subset while keeping
  non-tab view modes in their existing relative slots.
- Deleting the active view mode falls back to the first remaining mode in sorted
  order (not insertion order), then compacts `sortIndex` values.

## Overview pane behavior
- `ViewingEditingMode` now includes:
  - a `Window Spaces` pane at the top
  - `View Modes` (collapsible)
  - `Project Configs` (collapsible + vertically resizable)
- The `Window Spaces` pane lets the user save the current floating-window
  layout, restore saved layouts into the workspace, rename/reorder/delete saved
  window spaces, and open standalone `/windowspace/...` routes.
- Saving a window space is only enabled when at least one visible floating
  window exists.
- Reorder/edit controls in the `Window Spaces` pane are disabled in
  deployment/read-only mode when layout edits are blocked.
- The embedded `Project Configs` list supports drag-reorder and persists local
  order in `useLocalStorage().overviewProjectConfigOrder`.
- Persisted project-config order is merged with server metadata:
  - stale ids are removed;
  - unseen ids are appended in server order.
- Reorder/edit controls are disabled in deployment/read-only mode.
- Project-chat/window-space behavior is documented separately in
  `docs/reference/project-chat-windowing.md`.

## Layout + viewport storage
- Each view mode stores its own `topLevelSections` layout and
  `viewport`/`viewportInitialized`.
- `topLevelSections` should only contain *true* top-level sections (those with
  `parentSectionMap[sectionId] === null`). Nested sections (including attached
  terminals) are rendered via the section tree and must not have top-level
  layout entries; stale entries are ignored/cleaned up by the frontend.
- Layout updates merge into the active view mode so hidden sections keep their
  positions when only a subset of layouts is sent.
- When switching view modes, the backend saves the current layout/viewport into
  the outgoing view mode and loads the next view mode's layout/viewport into
  `projectConfig.topLevelSections` and `projectConfig.viewport`.
- During load, view modes missing layout data are backfilled from the active
  layout so they remain usable.

## Settings project defaults
- The settings project (`/settings`) seeds built-in tab view modes on load via
  `create_settings_project_state` + `ensure_settings_view_modes`.
- Tabs are grouped, ordered, and named:
  - Core
  - Section Defaults Structure and Code
  - Section Defaults Content and Media
  - Param Defaults
  - All Settings
- Layout defaults to a 3-column grid with 600px spacing
  (`SETTINGS_VIEW_GRID_COLUMNS`, `SETTINGS_VIEW_GRID_SPACING`).
