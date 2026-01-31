# Draw and Image Section Representation

This doc summarizes how Draw and Image sections are modeled in project state,
how they flow through realtime updates, and how codegen represents them in
packaged runtime.

## Shared data model (project state)
- Image sections store only a path: `ImageSectionImpl.imagePath`.
- Draw sections store the editable structure: `DrawSectionImpl.layers` plus
  `renderedImagePath` for the latest flattened snapshot.
- Draw layers contain `DrawAreaLayerItem` entries with:
  - `type`: `Image` or `BrushStroke`.
  - `dataPath`: artifact path for the image or stroke data.
  - `transformId`: artifact path for the transform + eraser state.
- Artifact ids default under `setta_files/artifacts` via
  `setta.types.artifact.create_*_artifact_id`.
- Draw snapshots default to
  `setta_files/artifacts/draw_snapshots/<sectionId>.png`.

Relevant code:
- `backend/setta/types/section_impls.py`
- `backend/setta/types/artifact.py`
- `backend/setta/project_state/draw_snapshots.py`

## Realtime (IDE/UI + listeners)
### UI and artifact caches
- The backend keeps in-memory artifact caches in `Artifacts`:
  - `ImageArtifact.value` is a `BinaryContentRef` with `contentId` + metadata.
  - `BrushStrokeArtifact.value` and `DrawAreaLayerItemTransformArtifact.value`
    are JSON payloads.
- File watcher updates call `read_*_from_disk`, cache artifacts, and broadcast
  `UpdateArtifacts` websocket messages.
- The frontend requests missing artifacts via:
  - `route_load_cached_image_artifacts`
  - `route_load_cached_brush_strokes`
  - `route_load_cached_draw_area_layer_item_transform`
- `useImageArtifact` looks up the image by `imagePath` and `ImageArea` fetches
  the bytes via `route_binary_download`, then renders from a Blob URL.
- `useDrawAreaArtifactLoader` loads and decodes images + strokes + transforms
  before Draw canvases render (binary images are fetched via the binary endpoint).

Relevant code:
- `backend/setta/project_state/artifacts.py`
- `backend/setta/routers/artifact.py`
- `frontend/src/state/hooks/artifacts.ts`
- `frontend/src/components/Section/Layouts/ImageArea.tsx`
- `frontend/src/components/Section/Layouts/DrawArea/DrawArea.tsx`

### Realtime dependency deltas (listeners)
- Draw sections emit binary snapshots via
  `sendRealtimeSectionBinary` -> `WebsocketMsgRealtimeUIChange` with a binary
  websocket frame.
- Image file changes emit binary deltas via
  `Artifacts.emit_realtime_image_updates`, which streams bytes in a binary frame.
- Listener-side dependency updates for Draw/Image expect `BinaryDependencyValue`
  (see `ListenerFrontendEmitResolver`).
- Direct dependency updates for Image sections are not applied to project state;
  use artifact updates instead (`listener_dependency_updates.py` raises
  `NotImplementedError` for Image sections).

Relevant code:
- `frontend/src/components/Section/Layouts/DrawArea/useRealtimeDrawEmitter.ts`
- `frontend/src/state/actions/websocketReceive.ts`
- `backend/setta/project_state/artifacts.py`
- `backend/setta/listeners/listener_frontend_emit_resolver.py`
- `backend/setta/project_state/listener_dependency_updates.py`

## Packaged runtime (codegen output)
- Dependency graph exports:
  - Image sections as `FileReadDependencyValue(imagePath)` for `file_read`.
  - Draw sections as `FileReadDependencyValue(renderedImagePath)` for `file_read`.
  - `file_path` emits a literal path string instead of reading file contents.
  - Missing `imagePath`/`renderedImagePath` downgrade to `expression` with the literal `"None"`.
- In packaged runtime (`PythonValueMode.PACKAGED_RUNTIME`), generated code
  uses `value_helpers.read_file_value(path)`:
  - Binary files (png snapshots) return `bytes`.
  - Text files return `str`.
- Draw snapshots are written on run when the frontend supplies
  `drawSnapshotsBySectionId`; the backend reads bytes from the binary store,
  writes the png, and updates `renderedImagePath`.

Relevant code:
- `backend/setta/code_gen/dependency_graph.py`
- `backend/setta/code_gen/value_codec.py`
- `backend/setta/code_gen/python/value_helpers.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/draw_snapshots.py`
