# Go Frontend Binding Generation Plan

Use this doc when work touches frontend-facing Go HTTP or websocket contracts.

## Current Direction

The steady-state goal is one Go-owned source of truth for frontend routes,
endpoint wrappers, and TypeScript DTOs.

Current ownership:

- route constants live in `internal/httpapi` and `internal/wsapi`
- frontend binding specs, DTOs, converter rules, templates, and validation live
  in `internal/frontendbindings`
- the canonical generator entrypoint is `cmd/setta-gen-frontend-bindings`
- the canonical checked-in outputs are:
  - `frontend/src/utils/generatedRoutes.ts`
  - `frontend/src/utils/generatedTypes.ts`
  - `frontend/src/utils/generatedEndpoints.ts`

Preferred regeneration path:

- `pnpm -C frontend generate-go-frontend-bindings`

The old Python generators are not the source of truth for converted surfaces.

## Steady-State Rules

- One Go-owned boundary contract per frontend-facing endpoint.
- Every generated endpoint wrapper should be driven by an explicit spec that
  names:
  - method
  - route
  - path params
  - request contract
  - response contract
- If a runtime type does not convert cleanly, add a dedicated Go boundary DTO
  or converter rule.
- Fail generation on unsupported or ambiguous shapes.
- Do not silently generate placeholder `null`, empty declarations, or manual
  drift.
- Do not keep `generatedGo*` shadow outputs as a steady state.
- Do not add handwritten TypeScript request/response wrappers one route at a
  time.
- Do not keep Python-generated frontend contract artifacts alive just to
  support a mixed-source transition.

## Preferred Ownership Shape

- Go route constants stay in `internal/httpapi` and `internal/wsapi`.
- Frontend-facing contract types stay in explicit Go boundary declarations.
- Endpoint specs point at those route constants and boundary DTOs.
- The generator renders the canonical TypeScript files from those specs and
  DTOs.

The source of truth should not be:

- handler implementation bodies
- arbitrary runtime structs with extra semantics the frontend does not need
- raw TypeScript embedded beside placeholder Go types

## Converter Rules

The converter should stay small, explicit, and fail-closed.

- Prefer a narrow set of supported Go shapes with explicit conversion rules.
- Prefer named boundary DTOs over reflection-heavy magic.
- Add converter support only when it is reusable and reviewable.
- Treat raw TypeScript as temporary debt only when a bounded slice cannot yet
  be expressed.

When widening the converted surface:

1. Identify the active caller and current Go route/websocket.
2. Add or reshape the Go boundary DTO/spec.
3. Extend the converter only if the rule is reusable.
4. Regenerate the canonical frontend outputs.
5. Cut callers over to the generated surface.
6. Extend validation tests/manifests.

## Current Validation Expectations

`internal/frontendbindings` should continue to prove all of these:

- the checked-in canonical generated files match current generator output
- generated outputs compile against the real frontend support boundary
- route inventory coverage matches the Go source of truth
- endpoint-contract inventory changes are explicit and reviewable
- additional declarations and type roots stay explicit and reviewable
- shadow generated outputs do not reappear under `frontend/src`
- non-test frontend code does not re-import Python-owned contract artifacts
- narrowed boundary modules stay narrow

The main validation entry points are:

- `internal/frontendbindings/generator_test.go`
- `internal/frontendbindings/validation_test.go`
- manifests under `internal/frontendbindings/testdata/`

## Intentional Exception

The remaining explicit nongenerated request-helper exception is the dynamic
Setta API action path in
`frontend/src/components/Section/Layouts/settaApiAction.ts`.

That exception exists because the feature still allows arbitrary custom route
strings in addition to preset routes. Do not widen that exception into a
general escape hatch.

## Working Rules

- Keep transport wrappers thin.
- Keep the generated surface deliberate and reviewable.
- Prefer Go DTOs plus converter rules over handwritten TypeScript.
- Prefer widening the reusable generator pipeline over adding one-off branches.
- If a contract cannot be represented robustly yet, stop and fix the Go
  boundary shape instead of hand-writing TypeScript around it.

## Non-Goals

- reflecting arbitrary Go runtime internals directly into frontend types
- recreating dormant Python-only helper surfaces without a caller
- preserving Python route naming or wrapper shape when current callers do not
  need it
- replacing every consumer in one pass if a bounded cutover is clearer

## Closeout Condition

This slice is done when frontend-facing Go transport contracts are generated
from Go-owned specs/DTOs, current callers use the canonical generated files,
the validation suite locks the boundary, and no parallel Python-owned or shadow
generated contract surface remains.
