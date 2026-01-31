# LSP feature gap plan

This plan documents the current LSP surface area and proposes a phased path to
fill the remaining gaps, with a focus on diagnostics in code sections and
unmapped generated-code errors.

## Current LSP surface (as implemented)
- **Autocomplete** for callable/dict text fields and param values via
  `route_text_field_completion` + `ProjectGenPythonCode`.
- **Autocomplete** for code sections (Python) via `route_code_area_completion`
  + `ProjectPythonCode`.
- **Autocomplete** for generated code prefix/suffix via
  `route_gen_code_prefix_completion` / `route_gen_code_suffix_completion`.
- **Signature help** when selecting callables (`set_callable` uses LSP to
  discover callable params).
- **Diagnostics (type errors)** are parsed from generated Python code and mapped
  to section/param IDs; the frontend renders these on callable search + param
  rows.

Key references:
- Backend diagnostics parsing: `backend/setta/project_state/lsp_response_handlers/diagnostics.py`
- Gen code diagnostics + websocket broadcast: `backend/setta/project_state/project_code.py`
- Code section LSP path (TODO): `backend/setta/project_state/project_code.py`
- Frontend type error UI: `frontend/src/components/Section/SectionParts/Search.tsx`,
  `frontend/src/components/Params/ParamSwitch.tsx`

## Gaps
- **Code section diagnostics are missing.** `ProjectPythonCode.diagnostics_callback`
  is a TODO and no UI state renders code-area errors.
- **Unmapped diagnostics are dropped.** Generated-code diagnostics that do not
  map to a section/param (prefix/suffix/imports/global errors) are ignored.
- **No diagnostics payload for code sections.** `SettaProjectConfigDiagnostics`
  only supports section/param errors; it cannot carry line/column data.
- **No code-area UI affordance** (gutter markers, underline, tooltip, problems
  list) for diagnostics.
- **No ignore/suppress model for code sections.** The ignore toggle only applies
  to callable/param errors.

## Goals
- Provide LSP diagnostics for Python code sections (inline + summary counts).
- Surface unmapped generated-code diagnostics (prefix/suffix/imports).
- Keep callable/param error UX intact while extending to code areas.
- Make it clear which diagnostics come from generated code vs code sections.
- Preserve share-mode restrictions and current LSP gating.

## Non-goals
- Replacing Pyright or LSP server selection in this phase.
- Full LSP code actions or refactor tooling.

## Proposed data model changes
- Introduce a new diagnostics payload that can carry both existing type errors
  and file/section diagnostics with ranges, e.g.:
  - `SettaLspDiagnosticsPayload`
    - `projectConfigId`
    - `genCode`: existing `SettaProjectConfigDiagnostics` structure
    - `codeSections`: map of `sectionId -> list[SettaLspDiagnostic]`
    - `unmappedGenCode`: list of `SettaLspDiagnostic` for prefix/suffix/imports
- Add `SettaLspDiagnostic` type:
  - `message`, `severity`, `code`, `source`
  - `range` (start/end line + character)
  - optional `uri` for non-section diagnostics
- Keep `SettaProjectConfigDiagnostics` for section/param errors so existing UI
  stays stable; add a new websocket message type (e.g. `LSPDiagnosticsV2`) or
  extend the existing one with a backward-compatible shape.
- Decision: code-section diagnostics are scoped **per section** (not per
  variant), matching the existing `errors` map keyed by section ID.

## Implementation phases

### Phase 1: Backend diagnostics for code sections
- Implement `ProjectPythonCode.diagnostics_callback` to:
  - Convert diagnostics into `SettaLspDiagnostic` entries.
  - Associate them with the owning `sectionId`.
  - Broadcast the new diagnostics payload.
- Ensure diagnostics are cleared on section removal or file rebind.
- Add a project-manager method to request diagnostics for all active code
  sections (optional new route to mirror `route_type_check`).

### Phase 2: Frontend diagnostics state + UI
- Add new state slice for `codeSectionDiagnostics` keyed by section ID.
- Build a CodeMirror lint extension that:
  - Underlines ranges, adds gutter markers, and shows hover tooltips.
  - Accepts diagnostics from the new payload and re-renders on update.
- Add a small header badge on code sections showing error count; click opens a
  lightweight “Problems” popover scoped to the section.
- Preserve existing callable/param error UI unchanged.

### Phase 3: Surface unmapped generated-code diagnostics
- Capture and forward diagnostics that do not map to section/param IDs.
- Display them in the GenPythonCode editor with lint markers.
- Add a “Generated code issues” badge on the GenPythonCode section header.

### Phase 4: Ignore/suppress rules (optional but recommended)
- Extend the ignore model to include code sections:
  - Per-section “mute diagnostics” toggle.
  - Optional per-rule suppression list (code + message substring).
- Ensure suppressions are stored in project state and honored on diagnostics
  ingestion.

## Testing plan
- Backend unit tests:
  - Diagnostics mapping for code sections.
  - Unmapped diagnostics captured and forwarded.
  - Ignore/suppress logic for code sections (if implemented).
- Frontend tests:
  - State update handling for diagnostics payload.
  - CodeMirror lint markers appear for a section with errors.
  - Badge counts match diagnostic list length.

## Rollout notes
- If the payload shape changes, run `source activate.sh && cd frontend && pnpm generate`.
- Keep the old `LSPDiagnostics` message until frontend migration is complete.
- Validate in share mode that diagnostics are not requested or displayed.

## Open questions
- How should we handle diagnostics for read-only bindings?
- Do we want a global “Problems” panel, or only per-section popovers?
- Which diagnostics are worth surfacing for generated code vs user-editable code?
