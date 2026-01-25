# Dropzone file explorer + local file picker attachments

## Goals
- Let Dropzone attach files via **server file explorer** in IDE mode.
- Keep **browser file picker** available for local files in IDE mode (user choice).
- In share mode, allow **local-only** attachments (browser picker + drag/drop), no server browsing.
- For now, always **store attachments as artifacts** under `setta_files/artifacts`.

## Non-goals
- Multi-select UX parity with full file managers (single selection is fine for now).
- Server-side stateless payloads (stateless remains base64 from the browser).
- Sharing-mode server browsing (still disabled by backend policy).

## UX summary
- Dropzone shows an action row:
  - **Local file…** (always, unless disabled)
  - **Server file…** (IDE mode + stateful only)
- Local picker and drag/drop continue to upload from browser via base64.
- Server picker opens a modal with the existing File Browser tree.
  - Double-click a file (or Attach) to add it.

## Backend plan
1. **New route:** `IMPORT_FILES_TO_ARTIFACTS`
   - Request: `paths: list[str]`
   - Response: list of file attachment descriptors (id/name/mime/size/kind).
2. **Validation:**
   - Reject in share mode (403).
   - Resolve paths against project root and disallow outside-root paths.
   - Ensure each path exists and is a file.
3. **Artifact creation:**
   - Read file bytes.
   - Create new artifact id in `setta_files/artifacts` using the file’s extension.
   - Base64 encode and write via `Artifacts.apply_updates`.
4. **Metadata:**
   - MIME via `mimetypes.guess_type`, fallback to `application/octet-stream`.
   - Size from bytes length.

## Frontend plan
1. **Modal:** add a Dropzone file picker modal that embeds the File Browser.
   - Provide a callback `onPickPaths` to return selected file paths.
   - Show Attach/Close actions (Attach enabled for file selection only).
2. **FileBrowserPane extension:**
   - Add optional `onFileOpen` and `onSelectionChange` props.
   - Use `onFileOpen` for the modal instead of opening code sections.
3. **DropzoneInput changes:**
   - Add hidden `<input type="file">` and Local File action to open it.
   - Add Server File action (IDE mode + stateful only) to open the modal.
   - On server pick: call `route_import_files_to_artifacts` and append returned attachments to the Dropzone value.
   - Enforce maxAttachments client-side (slice selections / disable when full).
   - Stateless mode: keep server picker hidden; local picker continues to emit base64 payloads.

## Share mode behavior
- Server file explorer never opens (no backend access).
- Dropzone supports only browser-local files (drag/drop + local picker).

## Data flow
- **Local file** (stateful): `FileReader → route_update_artifacts → Dropzone value JSON`.
- **Local file** (stateless): `FileReader → onStatelessDrop (base64 payload)`.
- **Server file** (stateful): `route_import_files_to_artifacts → Dropzone value JSON`.

## Tests / verification
- IDE mode:
  - Local picker uploads and persists.
  - Server picker imports to artifacts and persists.
  - Max attachments enforced for both options.
- Share mode:
  - Server picker hidden; local picker still works.
- Stateless mode:
  - Server picker hidden; local picker still emits base64 events.

## Follow-ups / open questions
- Multi-file selection in the server picker.
- Optional size warnings or limits for large attachments.
