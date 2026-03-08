# Go Backend Rewrite Plan

## Goal

Rewrite the backend from Python to Go as a clean break.

This was never a route-for-route port. The target is a Go-owned runtime for
the active product-facing backend surface, with explicit permission to drop
legacy route shapes, Python-shaped internals, and backward-compatibility
obligations that are not justified by a real caller.

## Working Source-of-Truth Docs

Use these docs when evaluating rewrite rules, caller reachability, backend
ownership, tests, and dependency choices:

- `CURRENT.md`
- `caller-backed-backend-surface-checklist.md`
- `backend-capability-coverage-checklist.md`
- `testing-strategy.md`
- `go-dependency-inventory-and-rationale.md`
- `docs/reference/dependencies/`

Historical phase planning, reranks, closeouts, and spikes live under
`archive/`.

## Rewrite Rules

- No backward-compatibility work is required unless a current caller or release
  path actually needs it.
- Prefer explicit runtime ownership, typed boundaries, and deterministic source
  of truth over Python-era incidental behavior.
- Prefer robust implementations over heuristics when provider/runtime metadata
  or explicit protocol/state exists.
- Prefer the Go stdlib or well-established libraries.
- For Go-owned OpenAI API interactions, use
  `github.com/openai/openai-go/v3` at the provider edge rather than
  hand-rolled HTTP or WebSocket clients.
- If a required OpenAI surface is not covered cleanly by `openai-go`, treat
  that as an explicit planning decision instead of silently adding bespoke
  transport code.
- Do not preserve old route shapes just because the Python backend had them.

## How To Use This Doc Set

- Use `caller-backed-backend-surface-checklist.md` for "does the active caller
  reach Go?" questions.
- Use `backend-capability-coverage-checklist.md` for broader runtime/service
  ownership questions.
- Read current code and registration wiring alongside the checklists when
  ownership is ambiguous.
- Use `archive/` for historical phase detail, not as a replacement for the
  working docs above.

## Selected Follow-On Work

- Go-owned frontend binding generation for Go HTTP/websocket contracts
  - give frontend-facing backend contracts a Go-owned source of truth wherever
    transport/runtime ownership is Go
  - do not recreate every Python internal helper generator in Go
  - keep generated contract surfaces deliberate and explicit
  - schema reflection from arbitrary Go structs should remain a tool, not the
    default contract owner
- Converge Go-owned OpenAI API interactions on `github.com/openai/openai-go/v3`
  - apply this at the provider edge for managed chat, transcription, realtime,
    and later Go-owned OpenAI provider surfaces
  - keep the SDK behind internal adapters so frontend/runtime contracts stay
    Go-owned rather than SDK-owned
  - do not broaden bespoke OpenAI HTTP/WebSocket clients further by default

## When To Open New Rewrite Work

Open a new rewrite slice only when at least one of these is true:

- an active caller or workflow is blocked by a Python-owned boundary
- a release/runtime issue exposes a real ownership gap
- tests show the current boundary is broken
- a product decision explicitly expands scope
- a selected infrastructure follow-on, such as Go-owned frontend binding
  generation or `openai-go` convergence for Go-owned OpenAI edges, is ready to
  be executed as a bounded slice

Otherwise, do not open a new numbered phase doc.
