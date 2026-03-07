# Phase 5 Signature Help Callable Refetch And Param Synthesis

## Purpose

This doc narrows the next bounded Phase 5 follow-up after the completed Go LSP
runtime, diagnostics, completion, and diagnostics-ignore transport slices.

Go now owns the base Python LSP substrate:

- process/session supervision
- canonical Python document sync
- generated Python materialization
- diagnostics storage/broadcast/hydration
- read-only completion over temp snapshot documents
- diagnostics ignore-state mutation routes

What Go still does not own is the callable-binding workflow that depends on
`textDocument/signatureHelp`:

- `setCallable`
- signature-help response parsing into parameter proposals
- callable parameter/code-object synthesis
- auto-refetch after generated diagnostics resolve undefined callables
- auto-refetch on generated signature mismatch diagnostics
- watch-code callable refreshes that use the same synthesis path

## Status

Current repo status as of 2026-03-07:

- Phase 5 slices 1 through 4 are complete
- Go owns the shared LSP session, diagnostics, completion, and diagnostics
  ignore-state runtime boundaries
- the active LSP gap has moved to signature-help-driven callable refetch and
  parameter synthesis
- Python remains the source of truth for that gap in:
  - `backend/setta/project_state/project_code.py`
  - `backend/setta/project_state/lsp_response_handlers/signatureHelp.py`
  - `backend/setta/project_state/base_project_manager.py`
  - `backend/setta/project_state/watch_code.py`
  - `backend/setta/lsp/writer.py`
- the current frontend still calls `route_set_callable` from:
  - `frontend/src/components/Section/SectionParts/Search.tsx`
- the current frontend ignores the Python route payload details and waits for
  a project-state websocket refresh, but Go still has no general IDE
  `UpdateFrontendProjectState` websocket message or `getLatestProjectState`
  route

## Scope

This focused follow-up covers:

- Go-owned `textDocument/signatureHelp` request transport over Python snapshot
  documents
- parsing `SignatureInformation` into deterministic parameter proposals
- Go-owned callable-binding mutation and parameter child synthesis
- IDE-only `setCallable` transport for manual callable selection
- explicit follow-up slices for auto-refetch and watch-code integration

## Non-Goals

- non-Python callable synthesis before the Python path is stable
- plugin-provided language-server signature help in the first slice
- preserving Python’s exact queue topology or canonical-file mutation pattern
- share/app mode callable binding or signature help
- broad generic project-state websocket push work unless a later dependency
  makes it unavoidable
- watch-code/file-watcher parity in the first bounded slice

## Inputs

- `docs/reference/code-temp-file-workflow.md`
- `docs/reference/lsp-diagnostics.md`
- `docs/reference/watch-code.md`
- `docs/reference/sharing-mode-vs-ide-mode.md`
- `docs/plans/go-backend-rewrite/phase-5-lsp-diagnostics-and-completion-runtime.md`
- `backend/setta/project_state/project_code.py`
- `backend/setta/project_state/lsp_response_handlers/signatureHelp.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/project_state/watch_code.py`
- `backend/setta/lsp/writer.py`
- `tests/project_state/test_signature_help_type_annotations.py`
- `tests/project_state/test_auto_refetch_history.py`
- `tests/project_state/test_lsp_diagnostics_processing.py`
- `tests/project_state/test_watch_code.py`
- `tests/routers/test_share_policy_routes.py`
- `frontend/src/components/Section/SectionParts/Search.tsx`

## Current Python Behavior

The current Python `set_callable` flow is more than a route:

1. mutate generated Python code context with the requested callable text
2. ask the language server for `textDocument/signatureHelp` with trigger
   character `(`
3. parse the first returned signature into ordered parameter proposals
4. create or reuse the callable code object
5. create/update child parameter code objects and their impls
6. write the callable binding back into the section impl
7. broadcast project state

The same synthesis path is reused later by:

- `auto_refetch_callable_params`
- `auto_refetch_callable_params_on_lsp_mismatch`
- watch-code callable refreshes

That means the next Go slice is not just a new handler. It needs one reusable
source-of-truth callable synthesis service above the shared LSP session.

## Dependency Finding

The next step is really an implementation-plan step, not immediate code, for
four reasons:

1. there is no Go-owned signature-help request pathway yet
2. there is no Go-owned parser for `SignatureInformation` into ordered
   `CodeParam` proposal data
3. there is no Go-owned project-state mutation helper for callable binding and
   child parameter synthesis
4. the current frontend `setCallable` flow depends on project-state refresh, but
   Go still has no general IDE project-state push/hydration pathway

There is also one scope dependency that should stay explicit:

- automatic refetch-on-mismatch currently depends on
  `settings.backend.autoRefetchCallableParamsOnLspMismatch`
  - that setting is still Python-owned for actual runtime behavior
  - the first Go slice should not silently hard-code policy if a Go settings
    owner is not ready

## Working Decisions

- keep the first slice manual
  - land user-triggered `setCallable` first
  - defer auto-refetch and watch-code triggers to explicit follow-up slices
- use temp generated Python snapshots for signature help
  - do not recreate Python’s mutate-canonical-then-request pattern
  - reuse the Go snapshot-document approach proven by completion
- keep callable synthesis custom
  - use standardized LSP `SignatureInformation` / `ParameterInformation`
    fields as the primary source of truth
  - fall back to docstring parsing only when the language server does not
    provide enough structured parameter detail
- keep transport thin
  - HTTP should decode, enforce IDE-only policy, call services, and map the
    authoritative response
- prefer authoritative state return over frontend mutation replay
  - callable synthesis touches section impls, callable code objects, child
    params, and variant maps
  - the frontend should not reconstruct that mutation locally
- keep share/app mode blocked
  - `setCallable` and any later auto-refetch work stay IDE-only

## Recommended Option

Execute this follow-up in three bounded slices:

1. manual `setCallable` over Go-owned signature-help snapshot requests
2. generated-diagnostics-driven auto-refetch callbacks
3. watch-code integration and mismatch-policy wiring

Rationale:

- it gets the main user-facing callable-binding path off Python first
- it reuses the existing Go LSP and Python codegen foundations instead of
  introducing another hidden state path
- it avoids prematurely coupling watch-code behavior to a partially migrated
  settings/runtime boundary
- it keeps the first slice small enough to verify with focused fixture tests

## Proposed Go Boundaries

### `internal/lsp`

Own:

- raw `textDocument/signatureHelp` request framing
- temp snapshot document lifecycle beside canonical/generated Python files
- request cancellation and timeout behavior

Do not own:

- project-state interpretation
- signature parsing into product semantics
- callable mutation rules

### `internal/lspsignature`

Own:

- building snapshot signature-help requests from runtime snapshots
- placing the cursor inside the synthetic callable invocation
- parsing LSP signature payloads into ordered parameter proposals
- returning an explicit synthesis result (`matched`, `no_match`, `skipped`)

Do not own:

- persisted project-state writes
- HTTP decoding
- watcher policy

### `internal/projectstate`

Own:

- callable-binding mutation helpers
- creating/reusing callable code objects
- creating/updating/removing child parameter code objects
- deterministic response data for the current callable + child params

Do not own:

- raw LSP request framing
- temp snapshot document lifecycle
- watch-code trigger policy

### `internal/httpapi`

Own:

- IDE-only `setCallable` route gating
- request decoding and error mapping
- authoritative response mapping for frontend project-state refresh

Do not own:

- signature-help request logic
- callable synthesis logic

## Response Direction

Python currently returns `SetCallableResponse`, but the frontend ignores the
payload and waits for a websocket project-state refresh. Go does not own that
project-state push path yet.

Recommended transport choice for the first Go slice:

- return authoritative updated project state together with the callable result
  in one route response

Rationale:

- it keeps the frontend on a source-of-truth refresh path
- it avoids reconstructing structural callable mutations locally
- it avoids widening this slice into a generic IDE websocket project-state push

If this response change proves too disruptive once implemented, the fallback is
to add a Go-owned `getLatestProjectState` hydrate route and explicitly re-fetch
after success. Do not add frontend local mutation replay as a fallback.

## Implementation Slices

### Slice 1: Manual `setCallable` Signature-Help Runtime

Deliver:

- `internal/lsp` signature-help request support over temp Python snapshots
- `internal/lspsignature` service for generated-code callable invocation
  snapshots
- parser port for:
  - parameter name extraction
  - default value extraction
  - type annotation extraction
  - passing-style derivation
  - docstring fallback parsing
- `internal/projectstate` callable synthesis helpers
- IDE-only `setCallable` route for manual callable selection
- frontend update to consume the authoritative response instead of waiting on a
  non-existent Go websocket project-state push

Acceptance:

- selecting a callable updates project state from Go end-to-end
- empty callable names clear the callable binding
- existing callable objects are reused when appropriate
- type annotations are preserved in created `CodeParam` impls
- share/app mode rejects the route

### Slice 2: Auto-Refetch From Generated Diagnostics

Deliver:

- Go-owned callbacks for:
  - undefined callable symbols becoming resolved
  - callable signature mismatch diagnostics
- explicit manager/app wiring that reuses the Slice 1 callable synthesis
  service
- history/coalescing behavior only where Go already owns the relevant state

Acceptance:

- resolved undefined-callable sections refetch without a user action
- callable mismatch sections refetch only when policy allows it
- no duplicate refetch churn from repeated identical diagnostics payloads

### Slice 3: Watch-Code Integration And Policy Finish

Deliver:

- watch-code callable refreshes routed through the Go callable synthesis
  service
- warning/notification behavior when signature help cannot resolve params
- any missing settings/runtime policy wiring needed for
  `autoRefetchCallableParamsOnLspMismatch`

Acceptance:

- watch-code callable updates reuse the same synthesis service as manual
  `setCallable`
- mismatch notifications remain source-of-truth-driven, not heuristic
- policy gating is explicit and test-covered

## Verification Expectations

For Slice 1 implementation, require at minimum:

- Go unit tests for signature parsing and callable synthesis helpers
- fixture-backed LSP integration tests for signature-help requests
- HTTP route tests for IDE-only gating and authoritative response payloads
- frontend Vitest coverage for the Search callable flow
- Playwright coverage for manual callable selection once the route lands

For later slices, add:

- history/coalescing tests
- generated-diagnostics callback/refetch tests
- watch-code integration tests

## Open Questions

- whether the first Go `setCallable` route should replace the current response
  type immediately or add a parallel route during transition inside the
  worktree
- whether auto-refetch should wait for Go settings/runtime ownership first or
  read the existing settings store through a narrower bridge

## Next Recommended Step

Execute Slice 1 next:

- add Go-owned signature-help snapshot request support
- port the signature parser and callable synthesis service
- land manual `setCallable` transport with an authoritative response path
