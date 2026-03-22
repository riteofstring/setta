# Go-Owned Type Generation Cleanup Plan

## Goal
Make Go the source of truth for shared backend/frontend/Python types.

That means:
- `backend/setta/types/` should contain almost no handwritten shared-contract files.
- Go -> TypeScript generation should discover convertible Go types generically, then prune unused generated output.
- Go -> Python generation should discover convertible Go types generically, then prune unused generated output.
- The only handwritten Python types left should be genuinely Python-only runtime helpers.

## Principles
- Do not keep duplicate shared type definitions in Python if the Go backend already owns the concept.
- Do not replace one manual allowlist with another manual allowlist in a different file.
- Prefer package-level discovery plus prune over hard-coded root manifests.
- Keep the Go backend clean too: if a type already exists in Go, reuse it instead of introducing a second Go definition just to satisfy generation.
- Delete tests that only assert that specific generated type names appear in generated output.

## Current Problems

### 1. Go -> TypeScript is still driven by a giant explicit inventory
`internal/frontendbindings/specs.go` still has a very large hand-maintained
`reflect.TypeOf(...)` list. That means the generator is still operating as:

- "convert this, this, this, this"

instead of:

- "discover convertible types from the backend packages, generate them, then prune what nobody uses"

### 2. Go -> Python is still driven by explicit contract inventories
`internal/pythonsharedtypes/contracts.go` and
`internal/pythonsdkcontracts/contracts.go` still define the generation surface
by hand. That is cleaner than the old Python-owned path, but it is still a
manual root list.

### 3. Handwritten Python types still exist where Go should own the shape
`backend/setta/types/` is much smaller than before, but several remaining files
still represent backend data structures that should ultimately come from Go.

The biggest remaining handwritten shared-type owners are:
- `backend/setta/types/section_impls.py`
- `backend/setta/types/code_obj_impls.py`
- `backend/setta/types/project_config.py`
- `backend/setta/types/chat.py`
- `backend/setta/types/chat_messages.py`
- `backend/setta/types/chat_stream_events.py`
- `backend/setta/types/artifact.py`
- `backend/setta/types/dependency_key.py`
- `backend/setta/types/dependency_value.py`
- `backend/setta/types/websocket.py`

### 4. Generation is centralized, but discovery is not
`frontend/generation/generate.sh` is already close to the right orchestration
shape. The remaining problem is the discovery logic behind the generators, not
the top-level shell entrypoint.

## Desired End State

### `backend/setta/types/`
Keep only files that are truly Python-only, for example:
- `id.py` if its Pydantic/schema integration is still Python-specific
- narrow runtime glue in `listener.py` if it cannot be expressed cleanly in Go

Everything else should either:
- be generated from Go into one generated Python module, or
- disappear entirely because it is no longer needed

### Go -> Python
- Generic discovery of convertible exported Go types from approved backend packages
- Single generated Python type module for shared Go-owned types
- Python prune step runs after generation
- No manual "generate these specific shared types" inventory except for a small set
  of explicit exclusions or package registration points if discovery truly needs them

### Go -> TypeScript
- Generic discovery of convertible exported Go types from approved backend packages
- Generated frontend types/routes/endpoints remain the consumer-facing outputs
- TS output still supports explicit special cases only where the converter truly
  needs additional semantic help, not as the normal ownership model
- Pruning/cleanup remains part of the workflow after generation

## Scope

### In scope
- Generic discovery for Go -> Python shared types
- Generic discovery for Go -> TypeScript shared types
- Migrating remaining backend data-structure types out of handwritten Python
- Deleting dead generator scripts and dead generated artifacts
- Deleting low-value generated-code inventory tests

### Out of scope
- Inventing a new third schema language
- Preserving backward compatibility for old Python type module paths
- Keeping Python reflection-based ownership just because it already exists

## Execution Plan

### Phase 1: Lock down the ownership rule
Define and apply a hard rule:

- If a type describes backend/runtime/project-state/frontend-contract data and
  already exists in Go, Go owns it.
- If a type is only for Python runtime behavior, Python may own it.

Deliverable:
- a short allowlist of truly Python-only files in `backend/setta/types/`

Expected survivors:
- `id.py`
- possibly parts of `listener.py`

Everything else must justify itself or move.

### Phase 2: Replace explicit Go -> Python root inventories with discovery
Target files:
- `internal/pythonsharedtypes/contracts.go`
- `internal/pythonsdkcontracts/contracts.go`
- `internal/pythonsharedtypes/generator.go`
- `internal/pythonsdkcontracts/generator.go`

Work:
- Add package-level discovery for exported convertible types.
- Discover enums/models from approved Go packages rather than hard-coding each type.
- Keep a small explicit exclusion mechanism for unsupported or intentionally private types.
- Keep route/endpoint generation separate where the source of truth is an endpoint spec,
  not a plain type scan.

Success condition:
- removing a manual type from the current Go inventory should not be necessary
  for new shared types to generate

### Phase 3: Replace explicit Go -> TypeScript root inventories with discovery
Target files:
- `internal/frontendbindings/specs.go`
- `internal/frontendbindings/converter.go`
- related support files under `internal/frontendbindings/`

Work:
- Replace the huge `CurrentAdditionalTypeRoots()` manifest with package/module discovery.
- Preserve explicit route spec ownership for endpoints.
- Preserve explicit converter-side semantic rules only where discovery alone is not enough
  (for example discriminated unions or custom render behavior).
- Keep the generated frontend output stable enough that existing compile/build tests still matter.

Success condition:
- the generator no longer requires continuously appending `reflect.TypeOf(...)`
  entries for ordinary shared backend types

### Phase 4: Move the impl families to Go ownership
This is the major structural step.

Target domains:
- section impls
- code obj impls
- project config
- websocket/shared message families

Target files likely to shrink or disappear:
- `backend/setta/types/section_impls.py`
- `backend/setta/types/code_obj_impls.py`
- `backend/setta/types/project_config.py`
- `backend/setta/types/websocket.py`

Work:
- identify the real Go owner packages for these type families
- reuse existing Go definitions when they already exist
- only add Go definitions where the concept is currently Python-owned and truly missing
- generate Python and TypeScript from those Go owners
- prune unused generated types

Guardrail:
- do not create duplicate Go definitions for the same concept under different packages

### Phase 5: Collapse Python shared types into generated output
After the Go owners exist and generic discovery is in place:

- generate the full shared Python surface into one generated module
- update imports to consume generated Go-owned types
- delete the handwritten Python files that become pure mirrors
- rerun prune so unused generated names disappear automatically

Success condition:
- `backend/setta/types/` contains only Python-only files plus a very small number
  of wrappers if absolutely required during transition

### Phase 6: Delete dead compatibility layers and dead tests
Remove:
- dead generated wrappers
- dead generator scripts
- tests that assert specific generated type names exist
- tests that only snapshot type inventories without exercising behavior

Keep:
- converter behavior tests
- compile/build/golden tests that validate structure or semantics
- prune-script tests
- runtime compatibility tests

### Phase 7: Final cleanup pass
- remove stale docs that still point at deleted Python-owned types
- remove obsolete imports and compatibility shims
- ensure `pnpm generate` and cleanup commands produce stable output
- ensure the repo no longer recreates deleted handwritten Python mirrors

## Concrete Work Order
1. Finish the plan doc and use it as the checklist.
2. Audit and replace `internal/pythonsdkcontracts/contracts.go` discovery first.
3. Audit and replace `internal/pythonsharedtypes/contracts.go` discovery next.
4. Replace `internal/frontendbindings/specs.go` type-root manifest with package discovery.
5. Migrate `section_impls` and `code_obj_impls` ownership into Go.
6. Migrate `project_config` and websocket/shared message families into Go.
7. Delete remaining handwritten Python mirrors.
8. Run generation and prune.
9. Run focused Go, Python, and frontend verification.

## Verification
- `./scripts/go.sh test ./internal/frontendbindings ./internal/pythonsharedtypes ./internal/pythonsdkcontracts -count=1`
- `source activate.sh && cd frontend && pnpm generate`
- `source activate.sh && ./scripts/run_backend_tests.sh`
- `./scripts/run_go_tests.sh`

Add targeted frontend verification once the TS generator changes start landing.

## Acceptance Criteria
- New shared backend types do not require hand-appending explicit root entries to
  large generation inventories.
- `backend/setta/types/` no longer contains handwritten mirrors of Go-owned backend types.
- Go -> Python and Go -> TypeScript generation both follow the same broad pattern:
  discover, generate, prune.
- The remaining handwritten Python files have a clear Python-only justification.

## Notes
- The main branch already demonstrated the right general idea on the Python side:
  broad conversion first, prune later. This plan keeps that shape while moving the
  source of truth to Go.
- Route and endpoint specs are still allowed to stay explicit where they are
  fundamentally route definitions rather than plain data-type discovery.
