# Phase 31 Packaged Python Boundary Slimdown Plan

## Purpose

Define the next focused track after the Phase 31 rerank selected the Python
distribution boundary itself as the remaining evidence-backed ownership gap.

This is not a return to backend route migration. The goal here is to make the
shipped Python package boundary explicit and narrow, while preserving the few
Python edges that are still intentionally active.

## Problem Statement

The current wheel and sdist still ship the full `backend/setta` package and the
root runtime dependency list still reflects that broad Python tree.

The active packaged user boundary is now much smaller:

- thin Python dispatch into packaged Go binaries
- checked-in external-agent sidecars
- checked-in data assets needed by the packaged runtime
- Python executables still invoked by the Go runtime such as `ruff` and
  `basedpyright`

The current package shape also still bundles the dev-only reload backend owner
and its legacy Python router/runtime imports into the same distribution.

## Recommended Direction

Prefer a wheel-first boundary slimdown.

Recommended option:

1. Make the wheel contents explicit and minimal first.
2. Keep the sdist broader until the source/dev install story is explicitly
   reworked.
3. Narrow dependency ownership only after the wheel boundary is explicit.

Rationale:

- the wheel is the clearest shipped end-user artifact
- wheel-content tests are deterministic and cheap
- this avoids mixing packaged-user cleanup with the separate question of how
  source/dev installs should keep working

## Scope

In scope:

- wheel package contents under `backend/setta`
- packaged Python assets and data files
- root runtime dependency ownership as it relates to the packaged artifact
- source/dev dependency separation when required by the wheel boundary

Out of scope:

- reopening backend route/runtime migration
- removing the deliberate Claude or OpenCode sidecar boundaries
- replacing `ruff` or `basedpyright` in this track
- broad `start.py` or legacy router cleanup without a packaging reason

## Slice Plan

### Slice 1: Explicit wheel contents and tests

Goal:

- replace the implicit "ship all of `backend/setta`" wheel boundary with an
  explicit minimal include set

Target contents should include only what the packaged product still needs, for
example:

- `backend/setta/__init__.py`
- `backend/setta/__main__.py`
- `backend/setta/entrypoint.py`
- `backend/setta/go_bin/**`
- active sidecar trees and their runtime files
- packaged static/frontend assets
- plugin schema assets that remain part of the packaged product

Verification:

- strengthen packaged-distribution tests to assert wheel contents explicitly
- keep module-entrypoint dispatch coverage

Landed outcome:

- the wheel now includes only:
  - `backend/setta/__init__.py`
  - `backend/setta/__main__.py`
  - `backend/setta/entrypoint.py`
  - explicit force-included runtime asset trees
- Slice 1 deliberately preserves the current shipped asset buckets:
  - `backend/setta/static/frontend`
  - `backend/setta/agentic/external_adapters/sidecars`
  - `backend/setta/vendor/node`
  - `backend/setta/plugins/schemas`
  - `backend/setta/launcher_artifacts/assets`
  - `backend/setta/go_bin`
- `__pycache__` content is now explicitly excluded from the wheel boundary
- targeted packaging tests now prove that dev-only and legacy Python modules do
  not leak into the wheel

### Slice 2: Narrow packaged dependency ownership

Goal:

- reduce root runtime dependencies to the packaged-wheel boundary
- move source/dev-only Python backend dependencies out of the packaged-user
  default install path

Expected boundary classes:

- packaged runtime deps that remain required
- source/dev reload deps
- legacy/reference deps that should no longer be installed by default

Verification:

- packaging smoke tests for wheel install
- explicit tests for tool dependencies or sidecar imports that remain required

Landed outcome:

- default packaged dependencies are now narrowed to:
  - `claude-agent-sdk`
  - `basedpyright`
  - `ruff`
- the remaining source/dev-only Python backend runtime dependencies now live
  under a dedicated `source` extra instead of the packaged-user default
  install path
- `uv.lock` now records that split explicitly, including `source`-scoped
  markers for platform-specific dependencies such as `ptyprocess` and
  `pywinpty`
- focused wheel-metadata tests now prove that the default install path does
  not pull in source/dev backend dependencies, while the `source` extra still
  carries them
- both the packaged build path and the install smoke path still pass with the
  narrowed default dependency boundary

### Slice 3: Decide the source/dev distribution story

Goal:

- make the source/dev install path explicit once wheel and dependency ownership
  are no longer coupled to the full legacy package tree

Possible outcomes:

- keep broader source installs through sdist or repo-local dev setup only
- add a dedicated source/dev extra or explicit setup path

This slice should only start once Slice 1 has landed.

Landed outcome:

- repo-local source/dev setup now stays explicit through `init_env.sh`, which
  installs the `source`, `dev`, and `gemini` extras instead of relying on
  `--all-extras`
- `dev_install.sh` remains the single higher-level source/dev bootstrap wrapper
  above that explicit Python environment setup
- source/dev docs now distinguish repo-local bootstrap from the narrower
  packaged install path
- the packaged import boundary is now aligned with the slimmed wheel: the
  packaged `backend/setta/__init__.py` no longer imports `backend_launcher`,
  so installed wheels and sdists can import `setta` and run `python -m setta`
  without the legacy backend tree
- focused shell-wiring tests now guard the explicit source/dev bootstrap path,
  and packaged-distribution tests now install a slimmed wheel into a disposable
  venv and execute the real packaged entrypoint modules

## Risks And Controls

Risk:

- deleting a Python file that is still a real packaged boundary

Control:

- rely on explicit Go callsites, build metadata, and packaging tests as the
  source of truth

Risk:

- breaking dev reload while slimming the packaged user boundary

Control:

- keep the first slice wheel-only
- treat source/dev distribution behavior as a separate later decision

## Verification Strategy

- `tests/start/test_packaged_distribution.py`
- `tests/start/test_module_entrypoint.py`
- distribution/install script wiring tests that assert the packaged builder path
- any new test that inspects wheel contents should fail on unexpected Python
  module inclusion or exclusion

## Open Questions

- whether plugin schema assets are still needed in the packaged wheel once the
  full Python plugin tree is no longer shipped
- whether any non-sidecar Python module besides the thin entrypoint must remain
  in the wheel for currently shipped product behavior
- whether the repo should continue treating sdist install as a supported dev
  bootstrap path after the wheel boundary is narrowed

## Verification

- `source activate.sh && ./scripts/run_backend_tests.sh tests/start/test_dev_install_script_wiring.py tests/start/test_distribution_script_wiring.py tests/start/test_packaged_distribution.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/start/test_packaged_distribution.py tests/start/test_module_entrypoint.py`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/start/test_distribution_script_wiring.py`
- `./build.sh`
- `./verify_install.sh`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/start/test_module_entrypoint.py`

## Next Recommended Step

Phase 31 is now closed for the current clean-break scope.

The next honest step is a broader rerank outside the packaged Python boundary:

- do not keep trimming packaged Python modules or dependencies by inertia
- only reopen this track if a concrete shipped import/runtime edge or release
  workflow still proves the boundary is too broad
