# Draw Section Snapshot + Codegen Policy

## Goal
Avoid embedding base64 image payloads in generated Python code while preserving realtime draw updates for listener scripts.

## Constraints
- Persist a rendered draw snapshot only when code is run.
- Keep realtime draw updates (base64) flowing to listeners for ML/image transforms.
- Allow generated code to load draw output from disk.

## Proposed Behavior

### Realtime path (listener runtime)
- Continue emitting debounced base64 draw snapshots from the frontend.
- Listener scripts receive base64 in realtime and can respond with Image artifacts.
- No file I/O is required for realtime.

### Run path (codegen / packaged runtime)
- When the user runs code, request a fresh draw snapshot from the frontend.
- Persist that snapshot as an artifact file (PNG) on disk.
- Store a stable artifact path on the Draw section (new field).
- Generated code reads the file on demand.

## Data Model Changes
- Add `renderedImagePath: str | None` to `DrawSectionImpl`.
  - This stores the canonical artifact path for the snapshot PNG.

## Codegen Policy
- Draw sections default to `representation=file` for codegen.
- `SectionRepresentationMode.base64` for Draw is removed/unsupported.
- `FileReadDependencyValue` is used for Draw when `renderedImagePath` is set.
- If no snapshot is available, emit `None`.

## PythonValueMode Impact
- **PACKAGED_RUNTIME**: `FileReadDependencyValue` loads from disk at runtime.
- **LIVE_RUNTIME**: `FileReadDependencyValue` yields the path string; realtime base64 updates still overwrite the value on state for listeners.

## Run-Time Snapshot Flow
1. User clicks Run.
2. Backend requests a fresh draw snapshot from the frontend.
3. Frontend returns base64 PNG for each Draw section.
4. Backend writes artifacts to disk and updates `renderedImagePath`.
5. Codegen emits `state.<draw>` with file-read expression.

## Notes
- Realtime base64 updates remain unchanged for listener workflows.
- This cleanly separates codegen payloads from realtime payloads.
