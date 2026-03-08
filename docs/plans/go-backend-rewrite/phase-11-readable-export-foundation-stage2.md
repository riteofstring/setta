# Phase 11 Readable Export Foundation Stage 2

## Purpose

This doc scopes the second bounded Phase 11 implementation slice after the
completed `backups` migration.

The goal is to move readable project export ownership into Go so
`setta export-db` can become a thin shipped Go CLI command instead of a
Python-owned one-off serializer.

## Current Status

As of 2026-03-08:

- Go already owns the shipped CLI router in:
  - `cmd/setta`
  - `internal/settacmd`
  - `backend/setta/entrypoint.py`
- this stage is now complete:
  - `internal/projectstate` now owns the shared readable-export builder
  - `internal/settacmd` now owns thin `setta export-db` routing
  - `backend/setta/entrypoint.py` now dispatches `export-db` to the packaged
    Go CLI
- Python still owns only the save-path hook that optionally writes
  `project.readable.yaml` during project saves in
  `backend/setta/project_state/session_project_manager.py`

## Inputs

- `docs/plans/go-backend-rewrite/phase-11-maintenance-command-inventory.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/project_state/readable_export.py`
- `backend/setta/project_state/session_project_manager.py`
- `backend/setta/start.py`
- `tests/project_state/test_readable_project_export.py`
- `tests/start/test_module_entrypoint.py`
- `internal/projectstate/document.go`
- `internal/projectstate/run_graph.go`
- `internal/projectstate/effective_payload_exports.go`
- `internal/projectstate/effective_section_payload.go`
- `internal/projectstate/section_code_objects.go`
- `internal/projectstate/section_names.go`
- `internal/projectstate/store.go`
- `internal/settacmd/cli.go`

## Problem Shape

`setta export-db` is not blocked by CLI routing complexity.

It is blocked by missing shared product semantics in Go:

1. build the readable export from the normalized project document
2. resolve section paths from the active project graph
3. resolve effective section and code-object payloads instead of raw stored
   payloads
4. emit readable edge endpoints using section paths and param/output names
5. keep readable export logic reusable outside the CLI wrapper

The CLI itself should stay thin:

1. load the current document from the Go project store
2. build the readable export
3. YAML-serialize it
4. write the selected output path

## Scope

This stage should cover only:

- a shared Go readable-export owner under `internal/projectstate`
- thin `setta export-db` CLI routing in `internal/settacmd`
- thin dispatch from the shipped Python entrypoint to Go
- focused docs/tests updates for the new ownership boundary

Do not include:

- readable-export-on-save parity in the Go runtime
- `plugins`
- unrelated project-state mutation or save-path work
- compatibility shims for the Python internal architecture

## Working Decisions

- keep readable export in `internal/projectstate`
  - this is project-state read semantics, not CLI logic
- build on existing Go source-of-truth helpers
  - active project lookup
  - active section path resolution
  - effective section payload merging
  - effective code-object payload merging
- keep transport thin
  - `internal/settacmd` should shape flags, YAML output, and errors only
- preserve the shipped readable export contract where it matters
  - top-level version/project/config shape
  - section path/type/callable/params/files fields
  - edges emitted as readable path strings
  - `--readable` and `--readable-with-variants`
- do not port Python type hierarchies into Go
  - use the normalized document plus payload-driven helpers already present in
    `internal/projectstate`

## Implementation Shape

1. add a shared readable-export builder in `internal/projectstate`
   - top-level document export
   - per-project readable config export
   - section-path map
   - param traversal/name-path collection
   - readable edges
   - file-reference extraction for code/json/chat/draw/image/chart assets
2. add thin `export-db` routing in `internal/settacmd`
   - default to `--readable-with-variants`
   - reject unsupported modes if any are still Python-only
   - write YAML to `setta_files/project.readable.yaml` or `--output`
3. update the shipped Python entrypoint
   - dispatch `setta export-db ...` to the packaged Go binary
4. update active docs
   - mark `export-db` as Go-owned
   - record that readable export now has a shared Go owner

## Test Strategy

- add focused Go tests for readable export in `internal/projectstate`
  - no UUID-like values leak into YAML output
  - code sections use file references instead of inline code
  - JSON-source sections omit `params`
  - edges use readable paths
  - agentic edges are ignored
- add focused `internal/settacmd` tests for:
  - default readable-with-variants behavior
  - `--readable` vs `--readable-with-variants`
  - custom output path handling
  - success message shaping
- extend `tests/start/test_module_entrypoint.py` so
  `python -m setta export-db ...` dispatches to Go

## Explicit Non-Goals

- save-hook parity for automatic readable exports
- moving `plugins`
- preserving Python Click internals
- broad project-state export APIs beyond the bounded readable export owner

## Open Questions

- whether Stage 3 should later move the save-path readable-export hook into Go
  once the runtime save owner needs it; that is intentionally out of scope for
  this stage

## Progress Notes

- 2026-03-08: created this Stage 2 plan to keep the next maintenance-command
  slice bounded around the shared readable-export owner required by
  `setta export-db`.
- 2026-03-08: completed this Stage 2 slice.
  - readable export now has a shared Go owner in `internal/projectstate`
  - `setta export-db` now routes through the shipped Go CLI
  - the shipped Python entrypoint now dispatches `export-db` to Go
  - the remaining Python-owned maintenance command is `plugins`

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/settacmd -count=1 -timeout 300s`
- `source activate.sh && python -m pytest tests/start/test_module_entrypoint.py -q`
- `git diff --check`

## Recommended Next Step

Move to the remaining maintenance-command surface:

1. dedicated `plugins` plan doc
2. bounded Go-owned `setta plugins` migration over the existing
   `internal/plugins` foundations
