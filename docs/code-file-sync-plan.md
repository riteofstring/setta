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
1. **Shared Language Metadata**
   - Extract a helper (e.g., `get_code_extension(language: CodeLanguage) -> str`) and reuse it in `Code`, `ProjectStateSingleConfig.validate_code_file_bindings`, and future sync formatting.

2. **Implement `CodeFileSyncService`**
   - Define the service under `backend/setta/project_state/code_file_sync.py`.
   - Accept `SpecificFileWatcher`, `DBE`, and a scheduler/loop helper for batching (rely on `asyncio` similarly to `JSONSource`).
   - Expose methods:
     - `register_binding(owner: BindingOwner)` / `unregister_binding`.
     - `refresh_binding(owner)` for path or mode changes.
     - Event callbacks that yield `CodeFileSyncEvent` payloads.
   - Ensure we fire an initial `created`/`modified` event for new registrations so state reflects disk immediately.

3. **Wire Into `BaseProjectManager`**
   - Accept `code_file_sync` in the constructor; store it.
   - After each `validate_code_file_bindings`, register all eligible bindings (read/write ones + maybe read_only).
   - Handle sync events by invoking existing helpers (`set_code`, `maybe_update_gen_python_code_section`, broadcasts).
   - Respect the project manager queue—schedule state mutations through `enqueue_method` or dedicated async tasks to avoid races with in-flight updates.

4. **Update Manager Creation**
   - Instantiate `CodeFileSyncService` in `backend/setta/server_state.py`.
   - Pass it into both `ProjectManager` and `SettingsProjectManager`.
   - Ensure tests (`tests/utils/manager_fixture.py`) construct the service as well.

5. **Expose Binding Mutations**
   - Add backend requests/routes for changing a section’s `CodeFileBinding` (path + access mode).
   - When processed, run `validate_code_file_bindings`, update the sync registrations, and persist/broadcast.

6. **Frontend Controls**
   - Surface binding details + editor UI (path picker, access mode toggle).
   - Call the new route, optimistic update state, and show errors if sync rejects the path (nonexistent, permission issues, etc.).

7. **Testing & Docs**
   - Add tests covering external file edits/deletions and binding updates using the new service.
   - Update `docs/code-section-file-binding-plan.md` once the core syncing step lands.

## Future Work
- Support read-only viewers for arbitrary text files by registering them with `CodeFileSyncService` and rendering the content in the UI without LSP.
- Extend the service with change throttling or diffing if we see performance issues on large files.
- Hook into upcoming UI flows for changing bindings (file picker dialog, access mode badges).
