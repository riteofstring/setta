# View Modes

## Overview
- View modes live in `ProjectConfig.viewModes` and control section visibility and
  layout within a project config.
- `ProjectConfig.activeViewModeId` points to the current view mode; the frontend
  filters sections and layout based on the active mode.
- `isTab` view modes render as tabs. `isUserFacing` gates whether a mode is
  intended for share/user-facing surfaces.

## Ordering
- `ViewModeConfig.sortIndex` is the primary ordering key for tabs and view mode
  lists.
- Ties fall back to a case-insensitive name sort and then by id (see
  `frontend/src/utils/viewModeOrdering.ts`).

## Layout + viewport storage
- Each view mode stores its own `topLevelSections` layout and
  `viewport`/`viewportInitialized`.
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
