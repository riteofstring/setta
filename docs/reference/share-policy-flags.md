# Deployment Policy Flags (Share/App)

Deployments (both share and app) include a `policy.json` at the deployment root.
When the server runs in deployment mode (`setta share` or `setta app`), these
flags gate route families and UI affordances.

Schema: `SharePolicy` (`backend/setta/types/share_deployment.py`).

Notes:
- Policy gates apply only in deployment mode. IDE mode ignores these flags.
- CodeParam edits are always blocked in deployment mode, regardless of
  `allowParamChanges`.
- Project-state `undo` / `redo` replay the current share-session overlay history
  without a dedicated policy flag. They are not blocked by
  `allowParamChanges` / `allowVariantChanges` / `allowLayoutChanges` /
  `allowLLM`, though the underlying mutations that create history entries still
  obey their usual policy gates.
- `runSnapshotMode=never` is rejected for deployments.
- Git features are always disabled in deployment mode: the Overview Git tab is
  hidden, and git API routes return 403 (`Route.GET_GIT_STATUS`,
  `Route.GET_GIT_DIFF`, `Route.GET_GIT_LOG`, `Route.GET_GIT_COMMIT_DETAILS`,
  `Route.GET_GIT_COMMIT_FILE_DIFF`).

## Defaults (When Publishing From The IDE)

Share deployments default to:
- `allowParamChanges=true`
- `allowVariantChanges=true`
- `allowLayoutChanges=true`
- `allowRun=false`
- `allowLLM=false`
- `allowExternalLinks=false`
- `allowFileDownloads=false`
- `allowMultipleRuns=true`
- `runSnapshotMode=ephemeral`

App deployments default to:
- `allowParamChanges=true`
- `allowVariantChanges=false`
- `allowLayoutChanges=false`
- `allowRun=true`
- `allowLLM=false`
- `allowExternalLinks=false`
- `allowFileDownloads=false`
- `allowMultipleRuns=true`
- `runSnapshotMode=ephemeral`

## Flag Semantics

**allowParamChanges** (content + param edits)
- Param value updates: set param entered value (`Route.SET_PARAM_ENTERED_VALUE`).
- Param metadata/actions: toggle/unselect param selection, set type-error ignore (`Route.TOGGLE_PARAM_SELECTED`, `Route.UNSELECT_ALL_PARAMS`, `Route.SET_TYPE_ERROR_IGNORE`).
- Content updates: text block text, draw strokes, image/chart paths, chart type/settings (`Route.SET_TEXT_BLOCK_TEXT`, `Route.APPEND_DRAW_AREA_LAYER_ITEM`, `Route.SET_IMAGE_AREA_IMAGE_PATH`, `Route.SET_CHART_AREA_IMAGE_PATH`, `Route.SET_CHART_TYPE`, `Route.SET_CHART_SETTINGS`).
- Artifact + listener updates in deployment sessions (`Route.UPDATE_ARTIFACTS`, listener emits).
- Chat and dropzone attachments: file uploads, deletes, and attachment metadata updates are blocked without `allowParamChanges` (chat attachments, dropzone files/text).
- Example: viewer edits a text block or changes chart data -> allowed only if `allowParamChanges` is true.
- Note: Code section edits (set code, format code, gen code prefix/suffix) are *always* blocked in deployment mode.
- Note: Code section diagnostics settings (mute/suppress) are *always* blocked in deployment mode.

**allowVariantChanges** (variants + view modes)
- Section variants: create new variant, set active/default variant, rename variant, toggle frozen, toggle variant JSON source (`Route.CREATE_NEW_SECTION_VARIANT`, `Route.SET_SECTION_VARIANT`, `Route.SET_DEFAULT_SECTION_VARIANT`, `Route.SET_SECTION_VARIANT_NAME`, `Route.TOGGLE_VARIANT_FROZEN`, `Route.TOGGLE_VARIANT_JSON_SOURCE`).
- View modes: set active (`Route.SET_ACTIVE_VIEW_MODE`). Other view mode edits (rename, toggle user-facing, show as tab, section visibility) are IDE-only and blocked in deployment mode.
- Example: viewer switches to a different variant or active view mode -> allowed only if `allowVariantChanges` is true.

**allowLayoutChanges** (layout + UI display controls)
- Layout structure: set/auto layout of top-level sections, set section sizes, move sections (`Route.SET_TOP_LEVEL_SECTION_LAYOUT`, `Route.AUTO_LAYOUT_TOP_LEVEL_SECTIONS`, `Route.SET_SECTION_SIZES`, `Route.MOVE_SECTIONS`).
- Positioning/visibility UI: toggle position locks, minimize, group orientation (`Route.TOGGLE_POSITION_LOCKS`, `Route.TOGGLE_MINIMIZED`, `Route.TOGGLE_GROUP_ORIENTATION`).
- Viewport/layout UI: set viewport, section color chrome/tag, show param display names, section param filter, hide params toggles, text block display mode/format, column widths and browser view modes (`Route.SET_VIEWPORT`, `Route.SET_SECTION_TAG_COLOR`, `Route.SET_SECTION_STYLE_COLOR`, `Route.SET_SHOW_PARAM_DISPLAY_NAMES`, `Route.SET_SECTION_PARAM_FILTER`, `Route.SET_CALLABLE_HIDE_PARAMS`, `Route.SET_SECTION_HIDE_UNPINNED_PARAMS`, `Route.SET_TEXT_BLOCK_DISPLAY_MODE`, `Route.SET_TEXT_BLOCK_FORMAT`, `Route.SET_SECTION_COLUMN_WIDTH`, `Route.SET_BROWSER_COLUMN_WIDTHS`, `Route.SET_BROWSER_AREA_VIEW_MODE`, `Route.SET_BROWSER_HIDE_COLUMN`).
- Project-chat window layout persistence and window-space CRUD (`Route.SET_PROJECT_CHAT_WINDOWING_STATE`, `Route.CREATE_WINDOW_SPACE`, `Route.SET_WINDOW_SPACE_NAME`, `Route.SET_WINDOW_SPACE_SORT_ORDER`, `Route.DELETE_WINDOW_SPACE`).
- Example: viewer drags/resizes sections or changes browser panel widths -> allowed only if `allowLayoutChanges` is true.
- Note: existing project-chat windows may still update transient local focus or reopen state client-side so already-visible windows remain usable, but those layout changes are not persisted when `allowLayoutChanges` is false.

**allowRun** (runs + terminals)
- Code execution: run code (`Route.RUN_CODE`).
- Terminal access: terminal websocket (`Route.TERMINAL`), delete terminals (`Route.DELETE_TERMINALS`), kill subprocesses (`Route.KILL_SUBPROCESSES`).
- Example: viewer clicks Run -> allowed only if `allowRun` is true.
- Note: deployment mode disables terminal input; runs always execute from snapshot files.

**allowLLM** (chat + AI follow)
- Chat routes: request response, get chat metadata/state, stop/delete chat (`Route.GET_LLM_RESPONSE`, `Route.GET_ALL_LLM_CHAT_METADATA`, `Route.GET_LLM_CHAT`, `Route.STOP_LLM_CHAT`, `Route.DELETE_LLM_CHAT`).
- Project-chat thread binding writes (`Route.SET_PROJECT_CHAT_WINDOW_CHAT_ID`).
- AI follow snapshots (`Route.GET_AI_FOLLOW_SNAPSHOT`).
- Example: viewer uses project chat -> allowed only if `allowLLM` is true.
- Note: LLM config/API key reads or writes remain IDE-only.
- Note: deployment mode chat uses an in-memory store (no MCP tools).
- Note: standalone project-chat routes fail closed when `allowLLM` is false. Standalone window-space routes also hide or block managed-chat windows while leaving purely non-managed windows available.

Project-chat/window-space behavior is documented in
`docs/reference/project-chat-windowing.md`.

**allowExternalLinks** (external URLs + remote assets)
- App mode: gates opening external URLs (for example, a Link action that opens `https://...`).
- App mode: gates injecting external `<link href="https://...">` assets (stylesheets/fonts/icons) via app assets.
- When false, the frontend filters external assets and blocks external link opens.

**allowFileDownloads** (download surfaces)
- Download URLs for artifacts/attachments (`Route.GET_ATTACHMENT_DOWNLOAD_URL`, `Route.ATTACHMENT_DOWNLOAD`).
- Binary downloads (`Route.BINARY_DOWNLOAD`).
- App mode: gates download actions like "downloadArtifact" / "downloadBinary" in the app renderer.

**allowMultipleRuns** (single-run sessions)
- If false, the backend enforces at most one run per deployment session. Subsequent runs are rejected with a policy error.
- This is enforced at run-start (a per-session "run slot" is reserved); if the run fails to start, the reservation is rolled back.

**runSnapshotMode** (run output retention)
- `ephemeral`: run outputs are stored under the deployment runtime root and cleaned up after the TTL (default 30 minutes).
- `always`: run outputs are retained.
- `never` is rejected for deployments.

See `docs/reference/sharing-mode-vs-ide-mode.md` for session lifecycle and
deployment setup, and `backend/setta/share/policy.py` for the enforcement
helpers.
