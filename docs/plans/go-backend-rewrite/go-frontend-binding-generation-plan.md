# Go Frontend Binding Generation Plan

## Purpose

Execute the selected follow-on from `CURRENT.md`: move frontend-facing Go
HTTP/websocket contracts onto a Go-owned source of truth using a real
Go-to-TypeScript conversion pipeline, not handwritten TypeScript emitters.

## Why This Slice Is Open Now

- The broad-coverage checklist still marks frontend backend-contract binding
  generation as Python-owned even for Go-owned transports.
- The repo already has a proven Python pattern for this problem:
  `frontend/generation/convert_pydantic_to_js.py` and
  `frontend/generation/convert_endpoints.py`.
- The rewrite needs the Go equivalent of that pattern, not a growing pile of
  route-by-route TS string assembly.

## Working Decision

Use explicit Go contract types plus explicit endpoint specs, then convert those
Go definitions into TypeScript in a reusable generator pipeline.

This follow-on does not permit:

- handwritten TS wrappers added one route at a time
- handwritten TS request/response type definitions added one route at a time
- per-route string-builder emission as the primary generator architecture

If a Go runtime type is not suitable for stable frontend generation, introduce
a dedicated Go contract type for the frontend boundary and convert that type.

## Generator Shape

The Go-side generator should mirror the roles of the current Python generators:

- route constants generation
  - source of truth: Go route constants under `internal/httpapi` and
    `internal/wsapi`
- endpoint wrapper generation
  - source of truth: explicit Go endpoint specs including method, route, and
    request/response types
- type generation
  - source of truth: explicit Go contract types converted into TypeScript

Expected outputs:

- `frontend/src/utils/generatedGoRoutes.ts`
- `frontend/src/utils/generatedGoTypes.ts`
- `frontend/src/utils/generatedGoEndpoints.ts`

## Initial Slice

Start by proving the converter pipeline on a small but real Go-owned surface:

- current Go websocket route constants
- current Go status/meta route constants
- the status/meta endpoint cluster and its request/response contract types

This is intentionally small enough to validate the generator architecture
before widening it across more caller-backed Go routes.

## Rules

- Prefer explicit Go contract types over reflection on arbitrary runtime
  structs.
- Prefer converter rules and reusable rendering over ad hoc output assembly.
- Keep transport wrappers thin.
- Keep the generated surface deliberate and reviewable.
- When widening coverage, reuse the converter pipeline instead of adding
  one-off generator branches.

## Non-Goals

- replacing every `generatedTypes.ts` consumer in one pass
- recreating dormant Python-only helper surfaces without a caller
- reflecting arbitrary Go runtime internals directly into frontend types
- preserving Python route naming or wrapper shape when no current caller needs
  it
