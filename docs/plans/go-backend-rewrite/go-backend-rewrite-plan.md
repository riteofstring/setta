# Go Backend Rewrite Plan

## Goal

Rewrite the backend from Python to Go as a clean break.

This was never a route-for-route port. The target was a Go-owned runtime for
the active product-facing backend surface, with explicit permission to drop
legacy route shapes, Python-shaped internals, and backward-compatibility
obligations that were not justified by a real caller.

## Current Outcome

As of `2026-03-10`, that rewrite is effectively complete for the current
clean-break scope.
That means the repo is no longer running a broad route-by-route migration
program; follow-on rewrite work must now be concrete and bounded.

Use these docs as the current source of truth:

- `CURRENT.md`
- `caller-backed-backend-surface-checklist.md`
- `backend-capability-coverage-checklist.md`
- `testing-strategy.md`
- `go-dependency-inventory-and-rationale.md`

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
- Do not preserve old route shapes just because the Python backend had them.

## Current Scope That Landed

For the active clean-break product surface, Go now owns:

- auth, mode policy, bootstrap, and live settings-state transport
- launcher, workspace launch, deployment runtime, and packaged CLI/server
  ownership
- realtime websocket transport, listener coverage reads, and terminal runtime
- project shell, project-state hydration, layout mutations, rename flow, code
  edit/format, LSP, and Watch Code
- MCP server/client/tooling plus the active caller-backed mutation surface
- active agentic runtime slices, managed chat/transcription ownership, and the
  bounded OpenAI-managed executor path
- plugin runtime reads, lifecycle mutations, backend route dispatch, backend
  MCP tools, and listener-endpoint wiring
- file browser, binary payloads, attachments, artifacts, and git reads

## Deliberate Boundaries

The remaining Python-owned or omitted surfaces are deliberate unless a concrete
issue selects new work:

- dev-only Python reload/server ownership
  - `python -m setta.dev_start`
  - `backend/setta/server.py`
- thin packaged Python dispatch into the Go CLI entrypoint
- explicit Python sidecars or tool executables still invoked by Go
- bounded AI/runtime limits
  - partial managed-provider parity
  - partial tool-preview parity
  - missing plugin-defined external-agent execution
- intentionally omitted legacy route families
  - detached runs
  - old CLI websocket routes
  - generic chat CRUD/metadata routes
  - large tails of old direct mutation/helper routes

## Selected Follow-On Work

The rewrite is still allowed to grow in narrow, source-of-truth-driven ways
when the current repo shape leaves Go-owned runtime/transport without a
matching Go-owned contract surface.

The currently selected follow-on is:

- Go-owned frontend binding generation for Go HTTP/websocket contracts
  - today, `frontend/src/utils/generatedEndpoints.ts` and
    `frontend/src/utils/generatedTypes.ts` are still generated from Python
    FastAPI/Pydantic metadata
  - that is acceptable only as a temporary repo state while Python still owns
    some caller-backed transport, but it is not the right long-term source of
    truth for routes/types whose active owner is Go
  - the goal is not to recreate every Python internal helper generator in Go
  - the goal is to give frontend-facing backend contracts a Go-owned source of
    truth wherever the transport/runtime owner is Go, so route/type generation
    cannot drift behind Go registrations
  - schema reflection from arbitrary Go structs should remain a tool, not the
    contract owner by default; keep the generated contract surface deliberate
    and explicit

## When To Open New Rewrite Work

Open a new rewrite slice only when at least one of these is true:

- an active caller or workflow is blocked by a Python-owned boundary
- a release/runtime issue exposes a real ownership gap
- tests show the current boundary is broken
- a product decision explicitly expands scope
- a selected infrastructure follow-on, such as Go-owned frontend binding
  generation, is ready to be executed as a bounded slice

Otherwise, treat further rewrite work as speculative cleanup and avoid opening
new numbered phase docs.
