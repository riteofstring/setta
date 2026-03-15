# Phase 28 Dev Startup Shared Helper Owner Plan

## Purpose

This doc records the next bounded follow-on after the landed packaged
entrypoint fallback closeout.

The packaged `python -m setta` path no longer reaches `backend/setta/start.py`.
The remaining active dependency is narrower: the explicit dev-only reload owner
in `backend/setta/dev_start.py` still imports shared startup helpers from
`backend/setta/start.py`.

The goal is to move that active helper surface to a dedicated shared owner
without reopening broad `start.py` cleanup.

## Current Status

Completed before this slice:

- packaged entrypoint fallback hardening in
  `phase-27-packaged-entrypoint-fallback-hardening-plan.md`
- explicit dev reload ownership in
  `phase-25-dev-startup-command-boundary-plan.md`

What remained active at the start of this slice:

- `backend/setta/dev_start.py` still imports the following shared helpers from
  `backend/setta/start.py`:
  - `_resolve_cli_paths`
  - `_apply_paths_to_env`
  - `_resolve_port`
  - `_run_uvicorn_server`
  - `_is_ssh_session`
  - `_should_auto_open`
  - `_render_startup_message`
- focused tests for those helpers still anchor to `setta.start` even when the
  helper itself is part of the active startup contract rather than legacy CLI
  fallback

Completed during this slice:

- `backend/setta/startup_runtime.py` now owns the active shared Python startup
  helper surface used by both `setta.start` and `setta.dev_start`
- `backend/setta/dev_start.py` no longer imports active startup helpers from
  `backend/setta/start.py`
- `backend/setta/start.py` now imports the shared helper surface from
  `backend/setta/startup_runtime.py` instead of duplicating those
  implementations
- focused startup helper tests now point at `setta.startup_runtime` for active
  path/env/message behavior instead of anchoring that coverage to
  `setta.start`
- the remaining active source/dev startup dependency on `setta.start` is
  removed for the current workflow surface

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-25-dev-startup-command-boundary-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-25-start-py-reachability-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/archive/phase-27-packaged-entrypoint-fallback-hardening-plan.md`
- `backend/setta/dev_start.py`
- `backend/setta/start.py`
- `tests/start/test_dev_start.py`
- `tests/start/test_start_paths_env.py`
- `tests/start/test_startup_message.py`
- `tests/start/test_start_interrupt_handling.py`
- `tests/start/test_start_workspace_validation.py`

## Scope

In scope:

- extract the shared startup helper surface used by both `setta.start` and
  `setta.dev_start` into a dedicated Python module
- retarget `backend/setta/dev_start.py` to that shared owner
- retarget `backend/setta/start.py` to import the shared helper surface
- move focused helper tests to the shared owner where they cover the active
  startup contract rather than legacy CLI behavior

Out of scope:

- broad `backend/setta/start.py` command-tree cleanup
- CLI/root-help redesign
- changing the current dev reload product behavior
- removing Python as the dev-only reload/runtime owner

## Planned Change

1. Create a dedicated startup-runtime helper module for the active shared
   source/dev startup contract.
2. Move the helper implementations used by `setta.dev_start` into that module.
3. Update `setta.start` and `setta.dev_start` to import the shared helpers from
   the new owner.
4. Update focused tests so active helper coverage points at the shared module
   instead of `setta.start` where appropriate.
5. Sync the Phase 25/27 docs and roadmap to reflect that the remaining active
   `setta.start` dependency has been reduced again.

## Decisions

- prefer an explicit shared startup-runtime module over continuing to treat
  `setta.start` as the helper namespace for active dev startup
- keep the extracted surface small and concrete; do not move unrelated legacy
  Click helpers in the same slice
- keep transport/CLI ownership thin: `setta.dev_start` and `setta.start`
  should orchestrate, not become the helper implementation source of truth

## Open Questions

- none for this landed slice

## Verification

- `source activate.sh && ./scripts/run_backend_tests.sh tests/start/test_dev_start.py tests/start/test_start_paths_env.py tests/start/test_startup_helpers.py tests/start/test_startup_message.py tests/start/test_start_interrupt_handling.py tests/start/test_start_workspace_validation.py tests/start/test_dev_script_wiring_backend_start.py`
- `git diff --check`

## Next Recommended Step

Do not broaden this into general `backend/setta/start.py` cleanup by inertia.

Rerank again before selecting another startup/distribution slice. The next
honest step should come from a concrete remaining active dependency, not from
line-count goals.
