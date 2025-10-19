# Code File Access Modes: Implementation Plan

## Goals
- Upgrade code sections to support read/write, write-only, and read-only modes.
- Mirror the architecture used by JSON sources and artifacts so file watching, conflict handling, and broadcasts stay consistent.
- Prevent write loops and unexpected overwrites when the filesystem changes behind Setta.

## Backend architecture
- **Create a `CodeFiles` manager** (`backend/setta/project_state/code_files.py`) that:
  - Tracks per-path metadata (`last_read_hash`, `last_written_hash`, `has_conflict`, `access_mode`).
  - Maps canonical paths to `(sectionId, variantId, projectConfigId)` tuples so we know which sections need reloading.
  - Maintains callback-category maps like `JSONSource` (`backend/setta/project_state/jsonSource/jsonSource.py:65`) so each watcher group stays isolated.
  - Exposes helpers to record writes, detect no-op rewrites, and skip processing when the access mode forbids changes.
- **Integrate with `SpecificFileWatcher`** via a new `BaseProjectManager.watch_code_files()` hook, parallel to `watch_json_source_files()` and `watch_artifact_files()` (`backend/setta/project_state/base_project_manager.py:1215`).
- **Implement `reload_code_sections()`** in `BaseProjectManager`:
  - Read file contents using `DBE.read`.
  - Compare hashes against `CodeFiles` metadata to avoid redundant reloads.
  - Update `ProjectStateBackend` in place with `set_effective_impl_value`, refresh `self.code_dict`, and broadcast the new state without re-registering watchers (to avoid loops).
  - Surface conflicts by scheduling notifications when external edits diverge from the last known snapshot.
- **Rewrite `Code.update_file()`** (`backend/setta/project_state/code.py:33`) to delegate writes to `CodeFiles`:
  - Skip writes entirely for read-only bindings.
  - Short-circuit when the code matches the last read hash to avoid needless churn.
  - Record `last_written_hash` so the next `modified` event can be ignored.
- **Adjust binding validation** (`backend/setta/types/project_state.py:224`):
  - Have `validate_code_file_bindings()` supply the manager with binding metadata (canonical path, snapshot dir, access mode).
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
- **Developer docs**: Document the new manager, access-mode expectations, and manual override steps (e.g., how to transition a section from write-only to read/write).
