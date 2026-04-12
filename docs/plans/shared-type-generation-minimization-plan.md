# Shared Type Generation Schema Migration Plan

## Goal

Replace the remaining bespoke non-HTTP Go -> TypeScript / Go -> Python shared
type generation logic with a standard schema-based path.

This plan is specifically about:

- `frontend/src/utils/generatedTypes.ts`
- `backend/setta/types/generated/go_shared_types.py`

The chosen direction is:

- Go emits one canonical non-HTTP shared-model IR as `JSON Schema 2020-12`
- Go also emits one small semantic sidecar for facts schema does not express
  well enough on its own
- standard generators consume that IR for TypeScript and Python

This does not reopen the HTTP problem. HTTP stays on OpenAPI.

## Why This Is The Right Next Step

The OpenAPI loop already removed the worst architectural problem:

- bespoke HTTP endpoint generation is gone
- HTTP clients now come from OpenAPI
- the remaining custom generator surface is concentrated in shared model
  generation

That means the remaining problem is now mostly:

- structural shared models and enums
- naming policy
- discriminated-family modeling
- defaults / `createX(...)` helpers
- exported runtime values / inventories
- Python-only handwritten inventories and overrides

Those are exactly the kinds of things that benefit from a schema IR plus a
small semantic sidecar.

## Chosen Architecture

Canonical non-HTTP shared-model path:

- backend-owned source: Go types and Go owner metadata
- canonical generated artifact: `JSON Schema 2020-12`
- semantic companion artifact: small Go-generated sidecar manifest
- Python generation: standard schema-driven generator
- TypeScript generation: standard schema-driven generator, or a Go-generated
  OpenAPI 3.1 projection only if it materially improves TS union/name output

The sidecar exists only for semantics that schema does not express reliably
enough by itself, such as:

- constructor defaults / `createX(...)` semantics
- exported runtime values and constants
- small inventories that are not just model shape
- truly semantic discriminated-family metadata

## Non-Goals

- Do not reopen or redesign the HTTP/OpenAPI endpoint path.
- Do not do a protobuf/RPC/IDL rewrite.
- Do not preserve the current generated TS/Python API for compatibility.
- Do not keep two target-specific custom structural model generators in
  parallel after the schema path is working.
- Do not force schema `default` to serve as a full constructor mechanism.

## Design Rules

- Go remains the source of truth.
- JSON Schema is the canonical non-HTTP shared-model IR.
- If TypeScript ergonomics require it, OpenAPI 3.1 may be used as a projection
  from the Go-owned schema/sidecar path, not as the canonical source.
- Structural model shape should come from schema, not from handwritten TS/Python
  emitters.
- Defaults, exported runtime values, and non-shape inventories should come from
  one Go-generated semantic sidecar, not separate TS/Python handwritten tables.
- Do not move handwritten logic from `internal/frontendbindings` to
  `internal/pythonsharedtypes`, `internal/frontendbindingmeta`, or owner
  packages and call that progress.
- Do not add tautological tests that only restate explicit schema, sidecar,
  member lists, naming tables, or default tables written in the same change.
- Do not add tautological owner-metadata tests or explicit-list assertion tests.
- Keep explicit owner metadata only when it expresses real semantics that cannot
  be derived cleanly from Go type information plus the shared schema/sidecar
  model.
- Moving handwritten logic from runtime packages into registry generators,
  discovery wrappers, or helper packages does not count as progress by itself.
- Any newly created helper or generator file that carries naming,
  collision-resolution, normalization, selection, or registry-assembly
  heuristics must be counted in the audited migration surface immediately.
- Now that the schema + sidecar bootstrap exists, total audited migration-surface
  LOC should trend downward. Do not accept commits that grow shared schema,
  sidecar, or other glue unless the same commit deletes a larger bespoke path
  and still leaves the total audited migration surface lower than before.

## Current Priority Order

Highest-leverage remaining leftovers:

- `internal/frontendbindings/type_compiler.go`
- `internal/frontendbindings/type_naming.go`
- `internal/pythonsharedtypes/generator.go`
- `internal/pythonsharedtypes/schema_aliases.go`

Prefer deleting bespoke logic from those files before expanding
`internal/sharedtypes/schema.go`, `internal/sharedtypes/sidecar.go`, or other
shared glue.

Also prefer deleting the remaining handwritten naming and selection heuristics
in place over recreating them in `cmd/`, `internal/sharedtypes`, or other
generator helper packages.

## Main Legacy Targets To Delete

- `internal/frontendbindings/type_naming.go`
- `internal/frontendbindings/type_compiler.go` structural-model-specific logic
- `internal/frontendbindings/discriminated_object_families.go`
- `internal/pythonsharedtypes/contracts.go` route/default inventories
- `internal/pythonsharedtypes/type_naming.go`
- structural model emission in `internal/pythonsharedtypes/generator.go`

## Phase 1: Emit Canonical Schema And Sidecar

First create the backend-owned artifacts.

Requirements:

- emit canonical JSON Schema for non-HTTP shared models
- emit one small semantic sidecar for:
  - constructor defaults
  - exported values/constants
  - non-shape inventories
  - discriminated-family semantics that schema alone does not express well
- keep schema and sidecar Go-generated from owner types/metadata

Rules:

- do not build a new handwritten schema tree by hand
- do not keep separate TS/Python naming policies as the primary naming source
- if a semantic cannot be derived generically, attach it to Go-owned metadata
  once and emit it through the sidecar

## Phase 2: Migrate Python Shared Types First

Use the schema + sidecar path to replace the current bespoke Python structural
generation first.

Why first:

- the current Python path still has the clearest handwritten inventories and
  default tables
- Python is a good proving ground for whether the schema + sidecar artifacts are
  expressive enough

Deletion targets:

- handwritten route inventory in `buildRouteContractSpec()`
- `pythonSharedDefaultSourcesByType`
- `pythonSharedDefaultFieldOverrides`
- duplicated Python naming logic that only mirrors TS naming policy

## Phase 3: Migrate TypeScript Shared Types

Replace the structural TS type emission path with schema-driven generation.

Preferred path:

- use the canonical JSON Schema plus sidecar directly

Allowed fallback:

- if TS union/name output is materially cleaner from OpenAPI 3.1, emit a
  Go-generated OpenAPI projection from the same schema/sidecar truth and use
  that for TS generation only

Rules:

- do not preserve current generated names with compatibility shims
- update callers instead
- do not keep the old `type_naming.go` / structural reflection path alive in
  parallel once the schema path covers the same surface

## Phase 4: Delete Legacy Generators

After schema + sidecar generation is live:

- delete the handwritten TS/Python structural emitters
- delete duplicated naming logic
- delete handwritten inventories/default tables that the sidecar replaced
- keep only the minimal residual glue needed to:
  - emit schema/sidecar from Go
  - run standard generators
- generate thin helper/value-export surfaces from the sidecar

## Failure And Retry Discipline

- Transient clean Codex failures should not kill the loop immediately when they
  leave `HEAD` unchanged and the worktree clean.
- A small retry budget is acceptable for those failures.
- Repeated clean failures without forward progress should still stop the loop
  instead of spinning forever.

## Verification

Minimum verification per iteration:

- focused `./scripts/go.sh test` on touched generator packages
- `./gcf.sh`
- `./check_quality.sh`

When TS generated callers change materially:

- focused frontend Vitest on touched generated-types callers

When Python generated callers change materially:

- the narrowest meaningful Python/package verification only

## Plateau Rule

Stop the loop when migration work plateaus.

A keep-going iteration must achieve at least one of:

- delete a whole helper/path/file
- reduce total tracked handwritten exception LOC by at least `20`
- remove a real duplicated metadata/inventory path without adding a new
  explicit enumeration elsewhere
- replace one bespoke TS/Python structural generation path with schema/sidecar
  output for a meaningful surface area

And:

- the total audited migration surface should be non-increasing
- if an iteration cannot keep that total flat or lower, it should stop rather
  than land more schema/sidecar glue
- the only acceptable exception is when the same commit deletes a larger bespoke
  path and the total audited migration surface still ends lower than before
- shrinking one file while introducing similar handwritten heuristics in newly
  created helper/generator files does not qualify unless the net handwritten
  logic across both old and new locations still drops materially

If three consecutive iterations fail to meet that bar, stop instead of
continuing tiny cleanups.

## Acceptance Criteria

The plan is complete only when all of these are true:

- non-HTTP shared model shape comes from a Go-generated canonical schema path
- defaults/value exports/inventories come from one Go-generated semantic
  sidecar rather than duplicated TS/Python tables
- no handwritten Python route inventory remains for generated shared routes
- no duplicated TS/Python naming engine remains unless a tiny justified bridge
  is still required temporarily
- remaining discriminated-family logic is small and justified
- no tautological tests were added during the migration
