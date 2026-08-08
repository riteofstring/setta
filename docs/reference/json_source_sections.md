# JSON source sections

## Overview
- A JSON source section is a **Dict** section variant with `isJsonSource = true`.
- The **variant name** is treated as the file path to the JSON source file (normalized relative to the repo root when possible).
- `jsonSourceKeys` is an optional key path into that JSON object; it scopes which subtree becomes the section’s top-level parameters. An empty list means the root.

## `jsonSourceKeys` behavior
- `jsonSourceKeys` is a list of string keys (path parts) that must resolve to a **dict** in the JSON source payload.
- The path is treated as a **name-path prefix** during traversal/merge. That means code objects are matched by full name paths that include the prefix.
  - Changing `jsonSourceKeys` effectively changes every name path, so existing code objects for that section are replaced on the next load.
- Load-time validation:
  - If the file is missing, the path is missing, or the path resolves to a non-dict, the section is marked `jsonSourceMissing` and no merge happens.
- Update-time validation (when editing keys via the API/UI):
  - If the file exists, the backend checks that the path exists and resolves to a dict, otherwise it raises a `400` with a specific error.
  - If the file does not exist, the keys are accepted but the section will remain `jsonSourceMissing` until a valid file is present.
- Save-time behavior:
  - The path is created if it does not exist (`{}`), so missing paths are re-created on save.
  - The subtree at `jsonSourceKeys` must be a dict; if not, save raises `ValueError`.

Example:
```
jsonSourceKeys = ["features", "flags"]
```
The section’s top-level params are mapped to:
```
{
  "features": {
    "flags": { ...section params... }
  }
}
```

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

## Multiple sections pointing at the same file
### Distinct `jsonSourceKeys`
- Each section gets its **own** code objects; they are not shared, even if they come from the same file.
- Loads are independent: each section merges from the same file using its own `jsonSourceKeys` prefix.
- If one section changes its `jsonSourceKeys`, the other section’s code objects are unaffected.

### Overlapping coverage (root + nested, or shared paths)
On load:
- Overlapping paths still produce **separate** code-object trees per section.
- The loader only merges into **requested** section variants, but it **does** update `jsonSourceMissing` for every section that shares the same `(file, jsonSourceKeys)` pair.
  - Example: if the file goes missing, all sections that point to that same file+keys are marked missing, even if only one variant was in the load request.

On save:
- Each section contributes a `(jsonSourceKeys → subtree)` update.
- Updates are applied from **shortest path to longest path**, so more specific paths override parts of broader ones.
  - Root + nested example:
    - Root update: `[] → {"app": {"name": "Setta"}}`
    - Nested update: `["app"] → {"debug": false}`
    - Result: `{"app": {"debug": false}}`
- If two sections write the **same** `jsonSourceKeys`, the last-applied update wins (order follows section/variant iteration).
- If a deeper update would write into a non-dict value, save raises: `ValueError("JSON source path conflicts with a non-dict value.")`.

## Code references
- `backend/setta/project_state/jsonSource/jsonSource.py`
- `backend/setta/project_state/jsonSource/load.py`
- `backend/setta/project_state/jsonSource/save.py`
- `backend/setta/database/db_objs.py`
- `backend/setta/project_state/base_project_manager.py`
