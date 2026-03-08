# Phase 25 Remaining Python Ownership Inventory And Rerank

## Purpose

This doc records the next broader rerank after the landed Phase 24
capability-gap inventory.

Phase 24 confirmed that the remaining typed Go `unsupported` /
`unavailable` branches did not select a new caller-backed backend
implementation phase. That moved the rewrite question again:

- if rewrite work continues beyond the closed backend route/runtime track,
  what Python-owned surface is actually left?

This doc answers that question by inventorying the remaining Python and shell
ownership around entrypoints, startup, and workflow glue instead of pretending
there is still a hidden backend-runtime phase.

## Current Status

Completed before this inventory:

- Phase 22 artifact/file-browser route-cluster closeout
- Phase 23 post-artifact direct-frontend rerank
- Phase 24 caller-backed capability-gap rerank

Current repo status as of 2026-03-10:

- packaged backend/runtime and shipped command semantics are Go-owned for the
  current product surface
- no caller-backed backend implementation slice is currently selected
- the remaining obvious Python ownership is now concentrated in:
  - legacy startup/fallback command code
  - source/dev wiring
  - distribution/install/release workflows

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-24-caller-backed-capability-gap-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/phase-7-closeout-and-cli-follow-up-boundary.md`
- `docs/plans/go-backend-rewrite/phase-8-cli-closeout-and-launcher-distribution-boundary.md`
- `docs/plans/go-backend-rewrite/phase-9-shipped-entrypoint-and-launcher-distribution-plan.md`
- `docs/plans/go-backend-rewrite/phase-11-maintenance-command-inventory.md`
- `docs/reference/setta-cli-commands.md`
- `pyproject.toml`
- `backend/setta/entrypoint.py`
- `backend/setta/__main__.py`
- `backend/setta/start.py`
- `frontend/backendStart.sh`
- `scripts/run-dev-instance.sh`
- `verify_install.sh`
- `tests/start/test_module_entrypoint.py`
- `tests/start/test_dev_script_wiring_backend_start.py`
- `tests/start/test_launch.py`
- `tests/start`

## Inventory Method

1. Start from the current docs that already close the packaged CLI/runtime
   slices.
2. Read the current shipped Python entrypoint wrapper and the remaining legacy
   Python command owner.
3. Read the current dev/start and verification shell scripts that still anchor
   source and release workflows.
4. Separate packaged product ownership from legacy fallback, dev-only wiring,
   and distribution/install glue.

## Findings

### 1. The packaged command surface is already Go-owned

Current packaged boundary:

- `pyproject.toml` publishes `setta = "setta.entrypoint:main"`
- `backend/setta/entrypoint.py` dispatches the current shipped command surface
  into the packaged Go binary
- `backend/setta/__main__.py` reuses that same thin dispatcher

Current shipped Go-owned command surface includes:

- default `setta`
- `share`
- `app`
- `launch`
- `launcher`
- `version`
- `export-db`
- `backups`
- `plugins`
- `status`
- `auth`
- `tools`
- `api`
- `stop`
- `connect`

Rerank implication:

- there is no remaining packaged CLI parity phase to invent
- this track is no longer about shipped product command semantics

### 2. `backend/setta/start.py` is now mostly a legacy/fallback owner

Current code reality:

- `backend/setta/start.py` still contains the large Click-based command tree
  and legacy startup helpers
- `tests/start/` still contains substantial coverage aimed directly at
  `setta.start`

Current product boundary:

- the shipped command surface above no longer depends on `start.py` for the
  listed commands when the packaged Go binary is available
- `start.py` is now primarily:
  - legacy fallback behavior
  - source/dev/test reference behavior
  - supporting glue for workflows that still assume Python ownership

Rerank implication:

- this is real remaining Python ownership
- but it is not the same as a missing backend runtime owner

### 3. Dev/start and workflow wiring still depends on Python and shell glue

Current examples:

- `frontend/backendStart.sh`
  - activates the Python environment
  - shells into the `setta` command with dev-focused env/path wiring
- `scripts/run-dev-instance.sh`
  - orchestrates worktree dev startup around shell helpers and frontend
    package scripts
- `verify_install.sh`
  - still builds and reinstalls the Python package through `python -m build`
    plus `uv pip`
- `tests/start/test_dev_script_wiring_backend_start.py`
  - validates script-to-command wiring rather than pure Go command ownership
- `tests/start/test_launch.py`
  - still validates legacy Python launch behavior directly

Rerank implication:

- the remaining rewrite surface is now strongly about startup and workflow
  ownership, not route transport
- that surface is broad enough to require an explicit plan rather than an
  opportunistic patch

### 4. Distribution/install workflow ownership is still partly Python/shell

Earlier CLI/distribution docs already narrowed this boundary, and the current
repo state still matches that direction:

- installer scripts and release workflows still exist under `scripts/`
- packaged command semantics are Go-owned, but install/build orchestration is
  still not purely Go-owned

Rerank implication:

- if rewrite work continues beyond backend runtime, distribution/install
  workflow ownership is part of the same remaining track as legacy startup
  ownership
- it should not be mixed back into backend route/runtime planning

### 5. The next rewrite phase is no longer backend runtime; it is legacy startup/distribution ownership

After the post-Phase-24 broader inventory:

- there is no evidence-backed next backend implementation slice
- there is still meaningful remaining Python ownership
- that remaining ownership is concentrated in legacy startup/fallback and
  workflow/distribution glue

## Reranked Outcome

1. The backend runtime rewrite is effectively closed for the current
   caller-backed/product-backed scope.
2. The next rewrite track, if work continues, should be legacy Python
   startup/fallback and distribution/workflow ownership.
3. That next track is large enough to require a focused implementation plan
   before code changes.

## Decisions Made

- stop framing the remaining rewrite work as another backend route/runtime gap
- treat `backend/setta/start.py` as legacy startup/fallback ownership, not as
  hidden packaged command ownership
- keep distribution/install workflow work grouped with startup ownership
  instead of scattering it across unrelated backend phases

## Next Recommended Step

The focused follow-on planning and Slice 1 classification are now recorded in:

- `phase-25-legacy-startup-and-distribution-boundary-plan.md`
- `phase-25-startup-test-surface-classification-and-source-of-truth.md`

The next executable step is Phase 25 Slice 2 source/dev startup contract
hardening.
