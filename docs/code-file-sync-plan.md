# Code File Sync Service Plan

## Goals
- Provide a single backend service that watches every `CodeFileBinding` and keeps project state in sync with on-disk edits.
- Keep existing `ProjectPythonCode` / `ProjectBashCode` responsibilities limited to outbound writes + LSP integration.
- Make it easy to add new languages or read-only viewers for arbitrary text files without touching queue plumbing again.

## Core Concepts
- **CodeFileSyncService**
  - Instantiated once in `backend/setta/server_state.py` alongside `Artifacts` and `JSONSource`.
  - Owns registration with `SpecificFileWatcher`, translating events into structured callbacks.
  - Normalizes paths, deduplicates rapid changes, and reads updated file contents via `DBE`.
  - Skips `write_only` bindings (generated code) unless we later opt into publish/backfill semantics.
- **Sync Subscribers**
  - `BaseProjectManager` registers each `(projectConfigId, sectionId)` + binding after `validate_code_file_bindings`.
  - Generated code registers separately using `projectState.genCodeBinding`.
  - Subscribers expose hooks (`on_external_update`, `on_deleted`, `on_created`) that mutate project state (e.g., `set_code`) and trigger broadcasts.
- **Binding Registry**
  - The service maintains a mapping from `Path` → `BindingOwner` metadata so multiple sections sharing a path co-exist.
  - When bindings change (new path, toggled access mode), the manager updates the registry without tearing down the whole watcher set.

## Integration Steps
1. **Shared Language Metadata** ✅ (done)
   - `get_code_extension(language: CodeLanguage) -> str` now lives in `backend/setta/project_state/utils.py`, reused by `Code` subclasses and `ProjectStateSingleConfig.validate_code_file_bindings` to keep extensions consistent.

2. **Implement `CodeFileSyncService`** ✅ (skeleton landed)
   - Define the service under `backend/setta/project_state/code_file_sync.py`.
   - Accept `SpecificFileWatcher`, `DBE`, and a scheduler/loop helper for batching (rely on `asyncio` similarly to `JSONSource`).
   - Expose methods:
     - `register_binding(owner: BindingOwner)` / `unregister_binding`.
     - `refresh_binding(owner)` for path or mode changes.
     - Event callbacks that yield `CodeFileSyncEvent` payloads.
   - Ensure we fire an initial `created`/`modified` event for new registrations so state reflects disk immediately.
   - ✅ Initial service scaffold handles multi-owner registry management, dedupes bursty filesystem events, normalizes `read`/`created`/`deleted` notifications, and surfaces them via subscriber callbacks. Queue wiring + consumers still to come in later steps.

3. **Wire Into `BaseProjectManager`** ⏳ (partial)
   - ✅ Constructor now accepts an optional `CodeFileSyncService` and keeps per-project owner bookkeeping so managers control registration lifecycles.
   - ✅ After `validate_code_file_bindings`, BaseProjectManager refreshes registrations, allowing multiple sections (and projects) to share a path.
   - ✅ Filesystem events reuse the existing `SetCodeRequest` flow, ensuring updates run through the queue and broadcast pipeline.
   - ⬜ Extend registration to include the generated code binding once we decide how to surface its callbacks (likely during Step 4 when the service is instantiated centrally).

4. **Update Manager Creation** ✅ (done)
   - ✅ Instantiate `CodeFileSyncService` in `backend/setta/server_state.py`.
   - ✅ Pass it into both `ProjectManager` and `SettingsProjectManager`.
   - ✅ Ensure tests (`tests/utils/manager_fixture.py`) construct the service as well.

5. **Expose Binding Mutations** ✅
   - ✅ Added `/setCodeFileBinding` under `Route.SET_CODE_FILE_BINDING`, delegating to `BaseProjectManager.set_code_file_binding`.
   - ✅ Manager method re-validates project state, rebuilds the binding via `BaseCodeSectionImplArgsWithCallable`, and lets `_sync_code_file_bindings_for_project_state` drive the watcher refresh.

6. **Frontend Controls** ⏳ (in progress)
   - ✅ Surface binding details + access mode editing in the UI editor via `CodeAreaSettings`, wiring optimistic updates through the new route.
   - ✅ Call the new route with optimistic state updates when bindings change.
   - ⬜ Add UX for path validation/file picker + surface backend errors (nonexistent files, permission issues, etc.).

7. **Testing & Docs** ⏳
   - ✅ Added regression coverage for backend mutation flow (`tests/project_state/test_code_file_binding.py`) and the FastAPI route (`tests/routers/test_set_code_file_binding_route.py`).
   - ⬜ Add tests covering external file edits/deletions using the live watcher integration.
   - ✅ Documented the new route details here for future UI integration.

## Future Work
- Support read-only viewers for arbitrary text files by registering them with `CodeFileSyncService` and rendering the content in the UI without LSP.
- Extend the service with change throttling or diffing if we see performance issues on large files.
- Hook into upcoming UI flows for changing bindings (file picker dialog, access mode badges).
