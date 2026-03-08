# Phase 32 Wheel-First Installer Artifact Boundary Plan

## Purpose

This doc narrows the next packaging/distribution track selected by the
post-Phase-31 rerank.

The remaining work is not "remove Python packaging." The current shipped
artifact format still deliberately includes Python sdist and wheel outputs.
The concrete remaining boundary problem is that installer-managed built-install
flows still bundle the broader sdist even though the wheel is now the explicit
packaged-user runtime boundary.

## Problem Statement

After Phase 31:

- the wheel is explicit, slimmed, and verified as the packaged-user runtime
  boundary
- default packaged dependencies now align with that wheel boundary
- repo-local source/dev bootstrap is explicit and separate

But the installer-managed release/install surface still uses the broader sdist:

- native macOS and Windows installers bundle `setta-<version>.tar.gz`
- native-installer smoke verifies the installed launcher version, but not a
  wheel-first artifact path
- `docs/reference/remote-built-install.md` still treats sdist as a normal
  built-install option

That means the packaged-user boundary and the installer-managed artifact
boundary are still inconsistent.

## Recommended Direction

Prefer a wheel-first installer-managed boundary.

Recommended option:

1. keep the wheel as the canonical packaged-user artifact
2. retarget native installers and adjacent built-install docs to that wheel
   boundary
3. keep sdist only where source-completeness smoke is explicitly desired

Rationale:

- native installers are already platform-specific, so wheel matches the real
  runtime boundary better than sdist
- the existing launcher bootstrap contract already accepts a generic package
  path and does not require sdist semantics
- this preserves explicit source-smoke value without forcing installer-managed
  product surfaces to carry the broader source artifact by default

## Scope

In scope:

- `scripts/release/build_macos_installer.sh`
- `scripts/release/build_windows_installer.ps1`
- native-installer smoke tests and script coverage
- built-install documentation that currently presents sdist as a normal
  packaged-user artifact
- any release helper wiring that must choose wheel versus sdist for the
  installer-managed surface

Out of scope:

- changing launcher runtime/setup semantics
- removing sdist emission from `build.sh`
- removing `verify_install.sh` or changing its purpose without an explicit
  follow-on decision
- changing repo-local source/dev bootstrap

## Current Status

Completed before this plan:

- packaged Go entrypoint and launcher command ownership
- native installer bootstrap contract over `setta launcher setup`
- root distribution-wrapper convergence
- Phase 31 packaged wheel boundary, dependency split, and source/dev bootstrap
  closeout

Current gap:

- installer-managed build/install surfaces still bundle or document the broader
  sdist
- wheel is not yet the canonical artifact for the installer-managed channel

## Inputs

- `phase-32-post-phase-31-distribution-artifact-rerank.md`
- `phase-9-native-installer-bundled-package-stage2.md`
- `phase-25-distribution-install-workflow-retargeting-plan.md`
- `docs/reference/dev-vs-built.md`
- `docs/reference/remote-built-install.md`
- `docs/guides/install-setta-desktop.md`
- `scripts/install_desktop_launcher.sh`
- `scripts/install_desktop_launcher.ps1`
- `scripts/release/build_macos_installer.sh`
- `scripts/release/build_windows_installer.ps1`
- `scripts/release/smoke_test_native_installer_macos.sh`
- `scripts/release/smoke_test_native_installer_windows.ps1`
- `tests/start/test_desktop_launcher_install_scripts.py`
- `tests/start/test_distribution_script_wiring.py`
- `tests/start/test_packaged_distribution.py`

## Planned Slices

### Slice 1: Native installer payload retargeting

Goal:

- make native installer builders bundle the current-platform built wheel instead
  of the sdist

Deliverables:

- macOS builder defaults to `dist/setta-<version>-*.whl`
- Windows builder defaults to the matching wheel
- bundled artifact filenames inside installers change from
  `setta-package.tar.gz` to a wheel-specific name
- native-installer tests and smoke scripts stay aligned with the new payload

Non-goals:

- changing launcher metadata or install-source semantics
- changing signing/notarization behavior

### Slice 2: Installer-managed built-install docs retargeting

Goal:

- make user-facing built-install documentation wheel-first for packaged-user
  installs

Deliverables:

- `docs/reference/remote-built-install.md` becomes wheel-first
- any adjacent built-install docs that currently normalize sdist as a regular
  packaged-user path are tightened accordingly

Non-goals:

- removing mention of sdist entirely when it still matters for source-smoke or
  advanced debugging

### Slice 3: Explicit sdist-smoke boundary decision

Goal:

- decide whether `verify_install.sh` should stay an sdist completeness smoke,
  split into wheel + sdist checks, or be retargeted later

Deliverables:

- explicit doc/plan decision on the purpose of `verify_install.sh`
- tests updated only if that purpose changes

This slice should only start after Slice 1 makes the installer-managed path
wheel-first.

## Working Decisions

- keep `scripts/install_desktop_launcher.*` as the single package-path
  bootstrap contract
- prefer wheel for installer-managed packaged-user flows
- keep sdist only where source-completeness verification is explicitly the goal
- avoid a mixed artifact story unless a concrete release constraint requires it

## Verification Strategy

- `tests/start/test_desktop_launcher_install_scripts.py`
- `tests/start/test_distribution_script_wiring.py`
- any focused packaging tests needed for wheel-based installer payload
  selection
- `git diff --check`

## Open Questions

- whether native installer builders should copy the wheel under a fixed bundled
  filename or preserve the full platform wheel name in payloads
- whether `verify_install.sh` should remain the only sdist smoke or whether a
  separate dedicated sdist check would be clearer
- whether any release automation beyond native installer builders still assumes
  `.tar.gz` for installer-managed flows

## Next Recommended Step

Implement Slice 1:

- retarget native installer builders and their tests to wheel payloads
- keep the launcher bootstrap contract unchanged
- leave `verify_install.sh` and broader sdist policy for the later explicit
  decision slice
