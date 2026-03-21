# Phase 26 Post-Startup And Distribution Ownership Rerank

## Purpose

This doc records the rerank after the landed Phase 25 startup/distribution
cleanup track.

The question is no longer whether there are still obvious repo-root wrapper
fixes to make. The current question is narrower:

- does the release/native-installer surface still hide a real remaining
  ownership gap that justifies another implementation slice
- or has the remaining Python/shell role become an explicit, acceptable
  boundary for the current clean-break rewrite scope

## Current Status

Completed before this rerank:

- Phase 25 Slice 2 source/dev startup hardening
- Phase 25 Slice 3 `setta.start` reachability inventory
- Phase 25 Slice 4A wrapper convergence over the shared package-builder
  boundary
- Phase 25 Slice 4A shared built-artifact selection for install/smoke wrappers
- Phase 25 Slice 4A cleanup-on-failure hardening for repo-root publish/smoke
  wrappers

What this doc adds:

- an evidence-backed answer on whether another Phase 25 or Phase 26
  implementation slice is actually selected
- an explicit closeout boundary for the startup/distribution track

Historical note:

- the deliberate packaged-entrypoint fallback follow-on mentioned here was
  later selected and landed in
  `phase-27-packaged-entrypoint-fallback-hardening-plan.md`

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-25-legacy-startup-and-distribution-boundary-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-25-start-py-reachability-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/archive/phase-25-distribution-install-workflow-retargeting-plan.md`
- `docs/reference/setta-cli-commands.md`
- `docs/reference/dev-vs-built.md`
- `docs/guides/dev-scripts.md`
- `build.sh`
- `build_and_upload.sh`
- `verify_install.sh`
- `install_built_setta.sh`
- `scripts/build_python_distribution_with_go_binaries.sh`
- `scripts/install_desktop_launcher.sh`
- `scripts/install_desktop_launcher.ps1`
- `scripts/release/build_macos_installer.sh`
- `scripts/release/build_windows_installer.ps1`
- `scripts/release/smoke_test_launcher_pipeline.sh`
- `scripts/release/smoke_test_native_installer_macos.sh`
- `scripts/release/smoke_test_native_installer_windows.ps1`
- `.github/workflows/release-desktop-launcher.yml`
- `tests/start/test_distribution_script_wiring.py`
- `tests/start/test_distribution_artifact_path_script.py`
- `tests/start/test_packaged_distribution.py`
- `tests/start/test_desktop_launcher_install_scripts.py`

## Inventory Method

1. Re-read the current Phase 25 docs to confirm the active boundary after the
   landed wrapper cleanup sub-slices.
2. Re-read the current repo-root build/install/publish wrappers.
3. Re-read the launcher bootstrap, native-installer build/smoke scripts, and
   release workflow.
4. Compare those scripts against the current test coverage to determine
   whether a non-dormant ownership gap still exists.

## Findings

### 1. The repo-root wrapper surface is now explicit and bounded

Current local wrapper state:

- `build.sh` stages built assets and packages through the shared
  Go-binary-aware distribution helper
- `verify_install.sh` and `install_built_setta.sh` resolve built artifacts
  through a shared single-artifact helper and fail fast on ambiguity
- `build_and_upload.sh` and `verify_install.sh` now preserve real failure exit
  codes while still cleaning on exit

Coverage state:

- `tests/start/test_distribution_script_wiring.py`
- `tests/start/test_distribution_artifact_path_script.py`
- `tests/start/test_packaged_distribution.py`

Rerank implication:

- there is no remaining obvious repo-root wrapper inconsistency that justifies
  another bounded implementation slice by itself

### 2. Native installer and launcher-release workflows already sit on the Go-owned command boundary

Current release/install boundary:

- native-installer build scripts consume packaged sdists built through
  `scripts/build_python_distribution_with_go_binaries.sh`
- bootstrap/install scripts bind desktop installation to the shipped
  `setta launcher setup` / `setta launcher remove` command contract
- native-installer smoke verifies post-install launcher status through the
  shipped `setta` executable, not through legacy Python command ownership
- the release workflow already enforces those paths with focused smoke gates

Coverage state:

- `tests/start/test_desktop_launcher_install_scripts.py`

Rerank implication:

- the remaining native-installer/release shell and PowerShell code is OS and
  packaging glue, not hidden Python-owned product semantics
- there is no evidence-backed next migration slice here unless a concrete
  installer/release failure mode appears

### 3. The remaining Python/shell role is now mostly deliberate boundary, not rewrite debt

The current remaining non-Go ownership is now concentrated in:

- Python package artifact format itself (`sdist` / `wheel`)
- shell/PowerShell orchestration for release, installer, and local workflow
  glue
- the separate legacy `backend/setta/start.py` fallback/help edge set already
  recorded in Phase 25 Slice 3

Rerank implication:

- these are no longer one coherent "next implementation phase"
- broadening this track further would mostly chase toolchain and packaging
  glue rather than closing a product/runtime ownership gap

## Reranked Outcome

1. Phase 25 startup/distribution work is effectively closed for the current
   clean-break scope.
2. The current evidence does not select a new Phase 26 implementation slice.
3. The next honest step is to stop broadening this track until a concrete
   release/install or packaged-entrypoint failure mode appears.

## Decisions Made

- do not invent another startup/distribution implementation phase by inertia
- treat the current release/native-installer shell and PowerShell code as an
  explicit boundary rather than hidden backend rewrite debt
- keep the remaining `setta.start` fallback question separate from
  distribution/install ownership

## Next Recommended Step

Use this doc as the pre-Phase-27 rerank checkpoint, not as the latest state.

The startup/distribution track remains closed for the current clean-break
scope, and the only deliberate follow-on that this doc left open is now also
landed:

- `phase-27-packaged-entrypoint-fallback-hardening-plan.md`

If rewrite work continues from here, only reopen this broader area when one of
these becomes concrete:

- a real release/native-installer failure mode
- a deliberate product decision to change the Python package artifact boundary
- a newly proven still-reachable legacy `setta.start` workflow outside the
  landed Phase 27 packaged-entrypoint slice
