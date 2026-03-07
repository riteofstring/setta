# Phase 5 Watch Code Inline Edit And Bound Code File Reuse

## Purpose

This doc narrows the remaining Watch Code backend gap after the completed Go
runtime, project-state apply, Callable section mutation, callable refetch, and
warning-notification slices.

Go now owns watcher-driven Watch Code updates for on-disk watched files. What
still remains Python-owned is the reuse boundary for edits that arrive through
bound code sections instead of the Watch Code watcher runtime:

- inline `set_code` updates on bound Python code sections
- bound code-file reloads after on-disk file changes
- the explicit LSP-before-Watch-Code ordering for those paths

## Status

Current repo status as of 2026-03-07:

- Watch Code state, route transport, parser/diff planning, runtime ownership,
  project-state file apply, Callable section mutation, callable refetch, and
  warning notifications are complete in Go
- watcher-triggered file updates already reuse the authoritative Go apply path
  in:
  - `internal/watchcode`
  - `internal/projectstate/watch_code_apply.go`
  - `internal/projectstate/watch_code_callable_sections.go`
  - `internal/app/watch_code_notifications.go`
- unresolved signature-help `no_match` warnings now emit as deduped frontend
  `Notification` websocket messages from Go
- Python still owns the remaining reuse boundary in:
  - `backend/setta/project_state/watch_code.py`
  - `backend/setta/project_state/code_files.py`
  - `backend/setta/project_state/base_project_manager.py`
- the active Watch Code gap is now narrowed to:
  - inline code edits on bound Python code sections
  - bound code-file reload integration
  - preserving LSP-before-Watch-Code ordering for both paths

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

Three source-of-truth layers are still missing in Go:

1. an authoritative bound-code-section Watch Code hook above the completed file
   apply helpers
2. inline `setCode` integration that preserves LSP-before-Watch-Code ordering
3. bound code-file reload integration that reuses the same helper instead of a
   second diff path

Without those layers, Watch Code behavior still differs depending on whether a
Python edit arrives through the watcher runtime or through a bound code section.

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
- keep transport thin
  - this is backend runtime work, not a frontend transport expansion
- avoid heuristic fallbacks
  - if a robust binding or section identity is unavailable, skip the Watch Code
    update instead of guessing

## Implementation Steps

### Step 1: Inline Edit Hook And Ordering

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

Deliver:

- route the Go code-file reload owner through the same helper after section
  reload
- keep one shared Watch Code apply path for external file edits

Acceptance:

- bound code-file reloads create, update, rename, and remove callables through
  the same source-of-truth apply helpers as watcher and inline edits
- no second diff engine or hidden watcher cache is introduced

### Step 3: Verification And Handoff

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

## Verification Expectations

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/lsp ./internal/app -count=1 -timeout 180s`
- add focused tests mirroring the Python reference behavior for:
  - bound inline edits creating or updating Watch Code callables
  - bound code-file reloads reusing the same Watch Code helper
  - `sync LSP -> Watch Code update` ordering

## Next Recommended Step

Execute Step 1 next:

- inventory the current Go `setCode` owner and bound-code-section save path
- add the authoritative bound-code-section Watch Code hook with explicit
  LSP-before-Watch-Code ordering
- keep the completed watcher/apply/refetch/warning layers unchanged
