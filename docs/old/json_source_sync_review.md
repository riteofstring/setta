# JSON Source Sync Review

## Loading From Disk
- `BaseProjectManager.watch_json_source_files` registers every `isJsonSource` variant with the shared `JSONSource` watcher so updates can be pushed without waiting for a manual reload (`backend/setta/project_state/base_project_manager.py:1144`).
- When a watched file changes or is first added, the watcher callback parses the JSON and caches a structured snapshot; it immediately invokes the backend loader and broadcasts a toast so the UI knows the file changed (`backend/setta/project_state/jsonSource/jsonSource.py:123-148`).
- `load_json_sources_into_data_structures` locates every section+variant pair that points at the touched file, flips the `jsonSourceMissing` flag when the file cannot be read, and otherwise reconciles the section graph with the JSON tree (`backend/setta/project_state/jsonSource/load.py:86-168`).
- Reconciliation covers the full diff surface:
  - `compute_existing_replacement_mapping` aligns new keys/values with existing code objects, marks mismatched nodes for deletion, and stages additions for anything that only exists on disk (`backend/setta/project_state/jsonSource/load.py:245-316`).
  - `merge_into_existing` reuses existing cores where possible, creates variants for updated impls, and repoints the section’s `codeObjVariantMap` to match the JSON hierarchy the loader produced (`backend/setta/project_state/jsonSource/load.py:169-242`).
- The JSON parser constructs code objects using the disk data as source of truth; leaf values are stored as `json.dumps(value)` so later saves can recover the original types (`backend/setta/project_state/jsonSource/jsonSource.py:190-236`).
- After merging, the backend converts each affected configuration to the single-config representation and broadcasts it, keeping the frontend in sync with the file system (`backend/setta/project_state/base_project_manager.py:380-391`).

## Saving Back to Disk
- `save_json_source_data` traverses the in-memory hierarchy for every JSON-source-backed variant, converts the stringified leaf values back to their JSON types, and writes the merged result to the underlying files (`backend/setta/project_state/jsonSource/save.py:21-64`, `backend/setta/types/hierarchy_traversal.py:84-153`).
- Empty sections still ensure their `jsonSourceKeys` path exists on disk via `add_key_path_to_dict`, preventing accidental path removal (`backend/setta/project_state/jsonSource/save.py:58-73`).
- The project managers call `save_json_source_data` before persisting any project or settings configuration, guaranteeing that edits made in the UI are reflected in the JSON sources on disk (`backend/setta/project_state/project_manager.py:22-33`, `backend/setta/project_state/settings_project_manager.py:34-41`).

## Preventing Duplicate Storage
- Immediately after writing JSON files, both project managers invoke `remove_json_source_values`, which clears the stored childless values out of the in-memory project state before serialization. This keeps the Pydantic project config free of data that already lives in the external JSON file (`backend/setta/project_state/jsonSource/save.py:76-95`, `backend/setta/project_state/project_manager.py:22-33`, `backend/setta/project_state/settings_project_manager.py:34-41`).
- The cleanup step only touches childless (value-holding) code objects, so nested structures remain intact while ensuring scalar values persist solely in the JSON source.

## Frontend Notes
- JSON-backed sections rely on the websocket broadcast above; the UI trusts the backend to send the updated project state rather than persisting section values locally. The editor uses the `jsonSourceMissing` flag to highlight missing files, matching the backend behavior (`frontend/src/components/Section/Container/utils.tsx:38-44`).
- `InputAreaSettings` still includes a call to `loadJsonContents` that is no longer imported in the current tree, so manual refreshes of a JSON mapping may fail in this component. The automatic watcher flow described above continues to keep sections in sync, but this helper likely needs a modern replacement if the manual reload UI is still expected to work (`frontend/src/components/Panes/UiEditor/SectionConfig/InputAreaSettings.tsx:21-33`).

## Conclusion
The reviewed code path matches the intended model: JSON-source sections treat the disk file as the single source of truth, refresh their structure and values whenever the file changes, and write edits back out before stripping scalar values from the serialized project config. The only discrepancy spotted is the stale `loadJsonContents` helper reference on the frontend, which appears unrelated to the core watcher-based syncing but may impact manual reload tooling.
