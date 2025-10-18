# JSON Source Persistence Review

## Summary
- The current save path treats the JSON file as the durable store for jsonSource sections and blanks the in-memory values before writing the Pydantic project models, matching the intended contract.
- The load/sync path rebuilds code objects from disk on every watcher-triggered refresh, adding or deleting entries so section structure always mirrors the JSON file.
- File watcher wiring keeps the cache and UI in sync after back-end or external edits, while autosave ensures frontend edits are flushed to disk.

## Save Path Findings
- Both project managers copy the project state, write jsonSource data to disk, then strip the inline values before persisting the project config (`backend/setta/project_state/project_manager.py:24`–`backend/setta/project_state/project_manager.py:33`, `backend/setta/project_state/settings_project_manager.py:34`–`backend/setta/project_state/settings_project_manager.py:41`).
- `save_json_source_data` walks each jsonSource section, reconstructs a nested dict from the current code objects, and writes it to the appropriate JSON file (`backend/setta/project_state/jsonSource/save.py:21`–`backend/setta/project_state/jsonSource/save.py:64`).
- `remove_json_source_values` then rewrites every jsonSource `BaseChildlessCodeObjImpl` value to an empty string so the serialized project config never captures data that lives in the JSON file (`backend/setta/project_state/jsonSource/save.py:76`–`backend/setta/project_state/jsonSource/save.py:95`).
- Frontend edits enqueue history entries, which trigger the autosave debouncer and ultimately call `save()` (`backend/setta/project_state/base_project_manager.py:1147`–`backend/setta/project_state/base_project_manager.py:1189`), guaranteeing UI changes propagate to disk.

## Load & Sync Findings
- When a manager spins up, `watch_json_source_files` registers every jsonSource section, backfills missing cache entries from disk via `_refresh_and_load_json_sources`, and kicks off a load for newly observed section/variant pairs (`backend/setta/project_state/jsonSource/jsonSource.py:86`–`backend/setta/project_state/jsonSource/jsonSource.py:168`).
- `load_json_sources_into_data_structures` compares each section’s existing code objects with the freshly parsed JSON, marks type mismatches for deletion, and records replacements for matching nodes (`backend/setta/project_state/jsonSource/load.py:86`–`backend/setta/project_state/jsonSource/load.py:166`).
- `compute_existing_replacement_mapping` identifies stale code objects that should be dropped whenever the JSON file no longer contains the associated key path, while building up the replacements/unmatched sets for new keys (`backend/setta/project_state/jsonSource/load.py:245`–`backend/setta/project_state/jsonSource/load.py:316`).
- `merge_into_existing` applies those replacements, creates variants for new keys, and updates the section’s `codeObjVariantMap` so the in-memory hierarchy mirrors the JSON payload (`backend/setta/project_state/jsonSource/load.py:169`–`backend/setta/project_state/jsonSource/load.py:239`).

## Runtime Synchronization
- Active file watcher callbacks read the current file contents, rebuild the processed JSON cache, and reload only the affected sections before broadcasting notifications (`backend/setta/project_state/jsonSource/jsonSource.py:169`–`backend/setta/project_state/jsonSource/jsonSource.py:208`).
- Settings-specific loads chain into `SettingsFile.load_and_broadcast_settings`, so the websocket payload that reaches the frontend always reflects the disk-backed jsonSource data (`backend/setta/project_state/settings_project_manager.py:49`–`backend/setta/project_state/settings_project_manager.py:59`).

## Conclusion
- The implementation aligns with the documented expectations: jsonSource values are persisted exclusively in their JSON files, the project models avoid storing duplicate data, and both load-time and watcher-driven merges guarantee the section structure stays consistent with what is on disk. No gaps surfaced that conflict with the structural refactor plan.
