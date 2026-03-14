# Spike: LSP

## Purpose

This doc now records the outcome of the LSP spike rather than a pending
uncertainty-reduction task.

The rewrite no longer needs to decide whether Go can own the LSP session
boundary. That decision is already represented by `internal/lsp`,
`internal/lspcompletion`, and the focused Phase 5 follow-up docs.

## Status

Current repo status as of 2026-03-08:

- `internal/lsp/session.go` owns stdio framing, request correlation, and
  process lifecycle
- `internal/lsp/current_process.go` owns current-process Python/basedpyright
  session startup
- `internal/lspcompletion` owns snapshot-backed completion builders
- the Phase 5 focused docs now track follow-up work above the completed base
  runtime instead of debating the core approach

## Recommendation

Keep the LSP manager custom and explicit.

The current Go boundary is the right shape:

- own stdio framing and JSON-RPC/LSP message flow inside `internal/lsp`
- keep process lifecycle, restart, timeout, and shutdown rules explicit
- support Python via current-process basedpyright first
- add later language servers above the same session boundary instead of letting
  a helper library dictate the architecture

## Outcome

### Framing and types

No larger third-party framing package is required today.

The current implementation keeps:

- request/response framing in `internal/lsp/session.go`
- Setta-owned diagnostic, completion, and signature-help result types
- timeout/error handling under Setta control instead of library callbacks

### Lifecycle rules that are now concrete

The base lifecycle is established in real code:

- start process
- initialize
- optionally push configuration
- open, update, and close documents
- issue completion and signature-help requests
- shutdown and exit with explicit timeouts

The current defaults are already codified:

- request timeout: `5s`
- shutdown timeout: `3s`

### Minimum viable server set

The early supported baseline is:

- Python via basedpyright in the current Python environment

The runtime is also structured so later plugin-provided language servers can
plug in above the same owner boundary once explicitly scoped.

## Exit Criteria Result

The original spike exit criteria are satisfied in the current implementation:

- one real language server works end-to-end
- diagnostics and completion function through the Go session boundary
- failure paths such as startup failure and request timeout are understood and
  tested
- the custom-vs-helper boundary is explicit and defensible

## Inputs

- `docs/reference/lsp-diagnostics.md`
- `backend/setta/lsp/managers.py`
- `tests/lsp/test_lsp_managers.py`
- `tests/lsp/test_fixture_language_server_integration.py`
- `internal/lsp/session.go`
- `internal/lsp/current_process.go`
- `internal/lsp/session_test.go`
- `docs/plans/go-backend-rewrite/archive/phase-5-lsp-diagnostics-and-completion-runtime.md`

## Next Step

Treat this spike as closed.

Future LSP work should start from the focused Phase 5 follow-up docs or a new
bounded runtime doc, not from reopening the base library-selection question.
