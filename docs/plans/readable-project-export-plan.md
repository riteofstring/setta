# Readable Project Export Plan

## Goal
Provide a YAML export of a Setta project that is easy to diff:
- semantic only (no layout/UI state)
- active variants only
- no UUIDs in the output
- file references for heavy/asset-backed sections

## Non-goals (for v1)
- Importing from readable YAML
- TOML/JSON export
- Multi-file export
- Backward compatibility guarantees

## Current state
- CLI `setta export-db` is wired but unimplemented (`backend/setta/start.py`).
- Project data lives in `setta_files/project.json` via `DBE`.
- Helpers exist for name paths and nested param dicts:
  - `get_section_path_full_name` (`backend/setta/types/helpers_lvl2.py`)
  - `traverse_hierarchy` (`backend/setta/types/hierarchy_traversal.py`)
- JSON source sections already serialize to external files in save flow
  (`backend/setta/project_state/jsonSource/save.py`).

## Proposed output shape (draft)
```yaml
version: 1
project:
  defaultConfig: "<project name>"
configs:
  - name: "<project name>"
    entrySection: "<section path>"   # if set
    sections:
      - path: "<section path>"
        type: "Callable"
        variant: "<variant name>"
        callable: "<callable name>"  # Callable sections only
        params:                      # omitted for json-source sections
          foo: 1
          bar:
            baz: true
        files:                       # only for file-backed types
          code: "code/sections/.../my_section.py"
          jsonSource: "data/config.json"
          image: "artifacts/..."
          chartData: "artifacts/..."
          drawAssets:
            - "artifacts/..."
        children:
          - "<child section path>"
      - path: "<section path>"
        type: "TextBlock"
        variant: "<variant name>"
        text: "..."
        format: "Markdown"
    edges:
      - from: "<section path>.out.<port_accessor>"
        to: "<section path>.param.<param_path>"
```

## Section handling (semantic-only)
- **Callable/Dict/Group/ListRoot/MetaControl/GlobalVariables**: include `params`
  (from `traverse_hierarchy` + `try_json`).
- **Dict with `isJsonSource=True`**: omit `params`, include
  `files.jsonSource` (from `variant.name`) and `jsonSourceKeys`.
- **Code / GenPythonCode / GenPythonMetadata**: omit inline `code`, include
  `files.code` from `codeFileBinding.canonical_path`.
- **Image**: include `files.image` (from `imagePath`).
- **Chart**: include `files.chartData` (from `dataPath`).
- **Draw**: include `files.drawAssets` (from layer element `dataPath`) and
  `files.drawRender` (from `renderedImagePath` if present).
- **TextBlock**: include `text` and `format` (kept semantic).
- **Chat**: include `files.chat` derived from `chatId` if present
  (`setta_files/chats/<id>.json`).
- **Browser/Social/IFrame/Terminal**: include only their semantic fields
  (`folder`, `url`, etc.), no layout.

## Path and name strategy (no UUIDs)
- **Section paths**: use `get_section_path_full_name` to produce stable
  fully-qualified paths (uses list indices for ListRoot sections).
- **Assumption**: duplicate section names are not supported, so no
  disambiguation is required.
- **Param paths**: use `traverse_hierarchy` with `build_id_to_name_path=True`
  to map `param_id -> name_path`. Join with `.` for edge targets and emit
  nested YAML dicts for `params`.

## Edge serialization (active variants only)
- Include edges where `edge.sourceVariantId` and `edge.targetVariantId` match
  the active variants in `projectConfig.sectionVariantMap`.
- `from`: `<source section path>.out.<edgeOutputPorts.accessor>`
- `to`: `<target section path>.param.<param_name_path>`

## Implementation plan
1. **Define exporter module**
   - New module, e.g. `backend/setta/project_state/readable_export.py`.
   - Accept `ProjectStateBackend` and export all configs.
   - Return a Python dict ready for YAML dumping.
2. **Build section/param name maps**
   - For each config, build `ProjectStateSingleConfig` via
     `convert_backend_to_single_config`.
   - Compute `section_path_map` and `param_name_path_map`.
   - Apply name disambiguation where needed.
3. **Assemble semantic sections**
   - Use active variant IDs from `sectionVariantMap`.
   - `get_curr_effective_section_impl` for section-specific data.
   - `traverse_hierarchy(..., build_nested_dict=True)` for `params`.
4. **Serialize edges**
   - Filter for active variant edges.
   - Use `edgeOutputPorts` and param name paths for readable endpoints.
5. **YAML output**
   - Use `yaml.safe_dump(..., sort_keys=False)` to preserve ordering.
   - Default output path: `setta_files/project.readable.yaml`
     (with optional `--output` override).
6. **Wire CLI**
   - Implement `export_db` in `backend/setta/start.py` to read `DBE`,
     call exporter, and write YAML.
7. **(Optional) Autosave hook**
   - If `exportDbReadableOnSave` or `exportDbReadableWithVariantsOnSave` is set,
     trigger export after `_save_project_state`.

## Tests
- Unit tests under `tests/` that build a small project state and assert:
  - no UUID-like values appear in YAML
  - code sections export file references only
  - json source sections omit params and include file reference
  - edges resolve to section/param paths

## Open questions
- None for v1.
