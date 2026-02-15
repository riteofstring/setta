## 2026-02-17 09:31:46 PST

- Consolidated findings from top-level branch reviews were implemented without backward compatibility, legacy shims, or migration layers.
- Fixed share-policy enforcement gap by adding layout guard coverage to list-root view mode mutation routes.
- Reworked file-browser spreadsheet disk-change handling to use a dedicated single-file stat route and integer nanosecond mtimes end-to-end.
- Optimized spreadsheet edit/update paths to avoid full-grid cloning on localized cell edits.
- Scoped file-browser copy/cut/paste shortcuts so editable targets (inputs, contenteditable, CodeMirror) preserve native clipboard behavior.
- Made spreadsheet section rename flow consistent with other file-open flows via sanitized naming and explicit rename response handling.
- Removed race-prone polling for calendar preset application by returning `metaControlParamId` from section creation and applying config deterministically.
- Removed legacy TextParam date/time compatibility branches and unreachable combobox branches, keeping DateParam/TimeParam as canonical behavior.
- Removed database migration/auto-expansion behavior so project loading uses strict model validation with no payload rewrites.
- Added/updated backend, Vitest, and Playwright coverage for these changes and verified targeted suites pass.

## 2026-02-17 10:18:34 PST

- Replaced file-browser base64 payload contracts with binary content-id contracts: read responses now return `contentId`, and writes now accept `contentId`.
- Updated backend file-browser routes to persist/read temporary binary payloads through `BinaryStore` while preserving existing size and mtime conflict behavior.
- Updated frontend spreadsheet preview/save and native file import flows to upload/download binary payloads directly instead of converting bytes to/from base64 strings.
- Added a dedicated `getBinary` endpoint utility path so binary endpoint parsing always returns raw bytes regardless of MIME type.
- Synced endpoint generator behavior so regenerated `route_binary_download` uses binary fetch semantics and `Uint8Array` typing.
- Added/updated tests across backend pytest, frontend Vitest, and Playwright E2E to cover the new binary content flow and verify end-to-end read/write behavior.

## 2026-02-17 11:33:24 PST

- Removed silent project payload coercion in `read_project`; non-object `project.json` payloads now fail fast with a deterministic type error.
- Tightened file-browser write semantics so `expectedMtimeNs: null` is treated as create-only: writes can create missing files but now return conflict when target files already exist.
- Reworked native file import to avoid create-before-upload residue and N network existence checks: it now resolves names from one folder listing, uploads first, then writes with conflict retry suffixing.
- Fixed file-browser transfer no-op churn by short-circuiting same-folder moves, reducing unnecessary refreshes (including root refresh only when root listings are affected), and removing redundant clipboard render state.
- Added spreadsheet editor stale-load guards and save-target validation so rapid file switching cannot apply stale loads or save to a mismatched selected file; also deduplicated duplicated toolbar/dropdown sort/filter handlers.
- Added explicit error-notification paths for calendar preset and post-create meta-control config failures to prevent silent partial-application states.
- Simplified task board normalization contract by removing redundant recurrence fallback coercions and double-normalization lane building; lane builder now requires normalized state.
- Made spreadsheet section open behavior consistent by preserving focus navigation even when rename responses fail.
- Added/updated backend, Vitest, and Playwright coverage for all affected flows and verified targeted suites pass.

## 2026-02-17 12:09:42 PST

- Implemented consolidated branch-review fixes while explicitly avoiding backward-compatibility shims and read-time auto-healing.
- Fixed `TextParamDateTimeInput` hook-order safety by making hooks unconditional and keeping mode branching render-only.
- Replaced UTC-derived "today" defaults with local-date ISO generation and reused it in both date/time param UI and task board due-date defaults.
- Hardened app param rendering by splitting DateParam and TimeParam into explicit typed paths with fail-fast type guards (no fallback field coercion).
- Removed settings-project section auto-creation during `ensure_settings_code_objs`; missing required settings sections now raise deterministic errors.
- Added unmount-safe global pointer listener teardown for file-browser preview resize interactions.
- Optimized spreadsheet editing paths by skipping no-op writes, setting dirty state only on real mutations, and removing eager visible-row rematerialization.
- Replaced deep-equality task board selector comparison with shallow comparison for lower hot-path store-update overhead.
- Cleaned up UI-type combobox calendar preset handling by enforcing `filterKey === "control"` invariant and removed redundant spreadsheet rename branching.
- Added/updated Vitest, pytest, and Playwright coverage for the above behaviors and verified targeted suites pass; completed CDP visual verification for updated date/calendar UI flows.

## 2026-02-17 13:07:50 PST

- Implemented spreadsheet editor race-condition hardening so save completion only applies to the initiating file path and dirty state clears only when no newer edits happened during save.
- Added explicit save-time edit locking in spreadsheet handlers (`effectiveReadOnly`) and aligned DOM + Glide editability to prevent in-flight save mutation drift.
- Optimized spreadsheet row-index derivation with a no-filter/no-sort fast path and extracted deterministic filtered/sorted index computation for large-sheet edit responsiveness.
- Increased native dropped-file import collision resilience by expanding candidate probe depth and write-conflict retry budget for large workspace roots.
- Replaced strict contenteditable selector checks with standards-aligned editable detection using `isContentEditable` plus non-false contenteditable matching.
- Reduced text-block master font slider backend churn by adding local drag-preview state and committing one persisted update at drag end (while preserving keyboard/input commit behavior).
- Removed dead frontend code by deleting an unused `lodash` import in `TaskBoardArea` and an unused calendar utility helper.
- Added/updated Vitest and Playwright coverage for spreadsheet save guards/index sorting, native import conflict retries, editable-target detection, and text-block slider commit semantics; verified targeted suites pass.

## 2026-02-17 13:43:30 PST

- Implemented the latest consolidated top-level review fixes without adding backward-compatibility shims and intentionally kept `CodeParam` multiline.
- Fixed multi-sheet spreadsheet save behavior by preserving untouched sheets during `.xlsx/.xls` writes, and wired the editor to round-trip source workbook bytes.
- Enforced a hard server-side file-content read cap in file browser routes so request `maxBytes` can only lower limits, never raise them.
- Eliminated stale async preview commits in universal file preview and fixed spreadsheet auto-reload status messaging to only announce success on true reload success.
- Restored `MetaControlMenuButton` check icon import and changed its store selector back to a primitive boolean read to avoid unnecessary rerenders.
- Removed duplicated text-block font-size clamp logic by reusing the shared typography utility as the single source of truth.
- Removed unused date/time config baggage from `TextParam` schema surfaces, updated related frontend extraction paths, and regenerated synced backend/frontend generated types.
- Added/updated targeted pytest, Vitest, and Playwright coverage for these fixes and completed a CDP visual verification pass on the affected UI surfaces.

## 2026-02-17 14:29:01 PST

- Implemented the remaining consolidated review fixes without adding any backward-compatibility shim behavior.
- Hardened file-browser content reads against stat/read races by enforcing max-size on bytes actually read and returning conflict if metadata changes during read.
- Made create-only file-browser writes atomic with exclusive create semantics to prevent silent overwrite races.
- Reworked task-board persistence to compute mutations from the latest store snapshot at optimistic-apply time and split structural vs non-structural mutation normalization.
- Reduced task-board write churn for recurrence-year text editing by committing parsed values on blur/Enter instead of persisting on each keystroke.
- Fixed long-date parsing to use local date parts for unzoned long format input, preventing day shifts in positive-offset timezones.
- Fixed file-browser move flow so moved expanded folders proactively refresh destination-folder contents and stay expansion/data consistent after transfer.
- Added/updated backend pytest, frontend Vitest, and Playwright coverage for all of the above and completed CDP visual verification for task-board and file-browser UI behavior.

## 2026-02-17 18:08:40 PST

- Implemented the consolidated review fixes while explicitly avoiding any new backward-compatibility behavior.
- Removed incrementer legacy child-type token rewriting so `create_child_sections_via_incrementer` now honors explicit requested section types only.
- Fixed dotfile copy naming in file-browser transfers so names like `.env` copy as `.env copy` / `.env copy 2` instead of extension-mangled variants.
- Closed share-policy regression gaps by adding deny-path route coverage for parent default child type, task board state, spreadsheet path/settings, and text-block master font size mutations.
- Removed dead/no-op TextParam config plumbing and merged duplicated TextParam/CodeParam UI render branches to reduce maintenance drift.
- Reduced avoidable frontend render work by adding shallow selector equality in `ManyNestedSections` and memoizing `TaskBoardSettings` normalization.
- Improved file-browser binary error reporting by parsing non-2xx binary responses as JSON/text and surfacing actionable server detail to callers.
- Deferred spreadsheet-heavy code paths with lazy component mounts and on-demand `xlsx` loading, including async spreadsheet parse/serialize flow updates.
- Pinned `@glideapps/glide-data-grid` to `6.0.3` for deterministic dependency resolution.
- Added/updated pytest, Vitest, and Playwright coverage for the above and verified targeted suites plus build checks pass.
