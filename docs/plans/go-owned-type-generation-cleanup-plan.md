# Go-Owned Type Generation Cleanup Plan

## Goal
Make Go the source of truth for shared backend, frontend, and Python types.

This plan covers shared type/schema ownership. It is separate from
"Go-backed Python" runtime ownership:

- Go-owned/generated Python types mean Python consumes Go-authored contracts.
- Go-backed Python means canonical local behavior in the retained Python SDK is
  delegated to Go, either through the running backend or the `sdk-local-core`
  subprocess path.

Status: complete for the current cleanup scope.

## Current Owner Model

- Go backend packages own shared contracts, validation-relevant structure,
  derived metadata, and generated downstream surfaces.
- `backend/setta/types/generated/` contains the generated shared Python surface:
  `go_shared_types.py` and `go_shared_constants.py`.
- Handwritten files under `backend/setta/types/` are limited to Python-only
  runtime glue:
  - `id.py`: Pydantic-specific `ID` integration and local ID factories.
  - `protocol.py`: dependency-key/value glue, frozen/hashable keys, and
    discriminated-union adapters used by generated SDK contracts.
  - `chat.py`: chat/runtime message and container union coercion used by the
    chat toolkit.
  - `artifact.py`: artifact union/type-adapter boundary used by listener
    runtime code.
- `internal/frontendbindings` is generator infrastructure and non-HTTP frontend
  contract support, not a domain contract owner.
- HTTP callers use the OpenAPI-generated client/types.
- Non-HTTP frontend and Python surfaces use Go-owned generation, broad
  discovery, and pruning/cleanup.

## Principles

- Reuse real Go owner packages for shared data.
- Prefer package discovery plus pruning over hand-maintained type inventories.
- Keep route and endpoint specs explicit when they are route definitions rather
  than plain data-type discovery.
- Keep handwritten Python code only for Python-only runtime concerns.
- Do not add duplicate Go definitions to satisfy generation.
- Do not keep alternate aliases for generated Python model names.
- Delete tests that only assert specific generated type names or inventories.

## Remaining Follow-Ups

### 1. Keep Mirror Ownership Out Of `frontendbindings`

`frontendbindings` can wrap or expose owner-backed metadata, but shared
contracts should live in the real backend owner package:

- HTTP route contracts under `internal/httpapi`.
- Websocket transport contracts under `internal/wsapi` or the real runtime
  owner.
- Project-state contracts under `internal/projectstate` or
  `internal/projectview`.

### 2. Keep Python Shared Types Generated

The Python shared surface should continue to follow this pattern:

- discover convertible exported Go types from approved owner packages
- generate one broad shared Python type module
- prune unused generated output
- keep only Python-only files beside the generated modules

### 3. Keep TypeScript Generation Generic

The TypeScript shared surface should continue to follow this pattern:

- discover convertible exported Go types from approved owner packages
- generate canonical frontend outputs
- run the standard cleanup/prune workflow
- keep only narrow semantic special cases in the converter

### 4. Collapse Duplicate Go Owners First

When two Go packages define the same shared concept:

- collapse backend ownership first
- point frontend/Python generation at the surviving owner
- avoid teaching generators to arbitrate between multiple backend owners

## Desired End State

### `backend/setta/types/`

Keep only:

- generated shared types/constants
- `id.py` while its Pydantic integration is Python-specific
- other files only when they are clearly Python-only runtime glue

Everything else should be generated from Go or deleted.

### Generation Workflow

- Go -> Python: discover, generate, prune.
- Go -> TypeScript: discover, generate, cleanup-prune.
- HTTP frontend client/types: generated from OpenAPI.
- Non-HTTP route/constants/default/value surfaces: generated from Go-owned
  metadata or exported values.

## Verification

Use focused verification for the package families touched by generation
ownership work:

- `./scripts/go.sh test ./internal/gotypediscovery ./internal/frontendbindings ./internal/pythonsharedtypes ./internal/pythonsdkcontracts -count=1`
- `source activate.sh && cd frontend && pnpm generate`
- `cd frontend && pnpm full-cleanup`
- `source activate.sh && ./scripts/run_backend_tests.sh`
- `./scripts/run_go_tests.sh`

Add targeted frontend verification when generated frontend callers or contract
semantics change.

## Acceptance Criteria

- Shared backend types do not require hand-appending large root inventories.
- `backend/setta/types/generated/` stays collapsed to a minimal generated shared
  surface.
- `backend/setta/types/` contains only generated modules plus Python-only
  runtime glue.
- Go -> Python follows the broad discover/generate/prune pattern.
- Go -> TypeScript follows the broad discover/generate/cleanup-prune pattern.
- Remaining handwritten Python files have concrete Python-only justification.
