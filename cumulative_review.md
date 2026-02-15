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
