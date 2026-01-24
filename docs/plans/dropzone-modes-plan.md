# Dropzone modes (stateless + stateful)

## Goals
- Add a **stateless** dropzone mode that behaves like ButtonParam: no persisted value, only listener events.
- Add a **stateful** mode that persists attachments, supports a max-attachments limit, and allows deletes.
- Ensure stateful dropzones have a real value representation in the value codec (not just a raw JSON string).
- Keep existing DropzoneParam behavior as close as possible (default = stateful).
 - Stateless mode should not write files to disk (use base64 payloads).

## Current behavior (summary)
- `DropzoneParam` is a `BaseChildlessCodeObjImpl` with a string `value`.
- Frontend only stores dropped **file names** (no upload/content).
- MetaControl dropzones behave like any other value control (RealtimeUIChange + set_param_entered_value).
- Codegen treats DropzoneParam as a string literal (see `backend/setta/code_gen/value_codec.py`).

## Proposed data model
- Add `DropzoneMode` enum:
  - `STATEFUL` (default)
  - `STATELESS`
- Add fields to `DropzoneParamCodeObjImpl` (in `backend/setta/types/code_obj_impls.py`):
  - `mode: DropzoneMode = DropzoneMode.STATEFUL`
  - `maxAttachments: int | None = None`
- Define a canonical, versioned JSON payload for stored stateful values:
  ```json
  {
    "version": 1,
    "attachments": [
      {
        "id": "artifacts/<uuid>.<ext>",
        "name": "file.pdf",
        "mimeType": "application/pdf",
        "size": 12345,
        "kind": "file"
      },
      {
        "id": "text:<uuid>",
        "name": "Dropped text",
        "kind": "text",
        "text": "some text"
      }
    ]
  }
  ```
- Store **empty** state as `""` (empty string) to preserve “no value” semantics in codegen.

## Backend plan
1. **Types + defaults**
   - Add `DropzoneMode` + new fields in `backend/setta/types/code_obj_impls.py`.
   - Run `pnpm generate` to update generated types in:
     - `backend/setta/types/generated/*`
     - `frontend/src/utils/generatedTypes.ts`
2. **Value codec representation**
   - Update `backend/setta/code_gen/value_codec.py` for `DropzoneParam`:
     - If `value == ""` → treat as empty list `[]`.
     - If JSON payload parses → emit a Python list of **attachment objects** with file paths and text payloads (stable across live + packaged runtime).
     - Fallback to `repr(value)` for invalid payloads.
3. **Attachment storage (stateful)**
   - Add new artifact type (recommended):
     - `ArtifactType.File` + `FileArtifact` in `backend/setta/types/artifact.py`.
     - Update `backend/setta/project_state/artifacts.py` to read/write file artifacts.
     - Extend `backend/setta/types/generated/unions.py` and artifact routers.
   - Alternative (lower-scope): add a dedicated dropzone upload route that writes
     files under `artifacts/` and returns a path.
4. **Stateless payloads (no disk)**
   - For `mode=STATELESS`, **do not persist** uploads.
   - Emit realtime events with base64 payloads + metadata (see frontend plan).
5. **Share deployment path rewriting**
   - Extend `backend/setta/share/deployment_utils.py` to parse DropzoneParam values
     and rewrite attachment paths via `resolve_artifact_path`.
6. **Listener compatibility**
   - Stateless mode uses `RealtimeDependencyEvent` (same path as ButtonParam).
   - Stateful mode relies on value codec so listeners see a list of attachment objects.
7. **Backend enforcement**
   - Enforce `maxAttachments` in backend (reject or truncate extra items).

## Frontend plan
1. **Config UI**
   - Add Dropzone config component (e.g., `DropzoneInputConfigForParam`) wired into
     `frontend/src/components/Params/ParamUIs/ParamUI.tsx`.
   - Expose mode selector + maxAttachments input via `route_update_param_impl_config`.
2. **DropzoneInput overhaul**
   - Parse `value` into attachments list (JSON payload).
   - Render attachments with delete controls.
   - Enforce `maxAttachments` client-side.
   - On file drops:
     - **Stateful:** upload files to backend (new artifact/file endpoint) and update value JSON.
     - **Stateless:** read file as base64 and emit event payload (no persistence).
   - On text drops:
     - Create text attachment entries.
3. **ParamInput + MetaControl wiring**
   - In `frontend/src/components/Params/ParamItems/ParamInput.tsx`:
     - If `DropzoneParam` + `mode=STATELESS`: send `RealtimeDependencyEvent`
       with payload `{ attachments, paramInfoId, sectionId }`, skip `set_param_entered_value`.
     - If `STATEFUL`: send `RealtimeUIChange` + `set_param_entered_value` with JSON.
   - In `frontend/src/components/Section/Layouts/MetaControlArea.tsx`:
     - Mirror the same stateless/stateful handling for meta controls (Section dependency keys).
4. **Stateless payload (base64)**
   - Attachment shape for stateless events:
     ```json
     {
       "kind": "file",
       "name": "report.pdf",
       "mimeType": "application/pdf",
       "size": 12345,
       "base64": "<raw base64 without data URI prefix>"
     }
     ```
   - Text entries include `{ "kind": "text", "name": "Dropped text", "text": "..." }`.

## Listener + docs
- Update `docs/meta-controls.md` and `docs/listener-flows.md` with:
  - Dropzone stateless payload format (base64).
  - Stateful value shape and codec output (list of attachment objects).
- Provide a short snippet in `docs/setta-listener-examples.md` showing how to handle
  dropzone events and read files from paths.

## Tests / verification
- Backend:
  - Unit tests for dropzone value codec formatting.
  - Tests for share deployment path rewriting of dropzone attachments.
- Frontend (manual):
  - Drop files in stateful mode, reload project, verify attachments persist.
  - Drop files in stateless mode, verify listener receives event payload.
  - Test maxAttachments truncation + delete behavior.

## Open questions
- For stateless mode, do we want a size cutoff to reject huge base64 payloads?
