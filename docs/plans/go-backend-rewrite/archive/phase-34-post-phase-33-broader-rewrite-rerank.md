# Phase 34 Post-Phase-33 Broader Rewrite Rerank

## Purpose

This doc records the broader rerank after the landed Phase 33 packaging and
distribution closeout.

Phase 33 confirmed that the remaining packaging split is deliberate:

- wheel for packaged-user installs
- sdist for explicit completeness smoke
- explicit source/dev bootstrap for repo workflows

The next honest question is broader again: does any active workflow now select
another concrete rewrite phase outside that closed packaging boundary?

## Current Status

Completed before this rerank:

- broader rewrite closeout in
  `phase-30-post-phase-29-broader-rewrite-rerank.md`
- packaged Python boundary closeout in
  `phase-31-packaged-python-boundary-slimdown-plan.md`
- packaging/distribution closeout in
  `phase-33-post-phase-32-packaging-and-distribution-rerank.md`

What this rerank adds:

- a post-Phase-33 check of the remaining explicit Python-owned surfaces
- a concrete decision on whether another implementation phase is honestly
  selected from the current repo state

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-30-post-phase-29-broader-rewrite-rerank.md`
- `docs/plans/go-backend-rewrite/archive/phase-31-packaged-python-surface-and-dependency-rerank.md`
- `docs/plans/go-backend-rewrite/archive/phase-33-post-phase-32-packaging-and-distribution-rerank.md`
- `backend/setta/entrypoint.py`
- `backend/setta/dev_start.py`
- `backend/setta/server.py`
- `pyproject.toml`
- `verify_install.sh`
- `install_built_setta.sh`
- `tests/start/test_module_entrypoint.py`
- `tests/start/test_dev_start.py`
- `tests/start/test_distribution_script_wiring.py`
- `tests/start/test_packaged_distribution.py`

## Inventory Method

1. Re-read the current roadmap and the landed Phase 30, Phase 31, and Phase 33
   reranks/closeouts.
2. Re-read the active packaged entrypoint, dev-start entrypoint, and current
   Python server owner.
3. Re-read the current packaging metadata plus the wheel/sdist install
   wrappers.
4. Re-read focused tests that prove the current packaged-user, dev-only, and
   sdist-smoke paths.
5. Decide whether any remaining explicit Python surface is now evidence of a
   concrete rewrite phase, rather than an already-accepted boundary.

## Findings

### 1. The shipped packaged command boundary remains closed

Current packaged-user command path:

- `python -m setta` dispatches through `backend/setta/entrypoint.py`
- that dispatcher resolves the packaged Go CLI binary and executes it directly
- `tests/start/test_module_entrypoint.py` still treats that thin Go dispatch as
  the shipped contract

Rerank implication:

- there is no remaining packaged CLI/entrypoint rewrite slice to open
- the shipped command surface is still explicitly Go-owned

### 2. The active Python backend/runtime surface is explicit and dev-only

Current source/dev path:

- `python -m setta.dev_start` is the explicit dev reload/start owner
- `backend/setta/dev_start.py` still launches `uvicorn` against
  `backend/setta/server.py`
- `tests/start/test_dev_start.py` treats that path as the current dev-only
  contract

Rerank implication:

- the remaining active Python server/runtime ownership is deliberate
- there is no new evidence that Go dev-reload/server ownership is a selected
  rewrite phase right now

### 3. Packaging/distribution is now coherent rather than mixed

Current split:

- wheel-first user installs via native installers, built-install docs, and
  `install_built_setta.sh`
- sdist completeness smoke via `verify_install.sh`
- explicit repo-local source/dev extras via `pyproject.toml` and `init_env.sh`

Rerank implication:

- the earlier packaging inconsistency is closed
- no new packaging/distribution implementation phase is selected

### 4. Remaining Python/tooling dependencies are already deliberate boundaries

Current explicit Python/tool edges still in repo state:

- dev-only server/runtime dependencies behind the `source` extra
- explicit sidecar/tool dependencies that the Go runtime still invokes
- packaged entrypoint modules that exist only to dispatch into the Go CLI

Rerank implication:

- these are not hidden rewrite debt by themselves
- changing them now would be a new product/tooling phase, not the continuation
  of the completed backend/runtime rewrite track

### 5. There is still no evidence-backed implementation slice to open

Current repo evidence:

- no caller-backed backend/runtime transport gap is open
- no launcher/install/distribution inconsistency is open
- no packaged-user artifact inconsistency is open
- the remaining Python surfaces are deliberate, dev-only, or explicit tooling
  boundaries

Rerank implication:

- there is no honest implementation slice to open from current repo state
- broadening the rewrite further would be speculative cleanup

## Decisions Made

- treat the broader rewrite as effectively closed again for the current
  clean-break scope
- do not open another implementation phase without a concrete active workflow,
  release/runtime issue, or product-backed decision
- keep the remaining Python-owned surfaces explicit:
  - packaged Go dispatch entrypoint
  - dev-only reload/server owner
  - explicit wheel/sdist/source install split
  - Python sidecars and tool executables still invoked by Go

## Verification

- `git diff --check`

## Next Recommended Step

Do not broaden the rewrite by inertia.

If work continues later, the next honest step is a new focused phase selected
by a concrete issue or product decision. There is no evidence-backed
implementation slice to open from the current repo state alone.
