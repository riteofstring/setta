# Go-Owned Type Generation Cleanup Plan

## Goal
Make Go the source of truth for shared backend, frontend, and Python types.

That means:
- `backend/setta/types/` should contain very few handwritten files.
- Shared Go-owned types should be generated broadly, then pruned.
- The remaining handwritten Python types should be clearly Python-only.
- The Go backend should stay clean too: no duplicate Go definitions just to satisfy generation.

## Principles
- If a type already exists in a real Go backend owner package, reuse it.
- Do not replace one manual allowlist with another manual allowlist in a different file.
- Prefer package discovery plus pruning over hand-maintained type inventories.
- Route and endpoint specs may stay explicit when they are fundamentally route definitions rather than plain data-type discovery.
- Delete tests that only assert that specific generated type names appear in generated output.

## Current State

### Completed
- Go type discovery is no longer driven by a hand-maintained frontend root manifest.
- `cmd/setta-gen-go-type-registries` now generates:
  - `internal/frontendbindings/discovered_type_roots_gen.go`
  - `internal/pythonsdkcontracts/discovered_contract_types_gen.go`
- `internal/pythonsharedtypes/contracts.go` now widens from discovered Go-convertible types instead of maintaining a separate Python-side inventory.
- Go -> Python already follows a real generate-then-prune path:
  - `frontend/generation/generate_go_python_types.sh`
  - `backend/scripts/prune_generated_types.py`
- TypeScript pruning already exists and matches the main-branch cleanup model:
  - `pnpm full-cleanup`
  - `frontend/scripts/runKnip.mjs`
  - `pnpm gcf`
- `backend/setta/types/generated/` has been collapsed to a single real generated file:
  - `backend/setta/types/generated/go_shared_types.py`
- The dead Python-owned impl and union generation layer is gone:
  - removed `section_impls.py`
  - removed `code_obj_impls.py`
  - removed `core.py`
  - removed generated union wrappers
  - removed generated `effective_impls.py`
  - removed the dead Python generators that existed only to support those files
- Low-value tests that only pinned generated type inventories or specific generated names have already been removed.
- `project_config.py` has been reduced substantially:
  - most nested project-state data models now come from `go_shared_types.py`
  - the handwritten remainder is mainly Python-side defaults and codegen-policy resolution logic
- Go type discovery now handles selector-backed named wrappers generically, so generated registries can keep frontend-facing names while still pointing at real backend owner types.
- `cmd/setta-gen-go-type-registries` now also generates a generic frontend wrapper-override registry, and `internal/frontendbindings/converter.go` uses that instead of a hardcoded canonical-type switch.
- `internal/frontendbindings/project_state_support.go` now points a large part of the project-state surface at real owner structs instead of empty placeholder structs.
- `internal/frontendbindings/artifact_support.go` and `contracts.go` now use backend-owned wrapper types for the artifact/binary leaf contract family instead of repeating field layouts locally.
- parts of `internal/frontendbindings/ai_settings_support.go` now use backend-owned wrapper types for enum/env-status families instead of repeating local string enums and structs.
- the Go -> Python generator now treats `omitempty` fields as absent-capable unless an explicit Python default override is provided, so generated Python models stay aligned with Go JSON omission behavior.

### Remaining Handwritten Python Types
Current handwritten files in `backend/setta/types/`:
- `artifact.py`
- `chat.py`
- `chat_messages.py`
- `chat_stream_events.py`
- `chat_toolkit.py`
- `dependency_key.py`
- `dependency_value.py`
- `id.py`
- `listener.py`
- `project_config.py`
- `websocket.py`

Working assumption for the next passes:
- `id.py` is likely truly Python-only.
- parts of `listener.py` are likely truly Python-only.
- the remaining handwritten part of `project_config.py` is likely Python-only policy/default glue, not another large shared-model family.
- every other file must justify itself as Python-only or move toward Go ownership.

## What Is Still Wrong

### 1. Discovery is generated, but ownership still flows through mirror packages
The biggest remaining problem is no longer “there is a giant manual type list.”

The remaining problem is that too much of the shared type surface still flows through:
- `internal/frontendbindings/project_state_support.go`
- `internal/frontendbindings/ai_settings_support.go`
- related support files under `internal/frontendbindings/`

That is better than handwritten Python mirrors, but it still means `frontendbindings` is acting as an oversized type owner instead of a thin conversion layer over real backend owner packages.

This has improved for the project-state/view/windowing family and the artifact/binary leaf family, but not yet for the chat, dependency, and larger settings/config families.

### 2. TypeScript pruning exists, but it is cleanup-time, not a separate generator concern
The earlier plan was wrong to say TS pruning did not exist.

What actually exists today:
- generate broad TS output
- run cleanup via `pnpm full-cleanup`
- `runKnip.mjs` iteratively trims unused declarations from `frontend/src/utils/generatedTypes.ts`

So the remaining work is not “invent TS pruning.”
The remaining work is:
- keep the TS generation surface generic
- keep the generated output stable under cleanup
- decide whether the standard documented workflow is `generate` then `full-cleanup`, or whether some of that cleanup should move closer to the generation entrypoint

### 3. Go -> Python still leans on `frontendbindings` more than it should
`internal/pythonsharedtypes/contracts.go` now widens from discovered convertible Go types, which is good.

But it still discovers through the `frontendbindings` surface, plus enum fallback logic, which means the real owner packages are still not cleanly expressed for many type families.

### 4. There is still some duplicated type ownership inside Go
The frontend/Python cleanup is surfacing a few remaining “two Go packages define the same concept” cases.

Current known example:
- prompt format exists both as `internal/projectstate.PromptFormat` and `internal/prompttemplates.Format`

Those need to be collapsed deliberately instead of teaching the generators to arbitrate between multiple backend owners forever.

### 5. Some remaining Python files are still shared-contract candidates
The remaining handwritten Python files are much smaller and clearer than before, but several still look like shared contract families rather than Python-only helpers.

The main candidates are:
- `artifact.py`
- `chat.py`
- `chat_messages.py`
- `chat_stream_events.py`
- `dependency_key.py`
- `dependency_value.py`
- `websocket.py`

Secondary candidate:
- the remaining local wrapper content in `project_config.py`, if more of its defaults can move cleanly onto Go-owned models without adding duplicate Go definitions

Those files should either:
- disappear because the Python package no longer needs them, or
- move to Go ownership and generate into `go_shared_types.py`, or
- be proven Python-only with a concrete runtime reason

## Desired End State

### `backend/setta/types/`
Keep only:
- `id.py` if its Pydantic integration remains genuinely Python-specific
- the narrow Python runtime glue in `listener.py` if it cannot be expressed cleanly in Go
- a very small number of other files only if they are truly Python-only

Everything else should either:
- be generated from Go into `backend/setta/types/generated/go_shared_types.py`, or
- disappear entirely because it is no longer needed

### Go -> Python
- Discover convertible exported Go types generically from approved owner packages
- Generate one broad shared Python type module
- Run the Python prune script after generation
- Avoid per-type manual inventories except for narrow exclusions

### Go -> TypeScript
- Discover convertible exported Go types generically from approved owner packages
- Generate the canonical frontend outputs
- Continue to rely on the existing TS cleanup path after generation
- Keep only narrow semantic special cases in the converter

## Scope

### In scope
- Shrinking `backend/setta/types/` further
- Moving remaining shared type ownership toward real Go owner packages
- Reducing `frontendbindings` mirror ownership
- Keeping Go -> Python generic and broad
- Keeping Go -> TypeScript generic and broad
- Preserving the existing TS cleanup path while making the overall workflow cleaner
- Deleting any more dead generators, dead generated outputs, or low-value tests that are discovered

### Out of scope
- Introducing a new third schema language
- Preserving backward compatibility for old Python module paths
- Keeping Python-owned shared contracts just because they existed historically

## Execution Plan

### Phase 1: Reclassify the remaining handwritten Python files
For each remaining file in `backend/setta/types/`, make one decision:
- keep as Python-only
- move to Go ownership
- delete as unneeded

Default rule:
- if the file describes backend/runtime/project-state/shared-contract data, it should not stay handwritten in Python

Deliverable:
- a short explicit survivor list for the Python-only files

Expected likely survivors:
- `id.py`
- the Python-specific validation and binary-payload glue in `listener.py`

### Phase 2: Shrink `frontendbindings` as a type owner
Target files:
- `internal/frontendbindings/project_state_support.go`
- `internal/frontendbindings/ai_settings_support.go`
- other support files that define shared structs and enums only to feed conversion

Work:
- identify which definitions already have real backend owners elsewhere
- move ownership away from `frontendbindings` where it is only acting as a mirror
- prefer backend-owned named wrappers plus the generated wrapper-override registry over manual converter switches
- keep `frontendbindings` focused on conversion rules, route groups, endpoint specs, and generation helpers

Guardrail:
- do not create duplicate Go definitions while doing this

### Phase 3: Move the remaining shared Python families to Go ownership
Primary targets:
- `artifact.py`
- `chat.py`
- `chat_messages.py`
- `chat_stream_events.py`
- `dependency_key.py`
- `dependency_value.py`
- `websocket.py`
- any remaining reducible wrapper content in `project_config.py`

Work:
- find the real Go owner package for each family
- reuse existing Go definitions wherever they already exist
- only add new Go definitions where the concept is truly missing
- if multiple Go packages already define the same concept, collapse that ownership first instead of adding another generated workaround
- generate the Python surface from those Go owners
- prune unused generated output afterward

### Phase 4: Collapse the Python package surface further
After the Go owners exist:
- update Python imports to use `go_shared_types.py`
- delete the handwritten mirror files that become unnecessary
- rerun pruning and formatting

Success condition:
- `backend/setta/types/` contains only genuinely Python-only files plus `generated/go_shared_types.py`

### Phase 5: Stabilize the full generation plus cleanup workflow
Target scripts:
- `frontend/generation/generate.sh`
- `frontend/generation/generate_go_frontend_bindings.sh`
- `frontend/generation/generate_go_python_types.sh`
- `frontend/scripts/runKnip.mjs`
- `frontend/scripts/gcf.sh`

Work:
- document the intended standard workflow clearly
- keep `generate` broad and deterministic
- keep cleanup deterministic after generation
- avoid reintroducing dead generated files or manual mirrors

Open decision:
- whether TS cleanup should remain a separate cleanup step in the standard workflow, or whether some of it should move closer to the generation entrypoint

### Phase 6: Final cleanup
- remove stale docs that still point at deleted Python-owned types
- remove obsolete compatibility imports and dead code paths
- remove any remaining low-value generated-code tests that only pin names or inventories
- verify that `pnpm generate` and the standard cleanup flow produce stable output

## Concrete Work Order
1. Reclassify the remaining handwritten Python files.
2. Identify the biggest mirror-owner blocks in `internal/frontendbindings/`.
3. Move shared project-state and websocket/chat families toward real Go owners.
4. Regenerate Python and TypeScript output.
5. Run the existing prune and cleanup flow.
6. Delete any handwritten Python mirrors that become unnecessary.
7. Run focused verification.

## Verification
- `./scripts/go.sh test ./internal/gotypediscovery ./internal/frontendbindings ./internal/pythonsharedtypes ./internal/pythonsdkcontracts -count=1`
- `source activate.sh && cd frontend && pnpm generate`
- `cd frontend && pnpm full-cleanup`
- `source activate.sh && ./scripts/run_backend_tests.sh`
- `./scripts/run_go_tests.sh`

Add targeted frontend verification as generator ownership changes land.

## Acceptance Criteria
- New shared backend types do not require hand-appending large root inventories.
- `backend/setta/types/generated/` stays collapsed to a single generated shared-types file.
- `backend/setta/types/` no longer contains handwritten mirrors of Go-owned shared types.
- Go -> Python follows the broad pattern: discover, generate, prune.
- Go -> TypeScript follows the broad pattern: discover, generate, cleanup-prune.
- The remaining handwritten Python files have a concrete Python-only justification.

## Notes
- The earlier version of this plan was stale in two important ways:
  - it claimed TypeScript pruning was missing
  - it still listed handwritten Python files and generator layers that have already been deleted
- The main remaining problem is no longer “replace giant manual inventories.”
- The main remaining problem is “stop using mirror conversion packages as de facto type owners, and finish collapsing the remaining handwritten Python shared-contract files.”
