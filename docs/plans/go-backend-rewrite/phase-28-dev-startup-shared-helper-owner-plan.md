# Phase 28 Dev Startup Shared Helper Owner Plan

## Purpose

This doc records the next bounded follow-on after the landed Phase 27 packaged
entrypoint closeout.

The packaged `python -m setta` shim no longer reaches `setta.start`, but one
active source/dev workflow still does: `python -m setta.dev_start` imports its
startup/session helper set from `backend/setta/start.py`.

The goal here is not broad `start.py` cleanup. It is to move the active
source/dev shared startup owner out of `setta.start` so the remaining
`start.py` surface is more honestly legacy.

## Current Status

Completed before this slice:

- Phase 25 Slice 2 made reload an explicit dev-only path through
  `python -m setta.dev_start`
- Phase 27 removed the last packaged `python -m setta` fallback branch back
  into `setta.start`

What remains active at the start of this slice:

- `backend/setta/dev_start.py` imports:
  - `_apply_paths_to_env`
  - `_is_ssh_session`
  - `_render_startup_message`
  - `_resolve_cli_paths`
  - `_resolve_port`
  - `_run_uvicorn_server`
  - `_should_auto_open`
  from `backend/setta/start.py`
- the helper tests around path-env application and startup messaging still
  anchor that logic through `setta.start`

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-25-dev-startup-command-boundary-plan.md`
- `docs/plans/go-backend-rewrite/phase-25-startup-test-surface-classification-and-source-of-truth.md`
- `docs/plans/go-backend-rewrite/phase-27-packaged-entrypoint-fallback-hardening-plan.md`
- `backend/setta/dev_start.py`
- `backend/setta/start.py`
- `tests/start/test_dev_start.py`
- `tests/start/test_dev_script_wiring_backend_start.py`
- `tests/start/test_start_paths_env.py`
- `tests/start/test_startup_helpers.py`
- `tests/start/test_startup_message.py`
- `tests/start/test_start_interrupt_handling.py`
- `tests/start/test_start_workspace_validation.py`

## Scope

In scope:

- extract the active shared startup/session helper cluster into an explicit
  Python module outside `setta.start`
- retarget `setta.dev_start` to that new owner
- keep `setta.start` importing/reusing the same helpers instead of remaining
  the owner
- update focused tests to cover the extracted owner directly where that makes
  the active boundary clearer

Out of scope:

- broad Click command cleanup in `setta.start`
- remote SSH helper extraction
- launcher/start/status/auth/api command migration
- Go reload implementation

## Implementation Plan

1. Add a small shared startup-helper module for the active helper cluster used
   by both `setta.dev_start` and `setta.start`.
2. Move the active helper ownership there, keeping behavior unchanged.
3. Retarget `setta.dev_start` and `setta.start` to import from that shared
   module.
4. Update focused tests for the extracted helper owner and the dev-start path.

## Decisions

- prefer an explicit shared helper module over leaving active source/dev logic
  embedded in the legacy Click root
- do not change user-visible startup message, path-env behavior, or reload
  behavior in this slice
- keep the transport/runtime boundary honest: this is Python shared-owner
  cleanup for an active dev path, not a new Go feature slice

## Open Questions

- none for this bounded slice

## Next Recommended Step

If this slice lands cleanly, rerank the remaining `setta.start` surface again.
At that point the active dependency should narrow to direct legacy command/test
coverage plus any intentionally unreplaced Python-only helpers.
