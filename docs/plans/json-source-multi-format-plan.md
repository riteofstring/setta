# JSON Source YAML/TOML Support Plan

This plan covers adding YAML and TOML support for jsonSource sections while
sticking to JSON-compatible data (dicts/lists/primitives only).

## Goals
- Allow jsonSource files to be `.json`, `.yaml`/`.yml`, or `.toml`.
- Enforce JSON-subset data (top-level object, JSON primitive types only).
- Keep autosave + share deployment behavior consistent across formats.

## Current Flow (notes)
- `JSONSource` reads files via `DBE.read_json` and feeds `process_json_object`
  (expects a dict) in `backend/setta/project_state/jsonSource/jsonSource.py`.
- Autosave writes via `save_json_source_data` -> `DBE.write_json`.
- Share deployments call `build_json_source_dicts` and `DBE.write_json` to emit
  jsonSource files into the deployment root.
- Frontend file language detection supports JSON/YAML but not TOML.

## Proposed Approach
- Add `DBE` helpers for YAML/TOML read/write, but keep JSON-source validation in
  a dedicated helper.
- Add structured read/write helpers with extension-based dispatch.
- Validate JSON-subset data after parsing YAML/TOML (reject non-JSON types or
  non-dict roots) and reject unknown or extensionless jsonSource files.
- Use helpers in all jsonSource read/write paths.
- Leave frontend rendering unchanged; jsonSource sections are rendered as normal
  dict sections, with only `jsonSourceMissing` affecting outline color.

## Implementation Steps
1. Add `DBE` YAML/TOML helpers in `backend/setta/database/db_objs.py`:
   - `read_yaml(path: Path) -> Any` / `write_yaml(path: Path, data: Any) -> None`.
   - `read_toml(path: Path) -> Any` / `write_toml(path: Path, data: Any) -> None`.
   - Use `dbe.read()`/`dbe.write()` for locking + atomic writes.
   - Reading: `yaml.safe_load` / `tomllib.loads`.
   - Writing: `yaml.safe_dump` / `tomli_w.dumps` (or `toml.dumps`).

2. Add a structured data helper module (e.g. `backend/setta/utils/structured_data.py`).
   - `SUPPORTED_JSON_SOURCE_EXTS = {".json", ".yaml", ".yml", ".toml"}`.
   - `read_json_source_payload(path: Path, dbe: DBE) -> dict`:
     - dispatch by suffix (case-insensitive):
       - `.json` -> `json.loads`
       - `.yaml`/`.yml` -> `dbe.read_yaml`
       - `.toml` -> `dbe.read_toml`
     - reject unknown or extensionless jsonSource files.
     - require a dict root; reject None, lists, or scalars.
     - validate JSON-subset types recursively (dict/list/str/int/float/bool/None).
   - `write_json_source_payload(path: Path, payload: dict, dbe: DBE) -> None`:
     - dispatch by suffix:
       - `.json` -> `json.dumps(..., indent=2, sort_keys=True)`
       - `.yaml`/`.yml` -> `dbe.write_yaml`
       - `.toml` -> `dbe.write_toml`
     - reject unknown or extensionless jsonSource files.
     - keep output deterministic (sorted keys) to minimize noisy diffs.
   - Add a TOML writer dependency (`tomli-w` or `toml`) in `pyproject.toml`.
     Reading can use stdlib `tomllib` (Python 3.12+).

3. Update jsonSource read paths to use the new reader:
   - `backend/setta/project_state/jsonSource/jsonSource.py`
     (`process_json_source_files`, file watcher callback).
   - `backend/setta/project_state/share_runtime_state.py` indirectly inherits
     this via `JSONSource.process_json_source_files`.

4. Update jsonSource write paths to use the new writer:
   - `backend/setta/project_state/jsonSource/save.py` (`save_json_source_data`).
   - `backend/setta/routers/share_deployments.py` when emitting snapshot jsonSource
     files into deployments.

5. Documentation updates:
   - Document supported jsonSource extensions and the JSON-subset rule.
   - Note that YAML/TOML files will be normalized on autosave (same as JSON).

## Tests
- New unit tests for YAML/TOML parsing:
  - valid JSON-subset YAML/TOML loads into jsonSource code objects.
  - non-JSON types (e.g., YAML timestamps, TOML datetime) raise errors.
  - top-level list/scalar is rejected.
- Share deployment test: YAML/TOML jsonSource files are emitted with correct
  extension and expected content.
- Existing JSON-source tests should remain unchanged and continue to pass.

## Open Questions
- Should YAML/TOML formatting be preserved, or is canonical reformatting OK?
