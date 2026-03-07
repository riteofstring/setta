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
- Slice 1 is now complete:
  - Go owns `internal/lsp` session/process supervision for a single Python
    language server
  - main-runtime save hooks now synchronize canonical Python code-section and
    generated Python files into the live LSP session
  - canonical Python code-section bindings normalize inside `internal/projectstate`
  - file-backed Python sections keep their canonical on-disk source when the
    current project snapshot has binding metadata but no inline `"code"` field
- Slice 2 is now complete:
  - Go owns project-scoped code-section diagnostics state and deduped snapshot
    hydration for `getLatestLspDiagnostics`
  - live Python code-section diagnostics now broadcast over the frontend
    websocket as `LSPDiagnostics`
  - generated Python diagnostics mapping is now Go-owned for
    `setta_gen.py` / `setta_gen_meta.py`
- Slice 3 is now complete:
  - Go owns snapshot-backed completion routes for:
    `textFieldCompletion`, `outputAccessorCompletion`,
    `codeAreaCompletion`, `genCodePrefixCompletion`,
    `genCodeSuffixCompletion`, and `clearTextFieldCompletion`
  - `internal/lsp` now owns temp snapshot document lifecycle beside canonical
    Python files
  - `internal/lspcompletion` now owns runtime-snapshot completion builders and
    frontend-compatible completion payload mapping
- Slice 4 is now complete:
  - Go owns diagnostics ignore-state routes for:
    `setCodeSectionDiagnosticsMute` and
    `setCodeSectionDiagnosticCodeSuppression`
  - Go project state now persists Code-section diagnostics ignore state and
    reapplies filtering from stored raw diagnostics without waiting for a new
    language-server publish
  - the frontend `lspDiagnostics` action now mirrors successful ignore-state
    mutations into local effective project state so existing header badges and
    menus update immediately without a broader project-state websocket push
- the next active LSP gap is now tracked in:
  - `docs/plans/go-backend-rewrite/phase-5-signature-help-callable-refetch-and-param-synthesis.md`
  - its Slice 1 manual `setCallable` runtime is now complete in Go
  - the remaining active work there is generated-diagnostics auto-refetch and
    later watch-code integration
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
- diagnostics ignore-state mutation helpers

Do not own:

- raw stdio protocol framing
- HTTP route policy

### `internal/lspcompletion`

Own:

- read-snapshot completion helpers for canonical Python code sections and
  generated Python files
- completion result mapping into the frontend `CodeMirrorCompletion` payload

Do not own:

- raw stdio protocol framing
- persisted diagnostics state
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

- complete

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

- complete

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

- complete

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

- complete

Completed in code and tests:

- `internal/projectstate` now owns Code-section diagnostics ignore-state
  mutation helpers with the same effective-field storage rules used by the
  frontend effective-impl setter path
- the LSP diagnostics registry now stores raw code-section diagnostics
  separately from filtered diagnostics and can reapply ignore state from the
  stored raw payloads without requesting a fresh LSP publish
- `internal/lsp` now refreshes canonical Python code-section diagnostics
  callbacks with the current ignore state during materialization, so policy-only
  project edits still affect later publishes when file content is unchanged
- `internal/httpapi` now serves IDE-only Go routes for
  `setCodeSectionDiagnosticsMute` and
  `setCodeSectionDiagnosticCodeSuppression`
- `frontend/src/state/actions/lspDiagnostics.ts` now updates local effective
  Code-section ignore state after successful route responses so the existing UI
  reads stay in sync with the persisted Go mutation

Key decision:

- keep the filtering source of truth inside `internal/projectstate` by
  reapplying against stored raw diagnostics, and keep the frontend follow-up
  narrowly scoped to local effective project-state mirroring instead of adding a
  second diagnostics-setting state path

Verification completed:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/lsp ./internal/httpapi -count=1 -timeout 150s`
- `pnpm -C frontend exec vitest run src/state/actions/lspDiagnostics.test.ts`

## Open Questions

- whether generated-code diagnostics mapping in Slice 2 should initially cover
  only Python-target outputs or also plugin-generated Python files from the
  same save hook

## Slice 1 Notes

Completed in code and tests:

- `internal/lsp` session framing, request correlation, timeout handling, and
  diagnostics callback dispatch
- current-process Python session resolution via explicit env override or the
  active virtualenv
- project-scoped synchronizer that keeps canonical Python section files and
  generated Python files open with the language server
- `internal/projectstate` canonical Python code-section binding reconciliation
  during normalization
- app lifecycle wiring for LSP start-on-demand and shutdown teardown

Key decision:

- treat inline section payload code as authoritative only when the effective
  payload actually contains a `"code"` string
- when a Python code section has a binding but no inline code field, preserve
  and sync the canonical on-disk file instead of overwriting it with an empty
  buffer

Verification completed:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/lsp -count=1`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -count=1`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/lsp ./internal/projectstate ./internal/app -count=1`

## Slice 2 Notes

Completed in code and tests:

- `internal/projectstate` now owns a project-scoped LSP diagnostics registry
  with deduped code-section payload snapshots
- `internal/lsp` synchronizer now forwards publish-diagnostics notifications
  for canonical Python code-section documents into that registry
- `internal/codegen` now maps generated Python diagnostics over the Go-owned
  dependency graph and renderer, including named/positional call issues,
  undefined-symbol range overlap, and `ignoreTypeErrors` filtering
- `internal/projectstate` now merges generated-code and generated-metadata
  diagnostics into the shared `genCode` / `unmappedGenCode` payload surface
- `internal/realtime` now exposes `LSPDiagnostics` websocket messages for
  frontend hydration
- `internal/httpapi` now serves `getLatestLspDiagnostics` from the Go-owned
  diagnostics registry with IDE-only gating
- `internal/app` now wires save-hook diagnostics updates, section pruning, and
  websocket broadcasts end-to-end
- `internal/lsp` now refreshes diagnostics callbacks even when tracked
  document content is unchanged, which keeps generated mapping aligned with
  policy-only project edits
- generated metadata diagnostics now clear when metadata generation is disabled
  or the Python target disappears

Verification completed:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/httpapi ./internal/lsp ./internal/realtime ./internal/app -count=1`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/codegen ./internal/projectstate -count=1`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/codegen ./internal/projectstate ./internal/lsp -count=1`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/codegen ./internal/projectstate ./internal/httpapi ./internal/lsp ./internal/realtime ./internal/app -count=1 -timeout 150s`

## Slice 3 Notes

Completed in code and tests:

- `internal/lsp` now owns temp snapshot file open/completion/close/unlink flow
  through `CompleteSnapshot`
- `internal/lspcompletion` now owns Python completion snapshot builders and the
  read-only completion service over runtime snapshots
- `internal/httpapi` now serves all six completion endpoints with existing
  frontend payloads unchanged
- `internal/app` now shares one LSP service between canonical-document sync and
  snapshot completion transport
- fixture-backed route and lifecycle tests now cover:
  - temp snapshot cleanup on success and timeout
  - code-area and generated-code completion payloads
  - completion requests staying unblocked by later runtime mutations

Key decision:

- move completion snapshot assembly out of `internal/projectstate` into
  `internal/lspcompletion`
- rationale: keeping the Go Python codegen/read-model logic separate from the
  persisted project-state package avoids the `projectstate -> codegen ->
  projectstate` import cycle while preserving a thin `httpapi` boundary

Verification completed:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/lsp ./internal/lspcompletion ./internal/httpapi ./internal/app -count=1 -timeout 150s`

## Next Recommended Step

The bounded Phase 5 LSP runtime plan is now complete through Slice 4.

Next recommended step:

- execute Slice 1 from
  `phase-5-signature-help-callable-refetch-and-param-synthesis.md`
- keep watch-code/file-watcher parity explicitly deferred until the manual
  `setCallable` slice is stable
