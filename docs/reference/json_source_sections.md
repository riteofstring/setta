# JSON source sections

## Overview
- A JSON source section is a **Dict** section variant with `isJsonSource = true`.
- The **variant name** is treated as the file path to the JSON source file (normalized relative to the repo root when possible).
- `jsonSourceKeys` is an optional key path into that JSON object; it scopes which subtree becomes the section’s top-level parameters. An empty list means the root.

## `jsonSourceKeys` behavior
- `jsonSourceKeys` is a list of string keys (path parts) that must resolve to a **dict** in the JSON source payload.
- The path is treated as a **name-path prefix** during traversal/merge. That means code objects are matched by full name paths that include the prefix.
  - Changing `jsonSourceKeys` effectively changes every name path, so code objects for that section are recreated on the next load.
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
2. On a file change, the Go runtime reads the file through
   `readOrderedJSONSourceObject`, which supports `.json`, `.yaml` / `.yml`, and
   `.toml` source files.
3. The JSON-source loader converts the structured object to code objects:
   - **dict** → `NestedParam` code objects.
   - **non-dict** (strings, numbers, lists, bools, null) → `CodeParam` with `value=json.dumps(value)`.
4. `LoadAllJSONSourceVariantsFromDisk` / `ReloadJSONSourceBindingsFromDisk`
   merge the processed tree into the project state by **name path**:
   - Reuses existing code objects when name paths match.
   - Updates children/value fields.
   - Deletes code objects that do not exist in the file.
   - Sets `topLevelParamId` to the object at `jsonSourceKeys` and updates `codeObjVariantMap`.
   - Marks `jsonSourceMissing` if the file is absent (no merge happens in that case).

## Save flow (params → file)
- The app save/autosave path calls `SaveJSONSourceFiles` before persisting `project.json`:
  - It rebuilds a nested object tree from the section params and converts stored
    leaf values back into structured data.
  - `jsonSourceKeys` is ensured to exist even if empty.
  - The file is written back using the source file's extension-specific encoder
    (`.json`, `.yaml` / `.yml`, or `.toml`).
- `ClearJSONSourceValuesForPersistence` clears the in-project values so the
  source file remains the canonical on-disk store for those values.

## Formats: JSON, YAML, and TOML
- JSON source files can use `.json`, `.yaml` / `.yml`, or `.toml`.
- The root payload must be an **object** for every supported format.
- Leaf values must remain JSON-compatible (`string`, number, bool, null,
  arrays, and nested objects with string keys).
- YAML/TOML-only value shapes outside that JSON-compatible set are rejected by
  the validation/load path.
- Save keeps the file extension and writes the same structured format back out.
- Unsupported extensions fail validation/load.

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
- Overlapping paths produce **separate** code-object trees per section.
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
- `internal/projectstate/json_source_load.go`
- `internal/projectstate/json_source_save.go`
- `internal/projectstate/json_source_keys_validation.go`
- `internal/projectstate/json_source_watch.go`
- `internal/jsonsourcewatch/service.go`
