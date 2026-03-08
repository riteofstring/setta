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
- The rewrite does not need to keep the app continuously working while Python
  boundaries are being removed; prefer severing frontend/backend ties to Python
  over maintaining temporary mixed-source compatibility.
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
- Do not preserve Python-generated frontend contract artifacts just to keep a
  partial mixed Go/Python frontend working during the rewrite.

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
  - build a converter-style pipeline analogous to the existing
    Python-to-TypeScript generators, driven by explicit Go contract types and
    endpoint specs
  - sever frontend ties to Python-generated backend bindings rather than
    maintaining a parallel mixed-source steady state
  - replace the canonical generated frontend contract files instead of keeping
    long-lived `generatedGo*` shadow outputs
  - do not land handwritten TS emitters or endpoint-by-endpoint string-builder
    wedges as the follow-on implementation
  - if a runtime type does not convert cleanly, add a dedicated Go contract
    type or converter rule instead of hand-writing TS for that route
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
