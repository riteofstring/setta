# Phase 25 Dev Startup Command Boundary Plan

## Purpose

This doc narrows Phase 25 Slice 2 into the first bounded implementation step.

The current source/dev startup scripts are already mostly shell-level wiring,
but the backend command boundary is still accidental:

- `frontend/backendStart.sh` activates the venv and runs bare `setta`
- in a source checkout, that venv-installed shim can still point directly at
  `setta.start.cli`
- that means the current dev workflow can silently bypass the routed
  `setta.entrypoint` boundary and keep using legacy Python startup

This slice fixes that specific boundary first instead of trying to clean up all
dev/startup scripts at once.

## Scope

In scope:

- `frontend/backendStart.sh`
- a minimal explicit Python dev-only module for the current reload path if
  needed
- focused source/dev wiring tests under `tests/start/`

Out of scope:

- distribution/install scripts
- broad `backend/setta/start.py` cleanup
- replacing the current reload implementation with a new runtime
- changing `run-dev-instance.sh` or `scripts/ai.sh` beyond the behavior they
  inherit from `backendStart.sh`

## Current Status

Completed in this slice:

- `frontend/backendStart.sh` no longer defaults to the stale venv `setta` shim
- non-reload startup now uses `python -m setta`
- reload startup now uses `python -m setta.legacy_start_entrypoint`
- `SETTA_BIN` remains as an explicit override for tests and power users
- focused source/dev tests now fail fast if `backendStart.sh` falls back to the
  venv `setta` shim again

## Inputs

- `phase-25-legacy-startup-and-distribution-boundary-plan.md`
- `phase-25-startup-test-surface-classification-and-source-of-truth.md`
- `frontend/backendStart.sh`
- `scripts/run-dev-instance.sh`
- `scripts/ai.sh`
- `backend/setta/entrypoint.py`
- `backend/setta/start.py`
- `tests/start/test_dev_script_wiring_backend_start.py`
- `tests/start/test_dev_script_wiring_run_dev_instance.py`
- `tests/start/test_dev_script_wiring_ai.py`

## Current Problem

The current source/dev contract is muddled in one specific place:

1. non-reload startup should use the current routed command surface
   - the active boundary is `python -m setta` / `setta.entrypoint`
   - bare `setta` in a source venv is not reliable because the installed shim
     can still target `setta.start.cli`

2. reload startup is still a legitimate dev-only exception
   - the current Go CLI intentionally rejects `--reload`
   - the repo still needs a Python-owned reload path for `pnpm startr` and
     `ai.sh --reload`
   - that exception should be explicit instead of hiding behind the same bare
     `setta` shim as non-reload startup

## Planned Change

### Step 1: Make the command split explicit in `backendStart.sh`

- when `--reload` is not requested, invoke `python -m setta`
- when `--reload` is requested, invoke an explicit dev-only legacy entrypoint
  instead of relying on the installed `setta` shim
- keep current env/path flag shaping and log behavior unchanged
- preserve `SETTA_BIN` as an override for tests and power users

### Step 2: Cover the explicit boundary in tests

- add focused tests proving non-reload startup no longer depends on bare
  `setta` from `PATH`
- add focused tests proving reload now uses an explicit legacy dev entrypoint
- keep the current path/env shaping assertions intact

## Decisions

- use `python -m setta` as the explicit non-reload source/dev command boundary
  because it routes through the current packaged entrypoint logic rather than a
  stale generated script
- keep reload as an explicit dev-only Python path for now because the current
  Go CLI does not implement reload
- do not expand this slice into launcher/install/distribution cleanup

## Verification

- `pnpm -C frontend exec vitest` is not relevant here
- run focused Python tests:
  `./scripts/run_backend_tests.sh tests/start/test_dev_script_wiring_backend_start.py tests/start/test_dev_script_wiring_run_dev_instance.py tests/start/test_dev_script_wiring_ai.py tests/start/test_dev_script_wiring_aireset.py`

Verification run completed:

- `./scripts/run_backend_tests.sh tests/start/test_dev_script_wiring_backend_start.py tests/start/test_dev_script_wiring_run_dev_instance.py tests/start/test_dev_script_wiring_ai.py tests/start/test_dev_script_wiring_aireset.py tests/start/test_dev_script_wiring_structure.py`

## Next Recommended Step

Rerank within Phase 25 Slice 2:

- if the inherited `backendStart.sh` behavior is sufficient for
  `run-dev-instance.sh` and `scripts/ai.sh`, keep those wrappers unchanged
- if a further source/dev cleanup slice is still warranted, make the next
  bounded step the reload owner itself rather than reopening the normal
  non-reload command boundary
