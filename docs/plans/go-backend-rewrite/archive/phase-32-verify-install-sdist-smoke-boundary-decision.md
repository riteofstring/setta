# Phase 32 Verify Install Sdist Smoke Boundary Decision

## Purpose

This doc closes Phase 32 Slice 3 by making the remaining `verify_install.sh`
boundary explicit after the landed wheel-first installer and built-install doc
retargets.

The question is no longer "should packaged-user installs be wheel-first?" That
is already true. The narrower question is whether `verify_install.sh` should
stay the dedicated sdist completeness smoke, split into wheel + sdist checks,
or be retargeted to wheel.

## Current State

After the landed Phase 32 Slice 1 and Slice 2 work:

- native macOS and Windows installers bundle the platform wheel
- `docs/reference/remote-built-install.md` now documents only the wheel-based
  packaged-user install path
- `install_built_setta.sh` builds the repo and installs the one built wheel
  into an isolated uv virtual environment
- `verify_install.sh` still builds the repo, resolves the one built
  `*.tar.gz` sdist, installs it with `uv pip`, and cleans up

Focused current coverage already exists for both sides of that split:

- `tests/start/test_distribution_script_wiring.py`
  - `test_verify_install_uses_shared_artifact_helper_for_sdist_selection`
  - `test_verify_install_runs_cleanup_even_when_install_fails`
  - `test_install_built_setta_uses_shared_artifact_helper_for_wheel_selection`
- `tests/start/test_packaged_distribution.py`
  - wheel metadata and packaged-entrypoint install coverage

## Decision

Keep `verify_install.sh` as the explicit sdist completeness smoke for the
current clean-break scope.

Do not:

- retarget `verify_install.sh` to wheel
- split `verify_install.sh` into wheel + sdist subchecks
- broaden this slice into generic packaging cleanup

## Rationale

### 1. `verify_install.sh` still covers a distinct failure mode

The repo still deliberately emits both wheel and sdist artifacts. The sdist
path remains the only direct smoke for:

- missing packaged source files
- incorrect sdist include/exclude boundaries
- source-tree packaging regressions that a wheel install can miss

Retargeting `verify_install.sh` to wheel would remove that distinct check.

### 2. Wheel-based packaged-user installs are already covered elsewhere

Wheel behavior is already covered by the current source-of-truth paths:

- native installer payloads are wheel-first
- `docs/reference/remote-built-install.md` is wheel-first
- `install_built_setta.sh` is the explicit isolated built-wheel install helper
- wheel build/install tests already exist in `tests/start/test_packaged_distribution.py`

Adding wheel install to `verify_install.sh` would mostly duplicate existing
coverage instead of filling a real ownership gap.

### 3. Keeping one sdist smoke is clearer than splitting the script now

A split wheel+sdist smoke would:

- increase packaging smoke time
- duplicate the current wheel install signal
- blur the purpose of a script that is currently easy to describe

For the current scope, a clean boundary is better:

- `install_built_setta.sh` and user-facing built installs prove wheel behavior
- `verify_install.sh` proves sdist completeness

### 4. There is no current release/user evidence that the sdist smoke is wrong

The current evidence-backed issue was the installer-managed/user-facing path
still anchoring on sdist. That issue is already fixed. No current caller or
release path shows that the remaining dedicated sdist smoke is itself a
problem.

## Consequences

- `verify_install.sh` remains intentionally sdist-based
- `install_built_setta.sh` remains the isolated wheel-install helper
- `docs/reference/remote-built-install.md` remains wheel-first
- Phase 32 is complete for the current clean-break scope

## Verification

- `source activate.sh && ./scripts/run_backend_tests.sh tests/start/test_distribution_script_wiring.py -k 'verify_install or install_built_setta'`
- `git diff --check`

## Next Recommended Step

Stop Phase 32 here.

If packaging/distribution work continues later, reopen it only for a concrete
release/runtime issue or a broader rerank outside this closed wheel-vs-sdist
boundary.
