# Section Codegen Inclusion + Metadata

## Goals
- Avoid bloating generated Python code for large or low-value section types (e.g., Chat).
- Make codegen inclusion configurable by section type and section id.
- Support multiple representation modes (json/file/base64) where appropriate.
- Provide access to project/section metadata in generated code when enabled.
- Preserve listener workflows that depend on the generated `state` object.

## Current state
- Dependency graph exports a fixed set of section types, including Chat, and codegen
  emits `state.<section>` assignments.
- There is no project-level or per-section codegen inclusion policy.
- Metadata such as section variant names is not available in generated code.
- FileRead dependency values exist but are used in packaged runtime only; listeners
  currently run in live runtime and do not auto-read files.
- Chat action events are already emitted from the frontend and exposed in the chat toolkit.

## Decisions

### 1) Codegen inclusion policy lives on the Python codegen target
- Extend `ProjectCodegenPythonTarget` with:
  - `generateMetadata: bool = False`
  - `sectionPolicy: SectionCodegenPolicy`
- No new endpoint: reuse `set_project_config_codegen_targets`.

### 2) Generalized representation policy
- Keep both `SectionRepresentationMode` (policy intent) and `DependencyValueType` (encoding).
- Policy structure:
  - `SectionCodegenMode`: `inherit | include | exclude`
  - `SectionRepresentationMode`: `json | file | base64`
  - `SectionTypeCodegenPolicy`: `{ mode, representation }`
  - `SectionCodegenOverride` (per section id): `{ mode, representation }`
  - `SectionCodegenPolicy`: `{ allowlist?, exclude, typePolicies, sectionOverrides }`
- Default allowlist = current exported section types except Chat.
- Default type policies:
  - Chat: `representation=file`
  - Draw: `representation=base64`
  - All others: `representation=json`

### 3) Dependency graph keeps nodes, codegen skips excluded nodes
- Always build the dependency graph for supported section types to preserve listener
  dependencies and action events.
- Add an `include_in_codegen` flag on section nodes; `PythonCodeGenerator` skips nodes
  where `include_in_codegen` is false.
- Per-section policy only affects emitted code, not dependency names.

### 4) Chat file mode constraints
- No per-section chat files.
- If `chatId` exists (managed chat), `file` mode uses `setta_files/chats/<chatId>.json`.
- If `chatId` is missing (scriptable chat), `file` mode falls back to `json`.
- Listener runtime remains live mode; `FileReadDependencyValue` yields path strings.

### 5) Metadata output and wiring
- Metadata is opt-in via `generateMetadata`.
- Emit `state.__state__` only when enabled; no `state.meta` alias.
- Generate typed `setta_gen_meta.py` with:
  - `project` namespace (id, name, activeViewModeId, entryCodeBlockId, etc.)
  - `sections` namespace keyed by `full_path_name` (same names as codegen)
  - `sections_by_id` for stable lookup
- Metadata is a snapshot; no dependency-triggered updates.

### 6) Generated meta file loading behavior
- `PythonValueMode.PACKAGED_RUNTIME`: `setta_gen.py` uses `from . import setta_gen_meta`.
- `PythonValueMode.LIVE_RUNTIME`: listeners use `exec` to load metadata (no import).
- No fallback import paths.

### 7) Share mode run behavior (metadata enabled)
- Always run Python with `-m` for consistency.
- Write `setta_gen_meta.py` into share snapshot folders alongside `setta_gen.py`.
- Use `PYTHONPATH=<snapshot_root>` and module path `_<timestamp>.setta_gen` for share runs.

## Open questions (remaining)
- Behavior when a representation mode is chosen that a section type does not support
  (raise vs ignore vs fallback).
