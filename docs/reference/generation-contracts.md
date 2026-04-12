# Generation and Contract Policy

This document captures the detailed generator-design constraints behind the
high-level `AGENTS.md` generation rules. It describes both the preferred
direction and the current generator shape in this repo. Not every generator is
fully discovery-driven today.

## Goal

When Go owns a contract or behavior surface, downstream Python and TypeScript
outputs should be derived from authoritative Go-owned structure instead of
re-created as handwritten mirrors.

## Current Repo Shape

- `frontend/generation/generate.sh` is the broad wrapper. The main generation
  entrypoints under it are
  `frontend/generation/generate_go_frontend_bindings.sh` and
  `frontend/generation/generate_go_python_types.sh`. The frontend pipeline also
  invokes `generate_go_shared_schema.sh`,
  `generate_non_http_openapi_bindings.sh`, and
  `generate_http_openapi_bindings.sh`.
- Shared schema, semantic sidecar, and OpenAPI projection are built in
  `internal/sharedtypes` from discovered Go types plus Go-owned metadata.
  `DiscoveredTypes()` pulls from frontend binding registries, shared exported
  values, and generated additional-type registries.
- Frontend non-HTTP bindings in `internal/frontendbindings` are largely driven
  by the shared schema and semantic sidecar, plus a small fixed set of extra
  declarations such as `JSONValue`.
- Python shared types in `internal/pythonsharedtypes` are derived from the
  shared semantic sidecar and Go-owned default metadata.
- The listener endpoint Python client in `internal/listenerendpoints` is
  derived from Go request structs and struct tags.
- Some generated Python surfaces intentionally start from explicit Go-owned
  inventories rather than broad discovery. The main examples are
  `internal/pythonsdkcontracts/contracts.go` and
  `internal/pythonsharedconstants/generator.go`. Those are still authoritative
  because the inventory lives in Go rather than being restated in Python.

## Preferred Direction

- Prefer generators driven by authoritative Go-side structure such as
  discovery, typed registration metadata, schema metadata, tags, enum
  metadata, zero values, or owner-provided descriptors.
- Prefer broad correct discovery plus pruning over brittle hyper-selective
  discovery that depends on hand-maintained inventories.
- Keep hardcoded generator special cases to the absolute minimum, and require a
  concrete reason when they cannot be removed.
- When a surface cannot be discovered generically, prefer an explicit
  Go-authored contract or metadata definition over restating that shape in
  Python or TypeScript.

## What Does Not Count As Real Generation

- Replacing one handwritten mirror with another handwritten mirror inside a
  generator.
- Enumerating downstream Python or TypeScript fields, defaults, or shapes one
  by one, even when wrapped in helper functions or small templates.
- Per-type create builders or helper-wrapped field lists that still restate the
  downstream object shape manually.

## Handling Exceptions

- If a downstream default or TypeScript-specific shape cannot be derived
  generically, attach that exception to Go-owned metadata or typed owner
  defaults with a concrete reason.
- Do not restate non-trivial downstream object structure inside the generator
  just because it is convenient.

## Generator Implementation Constraints

- Do not rely on hand-maintained allowlists of type or endpoint names when the
  generator can discover the relevant structures from Go packages or metadata.
- Rendering generated output with templates or small builders is fine when the
  emitted structure still comes from authoritative Go-owned inputs.
- Avoid large static Python or TypeScript source blobs inside generation code.
  The problem is hand-authored downstream structure embedded in the generator,
  not the act of rendering text.
- Keep generation code focused on structure, mapping rules, and authoritative
  metadata interpretation rather than acting as a second handwritten
  implementation.

## Related Repo Workflows

- Command map and generation entrypoints: `docs/guides/dev-scripts.md`
- Product-facing Python codegen behavior: `docs/reference/codegen-targets.md`
- Generated Python section metadata and policy behavior:
  `docs/reference/codegen-section-policy-and-metadata.md`
