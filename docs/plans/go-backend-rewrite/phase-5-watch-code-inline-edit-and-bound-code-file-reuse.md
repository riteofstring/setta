# Phase 5 Watch Code Inline Edit And Bound Code File Reuse

## Purpose

This doc narrows the remaining Watch Code backend gap after the completed Go
runtime, project-state apply, Callable section mutation, callable refetch, and
warning-notification slices.

Go now owns watcher-driven Watch Code updates for on-disk watched files. What
this doc finished migrating from Python was the reuse boundary for edits that
arrive through bound code sections instead of the Watch Code watcher runtime:

- inline `set_code` updates on bound Python code sections
- bound code-file reloads after on-disk file changes
- the explicit LSP-before-Watch-Code ordering for those paths

## Status

Current repo status as of 2026-03-07:

- Watch Code state, route transport, parser/diff planning, runtime ownership,
  project-state file apply, Callable section mutation, callable refetch, and
  warning notifications are complete in Go
- Step 1 in this focused doc is now complete:
  - Go owns the authoritative `/setCode` route path for Watch Code-bound
    Python edits through:
    - `internal/app/code_updates.go`
    - `internal/httpapi/project_routes.go`
    - `internal/projectstate/code_updates.go`
    - `internal/projectstate/watch_code_bound_sections.go`
  - bound Python inline edits now reuse the same Watch Code scan/apply helpers
    as watcher-driven file updates
  - the Go app service syncs the bound workspace path into LSP before applying
    the Watch Code update
  - successful bound Python edits now rehydrate authoritative project state on
    the frontend through `frontend/src/state/actions/codeUpdates.ts`
- watcher-triggered file updates already reuse the authoritative Go apply path
  in:
  - `internal/watchcode`
  - `internal/projectstate/watch_code_apply.go`
  - `internal/projectstate/watch_code_callable_sections.go`
  - `internal/app/watch_code_notifications.go`
- unresolved signature-help `no_match` warnings now emit as deduped frontend
  `Notification` websocket messages from Go
- Step 2 in this focused doc is now complete:
  - IDE mode now starts a Go-owned bound code-file polling runtime in:
    - `internal/boundcode/service.go`
    - `internal/app/app.go`
  - saved main project-state snapshots now sync exact bound Python code-file
    inputs into that runtime through:
    - `internal/projectstate/bound_code_files.go`
  - external bound file create/modify events now route through the same
    authoritative mutation path as inline edits in:
    - `internal/app/code_updates.go`
    - `internal/projectstate/bound_code_files.go`
    - `internal/projectstate/watch_code_bound_sections.go`
  - external bound file updates now preserve explicit
    `sync LSP -> Watch Code update` ordering in the shared app service path
- Step 3 in this focused doc is now complete:
  - focused Go coverage now exists for:
    - bound code-file runtime baselining and create/modify callbacks
    - bound section content reload on read-only bindings
    - LSP-before-Watch-Code ordering for external reloads
    - IDE app lifecycle wiring for the external reload path
- the remaining Watch Code backend gap is now closed in Go

## Scope

This focused doc covers:

- Go-owned reuse of the existing Watch Code apply helpers for bound Python
  code-section edits
- Go-owned integration from the code-file reload owner into the same Watch Code
  helper
- explicit LSP sync ordering before Watch Code updates
- focused verification for inline-edit and bound-file flows

## Non-Goals

- replacing the completed Watch Code watcher runtime owner
- widening frontend transport or route naming
- non-Python Watch Code support
- heuristic path matching or regex parsing
- broad generic code-file mutation abstractions beyond what this slice needs

## Inputs

- `docs/reference/watch-code.md`
- `docs/plans/go-backend-rewrite/phase-5-watch-code-runtime-and-callable-refresh.md`
- `docs/plans/go-backend-rewrite/phase-5-watch-code-projectstate-apply-and-section-mutation.md`
- `docs/plans/go-backend-rewrite/phase-5-watch-code-callable-section-mutation.md`
- `backend/setta/project_state/watch_code.py`
- `backend/setta/project_state/code_files.py`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_watch_code.py`
- `internal/app/app.go`
- `internal/projectstate/watch_code_apply.go`
- `internal/projectstate/python_code_section_bindings.go`
- `internal/lsp/project_synchronizer.go`

## Current Python Behavior

Python currently reuses Watch Code for two non-watcher edit paths:

1. inline code edits
   - `BaseProjectManager.set_code(...)` syncs LSP for bound Python code
     sections before delegating to
     `WatchCodeManager.handle_code_section_update(...)`
   - non-bound or non-Python sections are skipped explicitly
2. bound code-file reloads
   - `CodeFiles.watch_code_files(...)` watches the same bound files used by
     code sections
   - the reload callback updates section contents, then calls
     `handle_code_section_update(...)`
3. shared Watch Code apply behavior
   - both paths feed the same callable diff, section mutation, refetch, and
     warning logic
   - there is no second inline-edit-specific diff engine
4. ordering guarantee
   - `tests/project_state/test_watch_code.py::test_syncs_lsp_before_watch_code_update`
     asserts that LSP sync happens before Watch Code update

## Dependency Finding

The last missing source-of-truth layers from this slice are now closed:

1. bound code-file reloads now reuse the same helper instead of a second diff
   path
2. focused verification now covers the reload path

That means Watch Code behavior no longer differs depending on whether a Python
edit arrives through the watcher runtime, inline `setCode`, or a bound
code-file reload.

## Working Decisions

- keep the completed Watch Code parser/diff/apply helpers as the only callable
  diff owner
  - inline edits and bound reloads should adapt into that path instead of
    rebuilding diff logic
- preserve explicit LSP-before-Watch-Code ordering
  - do not race Watch Code updates ahead of signature-help sync
- keep source-of-truth bindings explicit
  - only bound Python code sections should enter this path
  - do not infer file ownership from section names or generated imports
- baseline tracked bound files when the runtime syncs inputs
  - the Go reload runtime owns subsequent on-disk changes only
  - do not invent an implicit disk-vs-project-state reconciliation policy in
    this slice
- keep transport thin
  - this is backend runtime work, not a frontend transport expansion
- avoid heuristic fallbacks
  - if a robust binding or section identity is unavailable, skip the Watch Code
    update instead of guessing

## Implementation Steps

### Step 1: Inline Edit Hook And Ordering

Status: complete

Deliver:

- inventory and port the authoritative Go hook for bound Python code-section
  updates
- wire the `setCode` path to sync LSP before invoking that helper
- keep the skip rules explicit for:
  - unbound sections
  - non-Python sections
  - projects without Python codegen targets

Acceptance:

- inline edits to bound Python sections reuse the same Watch Code apply path as
  watcher-driven file updates
- no Watch Code update runs before the relevant LSP sync completes

### Step 2: Bound Code File Reload Reuse

Status: complete on 2026-03-07.

Deliver:

- route the Go code-file reload owner through the same helper after section
  reload
- keep one shared Watch Code apply path for external file edits

Acceptance:

- bound code-file reloads create, update, rename, and remove callables through
  the same source-of-truth apply helpers as watcher and inline edits
- no second diff engine or hidden watcher cache is introduced

Completed in this chunk:

- `internal/boundcode/service.go`
- `internal/boundcode/service_test.go`
- `internal/projectstate/bound_code_files.go`
- `internal/projectstate/bound_code_files_test.go`
- `internal/app/code_updates.go`
- `internal/app/code_updates_test.go`
- `internal/app/app.go`
- `internal/app/app_test.go`

### Step 3: Verification And Handoff

Status: complete on 2026-03-07.

Deliver:

- focused tests for:
  - inline `setCode` on bound Python sections
  - bound code-file reloads
  - LSP-before-Watch-Code ordering
- doc updates recording the completed slice and the next remaining backend gap,
  if any

Acceptance:

- the remaining Watch Code gap is explicitly narrowed again, or Phase 5 Watch
  Code is complete if no backend behavior remains

Result:

- Phase 5 Watch Code backend work is now complete for:
  - watcher-driven file updates
  - bound inline edits
  - bound code-file reloads
- no Python-owned Watch Code backend path remains in scope for this phase doc

## Verification Expectations

Completed in this chunk:

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/boundcode -count=1 -timeout 180s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestCodeUpdateServiceReloadBoundCodeFileSyncsLSPBeforeWatchCodeApply|TestAppBoundCodeFileRuntimeAppliesWatchCodeReloads|TestAppSetCodeRouteAppliesWatchCodeBoundSectionUpdate' -count=1 -timeout 180s`

Note:

- the full `./internal/app` package suite still includes unrelated LSP-
  environment-sensitive tests, so this chunk used the focused app runs above
  for the touched Watch Code path

## Next Recommended Step

This focused doc is complete.

Recommended next step:

- return to `go-backend-rewrite-plan.md`, identify the next uncovered phase or
  focused doc outside Watch Code, and treat Watch Code as no longer blocking
  Phase 5 backend work
