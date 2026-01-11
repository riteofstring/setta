# Edge Inputs + Outputs Plan

## Goals

- Add an explicit, non-resizable edges strip for input/output ports without changing pinned params.
- Let users convert any param (including nested) into an input edge.
- Support multiple output ports configured manually via accessor strings.
- Keep everything expressed as Python expressions (`state.<path><accessor>`) so LSP type inference still drives UX.
- Keep the ports UI compatible with React Flow wiring (edges are tracked elsewhere, but ports must be stable).

## UX Summary

- The edges strip lives above pinned and normal params.
- It renders only when at least one input edge or output edge is configured.
- Left column: input edges (params flagged as edges).
- Right column: output edges (accessors configured in the section config pane).
- Edge params are hidden from the normal param list.
- Pinned params remain unchanged and keep their existing resizable behavior.

## Output Accessor Rules

- The output editor shows accessor-only lines, one per output.
- Each line is appended to `state.<section_path>` when generating the edge expression.
- Examples: `.image`, `.meta.width`, `[0]`, `["key"]`.
- Empty lines are ignored; if we want a base output, we store an empty accessor
  (display it as "value" in the edges strip).

## Data Model Changes

Add to `BaseSectionWithParamsImpl` in `backend/setta/types/section_impls.py`:

- `edgeInputParams: list[ID] = []`
- `edgeOutputAccessors: list[str] = []`

Update copy/remap logic so edge params survive copy/paste:

- `backend/setta/types/helpers_lvl3.py` `update_section_impl_details(...)` should remap
  `edgeInputParams` the same way it remaps `pinnedParams` and `selectedParams`.

Regenerate types after backend changes:

- `source activate.sh && cd frontend && pnpm generate`

## Backend Endpoints

Add simple "set list" endpoints (avoid toggle-only state on the server):

- `SetSectionEdgeInputsRequest` with `edgeInputParams: list[ID]`
- `SetSectionEdgeOutputsRequest` with `edgeOutputAccessors: list[str]`

Wire in:

- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/routes.py`
- `backend/setta/routers/project_manager.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/helpers_lvl2.py`

Helper behavior:

- `set_section_edge_inputs(...)` should overwrite the list (after de-duping).
- `set_section_edge_outputs(...)` should normalize lines (trim, drop blanks unless empty string
  is explicitly allowed for base output).

## Output Accessor Completions (LSP)

Add a dedicated completion endpoint so the editor can stay accessor-only:

- Request: `OutputAccessorCompletionRequest(projectConfigId, sectionId, fullText, position)`
- Response: `list[CodeMirrorCompletion]` (same as `textFieldCompletion`).

Implementation idea:

1. Use the existing `DependencyGraph` to resolve the section path for `sectionId`.
2. Build a temporary snippet:
   - `from .setta_gen import state`
   - `state.<section_path>{fullText}`
3. Map cursor position to the snippet and call the LSP completion request.

This keeps completions aligned with the section return type without requiring users
to type `state.<path>` in the UI.

## Frontend Changes

### Layout

- Add a new `EdgesContainer` rendered above pinned params in
  `frontend/src/components/Params/GroupContainer.tsx`.
- The strip is not resizable and auto-sizes to content.
- It is hidden when `edgeInputParams` and `edgeOutputAccessors` are both empty.
- Filter out `edgeInputParams` from the normal param list before calling
  `GetParamSwitch(...)`.

### Input Edges UI

- Add a "Convert to Edge" action in `frontend/src/components/Section/SectionParts/KwargsControls.tsx`.
  - Use `selectedParams` to build the new edge input list.
  - Send the full list through `route_set_section_edge_inputs`.
- Allow per-param toggles in the section config pane for fine-grained control.

### Output Edges UI

- Add an "Edges" area to the Section config pane for Callables/Dict/Globals:
  - Text area with CodeMirror completions (accessor-only).
  - One accessor per line.
- Update `frontend/src/utils/constants.ts` so those section types expose the Section
  tab (it is currently hidden for Callables/Dict/Globals).
- Add a new `SectionConfig` component for sections-with-params to host the edges UI.

### Labels and Ordering

- Input edge labels should use the full path (e.g. `Parent["Child"]`) for nested params.
- Output edge labels show the accessor; empty accessor displays as "value".
- Order inputs using the existing param ordering (top-level order + nested path order).

## Validation

- Edge strip appears only when there is at least one edge input/output.
- Edge inputs do not appear in the normal param list.
- LSP completions for output accessors reflect the callable return type.
- Copy/paste preserves edge input/output configuration.

## Must-haves vs nice-to-haves

### Must-haves (ship first)

- Edge strip with input/output ports (manual, explicit).
- Per-param edge input toggles (nested allowed).
- Manual output accessors with LSP completions.
- Edge inputs hidden from the normal param list.
- React Flow wiring uses these ports (edge persistence tracked in a separate plan).

### Nice-to-haves (later)

- Composition tools (subgraphs): collapse group into a reusable node, expose selected internal ports, save as a template/preset.

## Non-goals (for now)

- Schema changes for legacy configs (no backwards compatibility needed).
