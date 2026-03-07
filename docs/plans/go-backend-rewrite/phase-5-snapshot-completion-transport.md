# Phase 5 Snapshot Completion Transport

## Purpose

This doc narrows the active Slice 3 work from
`phase-5-lsp-diagnostics-and-completion-runtime.md`.

Go already owns:

- the Python language-server session boundary
- canonical Python code-section projection into the live LSP session
- generated Python file materialization and diagnostics mapping
- frontend-compatible diagnostics hydration/broadcast transport

What Go still does not own is the read-only completion transport that the
frontend uses for:

- text-field expression completion inside Python-backed generated code
- output accessor completion for edge-port accessors
- Python Code section completion
- generated code prefix/suffix completion

## Status

Current repo status as of 2026-03-07:

- Phase 5 Slice 1 is complete
- Phase 5 Slice 2 is complete
- Slice 3 is the active implementation gap
- there are still no Go-owned HTTP routes for:
  - `textFieldCompletion`
  - `outputAccessorCompletion`
  - `codeAreaCompletion`
  - `genCodePrefixCompletion`
  - `genCodeSuffixCompletion`
  - `clearTextFieldCompletion`
- the frontend already calls those routes through generated endpoints in:
  - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
  - `frontend/src/components/Section/Layouts/CodeArea.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/EdgePortsSettings.tsx`
- Python remains the source of truth for current completion semantics in:
  - `backend/setta/project_state/project_code.py`
  - `backend/setta/project_state/code.py`
  - `backend/setta/project_state/lsp_response_handlers/completion.py`
  - `backend/setta/project_state/base_project_manager.py`

## Scope

This focused Slice 3 plan covers:

- Go-owned read-only completion routes for the existing frontend payloads
- temporary snapshot documents under the canonical Python code root
- generated Python completion context building over the Go codegen graph and
  renderer
- completion result mapping into the existing `CodeMirrorCompletion` payload

## Non-Goals

- plugin-provided language-server completion in this slice
- multi-language completion routing before Python is stable
- signature-help mutation/refetch behavior
- diagnostics ignore-state mutation routes
- share/deployment-mode LSP completion enablement

## Inputs

- `docs/reference/code-temp-file-workflow.md`
- `docs/reference/lsp-diagnostics.md`
- `backend/setta/project_state/project_code.py`
- `backend/setta/project_state/code.py`
- `backend/setta/project_state/lsp_response_handlers/completion.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/lsp/writer.py`
- `tests/project_state/test_completion_queue_concurrency.py`
- `tests/lsp/test_fixture_language_server_integration.py`
- `frontend/tests/e2e/editor/codemirror-autocomplete-clip.spec.ts`
- `frontend/tests/e2e/overview/plugins/plugin-language-server.spec.ts`

## Working Decisions

- keep Slice 3 Python-only
  - `codeAreaCompletion` should serve Python Code sections only in this slice
  - non-Python/plugin completion stays deferred until Go owns multi-language
    LSP session routing
- keep completion transport read-only
  - completion requests must never update canonical tracked files or saved
    project state
- keep temp documents adjacent to canonical files
  - canonical Python sections use `<base>__<32hex>.py`
  - generated code uses `setta_gen__<32hex>.py`
  - temp documents must be closed with `didClose` and unlinked immediately
- keep project semantics out of handlers
  - `internal/httpapi` decodes, validates, and maps
  - `internal/projectstate` builds Python completion snapshots from the current
    project snapshot
  - `internal/lsp` owns temp document lifecycle and raw completion requests
- keep frontend DTOs unchanged
  - return `[{ label, type }]`
  - filter temp snapshot module labels like `__<32hex>`
- use current runtime snapshots as the read boundary
  - do not recreate Python’s old manager queue topology
  - prove that completion waits do not block ordinary runtime mutations

## Proposed Boundaries

### `internal/projectstate`

Own:

- deriving completion snapshot inputs from a runtime snapshot
- resolving canonical Python section bindings for `codeAreaCompletion`
- building generated Python completion code for:
  - `textFieldCompletion`
  - `outputAccessorCompletion`
  - `genCodePrefixCompletion`
  - `genCodeSuffixCompletion`

Do not own:

- filesystem temp-file creation
- LSP request framing
- HTTP decoding

### `internal/lsp`

Own:

- temp snapshot file creation beside canonical files
- `didOpen` / completion / `didClose` lifecycle
- unlinking temp files
- returning raw completion results from the shared live session

Do not own:

- project snapshot interpretation
- frontend DTO mapping

### `internal/httpapi`

Own:

- IDE-only route gating
- request decoding/validation
- completion-result mapping into `CodeMirrorCompletion`

Do not own:

- Python graph/render logic
- temp document lifecycle

## Implementation Steps

### Step 1: Focused plan/doc handoff

Deliver:

- this focused Slice 3 doc
- README index update

Acceptance:

- active completion work has an explicit scope boundary and sequencing

### Step 2: Python snapshot completion builders

Deliver:

- `internal/projectstate` helpers that derive temp-document requests for:
  - Python Code section completion
  - generated text-field completion
  - output accessor completion
  - generated prefix completion
  - generated suffix completion
- generated completion builders should use the Go Python dependency graph and
  renderer as the source of truth

Acceptance:

- completion inputs are derived from the current runtime snapshot only
- generated completion code reflects the current target settings and password
  secret presence
- unsupported/non-Python sections return an explicit empty result path, not a
  heuristic fallback

### Step 3: LSP temp-document completion service

Deliver:

- `internal/lsp` helper/service that:
  - resolves canonical parent directories under `setta_files`
  - writes temp files with `__<32hex>` suffixes
  - opens temp docs in the shared session
  - requests completion
  - closes and unlinks the temp docs

Acceptance:

- temp files are gone after completion returns or errors
- completion works while canonical files remain open in the same session

### Step 4: HTTP transport + verification

Deliver:

- Go-owned routes for all Slice 3 completion endpoints
- completion-result mapping to `CodeMirrorCompletion`
- focused tests for:
  - temp snapshot cleanup
  - generated completion context building
  - HTTP route payloads
  - completion wait not blocking runtime mutation progress

Acceptance:

- the existing frontend request payloads work unchanged
- completion requests do not mutate canonical project files
- completion waits do not block writes beyond the runtime snapshot boundary

## Next Recommended Step

Implement Step 2 first:

- add `internal/projectstate` Python completion snapshot builders
- add the minimal shared temp-document request struct they will hand to
  `internal/lsp`
- prove them with focused Go unit tests before wiring the HTTP routes
