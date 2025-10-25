# Code File Access Modes: Implementation Plan

## Goals
- Upgrade code sections to support read/write, write-only, and read-only modes.
- Mirror the architecture used by JSON sources and artifacts so file watching, conflict handling, and broadcasts stay consistent.
- Prevent write loops and unexpected overwrites when the filesystem changes behind Setta.

## Progress
- Stubbed `CodeFiles` manager (`backend/setta/project_state/code_files.py`) to capture per-path metadata, binding ownership, and watcher category bookkeeping ahead of the full integration work.
- Instantiated the shared `CodeFiles` manager inside `SettaFastAPIState`, injected it into both project managers, and added a `watch_code_files()` hook so the wiring is ready for upcoming watcher logic.
- Implemented real metadata tracking, access-mode enforcement, and helper APIs in `CodeFiles`; added backend tests for hash bookkeeping and conflict handling.
- Populated `CodeFiles` during project updates so existing bindings stay registered before watcher work lands.
- Wired `watch_code_files()` through `SpecificFileWatcher` using the live `project_state_backend_getter_fn`, filtering callbacks by active project configs and covering the registration path with tests.
- Cached per-category binding mappings within `CodeFiles.watch_code_files()` so watcher callbacks can resolve section ownership, and ensured initial callbacks fire for newly tracked paths.
- Hooked `CodeFiles.watch_code_files()` up to `BaseProjectManager.reload_code_sections`, stubbing the reload coroutine and passing file hashes so upcoming reload logic can share a single read per event.
- Implemented `reload_code_sections()` with real disk reads, per-config state refresh, code cache updates, and frontend broadcasts; covered the happy path with `tests/project_state/test_code_file_binding_registration.py`.

## Backend architecture
- **Create a single global `CodeFiles` manager** (`backend/setta/project_state/code_files.py`) and inject it into every project manager (mirroring how `Artifacts` and `JSONSource` are shared):
  - Tracks per-path metadata (`last_read_hash`, `last_written_hash`, `has_conflict`, `access_mode`).
  - Maps canonical paths to `(sectionId, variantId, projectConfigId)` tuples so we know which sections need reloading; generated-code bindings reuse language-specific sentinels (e.g. `GEN_PYTHON_CODE_SECTION_ID`) instead of `None` so future multi-language outputs remain unambiguous.
  - Maintains callback-category maps like `JSONSource` (`backend/setta/project_state/jsonSource/jsonSource.py:65`) so each watcher group stays isolated.
  - Exposes helpers to record writes, detect no-op rewrites, and skip processing when the access mode forbids changes.
- **Centralize binding registration inside `CodeFiles`**:
  - Add a `sync_bindings(project_state: ProjectStateSingleConfig)` API that walks sections and the generated-code binding, normalizes canonical paths, and installs/upgrades `RegisteredCodeFileBinding` entries (with per-project-config ownership).
  - Call `code_files.sync_bindings()` from `BaseProjectManager.update()` immediately after `validate_code_file_bindings()` so watchers always operate on the latest metadata; delete the legacy `_register_code_file_bindings()` helper once parity is confirmed.
- **Integrate with `SpecificFileWatcher`** via a new `BaseProjectManager.watch_code_files()` hook, parallel to `watch_json_source_files()` and `watch_artifact_files()` (`backend/setta/project_state/base_project_manager.py:1215`).
  - Reproduce the JSON-source lifecycle: compute per-category path→section/variant maps, consult `_should_defer_json_source_reload()` style heuristics when autosave is pending, and keep `_deferred_json_source_loads` in sync (`backend/setta/project_state/base_project_manager.py:1219`).
  - Ensure `watch_code_files()` runs whenever `updateFileWatcher=True` during project updates so binding changes propagate to the watcher layer.
- **Implement `reload_code_sections()`** in `BaseProjectManager`:
  - Read file contents using `DBE.read`.
  - Compare hashes against `CodeFiles` metadata to avoid redundant reloads.
  - Update `ProjectStateBackend` in place with `set_effective_impl_value`, refresh `self.code_dict`, and broadcast the new state without re-registering watchers (to avoid loops).
  - Surface conflicts by scheduling notifications when external edits diverge from the last known snapshot.
  - Ensure file contents are only read once per watcher event (e.g., the watcher callback should pass both the bytes/string payload and the computed hash into `reload_code_sections()` so `should_reload` and the reload logic share the same read result).
  - **Follow-up discussion**: the pre-lock preparation (reading files, computing hashes, grouping bindings) now lives in `BaseProjectManager.reload_code_sections`; consider migrating that setup into `CodeFiles` so the watcher callback hands the manager a ready-to-apply reload plan.
- **Fill in `CodeFiles.watch_code_files()`** (`backend/setta/project_state/code_files.py:88`):
  - Gather bindings from `_bindings`, diff against `_category_to_paths`, and call `SpecificFileWatcher.update_callbacks` with fire-immediately paths for uncached files.
  - Build the watcher coroutine so it forwards `FileWatcherCoreUpdate` payloads into `reload_code_sections()` once that API is available, mirroring the JSON source callback signature.
- **Model callbacks on JSONSource**: `get_json_source_file_watcher_callback()` (`backend/setta/project_state/jsonSource/jsonSource.py:105`) demonstrates how to read via `DBE`, refresh cached state, and broadcast change notifications; use the same shape for code files.
- **Rewrite `Code.update_file()`** (`backend/setta/project_state/code.py:33`) to delegate writes to `CodeFiles`:
  - Skip writes entirely for read-only bindings.
  - Short-circuit when the code matches the last read hash to avoid needless churn.
  - Record `last_written_hash` so the next `modified` event can be ignored.
- **Adjust binding validation** (`backend/setta/types/project_state.py:224`):
  - Keep `validate_code_file_bindings()` focused on enriching the project state; defer registration to `CodeFiles.sync_bindings()`.
  - Trigger `CodeFiles.watch_code_files()` during every project-state update when `updateFileWatcher=True`.

## Access-mode enforcement
- **Set-code API guard**: In `BaseProjectManager.set_code()` (`backend/setta/project_state/base_project_manager.py:647`), reject edits for read-only bindings and log or notify the user. Allow writes for write-only/read-write, forwarding them to the manager so we can mark files dirty.
- **Watcher callback rules**:
  - Read-write & read-only bindings: load disk changes, update state, and broadcast the new content.
  - Write-only bindings: ignore external changes (or emit a notification), since those sections should only be mutated by Setta.
- **Conflict notifications**: When the on-disk content differs from `last_written_hash`, mark `has_conflict=True` and broadcast a notification (pattern after `Artifacts` conflict handling in `backend/setta/project_state/artifacts.py:320`).

## Frontend updates
- **Editor behavior** (`frontend/src/components/Section/Layouts/CodeArea.tsx:304`):
  - Read access mode from `CodeSectionImpl.codeFileBinding.access_mode`.
  - Disable editing and route calls for read-only sections; show a badge or tooltip clarifying the mode.
  - Stop dispatching `setCurrEffectiveSectionImplValue` and `route_set_code` when the editor is locked.
- **User feedback**: When the backend broadcasts a disk change, highlight the affected code section or show a toast so users understand why text shifted.

## Testing & documentation
- **Backend tests** (`tests/project_state/`):
  - Simulate file writes through `SpecificFileWatcher` to confirm read-write sections reload, write-only sections ignore, and read-only edits are blocked.
  - Validate hash bookkeeping: identical rewrites should not trigger reloads; `last_written_hash` prevents write loops.
- **Leverage existing fixtures**: `tests/utils/manager_fixture.py` provisions a real `SettingsProjectManager` with live watchers, and `tests/project_state/test_code_files.py` already builds `CodeFiles` against `SpecificFileWatcher`; extend these to assert callback registration without new mocks.
- **Developer docs**: Document the new manager, access-mode expectations, and manual override steps (e.g., how to transition a section from write-only to read/write).
