# Meta Controls + Listener Integration Plan

## Goal
Make meta controls drive arbitrary UI behavior by routing their value changes through the listener system, while persisting control values in project state.

## Note
Existing branch implementations are provisional; do not preserve them during the refactor.

## Current State
- Meta controls persist `metaControlValue` in project state and emit realtime dependency updates.
- Listener realtime deltas support only section/param dependency keys.
- Listener emits can only update section params and TextBlock sections today.
- Dependency graph includes MetaControl sections; backend codegen still lacks meta control value encoding.

## Plan (Minimal Integration, Listener-First)
### 1) Persist meta control values in project state (done)
- Add a `metaControlValue` field to `MetaControlSectionImpl` (string).
- Store raw strings in state (no Python quoting).
- Ensure it is persisted in project state, included in snapshots, and broadcast like other section impl fields.

### 2) Export meta controls as dependencies (done)
- Update `DependencyGraph` to include `SectionType.MetaControl`.
- Export a `SectionNode` with a literal value sourced from `metaControlValue`.
- This enables listener deps like `@listener.listen(deps=["my_meta_control"])`.

### 3) Realtime UI change path for meta controls (done)
- Add a frontend helper similar to `sendRealtimeSectionParamLiteral` that emits a `SectionDependencyKey` + `LiteralDependencyValue` for MetaControl sections.
- Update the meta control UI components to:
  - Read `metaControlValue` from project state.
  - Write back to project state with debounced optimistic updates.
  - Emit realtime dependency updates so listeners fire.
- Add a backend route that persists meta control values to project state.

### 4) Encode meta control values server-side (done)
- Add a value encoding path in the backend code generator for `SectionType.MetaControl`.
- Use `metaControlType` to decide how to interpret raw strings:
  - slider/rotary: number
  - switch: boolean
  - textInput/textArea/password/dropdown/color/button: string
- This mirrors the param encoding model where the frontend stays string-only.

### 5) Listener-side behavior
- Listener callbacks receive meta control values via the generated `s.<name>` dependency as a string (same as other literal deps).
- Listeners use `emit_to_frontend` for downstream changes (params, TextBlock, artifacts).

## Optional Extensions (Next Iterations)
### A) Allow listeners to update meta controls
- Extend `apply_listener_dependency_updates` to accept `SectionType.MetaControl`.
- Add a helper (similar to `set_text_block_text`) to update `metaControlValue` in state.
- Enables listener-driven resets/toggles of meta controls.

### B) Add control-specific config schema
- Create a `MetaControlConfig` union keyed by `metaControlType`, e.g.:
  - Slider: min, max, step, curve/exponent.
  - Dropdown: choices (label/value).
  - Button: label, icon.
  - Switch: on/off labels.
  - Dropzone: accept filters, payload mode.
- Store config in `MetaControlSectionImpl` so UI is data-driven.

### C) Support typed router endpoint calls (no string ops)
- Provide a typed listener API generated from router endpoints (autocompletion + minimal validation).
- Generate a listener-facing `RouterEndpointAPI` wrapper from FastAPI routes.
- Use an allowlist so only safe endpoints are exposed to listeners.
- Prefer project-config–scoped endpoints and auto-inject `projectConfigId` where required.
- Define a stable call/result envelope with `callId`, `ok`, `result`, `error`.
- Keep `emit_to_frontend` as the helper for dependency/artifact updates.

## Encoding Decision (Aligned With Param Model)
- Store raw strings in project state.
- Backend codegen interprets the string based on `metaControlType`.
- This keeps the frontend language-agnostic and allows future non-Python codegen.

### Example mapping (initial)
- textInput/textArea/password/dropdown/color/button → string literal
- slider/rotary → numeric literal
- switch → boolean literal
