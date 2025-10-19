# CodeFileSyncService Read-Only Update Findings

- `CodeFileSyncService.register_binding` and `refresh_binding` (backend/setta/project_state/code_file_sync.py:79-138) only exclude bindings whose access mode is `write_only`. Both `read_only` and `read_write` bindings pass through `_add_owner`, enter the `_registry`, and trigger `SpecificFileWatcher.request_read`.
- `_dispatch_update` and `_emit_event` (backend/setta/project_state/code_file_sync.py:146-201) dispatch filesystem events to every owner on the watched path without re-checking access mode, so read-only subscribers get the same `CodeFileSyncEvent` payloads as read/write subscribers.
- A manual fixture run that registers a read-only binding and writes to the canonical file produced a `CodeFileSyncEvent` with `event_type=modified`, confirming the service emits updates for read-only bindings.
- Added regression coverage in `tests/project_state/test_code_file_sync.py::CodeFileSyncIntegrationTests.test_external_edit_updates_read_only_section_code`, which binds a section as read-only under the canonical `setta_files/code/sections` tree and asserts the section code updates after an external edit.
- On one run where the canonical file lived outside the generated `setta_files` hierarchy (e.g., directly under the repo root) the existing `SpecificFileWatcher` surfaced macOS fsevents errors (“Cannot start fsevents stream” / “Cannot add watch … already scheduled”). The binding stayed in `_registry`, but no callbacks fired, so the read-only section never received updates. We are keeping `SpecificFileWatcher` in place and should continue investigating upstream (likely in the project-state logic that processes watcher registrations) rather than swapping to a different observer.

### Recommendations

1. Instrument `_sync_code_file_bindings_for_project_state` to verify the read-only section actually gets registered (look for its owner id in `code_file_sync._registry`).
2. Add logging inside `_handle_code_file_sync_event` to confirm the callback runs and that no guard (`variant` mismatch, `event.content is None`, or unchanged code) suppresses the update.
3. If the backend updates correctly, inspect the frontend store to ensure it accepts broadcasts when `codeFileBinding.access_mode === "read_only"`.
4. If the watcher logs those fsevents errors again, capture the surrounding project-state context so we can track down why the existing `SpecificFileWatcher` path isn’t successfully registering callbacks for that binding.
