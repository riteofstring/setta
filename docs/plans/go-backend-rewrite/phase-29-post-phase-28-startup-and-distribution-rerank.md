# Phase 29 Post-Phase-28 Startup And Distribution Rerank

## Purpose

This doc records the rerank after the landed Phase 28 shared-helper
extraction.

The question is no longer whether the current repo-local startup or packaged
entrypoint paths still depend on `backend/setta/start.py`. They do not for the
active workflow surface. The question now is whether the remaining Python
startup/distribution ownership still selects a concrete rewrite slice at all.

## Current Status

Completed before this rerank:

- packaged entrypoint fallback hardening in
  `phase-27-packaged-entrypoint-fallback-hardening-plan.md`
- shared startup helper extraction in
  `phase-28-dev-startup-shared-helper-owner-plan.md`
- distribution/install wrapper convergence in
  `phase-25-distribution-install-workflow-retargeting-plan.md`

What this rerank adds:

- a post-Phase-28 inventory of the still-reachable startup/distribution surface
- a narrower distinction between active workflow ownership and legacy test
  anchoring
- an explicit decision on whether a new implementation slice is justified now

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-25-legacy-startup-and-distribution-boundary-plan.md`
- `docs/plans/go-backend-rewrite/phase-25-startup-test-surface-classification-and-source-of-truth.md`
- `docs/plans/go-backend-rewrite/phase-25-start-py-reachability-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/phase-27-packaged-entrypoint-fallback-hardening-plan.md`
- `docs/plans/go-backend-rewrite/phase-28-dev-startup-shared-helper-owner-plan.md`
- `backend/setta/entrypoint.py`
- `backend/setta/__main__.py`
- `backend/setta/dev_start.py`
- `backend/setta/start.py`
- `backend/setta/startup_runtime.py`
- `frontend/backendStart.sh`
- `build.sh`
- `build_and_upload.sh`
- `verify_install.sh`
- `install_built_setta.sh`
- `scripts/release/build_macos_installer.sh`
- `scripts/release/build_windows_installer.ps1`
- `tests/start/test_module_entrypoint.py`
- `tests/start/test_packaged_distribution.py`
- `tests/start/test_desktop_launcher_install_scripts.py`
- `tests/start/test_launcher_artifact_installers.py`

## Inventory Method

1. Re-read the current Phase 25/27/28 docs and roadmap state.
2. Re-read the active packaged and source/dev entrypoint files:
   - `backend/setta/entrypoint.py`
   - `backend/setta/__main__.py`
   - `backend/setta/dev_start.py`
   - `backend/setta/startup_runtime.py`
   - `frontend/backendStart.sh`
3. Search the repo for current non-test `setta.start` reachability.
4. Re-read representative packaged/distribution tests and release scripts to
   confirm whether install/release ownership still hides a `start.py`
   dependency or another concrete selected gap.

## Findings

### 1. Active packaged entrypoint ownership is closed

Current packaged path:

- `python -m setta` goes through `backend/setta/__main__.py` to
  `backend/setta/entrypoint.py`
- `backend/setta/entrypoint.py` is now a thin launcher to the packaged Go
  binary
- there is no live packaged fallback into `backend/setta/start.py`

Rerank implication:

- there is no remaining packaged-entrypoint rewrite slice to open
- further work here would be CLI/help redesign, not rewrite-boundary ownership

### 2. Active source/dev startup ownership is explicit and no longer depends on `setta.start`

Current source/dev path:

- normal repo-local startup routes through `frontend/backendStart.sh` to
  `python -m setta`
- reload routes through `python -m setta.dev_start`
- shared startup runtime behavior now lives in
  `backend/setta/startup_runtime.py`

Rerank implication:

- the active repo-local startup workflow is no longer evidence that
  `backend/setta/start.py` needs to stay as an active helper owner
- the remaining Python-owned dev surface is explicit and deliberate:
  dev-only reload/runtime plus env/bootstrap behavior

### 3. Distribution/install/release scripts are already on the packaged boundary

Current root/release wrapper state:

- `build.sh` delegates packaging to
  `scripts/build_python_distribution_with_go_binaries.sh`
- `verify_install.sh` and `install_built_setta.sh` share artifact resolution
  through `scripts/lib/distribution_artifact_path.sh`
- native installer scripts bundle the packaged sdist and bootstrap through the
  shipped `setta` / launcher install contracts rather than `setta.start`

Rerank implication:

- there is no hidden `setta.start` dependency left in the current install or
  native-installer workflow surface
- the remaining Python ownership here is deliberate packaging/installer glue,
  not backend rewrite debt selected by current evidence

### 4. Remaining `setta.start` reachability is legacy anchor coverage, not an active workflow gap

Current repo search result:

- non-test workflow files no longer route through `setta.start`
- direct `setta.start` imports remain concentrated in the legacy test bucket
  already classified in
  `phase-25-startup-test-surface-classification-and-source-of-truth.md`

Rerank implication:

- those tests remain useful as historical/legacy anchors while cleanup stays
  under discussion
- they do not by themselves justify a new implementation slice

## Decisions Made

- treat the startup/distribution track as effectively closed for the current
  clean-break rewrite scope
- do not open another `backend/setta/start.py` cleanup slice without a
  concrete active workflow, release issue, or product-backed reason
- continue treating direct `tests/start/*` coverage of `setta.start` as legacy
  anchor coverage unless a real current caller proves otherwise
- keep the remaining deliberate Python ownership explicit:
  - dev-only reload/runtime in `setta.dev_start` / `setta.startup_runtime`
  - Python packaging boundary
  - launcher/native-installer artifact scripts

## Verification

- `git diff --check`

## Next Recommended Step

Do not broaden startup/distribution cleanup by inertia.

If rewrite work continues, the next honest step is a broader rerank outside
this track or a new focused slice selected by a concrete release/runtime
problem. There is no evidence-backed startup/distribution implementation slice
to open right now.
