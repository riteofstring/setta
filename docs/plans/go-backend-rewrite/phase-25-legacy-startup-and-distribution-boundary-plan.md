# Phase 25 Legacy Startup And Distribution Boundary Plan

## Purpose

This doc scopes the next rewrite track after the landed Phase 25 ownership
inventory.

The packaged backend/runtime and shipped command semantics are already Go-owned
for the current product surface. The remaining meaningful Python ownership is
now concentrated in:

- legacy `backend/setta/start.py` fallback/startup behavior
- source/dev startup and script wiring
- distribution, install, and release workflow glue

The goal here is not to reopen backend route migration. It is to define the
smallest honest plan for reducing that remaining Python/shell ownership
without reintroducing Python-shaped command architecture.

## Current Status

Completed before this plan:

- packaged command routing through `backend/setta/entrypoint.py` to Go-owned
  binaries
- Go-owned shipped `setta` command surface in `cmd/setta` /
  `internal/settacmd`
- Go-owned backend runtime in `cmd/setta-server` / `internal/app`
- Phase 25 ownership inventory in
  `phase-25-remaining-python-ownership-inventory-and-rerank.md`

Completed during Slice 1:

- shipped CLI/reference docs synced to the Go-owned packaged command surface
- `tests/start/*` classified explicitly in
  `phase-25-startup-test-surface-classification-and-source-of-truth.md`
  into:
  - active shipped/distribution behavior
  - active source/dev workflow behavior
  - legacy fallback behavior

Focused Slice 2 plan now added:

- `phase-25-dev-startup-command-boundary-plan.md`
  - bounded first implementation step for source/dev startup hardening:
    make `backendStart.sh` use an explicit routed command boundary for normal
    startup and an explicit dev-only legacy path for reload

Completed during Slice 2 sub-slice:

- `frontend/backendStart.sh` no longer relies on bare `setta` for normal dev
  startup
- non-reload startup now uses `python -m setta`
- reload startup now uses the explicit `python -m setta.dev_start` owner
- the dev reload path no longer delegates through `setta.start.cli`
- focused source/dev tests now guard that boundary explicitly, including direct
  tests for the reload owner

Completed during Slice 3 inventory step:

- `phase-25-start-py-reachability-inventory-and-rerank.md` now records the
  still-reachable `setta.start` surface after the dev-start boundary change
- active source/dev startup no longer reaches `setta.start`
- the remaining active packaged fallback is now narrowed to root help, bare
  `plugins`, and unknown-command / unknown-flag handling through
  `backend/setta/entrypoint.py`
- direct `tests/start/*` imports of `setta.start` remain legacy anchors rather
  than automatic proof of active workflow reachability

Completed during the first Slice 4 distribution/install sub-slice:

- the shared package-builder boundary in
  `scripts/build_python_distribution_with_go_binaries.sh` is now reusable from
  repo-root wrappers via `--skip-cleanup`
- `build.sh` now stages frontend/static assets and then delegates packaging to
  that shared helper instead of calling `python -m build` directly
- focused root-wrapper tests now cover the shared build/install script contract

Completed during the second Slice 4 distribution/install sub-slice:

- built distribution artifact selection is now shared in
  `scripts/lib/distribution_artifact_path.sh`
- `verify_install.sh` and `install_built_setta.sh` now fail fast on zero or
  multiple matching artifacts instead of carrying separate selection logic
- focused helper and wrapper integration tests now cover that boundary

Completed during the third Slice 4 distribution/install sub-slice:

- `build_and_upload.sh` now has explicit repo-root ownership plus cleanup on
  failure without masking upload exit status
- `verify_install.sh` now also cleans on failure
- focused wrapper tests now cover failure propagation and cleanup ordering

Completed after the Phase 26 rerank:

- `phase-27-packaged-entrypoint-fallback-hardening-plan.md` now records the
  landed bounded packaged-entrypoint follow-on
- root help, bare `plugins`, `plugins lock`, and invalid root argv handling
  are now Go-owned through `internal/settacmd` plus
  `backend/setta/entrypoint.py`
- the active packaged `setta.start` fallback identified in Slice 3 is no
  longer the current ownership gap

Still owned outside Go:

- legacy `backend/setta/start.py` command/fallback behavior
- source/dev script wiring that still assumes Python env/bootstrap behavior
- distribution/install/release workflows under `scripts/`
- tests in `tests/start/` that still anchor legacy Python command semantics

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-25-remaining-python-ownership-inventory-and-rerank.md`
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
- `tests/start/test_packaged_distribution.py`

## Problem Shape

The remaining work is not one thing.

It splits into three related but different ownership problems:

1. legacy startup/fallback ownership
   - `backend/setta/start.py` still carries a large command tree and startup
     helper surface
   - some of that code is now legacy fallback rather than active shipped
     product behavior

2. source/dev startup ownership
   - local dev scripts still assume Python activation, Python package layout,
     and shell-layer bootstrap rules
   - the current dev-start contract is not expressed as a small explicit
     Go-owned boundary

3. distribution/install workflow ownership
   - install/release scripts still orchestrate packaging and bootstrap through
     Python and shell/PowerShell glue
   - those workflows should not quietly inherit legacy `start.py` assumptions

## Desired Boundaries

### 1. Keep packaged command semantics Go-owned

Do not reopen:

- Click parity for shipped commands
- Python-owned subcommand trees for current product commands
- hybrid route/command ownership

### 2. Reduce `start.py` to an explicit fallback boundary

Recommendation:

- treat `backend/setta/start.py` as legacy compatibility and dev helper code
  until each remaining consumer is moved or intentionally dropped
- do not keep adding new product semantics there

### 3. Make source/dev startup explicit

Recommendation:

- define a small explicit dev-start contract around the existing Go-owned
  command/router surface
- keep shell helpers thin and deterministic
- prefer environment/path wiring over Python-command semantics as the active
  source of truth

### 4. Keep distribution/install work separate from backend runtime

Recommendation:

- installer and release workflow ownership should build on the Go-owned
  command surface, not on `start.py`
- do not bundle those scripts into unrelated backend phases

## Planned Slices

### Slice 1: Startup boundary inventory cleanup and source-of-truth docs

Status: completed

Deliverables:

- update stale command/reference docs so they describe the current Go-owned
  shipped command surface accurately
- identify which `tests/start/*` cases still validate active product behavior
  versus legacy fallback
- record the explicit source/dev startup contract over the current Go-owned
  command surface

Why this goes first:

- the current docs and tests still mix shipped behavior with legacy Python
  fallback
- that ambiguity makes later cleanup risky

### Slice 2: Source/dev startup contract hardening

Deliverables:

- narrow `frontend/backendStart.sh` and related dev wiring to the explicit
  Go-owned command boundary
- remove accidental dependency on legacy Python command semantics where
  current dev workflows do not need them
- add or update focused wiring tests under `tests/start/`

Non-goals:

- removing every Python env dependency from dev workflows
- installer/release retargeting in the same slice

### Slice 3: Legacy `start.py` fallback reduction

Deliverables:

- identify which remaining `start.py` commands are still reachable through
  active workflows
- retire or isolate unreachable legacy command branches
- keep any still-needed compatibility path explicit and minimal

Non-goals:

- broad code motion just to claim line-count wins
- preserving Click internals as a design constraint

### Slice 4: Distribution/install workflow retargeting

Deliverables:

- retarget install/release helpers to explicit Go-owned command contracts
- keep Python packaging only where it is still the deliberate artifact format
  boundary
- update verification flows accordingly

Non-goals:

- rewriting every shell/PowerShell script into Go by default
- changing release packaging format unless that is separately selected

## Working Decisions

- treat this as a post-backend rewrite track, not as another backend phase
- keep packaged command semantics locked to Go
- use explicit workflow boundaries instead of preserving `start.py` behavior by
  inertia
- split source/dev startup from distribution/install work so each can move in
  bounded slices

## Recommended First Implementation Slice

Start with Slice 1 only:

1. sync the shipped CLI reference and remaining rewrite docs to the current
   command ownership
2. classify the current `tests/start/*` coverage into:
   - active shipped behavior
   - source/dev workflow behavior
   - legacy fallback behavior
3. open the narrower Slice 2 plan only after that classification is explicit

This keeps the first step small and prevents speculative cleanup in `start.py`
before the remaining active workflows are clear.

## Verification Targets

For Slice 1:

- docs-only verification with `git diff --check`

For later slices:

- focused `tests/start/*` runs for the touched wiring or entrypoint behavior
- explicit installer/release smoke only when those workflows are touched

## Next Recommended Step

The narrow packaged-entrypoint fallback slice is now complete.

If rewrite work continues, do not reopen broad `start.py` cleanup by default.
Rerank from the now-landed Phase 27 state instead:

- treat `phase-27-packaged-entrypoint-fallback-hardening-plan.md` as the
  closeout record for the last active packaged entrypoint fallback
- only open another startup/legacy-Python slice if a concrete still-reachable
  workflow or shipped surface remains after that landing

Use these docs as the current source of truth:

- use
  `phase-25-startup-test-surface-classification-and-source-of-truth.md` as the
  contract boundary
- use `phase-25-dev-startup-command-boundary-plan.md` as the record of the now
  landed source/dev startup hardening slice
- use `phase-25-start-py-reachability-inventory-and-rerank.md` as the record
  of the inventory step that selected the later landed fallback-hardening
  slice
- use `phase-27-packaged-entrypoint-fallback-hardening-plan.md` as the record
  of the now-landed packaged entrypoint fallback closeout

The focused Slice 4 implementation plan is now:

- `phase-25-distribution-install-workflow-retargeting-plan.md`

The post-Phase-25 rerank is now:

- `phase-26-post-startup-and-distribution-ownership-rerank.md`
