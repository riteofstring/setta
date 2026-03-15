# Temporary Rewrite Completion Audit Plan

Drafted: `2026-03-14`
Last updated: `2026-03-15`

Purpose: determine from current code, registrations, callers, and executable
behavior whether the Go rewrite is actually complete.

This document is intentionally stricter than the other rewrite checklists. It
should answer the completion question from code and runtime evidence, not from
plan-doc optimism.

## Decision rule

Return exactly one verdict:

- `Complete`
- `Incomplete`
- `Cannot prove complete`

`Complete` requires repo-backed proof that every active backend/runtime surface
outside the explicit retained Python boundaries is Go-owned today.

`Incomplete` means at least one active backend capability, caller path, or
runtime owner still depends on Python outside an allowed retained boundary.

`Cannot prove complete` means the code audit found unresolved ambiguity or the
required runtime/test proof could not be executed. Missing proof does not count
as complete.

## Completion standard

Treat the rewrite as complete only if all of the following are true:

- Every active non-test frontend caller reaches a Go-owned transport/runtime or
  an explicit retained boundary.
- Every active packaged/default backend entrypoint resolves to Go-owned command
  and server behavior, except for explicitly retained Python wrappers.
- No active Python router, websocket handler, or service owns backend behavior
  outside the explicit retained boundaries.
- Every claimed retained Python boundary is real, narrow, and still required by
  current code or supported public API.
- Go test coverage plus black-box runtime proof match or exceed the meaningful
  product behavior previously covered by the Python backend/tests.
- No material backend subsystem remains unclassified.

If any one of these statements cannot be proven, do not return `Complete`.

## Explicit retained boundaries to verify

Start with the retained-boundary list in `CURRENT.md`, then verify each claim
in code rather than accepting the doc at face value:

- packaging/install entrypoints and wheel-facing wrappers, including
  `python -m setta`
- public Python APIs:
  - `setta.api.SettaListener`
  - `setta.api.ListenerHotReloader`
  - `setta.api.chat_toolkit`
  - share listener entrypoints that instantiate `SettaListener`
  - `setta.api.SettaRunner`
- retained Python listener boundary means the authoring/client surface only;
  local dependency-graph rebuilding, Python codegen, or generated-runtime
  fallback inside that client are not acceptable completion exceptions
- external tool/provider runtimes and generic stdio MCP servers intentionally
  executed by Go

Anything outside these verified exceptions is presumptively rewrite scope.

## Evidence sources

Use these as the audit source of truth:

- `caller-backed-backend-surface-checklist.md` for current caller reachability
- `backend-capability-coverage-checklist.md` for current runtime/service
  ownership
- `testing-strategy.md` for behavioral test-parity expectations
- active Go entrypoints/transports under `cmd/*`, `internal/httpapi/*`,
  `internal/wsapi/*`, and `internal/app/*`
- disputed Python runtime ownership under `backend/setta/*`

## Audit execution result

### Verdict

`Incomplete`

The remaining proof against completeness includes both active Python runtime
ownership and missing Go-native plugin parity. The targeted Go-owned parity
blockers found earlier in this audit have been fixed, but the rewrite still is
not complete.

### Current blocker set

- Active Python backend/runtime ownership still remains in the listener/share
  support tail, centered on:
  - `backend/setta/routers/project_manager.py`
  - `backend/setta/routers/listener.py`
  - `backend/setta/server_state.py`
  - `backend/setta/share/listener_runtime.py`
- Full backend plugin parity is still missing. The previous plugin backend
  feature set now needs Go-native replacements rather than product-level
  deletion, including backend routes/static assets, listener/runtime hooks,
  codegen targets, language-server integration, external-agent integration,
  richer backend runtime/status visibility, and the rest of the Go-native
  backend plugin runtime model.
- The rewrite is not complete until those paths are either removed, moved to
  Go, or narrowed to the documented retained Python SDK surface only, and until
  the missing backend plugin feature set is restored in Go.

### Current proven Go-owned surface

- Packaged/default startup and default dev startup/reload now route through
  Go-owned CLI/server entrypoints:
  - `cmd/setta/main.go`
  - `cmd/setta-server/main.go`
  - `backend/setta/entrypoint.py`
  - `frontend/backendStart.sh`
- Active HTTP and websocket registration are Go-owned:
  - `internal/app/*`
  - `internal/httpapi/*`
  - `internal/wsapi/*`
- The old Python startup/server stack and broad Python router surface have been
  cut back substantially.
- The old Python listener generated-runtime fallback is gone. Retained Python
  listener code is expected to stay on the authoring/client side only.
- Go now owns plugin-defined backend MCP tool registration, invocation, and
  mutation-time refresh for Go-backed backend plugins.

### Behavioral test-parity rule

- Parity is about product behavior, not Python-vs-Go implementation shape.
- Before deleting a Python test, classify it as either:
  - `dead-path coverage`: the test only covered a Python path with no remaining
    supported caller/runtime owner
  - `replacement coverage`: the behavior still matters and Go tests prove it
- If live behavior still matters and no Go test proves it yet, add the Go test
  before deleting the Python test.

## Maintenance rule

- Keep this file as a concise verdict and evidence summary.
- Do not append chronological cleanup notes here.
- Use git commit history for slice-by-slice rewrite detail.
