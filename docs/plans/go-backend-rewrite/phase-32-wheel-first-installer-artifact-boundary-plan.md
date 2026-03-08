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

At selection time, the installer-managed release/install surface still used the
broader sdist:

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

Now landed in Slice 1:

- native macOS installer builds resolve exactly one
  `dist/setta-<version>-*.whl` artifact and bundle that wheel into the `.pkg`
- Windows MSI builds resolve exactly one matching wheel and bundle that wheel
  into the installer payload
- native installer release jobs now build wheel artifacts instead of installer
  sdist payloads
- installer payloads preserve the real wheel filename instead of renaming it to
  a generic placeholder, so the packaged artifact remains installable by `uv`

Remaining gap:

- none inside the current wheel-first installer/doc scope
- the only remaining follow-on was the explicit `verify_install.sh`
  sdist-smoke decision, now recorded in
  `phase-32-verify-install-sdist-smoke-boundary-decision.md`

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

Slice 2 status:

- completed on 2026-03-10
- `docs/reference/remote-built-install.md` now documents only the wheel-based
  packaged-user install path
- source-package guidance is now narrowed to the explicit
  `./verify_install.sh` smoke role instead of treating `.tar.gz` as a normal
  remote install option

### Slice 3: Explicit sdist-smoke boundary decision

Goal:

- decide whether `verify_install.sh` should stay an sdist completeness smoke,
  split into wheel + sdist checks, or be retargeted later

Deliverables:

- explicit doc/plan decision on the purpose of `verify_install.sh`
- tests updated only if that purpose changes

This slice should only start after Slice 1 makes the installer-managed path
wheel-first.

Slice 3 status:

- completed on 2026-03-10
- `verify_install.sh` remains the dedicated sdist completeness smoke
- `install_built_setta.sh`, native installers, and built-install docs remain
  the wheel-first packaged-user pathways
- no code change was required because the existing script/tests already matched
  the selected boundary

Slice 1 status:

- completed on 2026-03-10
- builders now fail fast on missing or ambiguous wheel artifacts instead of
  guessing a payload
- release workflow native-installer jobs now build wheels for the installer
  payload path

## Working Decisions

- keep `scripts/install_desktop_launcher.*` as the single package-path
  bootstrap contract
- prefer wheel for installer-managed packaged-user flows
- keep sdist only where source-completeness verification is explicitly the goal
- avoid a mixed artifact story unless a concrete release constraint requires it
- preserve the original wheel filename inside installer payloads; do not rename
  wheels to generic filenames because local wheel installation depends on a
  valid wheel filename shape

## Verification Strategy

- `tests/start/test_desktop_launcher_install_scripts.py`
- `tests/start/test_distribution_script_wiring.py`
- any focused packaging tests needed for wheel-based installer payload
  selection
- `git diff --check`

## Open Questions

- whether any release automation beyond native installer builders still assumes
  `.tar.gz` for installer-managed flows

## Next Recommended Step

Phase 32 is complete for the current clean-break scope.

Do not broaden packaging work from here by inertia. Reopen it only if:

- a concrete release/runtime issue appears, or
- a broader rewrite rerank selects another packaging boundary explicitly
