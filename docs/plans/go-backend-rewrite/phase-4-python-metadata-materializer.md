# Phase 4 Python Metadata Renderer And Materializer

## Purpose

This doc narrows Slice 3 after
`docs/plans/go-backend-rewrite/phase-4-python-value-codec-and-wrapper-renderer.md`.

Go already owns the Python target decode path, export surface, dependency
graph, value codec, and wrapper-code renderer for `setta_gen.py`.

What still blocks authoritative Python target runtime ownership is the last
source-of-truth layer:

- rendering `setta_gen_meta.py` in Go
- materializing `setta_gen.py` and `setta_gen_meta.py` from the save hook

## Status

Current repo status as of 2026-03-06:

- Go already owns:
  - typed Python target/policy decoding under `internal/projectstate`
  - ordered Python dependency graph export under `internal/codegen`
  - packaged-runtime wrapper rendering for `setta_gen.py`
- Python still owns:
  - metadata rendering in `backend/setta/code_gen/python/meta_generator.py`
  - generated Python file writes in `backend/setta/project_state/project_code.py`
- Go still lacks:
  - a native metadata renderer for `setta_gen_meta.py`
  - a native save-hook materializer for first-party Python outputs

## Scope

This focused plan covers:

- a Go metadata renderer over `projectstate.PythonCodegenExport` and the Go
  dependency graph
- a Go materializer for `setta_gen.py` and optional `setta_gen_meta.py`
- composed main-runtime save-hook integration alongside plugin codegen

## Non-Goals

- generated singleton section creation/update for `GenPythonCode` and
  `GenPythonMetadata`
- reopening Python target enable/edit transport
- shelling out to the Python generator
- watch-code or LSP temporary-document parity

## Inputs

- `docs/reference/codegen-section-policy-and-metadata.md`
- `backend/setta/code_gen/python/meta_generator.py`
- `backend/setta/project_state/project_code.py`
- `internal/codegen/python_code_renderer.go`
- `internal/codegen/plugin_materializer.go`
- `internal/app/app.go`

## Dependency Finding

This slice should land in two layers:

1. a pure metadata renderer with deterministic ordering and no file I/O
2. a materializer that resolves project exports, renders code/meta, writes the
   canonical paths, and prunes stale Python outputs

Keeping rendering separate from file writes preserves the same transport/runtime
boundary already used for plugin codegen.

## Working Decisions

- use `projectstate.PythonCodegenExport` as the metadata source of truth
  - do not re-read raw document JSON inside the renderer
- use dependency-graph section nodes for metadata section ordering and path
  naming
- materialize authoritative file contents from the main save hook only
- prune stale `setta_gen_meta.py` when metadata generation is disabled
- prune stale Python output roots for projects that no longer exist or no longer
  have a Python target

## Proposed Go Boundaries

### `internal/codegen/python_meta_renderer.go`

Own:

- project metadata formatting
- section metadata collection from the export + dependency graph
- deterministic rendering for `setta_gen_meta.py`

Do not own:

- save-hook orchestration
- document traversal
- file writes

### `internal/codegen/python_materializer.go`

Own:

- document/project traversal for Python-target projects
- export + dependency graph construction
- `setta_gen.py` and `setta_gen_meta.py` file writes
- stale-file and stale-project-root pruning

Do not own:

- route semantics
- project-state mutation logic

## Implementation Slices

### Slice A: Metadata Renderer

Deliver:

- a Go renderer for `setta_gen_meta.py`
- deterministic project/section metadata ordering
- focused renderer tests

Acceptance:

- metadata content comes entirely from the Go export + graph
- section entries are keyed by full path and by id in deterministic order

### Slice B: Save-Hook Materializer

Deliver:

- a Go materializer for Python generated outputs
- composed after-save integration with plugin codegen
- focused materializer/app tests

Acceptance:

- main-runtime saves write authoritative Python generated files in Go
- removing a Python target removes stale Python generated outputs
- disabling metadata removes stale `setta_gen_meta.py`

## Next Recommended Step

Implement Slice A first, then wire Slice B through the main runtime save hook.
