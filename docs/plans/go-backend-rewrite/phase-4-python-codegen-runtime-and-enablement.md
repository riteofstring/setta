# Phase 4 Python Codegen Runtime And Enablement

## Purpose

This doc narrows the next step after
`docs/plans/go-backend-rewrite/phase-4-codegen-targets-mutation-transport.md`.

Go now owns:

- plugin codegen save-hook materialization
- the first IDE `setProjectConfigCodegenTargets` mutation route
- authoritative route responses back to the frontend
- cleanup-only removal of an existing Python codegen target

What Go still does not own is the first-party Python codegen runtime needed to
support:

- enabling the Python target in Go
- editing Python target settings in Go
- authoritative `setta_gen.py` / `setta_gen_meta.py` materialization in Go
- authoritative `GenPythonCode` / `GenPythonMetadata` section creation and sync

## Status

Current repo status as of 2026-03-06:

- Go already owns:
  - project-state persistence/runtime boundaries under `internal/projectstate`
  - generated-entry run planning that understands first-party Python generated
    entry bindings when they exist
  - plugin codegen runtime/materialization under `internal/plugins` and
    `internal/codegen`
  - cleanup-only Python target removal from the Go mutation route
- Python still owns the first-party Python codegen source-of-truth under:
  - `backend/setta/code_gen/dependency_graph.py`
  - `backend/setta/code_gen/python/code_generator.py`
  - `backend/setta/code_gen/python/meta_generator.py`
  - `backend/setta/project_state/project_code.py`
  - `backend/setta/project_state/base_project_manager.py`
- Go still lacks:
  - typed Python target decoding above raw JSON payloads
  - canonical path/binding policy for first-party generated files
  - a Go dependency-export surface for Python codegen inputs
  - a Go Python code/meta renderer
  - a Go materializer for `setta_gen.py` / `setta_gen_meta.py`
  - authoritative generated-section creation/update on Python target enablement

## Scope

This focused plan covers:

- typed first-party Python target decoding from `projectConfig.codegenTargets`
- canonical output-path and binding policy for first-party generated files
- the first Go-owned source-of-truth export surface for Python codegen inputs
- a Go-owned materializer for generated Python code + metadata
- route enablement for Python target add/edit only after the runtime exists

## Non-Goals

- calling the legacy Python generator from Go
- preserving Python internal architecture or manager topology
- full LSP temp-file parity in the first slice
- watch-code integration in the first slice
- broad migration of unrelated IDE mutation routes

## Inputs

- `docs/reference/codegen-targets.md`
- `docs/reference/codegen-section-policy-and-metadata.md`
- `backend/setta/code_gen/dependency_graph.py`
- `backend/setta/code_gen/python/code_generator.py`
- `backend/setta/code_gen/python/meta_generator.py`
- `backend/setta/project_state/project_code.py`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_codegen_targets.py`
- `tests/code_gen/test_code_generator_formatting.py`

## Dependency Finding

The remaining gap is not a thin transport issue.

Python target enablement depends on four missing Go-owned source-of-truth layers:

1. a typed Python target config boundary
2. canonical generated file path/binding policy
3. a Go export surface for dependency/codegen inputs
4. a Go materializer that writes authoritative generated files and section
   content

The route should stay blocked for Python target enablement/editing until those
layers exist. Otherwise Go would return success while leaving stale or empty
generated state behind.

## Working Decisions

- keep first-party Python codegen native in Go
  - do not shell out to the legacy Python generator
- stage the work by source-of-truth layers, not by route shape
- keep materialization separate from transport
  - route handlers should continue invoking project-state services only
- let the main-runtime save hook remain the single authoritative write trigger
  for generated outputs
- treat generated file paths and bindings as deterministic policy, not
  user-authored state

## Recommended Option

Build a native Go Python codegen runtime in slices, starting with typed target
decode and canonical binding policy.

Rationale:

- it avoids baking a Python bridge into the clean-break runtime
- it creates the deterministic inputs every later slice will need
- it produces useful source-of-truth behavior before the full renderer lands

## Proposed Go Boundaries

### `internal/projectstate`

Own:

- typed Python target decoding/validation
- canonical first-party generated binding policy
- generated-section reconciliation once materialized outputs exist

Do not own:

- file writes to generated outputs
- transport decoding

### `internal/codegen`

Own:

- deterministic output-path helpers shared by plugin and Python codegen
- future Python code/meta rendering and materialization

Do not own:

- route semantics
- mutation authorization

## Implementation Slices

### Slice 1: Typed Python Target Decode + Canonical Binding Policy

Deliver:

- typed decoding for the Python codegen target payload
- canonical path helpers for first-party generated outputs
- canonical generated binding policy derived from project name + Python target
  config

Acceptance:

- Go can decode Python target payloads without hand-reading raw JSON at call
  sites
- canonical `setta_gen.py` / `setta_gen_meta.py` paths come from one source of
  truth
- metadata binding existence is derived from `generateMetadata`

Status:

- in progress

### Slice 2: Python Codegen Input Export Surface

Deliver:

- the first Go-owned export surface for the project data needed by first-party
  Python codegen and metadata generation

Acceptance:

- later renderers do not need to inspect raw frontend DTOs directly

### Slice 3: Python Code + Metadata Materializer

Deliver:

- Go-owned rendering/materialization for `setta_gen.py`
- Go-owned rendering/materialization for `setta_gen_meta.py`
- main-runtime save-hook integration

Acceptance:

- persisted project-state saves regenerate authoritative first-party Python
  outputs in Go

### Slice 4: Generated Section Sync + Route Enablement

Deliver:

- `GenPythonCode` / `GenPythonMetadata` section reconciliation in Go
- route support for Python target enablement and edits

Acceptance:

- enabling Python codegen from the IDE produces authoritative generated files,
  bindings, and sections in one Go-owned flow

## Open Questions

- whether the dependency/codegen input export surface should live entirely under
  `internal/projectstate` or split into a dedicated package before rendering
  starts

## Next Recommended Step

- Finish Slice 1 from this doc:
  - typed Python target decode
  - canonical generated path helpers
  - canonical binding reconciliation
- Keep Python target enablement/edit support blocked until at least Slice 3
  exists.
