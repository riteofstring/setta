In share mode only, those flags gate specific route families. Here is what each one affects (with concrete examples):

**allowParamChanges** (content + param edits)
- Param implementation + config edits: change param impl, update param impl config, set param entered value (`Route.CHANGE_PARAM_IMPL`, `Route.UPDATE_PARAM_IMPL_CONFIG`, `Route.SET_PARAM_ENTERED_VALUE`).
- Param metadata/actions: add/delete kwargs, toggle/unselect param selection, set type-error ignore (`Route.ADD_KWARG`, `Route.DELETE_KWARG`, `Route.TOGGLE_PARAM_SELECTED`, `Route.UNSELECT_ALL_PARAMS`, `Route.SET_TYPE_ERROR_IGNORE`).
- Content updates: text block text, draw strokes, image/chart paths, chart type/settings (`Route.SET_TEXT_BLOCK_TEXT`, `Route.APPEND_DRAW_AREA_LAYER_ITEM`, `Route.SET_IMAGE_AREA_IMAGE_PATH`, `Route.SET_CHART_AREA_IMAGE_PATH`, `Route.SET_CHART_TYPE`, `Route.SET_CHART_SETTINGS`).
- Artifact + listener updates in share sessions (`Route.UPDATE_ARTIFACTS`, listener emits).
- Example: viewer edits a text block or changes chart data -> allowed only if `allowParamChanges` is true.
- Note: CodeParam edits are *always* blocked in share mode (even if this is true).

**allowVariantChanges** (variants + view modes)
- Section variants: create new variant, set active/default variant, rename variant, toggle frozen, toggle variant JSON source (`Route.CREATE_NEW_SECTION_VARIANT`, `Route.SET_SECTION_VARIANT`, `Route.SET_DEFAULT_SECTION_VARIANT`, `Route.SET_SECTION_VARIANT_NAME`, `Route.TOGGLE_VARIANT_FROZEN`, `Route.TOGGLE_VARIANT_JSON_SOURCE`).
- View modes: create/delete/rename, set active, toggle editing, toggle user-facing, toggle section visibility (`Route.CREATE_VIEW_MODE`, `Route.DELETE_VIEW_MODE`, `Route.SET_VIEW_MODE_NAME`, `Route.SET_ACTIVE_VIEW_MODE`, `Route.TOGGLE_IS_EDITING_VIEW_MODE`, `Route.TOGGLE_VIEW_MODE_USER_FACING`, `Route.TOGGLE_SECTION_VISIBILITY`).
- Example: viewer switches to a different variant or toggles a view mode -> allowed only if `allowVariantChanges` is true.

**allowLayoutChanges** (layout + UI display controls)
- Layout structure: set/auto layout of top-level sections, set section sizes, move/group/ungroup sections (`Route.SET_TOP_LEVEL_SECTION_LAYOUT`, `Route.AUTO_LAYOUT_TOP_LEVEL_SECTIONS`, `Route.SET_SECTION_SIZES`, `Route.MOVE_SECTION`, `Route.GROUP_SECTIONS`, `Route.UNGROUP_GROUPS`).
- Positioning/visibility UI: toggle position locks, minimize, group orientation (`Route.TOGGLE_POSITION_LOCKS`, `Route.TOGGLE_MINIMIZED`, `Route.TOGGLE_GROUP_ORIENTATION`).
- Viewport/layout UI: set viewport, show param display names, section param filter, hide params toggles, text block display mode/format, column widths and browser view modes, social URL (`Route.SET_VIEWPORT`, `Route.SET_SHOW_PARAM_DISPLAY_NAMES`, `Route.SET_SECTION_PARAM_FILTER`, `Route.SET_CALLABLE_HIDE_PARAMS`, `Route.SET_SECTION_HIDE_UNPINNED_PARAMS`, `Route.SET_TEXT_BLOCK_DISPLAY_MODE`, `Route.SET_TEXT_BLOCK_FORMAT`, `Route.SET_SECTION_COLUMN_WIDTH`, `Route.SET_BROWSER_COLUMN_WIDTHS`, `Route.SET_BROWSER_AREA_VIEW_MODE`, `Route.SET_BROWSER_HIDE_COLUMN`, `Route.SET_SOCIAL_URL`).
- Example: viewer drags/resizes sections or changes browser panel widths -> allowed only if `allowLayoutChanges` is true.

If you want, I can map these directly to the UI toggles or share policy JSON you're using.
