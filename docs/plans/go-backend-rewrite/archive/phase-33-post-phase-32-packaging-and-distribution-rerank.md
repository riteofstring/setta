# Phase 33 Post-Phase-32 Packaging And Distribution Rerank

## Purpose

This doc records the broader rerank after the landed Phase 32 packaging closeout.

Phase 32 resolved the remaining evidence-backed installer/built-install artifact
gap:

- packaged-user install paths are wheel-first
- `verify_install.sh` is explicitly the sdist completeness smoke

The next honest question is whether any further packaging/distribution ownership
slice is now selected, or whether this track is effectively closed for the
current clean-break scope.

## Current Status

Completed before this rerank:

- broader rewrite closeout in
  `phase-30-post-phase-29-broader-rewrite-rerank.md`
- packaged Python boundary closeout in
  `phase-31-packaged-python-boundary-slimdown-plan.md`
- installer artifact and built-install closeout in
  `phase-32-wheel-first-installer-artifact-boundary-plan.md`
- explicit sdist smoke boundary decision in
  `phase-32-verify-install-sdist-smoke-boundary-decision.md`

What this rerank adds:

- a post-Phase-32 check that the remaining packaging/distribution surfaces are
  deliberate rather than hidden rewrite debt
- an explicit decision on whether another implementation phase is honestly
  selected now

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-30-post-phase-29-broader-rewrite-rerank.md`
- `docs/plans/go-backend-rewrite/archive/phase-31-packaged-python-surface-and-dependency-rerank.md`
- `docs/plans/go-backend-rewrite/archive/phase-31-packaged-python-boundary-slimdown-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-32-post-phase-31-distribution-artifact-rerank.md`
- `docs/plans/go-backend-rewrite/archive/phase-32-wheel-first-installer-artifact-boundary-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-32-verify-install-sdist-smoke-boundary-decision.md`
- `docs/reference/dev-vs-built.md`
- `docs/reference/remote-built-install.md`
- `docs/guides/dev-scripts.md`
- `docs/guides/install-setta-desktop.md`
- `pyproject.toml`
- `build.sh`
- `verify_install.sh`
- `install_built_setta.sh`
- `scripts/build_python_distribution_with_go_binaries.sh`
- `scripts/release/build_macos_installer.sh`
- `scripts/release/build_windows_installer.ps1`
- `tests/start/test_distribution_script_wiring.py`
- `tests/start/test_packaged_distribution.py`
- `tests/start/test_desktop_launcher_install_scripts.py`

## Inventory Method

1. Re-read the current roadmap plus the landed Phase 30, Phase 31, and Phase 32
   docs.
2. Re-read the current packaged-user install docs and built/install wrappers.
3. Re-read the current packaging metadata and release installer builders.
4. Re-read the focused packaging/distribution tests that cover wheel installs,
   native-installer payloads, and `verify_install.sh`.
5. Decide whether any remaining packaging/distribution surface still selects a
   concrete implementation slice instead of an explicit deliberate boundary.

## Findings

### 1. Packaged-user install ownership is now consistently wheel-first

Current packaged-user paths:

- native macOS and Windows installers bundle the platform wheel
- `docs/reference/remote-built-install.md` is wheel-first
- `install_built_setta.sh` builds and installs the one built wheel into an
  isolated environment

Rerank implication:

- there is no remaining packaged-user artifact inconsistency to resolve
- the earlier mixed wheel/sdist user-facing story is closed

### 2. The remaining sdist path is explicit and purposeful

Current sdist path:

- `verify_install.sh` still builds the repo and installs the built sdist
- the current tests treat that behavior as the dedicated sdist completeness
  smoke
- the docs now distinguish it from wheel-based packaged-user install paths

Rerank implication:

- the remaining sdist use is deliberate rather than accidental
- this is not evidence of another implementation gap by itself

### 3. Packaging metadata no longer selects another obvious boundary slice

Current packaging state:

- wheel contents are already explicit and tested
- default packaged dependencies are already narrowed to the packaged-user
  boundary
- source/dev-only Python ownership already lives behind the explicit `source`
  extra and repo-local bootstrap flow

Rerank implication:

- there is no new evidence-backed dependency or wheel-content slice selected
- further trimming now risks becoming speculative cleanup rather than rewrite
  ownership work

### 4. Release/build wrappers already encode the current intended split

Current wrapper split:

- `build.sh` and `scripts/build_python_distribution_with_go_binaries.sh`
  deliberately emit both wheel and sdist artifacts
- native installers and built-install docs consume the wheel
- `verify_install.sh` consumes the sdist

Rerank implication:

- the current build/release behavior is coherent for the current scope
- there is no wrapper-level inconsistency selecting another bounded fix

### 5. No concrete release/runtime problem currently selects another phase

Current evidence:

- no active packaged-user doc still normalizes sdist as the main install path
- no active installer payload still bundles sdist
- no current tests or wrappers point to an unresolved artifact-choice mismatch

Rerank implication:

- there is no honest implementation slice to open from current repo evidence
- continuing this track would be broadening by inertia

## Decisions Made

- treat the packaging/distribution track as effectively closed for the current
  clean-break scope
- do not open another packaging implementation phase without a concrete
  release/runtime problem or product-backed decision
- keep the current explicit split:
  - wheel for packaged-user installs
  - sdist for explicit completeness smoke
  - explicit repo-local source/dev bootstrap for source workflows

## Verification

- `git diff --check`

## Next Recommended Step

Do not broaden packaging/distribution cleanup by inertia.

If rewrite work continues later, the next honest step is a new focused phase
selected by a concrete release/runtime issue or a broader rerank outside this
now-closed packaging boundary.
