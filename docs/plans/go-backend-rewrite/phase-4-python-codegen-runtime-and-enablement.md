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
  - typed Python target decoding/default handling under
    `internal/projectstate`
  - canonical first-party generated path and binding policy shared across
    Python and plugin codegen roots
  - typed section/code-obj policy decoding and resolution for Python codegen
  - a Go-owned export surface for effective Python-codegen section/code-object
    inputs under `internal/projectstate`
- Python still owns the first-party Python codegen source-of-truth under:
  - `backend/setta/code_gen/dependency_graph.py`
  - `backend/setta/code_gen/python/code_generator.py`
  - `backend/setta/code_gen/python/meta_generator.py`
  - `backend/setta/project_state/project_code.py`
  - `backend/setta/project_state/base_project_manager.py`
- Go still lacks:
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

- complete

Completed 2026-03-06:

- added typed Python target decoding with explicit defaults and strict payload
  validation
- added canonical project code-sections root helpers for deterministic
  first-party output paths
- added project-state reconciliation for canonical generated Python bindings
  with `write_only` access
- updated Python-target equality to compare decoded semantic config instead of
  raw payload shape
- moved plugin codegen project-root pathing onto the same shared source of
  truth
- added focused Go coverage for decoding defaults, explicit fields, canonical
  binding reconciliation, cleanup when Python is missing, and unchanged-default
  payload comparison

### Slice 2: Python Codegen Input Export Surface

Deliver:

- the first Go-owned export surface for the project data needed by first-party
  Python codegen and metadata generation

Acceptance:

- later renderers do not need to inspect raw frontend DTOs directly

Status:

- complete

Completed 2026-03-06:

- added typed Go decoding for Python section policy and code-object value policy
  with Python-matching defaults and representation validation
- added projectstate-owned resolution helpers for section inclusion/
  representation and code-object value representation
- added a dedicated Python-codegen export surface that exposes effective section
  and code-object inputs through typed Go accessors instead of raw JSON parsing
- tightened unchanged-Python-target equality so explicit default policy objects
  compare equal to omitted defaults
- added focused Go coverage for policy defaults, policy resolution, effective
  section/code-object export, nested policy validation, and default-policy
  equality through the mutation route

### Slice 3: Python Code + Metadata Materializer

Deliver:

- Go-owned rendering/materialization for `setta_gen.py`
- Go-owned rendering/materialization for `setta_gen_meta.py`
- main-runtime save-hook integration

Acceptance:

- persisted project-state saves regenerate authoritative first-party Python
  outputs in Go

Status:

- in progress

Slice 3 inventory as of 2026-03-06:

- Python currently layers codegen as:
  - dependency graph export
  - value codec / helper import tracking
  - wrapper-class code renderer
  - metadata renderer
  - project-manager file writes and generated-section sync
- The new Go export surface replaces only the first raw-project-state boundary.
  It does not yet provide the dependency-node graph that the current Python
  renderer and metadata builder consume.
- The save hook in Go is already the correct integration point, but it is
  currently wired only to plugin materialization in `internal/app/app.go`.

Completed Slice 3 chunk on 2026-03-06:

- added a Go-owned structural Python dependency-node graph in `internal/codegen`
  over `projectstate.PythonCodegenExport`
- ported deterministic Python path naming and sibling de-duplication for
  section/code-object full-path names
- ported the current section/code-object traversal boundaries for:
  - callable, dict, list-root, group, global-variables
  - text-block, prompt, plugin, meta-control
  - chat, draw, image
  - task-board, spreadsheet
- ported current section value shaping for file-backed chat/draw/image nodes,
  plugin literal payloads, task-board/spreadsheet literals, meta-control
  control values, and password-secret presence gating
- fixed the Go export surface so MetaControl policy resolution derives the
  control code-object type from effective state instead of requiring a payload
  field
- added robust parser-backed Python expression reference-edge extraction for
  `state.<name>` reads in callable names and childless code-object values using
  tree-sitter Python, with syntax-error rejection instead of heuristic fallback
- resolved extracted Python reference edges against the graph's authoritative
  full-path index in a second pass so forward references land after structural
  export completes
- added a Go-owned Python value codec for the graph value kinds Go currently
  emits, including live-runtime vs packaged-runtime modes, helper import
  tracking, callable/dict/list formatting, section/param representation
  handling, and dropzone payload parsing
- tightened the Go graph with explicit node/dependency order slices so wrapper
  rendering can stay deterministic instead of depending on Go map iteration
- added a Go wrapper-class renderer for `setta_gen.py` with ordered top-level
  traversal, helper-import block assembly, var-name mapping, and
  value-position bookkeeping
- added focused Go coverage for:
  - callable param path generation
  - global-variables top-level param export
  - plugin/chat/draw section value shaping
  - password-secret presence gating
  - forward reference resolution to later-exported nodes
  - function/comprehension shadowing for `state`
  - syntax-invalid Python snippets producing no reference edges
  - Python value codec formatting for callable args, param representations,
    password/file helpers, section representations, dropzone payloads, and
    multiline collections
  - wrapper renderer formatting for dict/callable multiline output, helper
    import block emission, and plugin assignments
  - MetaControl allowlist resolution from the derived control param type

Recommended Slice 3 structure:

- keep the renderer/materializer under `internal/codegen`
- add a Go dependency-node layer derived from
  `projectstate.PythonCodegenExport`
- port the packaged-runtime value codec semantics next
  - helper import tracking
  - callable arg formatting
  - dict/list multiline formatting
  - section/code-object representation handling
  - password/file/binary helper expression generation
- port the wrapper-class renderer and metadata assignment block after the value
  codec exists
- port metadata rendering as a sibling renderer over the same dependency-node
  graph
- add a composed after-save materialization hook so plugin and first-party
  Python outputs run from one authoritative save path

Recommended option:

- do not render directly from the export surface

Rationale:

- the Python runtime already separates dependency-node construction from string
  rendering
- metadata generation and code generation both depend on the same node graph
- direct rendering from section payloads would duplicate traversal and naming
  logic, then force a second rewrite when metadata and temp-edit position
  tracking land

Current open gap inside Slice 3:

- the Go dependency graph now owns both structural dependencies and
  parser-backed `state.<name>` reference edges
- Go now owns the value codec and helper-import layer for the graph value kinds
  it emits
- Go now owns the wrapper-class renderer that turns ordered dependency nodes
  into authoritative `setta_gen.py` assignments
- Go still lacks the metadata renderer and composed save-hook materializer that
  turn those renderers into authoritative generated files on save

### Slice 4: Generated Section Sync + Route Enablement

Deliver:

- `GenPythonCode` / `GenPythonMetadata` section reconciliation in Go
- route support for Python target enablement and edits

Acceptance:

- enabling Python codegen from the IDE produces authoritative generated files,
  bindings, and sections in one Go-owned flow

## Open Questions

- whether the future renderer should stay in `internal/codegen` while consuming
  the `internal/projectstate` export surface directly, or whether a narrower
  shared data package is still warranted once rendering logic starts

## Decisions Made In Slice 1

- Python target mutation equality is semantic for Go-owned fields; empty payload
  and explicit default payloads are treated as the same config
- canonical first-party generated bindings are deterministic derived state, not
  user-authored project config
- plugin and first-party Python codegen now share the same project slug/root
  helper so later materializers do not drift on filesystem layout

## Decisions Made In Slice 2

- keep the dependency/codegen input boundary in `internal/projectstate`
  for now because it already owns effective project-state semantics and target
  config decoding
- expose effective section/code-object state through typed Go accessors instead
  of handing later renderers raw payload JSON blobs
- normalize Python policy defaults in Go so semantic equality and later
  rendering logic use one source of truth for omission vs explicit-default cases

## Next Recommended Step

- Start Slice 3 from this doc:
  - port Python expression reference-edge extraction for `state.<name>`
    dependencies into the Go dependency graph
  - port the packaged-runtime Python value codec and wrapper-class renderer for
    `setta_gen.py` on top of that completed graph
  - port the metadata renderer for `setta_gen_meta.py`
  - integrate the resulting Python materializer into the authoritative save
    hook alongside plugin materialization
- Keep Python target enablement/edit support blocked until at least Slice 3
  exists.
