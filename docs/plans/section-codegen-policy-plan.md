# Section Codegen Inclusion + Metadata (Looking Ahead)

## Goals
- Avoid bloating generated Python code for large or low-value section types (e.g., Chat).
- Make codegen inclusion configurable by section type and optionally by section id.
- Support multiple representation modes for sections that can be large (e.g., Chat as JSON vs file read).
- Provide access to project/section metadata (variant names, ids, types) in generated code.
- Preserve listener workflows that depend on the generated `state` object.

## Current state
- Dependency graph exports a fixed set of section types, including Chat, and codegen
  emits `state.<section>` assignments.
- There is no project-level or per-section codegen inclusion policy.
- Metadata such as section variant names is not available in generated code.
- FileRead dependency values exist but are used in packaged runtime only; listeners
  currently run in live runtime and do not auto-read files.

## Proposal

### 1) Codegen inclusion policy
- Add a project-level setting to define which section types are included in codegen.
  - Example: `codegenSectionTypes` (allowlist) and/or `codegenSectionTypesExcluded`.
  - Default: include the current minimal set, exclude Chat by default.
- Add optional per-section override flags.
  - Example: `codegenMode: "inherit" | "include" | "exclude"`.
  - Optional per-section representation override (see Chat modes below).
- The dependency graph should respect the policy when exporting sections to `state`.

### 2) Chat representation modes (when included)
If Chat is included by policy, allow two representations:
- `json`:
  - Export `ChatSectionState` as a JSON literal (`LiteralDependencyValue`).
  - Pros: easy to use in listeners and code sections; no IO.
  - Cons: can bloat `setta_gen.py` for long histories.
- `file`:
  - Export a file reference (`FileReadDependencyValue`) to a canonical chat JSON file.
  - Pros: keeps generated code small.
  - Cons: in live runtime, the listener currently sees the path string, not file contents.

Notes for `file` mode:
- Decide a canonical chat JSON path (e.g., `setta_files/chats/<projectConfigId>/<sectionId>.json`
  or reuse the existing chat store).
- If listeners should read file contents automatically, add a listener-runtime value mode
  that uses `read_file_value(...)` helpers (mirroring packaged runtime behavior).

### 3) Metadata access in generated code
Expose a lightweight metadata surface in `state` without bloating section values:
- Add `state.meta` (or `state.__setta__`) with:
  - `sections_by_id` entries: `id`, `name`, `type`, `variantId`, `variantName`,
    parent/child relationships, and optional display name.
  - `variants_by_section_id` or a global `variants` map.
- Keep metadata export separate from section value export so users can opt-in
  even if they exclude section values from codegen.

### 4) Listener compatibility + action events
- Listeners still use `state` for constructed objects and dependency resolution.
- For Chat, prefer action events for "send" activity:
  - Emit an action event on send (payload includes section id + message details).
  - Listeners can subscribe via `event_types=[DependencyEventType.ACTION]` and
    section dependencies without needing chat in codegen.
- Dependency graph remains the primary source for:
  - `ctx.values`/`ctx.changed` resolution.
  - Listener coverage snapshots.
  - `emit_to_frontend` dependency translation.

## Open questions
- Where should the inclusion policy live (project config vs settings vs section impl)?
- Should per-section overrides be per-variant as well?
- If Chat is in `file` mode, should the listener runtime read files automatically?
- What metadata is required for experiment tracking (variant name vs id vs both)?
- Should metadata updates trigger listener callbacks (as dependencies), or be static?
