# Code File Binding & Sync System

## Overview
- Every code section (Python, Bash, generated code) is paired with a `CodeFileBinding` that determines where its canonical source file lives and where LSP snapshot files are written.
- `ProjectCode` objects write section code to those canonical paths and keep the language server in sync, so users can open the on-disk files directly.
- `CodeFileSyncService` registers each binding with `SpecificFileWatcher`; whenever a watched file changes, the owning project manager feeds the new contents back through the normal `setCode` queue to update application state and broadcast to clients.

## Binding Data Model & Directory Layout
- `CodeFileBinding` holds three fields:
  - `canonical_path`: normalized absolute path to the section’s source file.
  - `snapshot_dir`: directory used for short-lived LSP snapshot documents.
  - `access_mode`: `read_write`, `read_only`, or `write_only`.
- `ProjectStateSingleConfig.validate_code_file_bindings` materializes bindings before every update. By default it builds paths under `setta_files/code`:
  - `setta_files/code/sections/<project-slug>/<section-slug>.py|sh` for editable sections.
  - `setta_files/code/generated/<project-slug>/setta_gen.py` for generated Python code.
  - `setta_files/code/temp_folder/<project-slug>/` for snapshot documents.
- Paths are derived from slugs created via `sanitize_name`; parents are created on demand when files are written.

## Writing Canonical Files & LSP Snapshots
- `backend/setta/project_state/code.py` defines the shared `Code` helpers. `ProjectPythonCode` and `ProjectBashCode` write to `binding.canonical_path` via `DBE.write`, ensuring folders exist.
- Python sections open the canonical file in the language server after every write and reuse `binding.snapshot_dir` for temporary documents (`temporary_document` context manager).
- Generated code (`ProjectGenPythonCode`) receives the `write_only` binding so it still writes to disk but the sync service ignores filesystem events for it.

## Runtime Binding Changes
- The `/setCodeFileBinding` FastAPI route (`Route.SET_CODE_FILE_BINDING`) accepts a `SetCodeFileBindingRequest` from the frontend (`generatedEndpoints.setCodeFileBinding`).
- `BaseProjectManager.set_code_file_binding` normalizes the requested path, derives a snapshot directory from its parent, updates the section impl with a new `CodeFileBinding`, and then calls the standard `update_and_broadcast_project_state`.
- During the subsequent `update`, `validate_code_file_bindings` re-runs so bindings remain consistent with project metadata even if multiple sections share a file.

## Sync Registration Lifecycle
- `BaseProjectManager.update` calls `_sync_code_file_bindings_for_project_state` after validation:
  - Builds a `BindingOwner` (project id, section id, variant id, callbacks) for each section that currently resolves to a `CodeSectionImpl`.
  - Compares owner ids with the prior registration set to find new, existing, and stale bindings.
  - For new owners, `CodeFileSyncService.register_binding` records the owner, updates the watcher callbacks, and issues an initial read through `SpecificFileWatcher.request_read`.
  - For existing owners whose metadata changed (e.g., different canonical path or access mode), `refresh_binding` reconciles the registry.
  - Owners that disappear are unregistered so their paths stop being watched.
- Bindings with `access_mode == write_only` (generated code) are skipped entirely to avoid feedback loops.

## CodeFileSyncService Responsibilities
- Lives in `backend/setta/project_state/code_file_sync.py`; constructed in `backend/setta/server_state.py` and shared by every project manager.
- Maintains a path → `_PathSubscribers` registry and an owner → path map so multiple sections can watch the same file without duplicate observers.
- Uses `SpecificFileWatcher.update_callbacks` to configure a single watchdog observer per directory while categorizing callbacks by service instance.
- Deduplicates bursty filesystem events by queuing them per path; `_process_updates` coalesces updates under an asyncio lock before dispatch.
- Reads file contents via `DBE.read` for non-deletion events; if the read fails, the event is downgraded to `deleted` so owners receive a consistent signal.
- Emits `CodeFileSyncEvent` objects to the owner’s `on_external_update` / `on_created` / `on_deleted` coroutines based on the final event type.

## External File Edit Flow
1. A user edits a watched file on disk; watchdog raises a `created`, `modified`, `moved`, or `deleted` event.
2. `SpecificFileEventHandler` normalizes the path and hands a `FileWatcherCoreUpdate` to the registered callback for the canonical path.
3. `CodeFileSyncService` enqueues the update, reads the current contents (unless deleted), and emits a `CodeFileSyncEvent` to each `BindingOwner`.
4. `BaseProjectManager._handle_code_file_sync_event` checks that the section still uses the same variant, confirms the new content differs, and enqueues a `set_code` request.
5. The manager processes the queued request in order with other operations, mutates project state, rewrites the canonical file (ensuring LSP stays aligned), and broadcasts the change back to clients.

## Handling Variant or Project Changes
- Owners include the expected variant id. If a section switches variants before the filesystem event is processed, the manager discards the update to avoid stale writes.
- Project managers keep per-project owner id sets so unloading a project or deleting a section tears down watcher registrations automatically.

## Access Modes
- `read_write`: default for editable sections; sync service both watches the file and allows outbound writes.
- `read_only`: registered with the sync service but UI-level operations should not persist edits; external changes still flow back into state.
- `write_only`: used for generated artifacts; project code writes to disk, but sync registration is skipped so external edits are ignored.

## Key Modules & Reference Points
- `backend/setta/types/project_state.py`: binding generation (`validate_code_file_bindings`) and default path layout.
- `backend/setta/project_state/base_project_manager.py`: binding synchronization, `/setCodeFileBinding` handling, and external edit ingestion.
- `backend/setta/project_state/code_file_sync.py`: watcher orchestration and event dispatching.
- `backend/setta/file_watchers/specific_file_watcher.py`: filesystem integration built on `watchdog`.
- `frontend/src/utils/generatedEndpoints.ts`: generated client helper for the binding mutation route.
- Tests: `tests/project_state/test_code_file_binding.py` (binding updates + sync refresh) and related fixtures under `tests/utils/manager_fixture.py`.
