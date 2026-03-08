# Phase 9 Native Installer Bundled Package Stage 2

## Purpose

This doc captures the next bounded Phase 9 distribution slice after the
completed packaged-Go-entrypoint Stage 1B landing.

The goal is to make the native macOS and Windows launcher installers bootstrap
the exact packaged Setta artifact produced in the same release flow, instead of
implicitly resolving whatever `setta` package spec happens to be available from
an index at install time.

## Why This Slice Exists

After Stage 1B, the shipped Python entrypoint and launcher/helper command
surface were already bound to packaged Go binaries.

The remaining distribution gap was narrower:

1. the native installers (`.pkg`, `.msi`) still only embedded bootstrap scripts
2. those bootstrap scripts still defaulted to `uv tool install --upgrade setta`
3. native-installer smoke therefore did not prove that the installer was
   bootstrapping the exact packaged release artifact built in the same workflow

That is a release-contract problem, not a launcher-runtime problem.

## Current Status

As of 2026-03-08:

- Stage 1B is complete:
  - `cmd/setta`
  - `backend/setta/entrypoint.py`
  - `scripts/build_packaged_go_binaries.sh`
  - `scripts/build_python_distribution_with_go_binaries.sh`
  - platform-specific wheel enforcement in `hatch_build.py`
- launcher bootstrap scripts already support explicit package specs:
  - `scripts/install_desktop_launcher.sh`
  - `scripts/install_desktop_launcher.ps1`
- native installer builders existed, but previously only copied bootstrap
  scripts and let them resolve the default `setta` package:
  - `scripts/release/build_macos_installer.sh`
  - `scripts/release/build_windows_installer.ps1`

## Inputs

- `docs/plans/go-backend-rewrite/phase-9-shipped-entrypoint-and-launcher-distribution-plan.md`
- `docs/plans/go-backend-rewrite/phase-9-packaged-go-entrypoint-and-distribution-stage1b.md`
- `scripts/install_desktop_launcher.sh`
- `scripts/install_desktop_launcher.ps1`
- `scripts/release/build_macos_installer.sh`
- `scripts/release/build_windows_installer.ps1`
- `scripts/release/smoke_test_native_installer_macos.sh`
- `scripts/release/smoke_test_native_installer_windows.ps1`
- `.github/workflows/release-desktop-launcher.yml`
- `tests/start/test_desktop_launcher_install_scripts.py`

## In Scope

- bundle the current-platform packaged Setta sdist into the macOS and Windows
  native installers
- make installer postinstall/custom-action bootstrap pass that bundled package
  path into the existing `setta-install-desktop` scripts
- build the packaged Setta sdist in native-installer workflow jobs before
  building the installers
- tighten native-installer smoke so it verifies the bootstrapped Setta version
  matches the installer version under test

## Out Of Scope

- changing launcher runtime semantics
- changing installer signing/notarization policy
- making the full dependency graph offline
- moving remaining Python-owned local commands into Go

## Working Decisions

- bundle a deterministic packaged artifact into the installers instead of
  relying on an index-default package name
- use the existing installer bootstrap scripts as the only bootstrap entrypoint;
  do not create a second launcher-install contract just for native installers
- use the Go-binary-aware packaged sdist as the bundled artifact for this slice
  because that is the current rewrite-owned distribution helper
- fail fast when the bundled package artifact is missing; do not guess build
  outputs heuristically

## Progress Notes

- 2026-03-08: created this focused Stage 2 doc after Stage 1B completion left a
  smaller native-installer packaging gap.
- 2026-03-08: completed the bundled-package slice.
  - macOS `.pkg` builds now bundle `dist/setta-<version>.tar.gz` (or an
    explicit override via `SETTA_DESKTOP_INSTALLER_PACKAGE_PATH`) and postinstall
    bootstraps via `setta-install-desktop --package ...`
  - Windows `.msi` builds now bundle the same packaged sdist and pass it to the
    PowerShell bootstrap custom action via the installed file path
  - native-installer smoke now verifies the resulting launcher metadata reports
    the same Setta version as the installer artifact under test
  - native-installer workflow jobs now build the Go-binary-aware packaged sdist
    before building installer artifacts

## Verification

- `source activate.sh && python -m pytest tests/start/test_desktop_launcher_install_scripts.py -q`
- `git diff --check`

## Recommended Next Step

With Stage 2 complete, the remaining Phase 9 question is no longer installer
artifact ownership. The next decision is whether the still-Python local command
groups should remain behind the thin wrapper boundary longer or move into later
Go slices.
