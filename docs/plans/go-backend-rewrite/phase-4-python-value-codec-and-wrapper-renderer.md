# Phase 4 Python Value Codec And Wrapper Renderer

## Purpose

This doc narrows the next Slice 3 step after
`docs/plans/go-backend-rewrite/phase-4-python-codegen-runtime-and-enablement.md`.

The Go rewrite now owns:

- typed Python target decode and policy resolution
- canonical Python codegen export data
- a Go dependency graph with structural edges and parser-backed
  `state.<name>` reference edges
- a Go value codec and wrapper-class renderer over that graph

What Go still does not own is the metadata/materialization layer that turns
those rendered outputs into authoritative generated files from the save hook.

## Status

Current repo status as of 2026-03-06:

- Go already owns:
  - dependency graph traversal, value shaping, full-path naming, and
    expression-edge extraction under `internal/codegen`
  - deterministic dependency/node ordering in the Go graph for later renderer
    work
  - a Go Python value codec for the graph value kinds Go currently emits
  - a Go wrapper-class renderer with var-name mapping, helper-import assembly,
    and value-position bookkeeping
  - effective section/code-object policy resolution under
    `internal/projectstate`
- Python still owns:
  - `backend/setta/code_gen/python/meta_generator.py`
- Go still lacks:
  - metadata rendering and save-hook materialization integration

Completed 2026-03-06:

- added `internal/codegen/python_value_codec.go`
- ported live-runtime vs packaged-runtime formatting modes
- ported helper import tracking for password/file helper usage
- ported collection formatting, callable arg formatting, section/param
  representation handling, and dropzone payload parsing for current graph value
  kinds
- tightened the Go dependency graph with explicit node order and dependency
  order slices so future renderer output stays deterministic
- added focused Go coverage for callable formatting, param representations,
  password/file helpers, section representations, dropzone formatting, and
  multiline collection formatting
- added `internal/codegen/python_code_renderer.go`
- ported ordered top-level traversal, wrapper-class assignment emission,
  helper-import blocks, var-name mapping, and value-position bookkeeping for
  `setta_gen.py`
- added focused Go coverage for dict/callable multiline formatting, helper
  import block emission, and plugin assignment rendering

## Scope

This focused plan covers:

- a Go Python value codec over `PythonDependencyGraph`
- packaged-runtime helper import tracking
- collection and callable formatting that matches current Python output
- wrapper-class line rendering over codec output

## Non-Goals

- invoking the legacy Python generator from Go
- preserving Python internal class names or module topology
- reworking the dependency graph again while porting the codec
- implementing binary dependency values before a Go source-of-truth node emits
  them

## Inputs

- `docs/reference/codegen-section-policy-and-metadata.md`
- `backend/setta/code_gen/value_codec.py`
- `backend/setta/code_gen/python/code_generator.py`
- `backend/setta/types/dropzone.py`
- `tests/code_gen/test_value_codec.py`
- `tests/code_gen/test_code_generator_formatting.py`

## Dependency Finding

The renderer work should not start with string concatenation directly over
dependency nodes.

The Python runtime already separates:

1. dependency graph export
2. value formatting and helper-import tracking
3. wrapper-class line generation
4. metadata attachment

Porting the codec first keeps representation policy, password/dropzone/file
handling, and multiline collection formatting in one place instead of leaking
those semantics into multiple renderers.

## Working Decisions

- keep the codec separate from wrapper rendering
- support both live-runtime and packaged-runtime formatting in the codec
  - packaged runtime is the first renderer target
  - live runtime remains useful for test parity and later listener work
- treat helper imports as codec-owned usage state
- keep binary dependency values out of scope until Go emits them explicitly
  - do not invent placeholder binary nodes just to satisfy the codec API

## Recommended Option

Port the value codec first, then build the wrapper renderer on top of it.

Rationale:

- it matches the current Python layering
- it gives the wrapper renderer one expression API instead of many ad-hoc
  formatting branches
- it keeps policy-sensitive formatting and helper imports in one source of
  truth

## Proposed Go Boundaries

### `internal/codegen/python_value_codec.go`

Own:

- param and section expression formatting
- helper import tracking
- collection and callable formatting
- dropzone payload decoding for codegen formatting

Do not own:

- project-state export
- wrapper-class assignment ordering
- file writes

### `internal/codegen/python_code_renderer.go`

Own:

- top-level node ordering over the dependency graph
- wrapper-class assignment emission
- value-position bookkeeping needed by future sync work

Do not own:

- policy resolution
- mutation transport

## Implementation Slices

### Slice A: Go Python Value Codec

Deliver:

- a Go codec over `PythonDependencyGraph`
- live-runtime vs packaged-runtime value modes
- helper import tracking for password/file helpers
- dropzone payload decoding and formatting

Acceptance:

- Go can format current graph nodes without reaching back into raw project DTOs
- helper imports come from codec usage instead of renderer heuristics
- focused Go tests cover the current Python value codec behavior for the graph
  value kinds Go already emits

Status:

- complete for the graph value kinds Go currently emits
- binary dependency values remain intentionally out of scope until Go exports a
  first-party binary node kind

### Slice B: Go Wrapper-Class Renderer

Deliver:

- wrapper-class body rendering for `setta_gen.py`
- variable-name mapping and value-position bookkeeping
- helper-import block assembly from codec usage

Acceptance:

- Go can render the generated body for dict/list/callable/plugin-style graphs
- multiline collection formatting matches the current Python formatter policy

Status:

- complete for wrapper-class rendering of `setta_gen.py`
- metadata import/assignment hooks exist, but authoritative metadata generation
  is still blocked on the dedicated Go metadata renderer

### Slice C: Metadata Renderer + Save Hook Integration

Deliver:

- metadata renderer over the same dependency graph
- composed materialization from the save hook

Acceptance:

- Go owns authoritative `setta_gen.py` and `setta_gen_meta.py` writes from the
  runtime save path

## Next Recommended Step

Implement Slice C next:

- port the Python metadata renderer over the same ordered dependency graph
- wire `PythonCodeRenderer` and the metadata renderer into a composed Go
  materializer for `setta_gen.py` and `setta_gen_meta.py`
- integrate that materializer into the authoritative save hook before
  reopening Python target enablement/edit support
