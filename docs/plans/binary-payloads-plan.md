# Plan: Replace Base64 Payloads With Binary Transport

## Summary
Remove base64 usage for artifacts, realtime draw/image updates, and dropzone uploads by switching to binary transport. This is a breaking change with no backward compatibility. The plan replaces JSON-embedded base64 strings with binary endpoints and binary websocket frames, and updates generated types, backend storage, and frontend decoding to use bytes/Blob/ArrayBuffer directly.

## Goals
- Eliminate base64 for image/file artifacts, draw snapshots, realtime dependency events, and dropzone uploads.
- Reduce payload size (~33% overhead removed) and CPU/memory cost from encode/decode.
- Provide a single, explicit binary transport path across HTTP and WebSocket.
- Update docs, tests, and generated types to reflect the new binary model.

## Non-Goals
- Preserve backward compatibility with existing base64 payloads.
- Change JWT/base64url token handling (auth remains base64url as required).
- Implement optional fallbacks for legacy clients.

## Current Base64 Touchpoints (High-Level)
- Artifact read/write and caching: `backend/setta/project_state/artifacts.py`
- Draw snapshot updates: `backend/setta/project_state/draw_snapshots.py`
- Artifact API endpoints and size checks: `backend/setta/routers/artifact.py`
- Realtime dependency payload type: `backend/setta/types/dependency_value.py`
- Frontend canvas/image helpers: `frontend/src/components/Section/Layouts/DrawArea/base64Conversion.ts`
- Dropzone uploads: `frontend/src/components/Params/ParamUIs/DropzoneInput.tsx`
- Realtime senders: `frontend/src/state/actions/websocketReceive.ts`
- Codegen helpers: `backend/setta/code_gen/value_codec.py`, `backend/setta/code_gen/python/value_helpers.py`
- Docs and tests: `docs/`, `tests/`

## Decisions (Locked)

### BinaryContentRef Shape
Use a simple metadata object everywhere binary payloads were base64:
```
{
  "contentId": "<uuid>",
  "byteLength": 12345,
  "mimeType": "image/png",
  "sha256": "<optional>"
}
```
- `sha256` is optional but recommended for integrity/caching.

### HTTP Upload/Download
- Upload: `POST /binary/upload` with `multipart/form-data` (`file` field).
  - Response: `BinaryContentRef`.
- Download: `GET /binary/{contentId}`
  - Response: `application/octet-stream` with stored `Content-Type`.

### WebSocket Binary Frames
Single binary frame format:
- 4‑byte big‑endian header length
- UTF‑8 JSON header
- Raw binary payload

Header example:
```
{
  "messageType": "RealtimeDependencyEvent",
  "content": {
    "projectConfigId": "...",
    "dependencyEvent": {
      "dependencyKey": { ... },
      "payload": {
        "type": "Binary",
        "contentId": "...",
        "byteLength": 12345,
        "mimeType": "image/png"
      },
      "timestampMs": 123
    }
  }
}
```

### contentId Lifecycle
- Uploads are stored in `setta_files/binary/` under UUID filenames.
- When an artifact update claims a `contentId`, bytes are moved/copied to the artifact path and the temp blob is deleted.
- Unclaimed blobs are deleted by TTL cleanup (1–24 hours configurable).

### Realtime Payload Strategy
- Realtime dependency events always inline bytes via WS binary frames.
- Enforce a realtime payload cap (e.g., 5–10 MB) and reject larger payloads.
- Artifact updates use upload + ref (never inline base64 or inline bytes in JSON).

## Proposed Architecture

### 1) Binary Content Model
Introduce a content reference type that is used everywhere base64 was used.

**New types (conceptual):**
- `BinaryContentRef`: `{ contentId: string, byteLength: int, mimeType?: string, sha256?: string }`
- `DependencyValueType.Binary`: payload becomes a `BinaryContentRef`.
- `ImageArtifact.value` and `FileArtifact.value` become `BinaryContentRef` (not strings).

Binary bytes live outside JSON. Metadata is passed via JSON; bytes are transferred via HTTP or WS binary frames.

### 2) HTTP Binary Endpoints
Add explicit binary endpoints to upload and download artifact payloads.

**Upload:**
- `POST /binary/upload` (`multipart/form-data`, `file` field)
- Response: `BinaryContentRef`.

**Download:**
- `GET /binary/{contentId}`
- Response: `application/octet-stream` with correct `Content-Type`.

Artifacts update flow changes:
- Frontend uploads bytes first, receives `contentId`.
- Frontend sends artifacts update JSON with `value: BinaryContentRef`.
- Backend saves bytes to disk using `contentId` payload and deletes the temp blob.

### 3) WebSocket Binary Frames
Send realtime binary data using a single binary frame with a compact header.

**Binary frame format:**
- 4-byte big-endian header length
- UTF-8 JSON header
- Raw binary payload

**Rationale:** single-frame delivery avoids ordering issues and keeps metadata/bytes atomic.

### 4) Frontend Binary Handling
- Replace `base64Conversion.ts` with binary helpers:
  - `canvasToBlob` via `HTMLCanvasElement.toBlob`.
  - `blobToImageObj` using `URL.createObjectURL` + `revokeObjectURL`.
- Update image rendering to use `Blob`/`ArrayBuffer` instead of base64 strings.
- Update dropzone to read files via `file.arrayBuffer()` and upload binary directly.
- Update realtime sending to emit binary WS frames.

### 5) Backend Storage and Artifacts
- Update `Artifacts.read_*_from_disk` to return `BinaryContentRef` rather than base64.
- Update `Artifacts._prepare_artifact_for_storage` to accept bytes directly, no base64 decode.
- Update file size enforcement to use raw byte length.
- Update draw snapshot updates to accept bytes and write directly.

### 6) Codegen and Dependency Values
- Replace `DependencyValueType.Base64` with `DependencyValueType.Binary`.
- Update `value_codec.py` to render binary dependencies.
- Update `value_helpers.py` to remove base64 helpers; add binary payload helpers if needed.
- Regenerate types (`pnpm generate`).

### 7) Docs and Tests
- Rewrite docs that mention base64.
- Update tests to use binary payloads (fixtures as bytes and content refs).
- Remove base64 expectations in websocket and artifact tests.

## Detailed Work Plan (Phases)

### Phase 1: Type & Schema Changes (Breaking)
- Update dependency value model to remove Base64, add Binary.
- Update artifact models to replace base64 strings with `BinaryContentRef`.
- Regenerate generated types and unions (`pnpm generate`).
- Update any JSON schemas or frontend type usage accordingly.

### Phase 2: HTTP Binary Transport
- Add new binary upload/download routes and wire into `Route` enum.
- Add backend binary storage in `setta_files/binary/`.
- Implement TTL cleanup for unclaimed blobs.
- Update artifact update API to accept `BinaryContentRef`.
- Update file size checks to use `byteLength`.

### Phase 3: WebSocket Binary Transport
- Add binary frame support to frontend and backend websocket send/receive.
- Update realtime dependency event handling to accept binary payloads.
- Enforce realtime payload size limits.
- Update `listener_frontend_emit_resolver.py` to coerce binary values.

### Phase 4: Frontend Migration
- Replace base64 canvas utilities with Blob/ObjectURL utilities.
- Update draw/image handling to load from binary endpoints.
- Update dropzone to upload bytes and pass references.
- Update any components expecting base64 (DrawArea, ChartArea, hooks).

### Phase 5: Backend Artifact IO and Draw Snapshots
- Update `Artifacts` read/write to handle bytes and refs.
- Update draw snapshot handler to accept bytes.
- Remove base64 from artifact import/export paths.

### Phase 6: Docs + Tests
- Update documentation, examples, and reference guides.
- Update tests to use binary payloads.
- Add tests for binary WS frame decode/encode and binary HTTP endpoints.

## File-by-File Impact (Primary)
- `backend/setta/types/dependency_value.py`
- `backend/setta/types/artifact.py`
- `backend/setta/project_state/artifacts.py`
- `backend/setta/project_state/draw_snapshots.py`
- `backend/setta/routers/artifact.py`
- `backend/setta/types/websocket.py` and generated websocket unions
- `backend/setta/code_gen/value_codec.py`
- `backend/setta/code_gen/python/value_helpers.py`
- `frontend/src/state/actions/websocketReceive.ts`
- `frontend/src/components/Section/Layouts/DrawArea/*`
- `frontend/src/components/Params/ParamUIs/DropzoneInput.tsx`
- `frontend/src/state/hooks/artifacts.ts`
- `frontend/src/utils/dropzone.ts`
- `docs/`, `tests/`

## Risks and Mitigations
- **Large payload memory spikes**: use multipart uploads + temp file store, avoid buffering entire payload in memory.
- **WebSocket binary handling complexity**: keep a single-frame format with explicit header length to simplify parsing.
- **Breaking changes**: coordinate generator updates and ensure frontend and backend are updated together.

## Validation & Testing
- Add unit tests for binary payload encoding/decoding and content ref handling.
- Add integration tests for artifact update + fetch roundtrip.
- Add websocket tests for binary realtime dependency events.
- Manual: open a project with Draw + Image sections and verify realtime updates display without base64.

## Rollout
- This is a hard cutover (no compatibility layer). The frontend and backend must be updated in lockstep.
- Update docs and examples before release.

