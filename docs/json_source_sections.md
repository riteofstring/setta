# JSON source sections

## Overview
- A JSON source section is a **Dict** section variant with `isJsonSource = true`.
- The **variant name** is treated as the file path to the JSON source file (normalized relative to the repo root when possible).
- `jsonSourceKeys` is an optional key path into that JSON object; it scopes which subtree becomes the section’s top-level parameters. An empty list means the root.

## Load flow (file → params)
1. The JSON source watcher discovers all `isJsonSource` variants and watches their file paths.
2. On a file change, the backend reads the file via `DBE.read_json` (JSON only).
3. `JSONSource.process_json_object` converts the JSON object to code objects:
   - **dict** → `NestedParam` code objects.
   - **non-dict** (strings, numbers, lists, bools, null) → `CodeParam` with `value=json.dumps(value)`.
4. `load_json_sources_into_data_structures` merges the processed tree into the project state by **name path**:
   - Reuses existing code objects when name paths match.
   - Updates children/value fields.
   - Deletes code objects that no longer exist in the file.
   - Sets `topLevelParamId` to the object at `jsonSourceKeys` and updates `codeObjVariantMap`.
   - Marks `jsonSourceMissing` if the file is absent (no merge happens in that case).

## Save flow (params → file)
- Autosave calls `save_json_source_data` before writing `project.json`:
  - `traverse_hierarchy(..., build_nested_dict=True)` rebuilds a nested dict and uses `try_json` to turn JSON-encoded strings back into proper JSON types.
  - `jsonSourceKeys` is ensured to exist even if empty.
  - `DBE.write_json` writes the file (indent=2, sort_keys=True).
- `remove_json_source_values` clears the in-project values so JSON sources remain the canonical storage for those values.

## Formats: JSON vs YAML/TOML
- **JSON is the only supported storage format** for JSON source files. The backend uses `json.loads`/`json.dumps`.
- **YAML** only appears in UI display mode (`SectionWithParamsDisplayMode.Yaml`) and readable exports; it is **not** used for JSON source loading/saving.
- **TOML** is not parsed in the JSON source flow.
- Pointing a JSON source at a `.yaml` or `.toml` file will fail to parse as JSON.

## Notes / gotchas
- The JSON source file must be an **object** at the root. Arrays are treated as leaf values, not nested params.
- Removing the `jsonSourceKeys` path from the file can break reloads; saves will re-create the path as an empty object.

## Code references
- `backend/setta/project_state/jsonSource/jsonSource.py`
- `backend/setta/project_state/jsonSource/load.py`
- `backend/setta/project_state/jsonSource/save.py`
- `backend/setta/database/db_objs.py`
- `backend/setta/project_state/base_project_manager.py`
