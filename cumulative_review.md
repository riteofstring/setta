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
