# Frontendbindings OpenAPI Replacement Plan

## Goal

Stop maintaining bespoke Go -> TypeScript HTTP conversion logic.

The HTTP contract path should become:

- Go-authored backend route registration with explicit typed metadata
- OpenAPI 3.1 as the generated artifact
- standard OpenAPI client/type generation for frontend HTTP callers
- `internal/frontendbindings` reduced to the non-HTTP leftovers that OpenAPI
  does not cover, such as websocket payloads, frontend constants, and a small
  amount of owner-provided TS metadata

This is not another cleanup pass on the current endpoint discovery logic. The
goal is to delete the custom HTTP endpoint conversion path.

## Chosen Stack

Default architecture:

- Backend HTTP contract layer: `Huma` on top of the Go backend
- Contract artifact: generated `OpenAPI 3.1`
- Frontend HTTP generation: standard OpenAPI generator, default
  `@hey-api/openapi-ts`

Why this stack:

- it keeps Go as the source of truth
- it makes endpoint metadata explicit instead of inferred from handler bodies
- it replaces custom Go -> TS HTTP conversion with a standard ecosystem path
- it still fits the current HTTP/JSON browser architecture better than a full
  RPC/protobuf rewrite

If `Huma` proves concretely incompatible with required `chi` registration or
middleware flows, the fallback is:

- explicit typed route registration in `internal/httpapi`
- a standard OpenAPI emitter

The fallback still must produce OpenAPI and still must delete AST-based handler
inference. It is not permission to keep `internal/frontendbindings` as a custom
endpoint compiler.

## Non-Goals

- Do not migrate websocket transport to OpenAPI.
- Do not do a Connect RPC / protobuf rewrite in this effort.
- Do not preserve the current generated TypeScript or Python surfaces for
  compatibility.
- Do not keep a custom HTTP endpoint converter in parallel "temporarily" after
  the OpenAPI path is working.

## Design Rules

- Go remains the source of truth for HTTP contracts and behavior.
- OpenAPI is the artifact for HTTP contracts, not a second handwritten source.
- HTTP route definition and HTTP contract metadata must be declared once, at the
  route registration site.
- Do not define runtime routes in one place and maintain separate doc-only
  metadata somewhere else.
- Do not maintain handwritten endpoint inventories, route manifests, or AST
  handler-body inference for HTTP generation.
- Do not write a second custom OpenAPI generator when a standard backend layer
  or library can emit the schema.
- Do not preserve old generated names with compatibility shims. Change callers.
- Do not reintroduce per-endpoint wrappers in `generatedEndpoints.ts`.
- A small transport adapter is acceptable only if it configures the generated
  client once. It must not enumerate endpoints or restate schemas.
- Keep custom generation only for surfaces OpenAPI does not cover:
  websocket contracts, frontend constants, and a small true-exception type
  layer.

## Target Shape

After this migration:

- `internal/httpapi` owns HTTP operation registration and HTTP contract metadata
- `/api/openapi.json` is a real backend output and testable artifact
- frontend HTTP types and endpoint functions come from standard OpenAPI
  generation
- `internal/frontendbindings` no longer discovers or names HTTP endpoints
- `internal/frontendbindings` no longer owns HTTP request/response type naming
  policy
- the remaining `internal/frontendbindings` package is limited to non-HTTP
  frontend contract generation

Expected surviving custom generator scope:

- websocket message types under `internal/wsapi`
- frontend constants/defaults/value exports from Go owners
- narrow owner-provided TS expression or union metadata for true reflection gaps

Expected deleted custom generator scope:

- `internal/frontendbindings/endpoint_discovery.go`
- HTTP route-name inference used only for generated endpoints
- HTTP operation-name inference used only for generated endpoints
- HTTP endpoint wrappers produced from custom Go-side templates

## Phase 0: Freeze The Architecture

Before refactoring:

- declare that HTTP endpoint generation is moving to OpenAPI
- declare that `internal/frontendbindings` is no longer allowed to own HTTP
  endpoint discovery
- declare the chosen frontend generator and runtime integration approach
- explicitly separate HTTP contract generation from websocket/default/constant
  generation

Deliverables:

- this plan
- a dedicated Codex loop for the OpenAPI migration

## Phase 1: Make HTTP Operation Metadata Explicit

Stop inferring HTTP endpoint metadata from handler bodies.

Replace the current implicit model with one explicit registration path in
`internal/httpapi` that includes:

- operation id
- method
- path
- path params type, if any
- request body type, if any
- response type
- binary or multipart policy
- auth and mode requirements when relevant

Preferred implementation:

- register operations through `Huma` while preserving existing backend behavior
  and middleware requirements

Fallback only if required:

- typed `internal/httpapi` descriptors that feed a standard OpenAPI emitter

Rules:

- operation ids are authoritative and become generated frontend function names
- do not derive operation ids from AST heuristics
- do not let `openapi_document_builder.go` or any similar file become a second
  manifest of route metadata
- if one shared registration path cannot directly serve both runtime and
  OpenAPI, use typed descriptors consumed by both; do not duplicate route
  declarations
- do not keep the old route/endpoint discovery path alive once the new one
  covers a route family

## Phase 2: Emit A Real OpenAPI Artifact

Produce a real backend-authored OpenAPI document from the explicit HTTP
registration layer.

Requirements:

- serve `/api/openapi.json`
- generate a checked-in OpenAPI artifact for frontend code generation if needed
- model binary upload/download and multipart intentionally instead of hiding
  them behind bespoke endpoint overrides
- model discriminated unions deliberately where plain reflection is not enough

Rules:

- use OpenAPI features and explicit schema metadata for union-heavy cases
- do not push that complexity back into `internal/frontendbindings`
- if a schema needs custom shaping, put it on the Go owner or operation schema,
  not in a frontend compatibility table
- fake service implementations used only for doc generation are not an end
  state; treat them as temporary scaffolding and delete or replace them with
  shared typed descriptors as soon as practical

## Phase 3: Generate Frontend HTTP Types And Client From OpenAPI

Replace the current custom HTTP `generatedEndpoints.ts` and HTTP type emission
with standard OpenAPI generation.

Default frontend stack:

- `@hey-api/openapi-ts` for types plus SDK functions

Acceptable alternative:

- another standard OpenAPI generator with emitted endpoint functions, if it
  materially fits the repo better

Rules:

- generated frontend endpoint functions must come from operation ids
- frontend callers must be updated to the generated client instead of preserving
  the old custom helpers
- a thin shared transport configuration layer is allowed
- do not add handwritten per-endpoint wrappers around the generated client

Success bar:

- frontend HTTP callers no longer depend on `internal/frontendbindings`
  endpoint discovery or templates
- the number of real imports of `frontend/src/utils/generatedEndpoints.ts`
  keeps decreasing as route families migrate

## Phase 4: Delete HTTP Logic From `internal/frontendbindings`

Once the OpenAPI path exists, remove the old HTTP-specific custom generator
pieces.

Delete:

- AST endpoint discovery
- custom HTTP route naming logic used only for frontend endpoints
- custom HTTP endpoint templates
- custom HTTP endpoint tests that only validate the deleted generator path

Deletion rule:

- when a route family migrates to OpenAPI, remove that family from the old
  `internal/frontendbindings` HTTP path in the same batch or the very next one;
  do not let both systems carry the same family for long

Keep only if still needed outside HTTP:

- generic type rendering for websocket/default/constant surfaces
- owner metadata hooks for true TS expression or union gaps

Success bar:

- `internal/frontendbindings` is no longer on the HTTP critical path

## Phase 5: Narrow The Remaining Custom Generation

After HTTP migration, trim the remaining custom layer aggressively.

Allowed remaining scope:

- websocket payload contracts
- frontend constants and value exports
- owner-backed defaults needed by frontend-only helpers
- true reflection exceptions for non-HTTP contracts

Disallowed remaining scope:

- endpoint discovery
- route naming inference for HTTP
- per-type HTTP request/response compatibility hacks
- recreating OpenAPI-generated surfaces inside `generatedTypes.ts`

## Phase 6: Adapt Downstream Callers

Update downstream frontend and Python code to the new generated surfaces.

Rules:

- do not preserve legacy generated names
- delete dead helpers immediately
- prefer mechanical caller updates over compatibility layers

Python guidance:

- if Python needs HTTP client generation, source it from the same OpenAPI
  artifact
- do not let Python client choice block the HTTP/OpenAPI migration
- non-HTTP shared Python type generation can remain Go-owned and separate

## Verification Strategy

For backend registration and schema work:

- focused `./scripts/go.sh test` on touched `internal/httpapi` packages
- tests that confirm the backend emits the expected OpenAPI artifact or serves
  `/api/openapi.json`

For frontend generation work:

- regenerate
- focused frontend Vitest runs for touched callers
- `pnpm -C frontend exec tsc --noEmit`

For deletion work:

- verify removed custom generator paths are no longer referenced
- do not replace them with equivalent metadata tables elsewhere
- track the count of live frontend imports of `utils/generatedEndpoints` and
  keep driving it down

Always run:

- `./gcf.sh`
- `./check_quality.sh`

## Acceptance Criteria

The plan is complete only when all of these are true:

- HTTP operation metadata is explicit and backend-owned
- `/api/openapi.json` is real
- frontend HTTP generation comes from a standard OpenAPI tool
- `internal/frontendbindings` no longer discovers or renders HTTP endpoints
- frontend callers use the OpenAPI-generated HTTP client
- no handwritten HTTP compatibility layer replaces the deleted generator
- the remaining `internal/frontendbindings` package is limited to non-HTTP
  frontend contract generation
