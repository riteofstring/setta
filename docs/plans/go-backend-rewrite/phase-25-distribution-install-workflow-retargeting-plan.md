# Phase 25 Distribution Install Workflow Retargeting Plan

## Purpose

This doc narrows Phase 25 Slice 4 into the next bounded implementation track
after the completed `setta.start` reachability inventory.

The remaining work is not "remove Python from packaging." The current shipped
artifact format is still a Python sdist/wheel that deliberately bundles the
Go-owned binaries. The real remaining ownership problem is the workflow glue
around that artifact boundary:

- repo-root build/upload/smoke wrappers
- built-install convenience scripts
- release/install documentation that still points at stale shell contracts

## Scope

In scope:

- `build.sh`
- `build_and_upload.sh`
- `verify_install.sh`
- `install_built_setta.sh`
- `scripts/build_python_distribution_with_go_binaries.sh`
- focused docs and tests for those workflow boundaries

Out of scope:

- changing the shipped package format away from Python sdist/wheel
- native installer bootstrap changes already covered by the landed Phase 9 work
- broad `backend/setta/start.py` cleanup
- removing Python packaging from the release artifact pipeline

## Current Status

Completed before this plan:

- packaged `setta` command routing is Go-owned through the thin Python
  entrypoint wrapper
- packaged wheels now require bundled Go binaries and are marked
  platform-specific
- release workflows and native-installer packaging already use
  `scripts/build_python_distribution_with_go_binaries.sh` as the explicit
  distribution builder boundary
- Phase 25 Slice 2 and Slice 3 closed the active dev-start boundary and
  narrowed remaining `setta.start` reachability

Current gap:

- the repo-root distribution wrappers still do not consistently use the same
  explicit distribution builder boundary as the release workflows
- the docs still describe some of those wrappers in terms of raw
  `python -m build` behavior rather than the shared helper boundary

## Inputs

- `phase-25-legacy-startup-and-distribution-boundary-plan.md`
- `phase-25-start-py-reachability-inventory-and-rerank.md`
- `phase-9-shipped-entrypoint-and-launcher-distribution-plan.md`
- `docs/reference/dev-vs-built.md`
- `docs/reference/remote-built-install.md`
- `docs/guides/dev-scripts.md`
- `build.sh`
- `build_and_upload.sh`
- `verify_install.sh`
- `install_built_setta.sh`
- `scripts/build_python_distribution_with_go_binaries.sh`
- `scripts/build_packaged_go_binaries.sh`
- `hatch_build.py`
- `tests/start/test_packaged_distribution.py`
- `tests/start/test_desktop_launcher_install_scripts.py`
- `tests/start/test_activate_built_setta_script.py`

## Current Problem

The explicit packaging boundary already exists, but it is not used consistently.

Current state:

- release workflows call
  `./scripts/build_python_distribution_with_go_binaries.sh`
- root `build.sh` still drives `python -m build` directly after its own
  cleanup/build preparation
- root verification/install wrappers inherit that duplication
- the helper currently performs its own cleanup, which prevents `build.sh`
  from reusing it directly after frontend/static preparation

That split is unnecessary technical debt:

- the release path and local build path can drift
- docs have to explain two slightly different packaging stories
- future distribution changes have more places to update

## Planned Slices

### Slice 4A: Root wrapper convergence over the packaged distribution helper

Deliverables:

- make `build.sh` package through
  `scripts/build_python_distribution_with_go_binaries.sh`
- keep a way for `build.sh` to reuse that helper without deleting freshly built
  frontend/static artifacts
- keep `build_and_upload.sh`, `verify_install.sh`, and `install_built_setta.sh`
  aligned around the same explicit artifact-building boundary
- add focused `tests/start/*` coverage for those script contracts
- sync the developer-facing docs that describe those wrappers

Non-goals:

- changing which artifacts `build.sh` emits
- changing release publication semantics
- changing native-installer package inputs

### Slice 4B: Built-install and release-smoke contract cleanup

Deliverables:

- audit whether `verify_install.sh` and `install_built_setta.sh` should share
  a deterministic artifact-selection helper
- tighten docs and tests around built-install expectations and cleanup

Non-goals:

- adding a new installer/runtime owner
- changing end-user install recommendations without evidence

## Decisions

- keep the Python package artifact boundary explicit for now
- treat `scripts/build_python_distribution_with_go_binaries.sh` as the
  canonical local/release package builder
- converge wrappers onto that boundary instead of inventing another packaging
  abstraction
- keep the first slice small and script-focused

## Verification

For Slice 4A:

- focused backend tests under `tests/start/` for the touched scripts/docs
- `git diff --check`

## Next Recommended Step

Execute Slice 4A first:

1. make the packaged-distribution helper reusable from `build.sh` without
   wiping newly prepared frontend/static assets
2. retarget `build.sh` to that helper
3. add focused script-wiring coverage and sync docs
