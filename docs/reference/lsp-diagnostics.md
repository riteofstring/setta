# LSP Diagnostics

This reference explains how Setta collects LSP diagnostics for generated code and
code sections, how they are broadcast to the UI, and how suppression works.

## Payloads and routing
- Diagnostics are broadcast over the frontend websocket as `LSPDiagnostics` and
  returned by the `get_latest_lsp_diagnostics` tool/route.
- The frontend calls `get_latest_lsp_diagnostics` on project load or websocket
  reconnect to rehydrate diagnostics after hard refreshes.
- Payload shape: `SettaLspDiagnosticsPayload`.
  - `projectConfigId`: target project config.
  - `genCode`: `SettaProjectConfigDiagnostics` (section/param type errors from
    generated code).
  - `codeSections`: map of `sectionId -> [SettaLspDiagnostic]` for Code sections.
  - `unmappedGenCode`: diagnostics from generated code that do not map to a
    section/param (reported with line/column ranges).

## Diagnostic shape
`SettaLspDiagnostic` is a thin wrapper around LSP diagnostics:
- `message`: diagnostic text.
- `severity`: numeric LSP severity (1 error, 2 warning, 3 info, 4 hint).
- `code`: diagnostic code (string or int) when provided.
- `source`: origin (for example `pyright`).
- `range`: `{ start: { line, character }, end: { line, character } }` (0-based).
- `uri`: document URI when available.

## Generated code diagnostics
- Generated code diagnostics are mapped into `SettaProjectConfigDiagnostics`
  so the UI can associate errors with sections/params.
- Diagnostics that cannot be mapped are preserved in `unmappedGenCode` so the
  GenPythonCode section can surface them with line/column context.
- When generated code changes, existing diagnostics are kept until the LSP
  publishes for the new code to avoid UI flicker. If there is no LSP writer,
  the backend clears `genCode` and `unmappedGenCode` to avoid stale mappings.

## Code section diagnostics
- Each Code section maintains a diagnostics list keyed by section id.
- The Go LSP synchronizer forwards publish-diagnostics callbacks into
  `LSPDiagnosticsRegistry`, which filters, merges, and broadcasts updates.
- CodeMirror linting uses the LSP ranges to highlight inline issues in the
  section editor.

## Formatter diagnostics
- The format-code action uses Ruff and returns errors through the API; the
  frontend converts those into diagnostics with `source=Formatter`.
- Formatter diagnostics are stored alongside LSP diagnostics for Code sections,
  and in `unmappedGenCode` for GenPythonCode prefix/suffix errors.
- Incoming LSP updates preserve existing formatter diagnostics unless the
  formatter produces new ones; successful formatting clears them.

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
- `internal/projectstate/lsp_diagnostics.go`
- `internal/lsp/project_synchronizer.go`
- `internal/httpapi/lsp_routes.go`
- `internal/realtime/messages.go`
- `frontend/src/state/actions/lspDiagnostics.ts`
- `frontend/src/components/Section/Header/SectionHeader.tsx`
- `frontend/src/components/Utils/CodeMirror/lspDiagnostics.ts`
