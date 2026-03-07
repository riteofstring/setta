# Phase 5 Watch Code Callable Section Mutation

## Purpose

This doc narrows Step 2 from
`phase-5-watch-code-projectstate-apply-and-section-mutation.md`.

Go now owns Watch Code file apply helpers and runtime callback wiring into
persisted project state. This focused doc tracks the authoritative layer above
those helpers:

- backfilling placeholder registry entries into real Callable sections
- rename/remove behavior over existing Callable sections
- Python `genCodePrefix` import bookkeeping for Watch Code-owned callables
- signature-change reuse of the shared Go callable refetch path

The only remaining work after Step 2 is warning-notification emission for
unresolved signature help.

## Status

Current repo status as of 2026-03-07:

- Watch Code state, route transport, manager/runtime ownership, and file apply
  helpers are complete in Go
- `applyWatchCodeFileUpdate` / `applyWatchCodeFileDelete` now update:
  - `watchCodeRegistry`
  - `watchCodeBaselineByPath`
  - move-aware `sourcePath` rewrites
- Step 1 intentionally materialized new callables as placeholder registry
  entries with empty `sectionIds`
- the active Watch Code gap is now narrower:
  - Step 1 is now complete:
    - new and pending Watch Code registry entries now create real Callable
      sections in Go
    - rename/remove behavior over section IDs now runs in Go
    - Python target import-prefix updates now run in Go
    - the IDE Watch Code runtime now drives that section-mutation path
  - Step 2 is now complete:
    - watcher-triggered signature changes now call the shared Go
      `SetCallable(..., refetch=true)` path after section reconciliation
    - refetch uses the Watch Code registry `callableName` as the authoritative
      callable target for each linked section
    - unavailable signature context now preserves existing params while still
      updating registry signature/body metadata
  - the remaining gap is now Step 3 only:
    - unresolved signature-help warning notifications still are not emitted

## Scope

This focused doc covers:

- Go-owned Callable section creation for new and pending Watch Code registry
  entries
- Go-owned section rename/remove behavior driven by the existing Watch Code
  scan/delete plans
- alias-safe Python `genCodePrefix` import add/remove updates
- Go-owned signature-change reuse of the shared callable refetch path
- registry reconciliation for:
  - `callableName`
  - `sectionIds`
  - `sectionsCount`

## Non-Goals

- warning-notification websocket emission
- broad section-creation APIs for unrelated section kinds
- inline code-section / bound code-file Watch Code reuse
- widening frontend transport

## Inputs

- `docs/reference/watch-code.md`
- `docs/plans/go-backend-rewrite/phase-5-watch-code-projectstate-apply-and-section-mutation.md`
- `backend/setta/project_state/watch_code.py`
- `backend/setta/types/helpers_lvl2.py`
- `tests/project_state/test_watch_code.py`
- `internal/projectstate/watch_code_apply.go`
- `internal/projectstate/callable.go`
- `internal/projectstate/python_codegen.go`

## Current Python Behavior

Python currently owns three section-mutation behaviors that sit directly above
the completed Go file-apply layer:

1. new callables resolve an alias-safe reference name, add a Python import
   line, create a top-level Callable section, and link that section back into
   the registry
2. renamed callables keep their existing section IDs and existing params while
   updating registry identity, callable object name, and import lines
3. removed callables delete only the matching Callable variants; whole sections
   are deleted only when no other variants remain

Those behaviors are independent of later signature-help refetch. They are the
minimum source-of-truth layer needed before the remaining Watch Code work can
reuse the Go callable runtime cleanly.

## Working Decisions

- treat empty-section registry entries as pending section creation
  - Step 1 placeholders are now the source of truth for cross-config moves and
    pre-section runtime updates
- keep section mutation project-state-owned
  - `internal/watchcode` continues to own parsing and diff plans only
- keep import aliasing explicit and deterministic
  - reuse canonical identity + reserved callable names
  - do not infer aliases from heuristics or frontend state
- prefer narrow Callable-only helpers here
  - generic section-creation abstractions can wait until another subsystem
    needs them
- use the registry entry as the signature-refetch source of truth
  - Watch Code owns the authoritative callable identity for its linked sections
  - do not infer the target callable name from whichever code object happens to
    be selected in the section payload

## Implementation Steps

### Step 1: Callable Section Backfill And Import Sync

Status: complete on 2026-03-07.

Deliver:

- Go helpers to:
  - create top-level Callable sections for pending/new Watch Code entries
  - resolve alias-safe callable reference names
  - add/remove Python `genCodePrefix` imports
- scan-plan application updates for:
  - additions
  - placeholder backfill
  - renames
  - removals

Acceptance:

- new Watch Code callables create one Callable section and record its section ID
- moved placeholder entries become section-backed again on the next destination
  scan
- renames keep existing section IDs and update the selected callable name
- removals delete whole sections only when no other variants remain

Completed in this chunk:

- `internal/projectstate/watch_code_callable_sections.go`
- `internal/projectstate/watch_code_apply.go`
- `internal/projectstate/python_codegen.go`
- `internal/projectstate/watch_code_apply_test.go`
- `internal/app/app.go`
- `internal/app/app_test.go`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/app -count=1 -timeout 180s`

### Step 2: Callable Refetch Reuse

Deliver:

- route Watch Code signature changes through the completed Go callable binding /
  refetch path after Step 1 section mutation is stable
- preserve existing params when signature resolution is unavailable

Acceptance:

- signature changes reuse the same callable synthesis ownership as manual and
  diagnostics-triggered refetch
- no second Watch Code-only param synthesis path exists

Status: complete on 2026-03-07.

Completed in this chunk:

- `internal/projectstate/watch_code_callable_sections.go`
- `internal/projectstate/watch_code_apply_test.go`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestRuntimeApplyWatchCodeFileUpdate(SignatureChangeRefetchesCallableParams|SignatureChangeWithoutSignatureContextKeepsParams|RenamePreservesSectionIDsAndParams|SyntaxErrorPreservesProjectState)$|TestProjectRefetchCallableParamsReusesCurrentCallable|TestProjectSetCallableAppliesMatchedSignatureAndPreservesExistingValues' -count=1 -timeout 180s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/app -count=1 -timeout 180s`

### Step 3: Warning Notifications And Final Verification

Deliver:

- deduped warning notification emission for unresolved signature help
- focused runtime/app verification after Step 2 lands

Acceptance:

- the remaining Watch Code gap is narrowed to later inline-edit / bound-code
  file reuse only

## Verification Expectations

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/app -count=1 -timeout 180s`
- narrower package-level runs while building Step 1
- add explicit coverage for:
  - new section creation
  - placeholder backfill after cross-config move
  - rename reusing section IDs
  - remove-vs-keep behavior with multiple variants

## Next Recommended Step

Execute Step 3 next:

- emit deduped warning notifications when Watch Code signature help returns
  `no_match`
- keep the completed section-mutation and refetch helpers as the only Watch
  Code section owner
- finish the bounded runtime/app verification around that warning path
