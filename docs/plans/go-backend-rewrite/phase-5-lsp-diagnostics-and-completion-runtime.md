# Phase 5 LSP Diagnostics And Completion Runtime

## Purpose

This doc narrows the first bounded Phase 5 work after the completed Phase 4
realtime, terminal, deployment, plugin-codegen, and Python-codegen follow-ups.

Go now owns the runtime pieces that make a clean-break LSP migration viable:

- project-state runtime and save hooks
- websocket/realtime fan-out
- deterministic generated Python file materialization
- generated Python section reconciliation and frontend verification

What Go still does not own is any LSP runtime or transport. Python remains the
source of truth for:

- language-server process/session management
- diagnostics state and websocket/hydration payloads
- completion request routing over temporary snapshot documents
- diagnostics ignore-state mutation routes
- signature-help-driven callable parameter synthesis

## Status

Current repo status as of 2026-03-07:

- Phase 4 focused follow-ups are complete through backend tests, Playwright,
  and headed CDP verification for the Python codegen target flow
- there is still no `internal/lsp` package in Go
- there are still no Go-owned HTTP routes for:
  - `getLatestLspDiagnostics`
  - `textFieldCompletion`
  - `outputAccessorCompletion`
  - `codeAreaCompletion`
  - `genCodePrefixCompletion`
  - `genCodeSuffixCompletion`
  - `clearTextFieldCompletion`
  - `setCodeSectionDiagnosticsMute`
  - `setCodeSectionDiagnosticCodeSuppression`
- Python still owns the current LSP runtime under:
  - `backend/setta/lsp/managers.py`
  - `backend/setta/lsp/server.py`
  - `backend/setta/lsp/writer.py`
  - `backend/setta/lsp/reader.py`
  - `backend/setta/project_state/project_code.py`
  - `backend/setta/project_state/lsp_diagnostics_state.py`
  - `backend/setta/project_state/lsp_response_handlers/diagnostics.py`
- the frontend already depends on the LSP transport and payload surface in:
  - `frontend/src/state/actions/project/loadProject.ts`
  - `frontend/src/state/actions/websocketReceive.ts`
  - `frontend/src/state/actions/lspDiagnostics.ts`
  - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx`
  - `frontend/src/components/Section/Layouts/CodeArea.tsx`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/EdgePortsSettings.tsx`

## Scope

This focused Phase 5 plan covers:

- the first Go-owned language-server runtime for Python code intelligence
- project-scoped diagnostics state, websocket broadcast, and hydration routes
- read-only completion transport over temporary snapshot documents
- diagnostics ignore-state transport for Code sections

## Non-Goals

- plugin-provided language servers in the first slice
- multi-language production support before Python is stable
- watch-code file-watcher parity in the first slice
- format-code transport or formatter diagnostics generation
- signature-help-driven callable refetch and param synthesis in the first slice
- deployment/share-mode LSP enablement
- preserving the Python manager or queue topology

## Inputs

- `docs/reference/lsp-diagnostics.md`
- `docs/reference/code-temp-file-workflow.md`
- `docs/reference/sharing-mode-vs-ide-mode.md`
- `docs/plans/go-backend-rewrite/spike-lsp.md`
- `backend/setta/lsp/managers.py`
- `backend/setta/lsp/server.py`
- `backend/setta/lsp/writer.py`
- `backend/setta/lsp/reader.py`
- `backend/setta/project_state/project_code.py`
- `backend/setta/project_state/lsp_diagnostics_state.py`
- `backend/setta/project_state/lsp_response_handlers/completion.py`
- `backend/setta/project_state/lsp_response_handlers/diagnostics.py`
- `tests/lsp/test_lsp_managers.py`
- `tests/lsp/test_fixture_language_server_integration.py`
- `tests/project_state/test_lsp_diagnostics_state.py`
- `tests/project_state/test_code_section_diagnostics_ignore.py`
- `tests/project_state/test_completion_queue_concurrency.py`

## Dependency Finding

The next LSP step is not just route transport.

Three source-of-truth layers are missing in Go:

1. a Go-owned language-server session/runtime boundary
2. a Go-owned diagnostics state and broadcast/hydration boundary
3. a Go-owned snapshot-document completion pathway that can read project state
   without mutating canonical files

There is also one project-state dependency that should be handled explicitly in
the first slice:

- Go already materializes `setta_gen.py` / `setta_gen_meta.py`, but it does not
  yet own canonical per-section code-file projection for normal Code sections
  as an LSP source of truth

Without those layers, adding thin handlers would only recreate Python-shaped
hidden state in Go or return incomplete diagnostics/completion behavior.

## Working Decisions

- support Python via basedpyright first
  - plugin-provided language servers stay deferred until the base runtime is
    stable
- keep `internal/lsp` custom and explicit
  - use helper packages only for protocol framing/types if they reduce pain
  - do not let a library dictate project/runtime ownership
- keep transport thin
  - HTTP routes should extract context, enforce IDE-only policy, call services,
    and map responses only
- keep diagnostics state authoritative and shared
  - websocket `LSPDiagnostics` broadcasts and `getLatestLspDiagnostics` must
    read the same project-scoped store
- keep completion requests read-only and concurrency-safe
  - completion handlers should bypass the serialized mutation queue
  - they should read from a consistent project snapshot and use temp documents
    with `didOpen` / request / `didClose`
- keep share/app mode blocked for LSP
  - LSP routes and diagnostics-setting routes stay IDE-only in this slice
- defer signature-help mutation semantics
  - do not widen the first slice into callable refetch, parameter synthesis, or
    watch-code ownership

## Recommended Option

Start Phase 5 with a read-mostly LSP foundation:

1. one real Python language-server session in Go
2. diagnostics cache + hydrate/broadcast transport
3. snapshot-based completion transport
4. diagnostics ignore-state routes

Rationale:

- it gives the frontend real Go-owned code intelligence without first migrating
  every structural section-edit route
- it builds on the recently completed Go Python codegen runtime instead of
  bypassing it
- it keeps the most stateful part of LSP ownership inside explicit services,
  not handlers
- it leaves signature-help and watch-code as a clean follow-up once the base
  runtime is proven

## Proposed Go Boundaries

### `internal/lsp`

Own:

- language-server process supervision
- stdio JSON-RPC framing
- initialize / shutdown / restart rules
- request correlation, timeout, and cancellation boundaries
- document open/change/close bookkeeping
- diagnostics callback registration

Do not own:

- project-state mutation rules
- HTTP decoding
- websocket broadcast policy

### `internal/projectstate`

Own:

- project-scoped LSP diagnostics state
- canonical code-section binding reconciliation needed for LSP-visible files
- read-snapshot completion helpers for code sections and generated code
- diagnostics ignore-state mutation helpers

Do not own:

- raw stdio protocol framing
- HTTP route policy

### `internal/httpapi`

Own:

- IDE-only route gating for LSP and diagnostics settings
- decoding completion/diagnostics requests
- mapping service outputs to the existing frontend DTOs

Do not own:

- session lifecycle
- diagnostics storage
- temp-file completion logic

### `internal/app`

Own:

- app lifecycle for starting/stopping the LSP service
- wiring `internal/lsp`, `internal/projectstate`, `internal/httpapi`, and the
  existing realtime broadcaster together

Do not own:

- per-request logic
- diagnostics mapping logic

## Implementation Slices

### Slice 1: LSP Session Foundation + Canonical File Projection

Deliver:

- `internal/lsp` package with one Go-owned Python language-server session
- app lifecycle wiring for start/stop
- deterministic canonical code-file projection for Python Code sections under
  the same project code root used by generated Python files
- focused Go tests for:
  - startup/shutdown
  - request timeout behavior
  - initialize + document open/change/close
  - fixture-language-server diagnostics/completion

Acceptance:

- one real language server initializes end-to-end from Go
- Go can keep canonical code-section and generated-code documents open with the
  language server
- startup failure and restart/teardown paths are explicit and tested

Status:

- pending

### Slice 2: Diagnostics State + Hydration/Broadcast Transport

Deliver:

- project-scoped diagnostics state equivalent to
  `ProjectLspDiagnosticsState`
- generated-code diagnostics mapping over the Go Python renderer/runtime
- websocket `LSPDiagnostics` broadcast wiring through the existing realtime
  boundary
- Go-owned `getLatestLspDiagnostics` route

Acceptance:

- project load and websocket reconnect can rehydrate diagnostics from Go
- duplicate diagnostics updates do not rebroadcast
- stale code-section diagnostics are pruned when sections disappear
- generated-code diagnostics clear correctly when Python LSP is unavailable

Status:

- pending

### Slice 3: Snapshot Completion Transport

Deliver:

- Go-owned routes for:
  - `textFieldCompletion`
  - `outputAccessorCompletion`
  - `codeAreaCompletion`
  - `genCodePrefixCompletion`
  - `genCodeSuffixCompletion`
  - `clearTextFieldCompletion`
- temporary snapshot document support for normal Code sections and generated
  code under the canonical section root
- read-lock concurrency coverage equivalent to
  `tests/project_state/test_completion_queue_concurrency.py`

Acceptance:

- completion requests do not mutate canonical project code files
- completion requests do not block writes beyond the shared read-lock boundary
- temp snapshot documents are closed and removed after the request
- generated-code completion uses the Go-owned Python renderer/materializer path

Status:

- pending

### Slice 4: Diagnostics Ignore-State Transport

Deliver:

- Go-owned routes for:
  - `setCodeSectionDiagnosticsMute`
  - `setCodeSectionDiagnosticCodeSuppression`
- projectstate helpers that reapply ignore-state filtering from stored raw
  diagnostics without re-requesting the language server
- focused Go and frontend tests for IDE-only behavior and filtered payloads

Acceptance:

- muting clears visible section diagnostics without losing raw diagnostics
- suppressed diagnostic codes filter correctly and survive payload refreshes
- deployment/share mode still rejects diagnostics-setting routes

Status:

- pending

## Open Questions

- which Go helper package, if any, is the narrowest acceptable fit for
  JSON-RPC/LSP framing without taking over service design?
- whether canonical code-section binding reconciliation should live in one Phase
  5 commit or in a tiny pre-slice before the first session tests
- whether the first generated-code diagnostics mapper should cover only Python
  generated sections or also plugin-generated Python files in the same slice

## Next Recommended Step

Execute Slice 1 first:

- add `internal/lsp` with a single Python language-server session
- add deterministic per-section canonical code-file projection for Python Code
  sections
- prove the runtime against the existing fixture language-server integration
  pattern before widening to diagnostics or completion routes
