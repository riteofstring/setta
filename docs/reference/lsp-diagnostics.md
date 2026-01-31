# LSP Diagnostics

This reference explains how Setta collects LSP diagnostics for generated code and
code sections, how they are broadcast to the UI, and how suppression works.

## Payloads and routing
- Diagnostics are broadcast over the frontend websocket as `LSPDiagnostics` and
  returned by the `get_latest_lsp_diagnostics` tool/route.
- Payload shape: `SettaLspDiagnosticsPayload`.
  - `projectConfigId`: target project config.
  - `genCode`: `SettaProjectConfigDiagnostics` (section/param type errors from
    generated code).
  - `codeSections`: map of `sectionId -> [SettaLspDiagnostic]` for Code sections.
  - `unmappedGenCode`: diagnostics from generated code that do not map to a
    section/param (still reported with line/column ranges).

## Diagnostic shape
`SettaLspDiagnostic` is a thin wrapper around LSP diagnostics:
- `message`: diagnostic text.
- `severity`: numeric LSP severity (1 error, 2 warning, 3 info, 4 hint).
- `code`: diagnostic code (string or int) when provided.
- `source`: origin (for example `pyright`).
- `range`: `{ start: { line, character }, end: { line, character } }` (0-based).
- `uri`: document URI when available.

## Generated code diagnostics
- Generated code diagnostics are still mapped into `SettaProjectConfigDiagnostics`
  so the UI can associate errors with sections/params.
- Diagnostics that cannot be mapped are preserved in `unmappedGenCode` so the
  GenPythonCode section can surface them with line/column context.
- When generated code changes, the diagnostics cache for `genCode` and
  `unmappedGenCode` is reset to avoid stale mappings.

## Code section diagnostics
- Each Code section maintains a diagnostics list keyed by section id.
- `ProjectPythonCode` forwards publish-diagnostics notifications into
  `ProjectLspDiagnosticsState`, which filters and broadcasts updates.
- CodeMirror linting uses the LSP ranges to highlight inline issues in the
  section editor.

## Diagnostics ignore state
Code sections store `diagnosticsIgnoreState`:
- `muted`: hide all diagnostics for the section.
- `suppressedCodes`: list of diagnostic codes to filter out.

Updates flow through:
- `Route.SET_CODE_SECTION_DIAGNOSTICS_MUTE` to toggle `muted`.
- `Route.SET_CODE_SECTION_DIAGNOSTIC_CODE_SUPPRESSION` to toggle a code in
  `suppressedCodes`.

The backend keeps raw diagnostics so that changing ignore state can reapply
filters without re-requesting LSP diagnostics.

## Share mode behavior
Share mode disables LSP and rejects diagnostics settings routes. Muting and
suppression are IDE-only controls.

## Code references
- `backend/setta/project_state/lsp_diagnostics_state.py`
- `backend/setta/project_state/project_code.py`
- `backend/setta/project_state/lsp_response_handlers/diagnostics.py`
- `backend/setta/project_state/base_project_manager.py`
- `frontend/src/state/actions/lspDiagnostics.ts`
- `frontend/src/components/Section/Header/SectionHeader.tsx`
- `frontend/src/components/Utils/CodeMirror/lspDiagnostics.ts`
