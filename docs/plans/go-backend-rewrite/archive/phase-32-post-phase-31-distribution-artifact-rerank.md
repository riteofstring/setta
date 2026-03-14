# Phase 32 Post-Phase-31 Distribution Artifact Rerank

## Purpose

This doc records the rerank after the landed Phase 31 packaged Python boundary
closeout.

Phase 31 made the wheel boundary explicit, narrowed default packaged
dependencies, and made repo-local source/dev bootstrap explicit. The next honest
question is narrower: does the shipped distribution artifact surface still have
one more selected ownership gap now that the wheel is the clear packaged-user
boundary?

Update after Slice 1 landing on 2026-03-10:

- native macOS and Windows installers now bundle platform wheels rather than
  the broader sdist
- native-installer workflow jobs now build wheels for that installer-managed
  path
- the remaining Phase 32 work is now the explicit `verify_install.sh`
  sdist-smoke decision

Update after Slice 2 landing on 2026-03-10:

- `docs/reference/remote-built-install.md` now documents only the wheel-based
  packaged-user install path
- source-package guidance is now narrowed to the separate
  `./verify_install.sh` smoke role instead of being presented as a parallel
  normal install option

Update after Slice 3 landing on 2026-03-10:

- `verify_install.sh` remains the dedicated sdist completeness smoke
- wheel-based packaged-user install coverage remains owned by native installers,
  `install_built_setta.sh`, and wheel-first built-install docs
- Phase 32 is now complete for the current clean-break scope

## Current Status

Completed before this rerank:

- packaged entrypoint and launcher/distribution closeout in
  `phase-9-shipped-entrypoint-and-launcher-distribution-plan.md`
- native installer bundled-package slice in
  `phase-9-native-installer-bundled-package-stage2.md`
- root distribution-wrapper convergence in
  `phase-25-distribution-install-workflow-retargeting-plan.md`
- packaged Python boundary closeout in
  `phase-31-packaged-python-boundary-slimdown-plan.md`

What this rerank adds:

- a post-Phase-31 inventory of which built artifact shapes still anchor real
  shipped install/release paths
- a decision on whether another focused packaging/distribution track is now
  selected

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-9-shipped-entrypoint-and-launcher-distribution-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-9-native-installer-bundled-package-stage2.md`
- `docs/plans/go-backend-rewrite/archive/phase-25-distribution-install-workflow-retargeting-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-29-post-phase-28-startup-and-distribution-rerank.md`
- `docs/plans/go-backend-rewrite/archive/phase-31-packaged-python-surface-and-dependency-rerank.md`
- `docs/plans/go-backend-rewrite/archive/phase-31-packaged-python-boundary-slimdown-plan.md`
- `docs/reference/dev-vs-built.md`
- `docs/reference/remote-built-install.md`
- `docs/guides/install-setta-desktop.md`
- `docs/reference/setta-cli-commands.md`
- `pyproject.toml`
- `build.sh`
- `verify_install.sh`
- `install_built_setta.sh`
- `scripts/build_python_distribution_with_go_binaries.sh`
- `scripts/install_desktop_launcher.sh`
- `scripts/install_desktop_launcher.ps1`
- `scripts/release/build_macos_installer.sh`
- `scripts/release/build_windows_installer.ps1`
- `scripts/release/smoke_test_native_installer_macos.sh`
- `scripts/release/smoke_test_native_installer_windows.ps1`
- `backend/setta/launcher_setup.py`
- `internal/launcher/management.go`
- `tests/start/test_packaged_distribution.py`
- `tests/start/test_distribution_script_wiring.py`
- `tests/start/test_desktop_launcher_install_scripts.py`

## Inventory Method

1. Re-read the current roadmap plus the landed Phase 9, Phase 25, and Phase 31
   docs.
2. Re-read the current build, smoke, and built-install wrappers.
3. Re-read the native installer builders and smoke tests.
4. Re-read the launcher install/bootstrap contract to confirm whether it is
   coupled to sdist specifically or only to a generic packaged artifact path.
5. Re-read the user-facing install docs that describe wheel versus sdist usage.

## Findings

### 1. The wheel is now the clearest packaged-user boundary

Current state after Phase 31:

- the wheel ships only the thin packaged Python entrypoint modules plus
  explicit runtime asset trees
- default packaged dependencies are now limited to:
  - `claude-agent-sdk`
  - `basedpyright`
  - `ruff`
- focused tests now prove that a slimmed installed wheel can import `setta` and
  run `python -m setta`

Rerank implication:

- the packaged end-user runtime boundary is now wheel-first in practice
- the remaining work is no longer generic package slimming

### 2. Installer-managed and release-smoke paths still anchored on the sdist at rerank time

Current shipped/release paths:

- `verify_install.sh` still builds the repo and installs the built
  `*.tar.gz` sdist
- `scripts/release/build_macos_installer.sh` still bundles
  `dist/setta-<version>.tar.gz`
- `scripts/release/build_windows_installer.ps1` still bundles the same `.tar.gz`
- native installer tests still assert that the bundled package is
  `setta-package.tar.gz`
- `docs/reference/remote-built-install.md` still presents sdist install as a
  live user-facing option

Rerank implication:

- the current shipped artifact story is still mixed:
  - wheel is the explicit packaged runtime boundary
  - sdist is still the installer-managed and release-smoke artifact boundary
- that is a remaining packaging/distribution ownership question, not just a
  historical note

### 3. The launcher bootstrap contract does not require sdist specifically

Current launcher bootstrap boundary:

- `scripts/install_desktop_launcher.sh` accepts a generic `--package SPEC`
- installer-managed flows pass a package path into that existing contract
- launcher metadata only records `installSource=installer-managed`; it does not
  encode sdist-specific semantics

Rerank implication:

- retargeting installer-managed flows away from sdist does not require a new
  launcher runtime owner
- the remaining question is artifact choice, not launcher behavior

### 4. Native installers are already platform-specific, which weakens the case for sdist as their bundled artifact

Current native-installer boundary:

- macOS `.pkg` and Windows `.msi` installers are already platform-specific
- the wheel is now platform-specific and already carries the packaged Go
  binaries and explicit runtime assets
- the bundled sdist still carries the broader source tree by design

Rerank implication:

- the native-installer path is now the strongest evidence-backed place to adopt
  a wheel-first packaged artifact boundary
- continuing to bundle the broader sdist there is a deliberate choice that
  should now be re-evaluated, not an incidental default

### 5. `verify_install.sh` is now a separate question from native installer payload choice

Current behavior:

- `verify_install.sh` uses sdist specifically to smoke missing-file and source
  packaging errors
- `install_built_setta.sh` already uses wheel

Rerank implication:

- native installer retargeting does not automatically force `verify_install.sh`
  to stop using sdist
- the repo can treat:
  - installer-managed/user-facing built installs
  - source/sdist completeness smoke
  as separate owned boundaries

### 6. This selects one more focused packaging/distribution track

Unlike the Phase 31 closeout note, the post-Phase-31 evidence does select a
concrete new follow-on:

- the remaining evidence-backed track is the installer-managed distribution
  artifact boundary
- the highest-leverage next move is not more generic packaged-Python trimming
- it is a wheel-first retargeting plan for native installers and adjacent
  built-install docs, while deciding explicitly whether sdist remains only a
  source-smoke artifact

## Decisions Made

- open a new Phase 32 track for wheel-first installer artifact retargeting
- keep launcher setup/runtime semantics out of scope for that track
- treat `verify_install.sh` as a separate explicit source/sdist smoke question,
  not automatic evidence that user-facing installer payloads must stay on sdist
- keep the current packaged wheel boundary as the source of truth for
  packaged-user runtime ownership

## Verification

- `git diff --check`

## Next Recommended Step

Use `phase-32-wheel-first-installer-artifact-boundary-plan.md` as the next
focused working doc.

The recommended first slice is:

- retarget native macOS and Windows installers to bundle the built wheel rather
  than the sdist
- keep the existing `setta-install-desktop` package-path contract unchanged
- leave `verify_install.sh` on sdist until that source-smoke boundary is
  reevaluated explicitly
