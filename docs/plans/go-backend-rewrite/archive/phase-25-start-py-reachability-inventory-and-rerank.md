# Phase 25 Start.py Reachability Inventory And Rerank

## Purpose

This doc records the Phase 25 Slice 3 inventory step selected after the
landed source/dev startup boundary hardening.

The question is no longer whether `frontend/backendStart.sh` still depends on
legacy Python startup. It does not. The question now is narrower:

- which `backend/setta/start.py` branches are still reachable through active
  workflows at all
- which remaining direct `tests/start/*` coverage is only legacy anchor
  coverage rather than evidence of a current workflow dependency

## Current Status

Completed before this doc:

- broader remaining-Python-ownership rerank in
  `phase-25-remaining-python-ownership-inventory-and-rerank.md`
- startup test classification in
  `phase-25-startup-test-surface-classification-and-source-of-truth.md`
- explicit dev startup boundary hardening in
  `phase-25-dev-startup-command-boundary-plan.md`

Later follow-on now landed:

- `phase-27-packaged-entrypoint-fallback-hardening-plan.md` moved the
  inventoried root-help / bare-plugins / invalid-root-argv packaged fallback
  from `setta.start` to the Go-owned packaged CLI boundary
- `phase-28-dev-startup-shared-helper-owner-plan.md` moved the remaining
  active shared startup helper surface for `setta.dev_start` out of
  `setta.start` and into `setta.startup_runtime`

What this doc adds:

- a concrete post-Slice-2 inventory of the still-reachable `setta.start`
  surface
- an explicit distinction between small packaged-entrypoint fallback edges and
  broad legacy direct test coverage
- a rerank of whether any immediate `start.py` reduction code slice is still
  justified

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-25-remaining-python-ownership-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/archive/phase-25-legacy-startup-and-distribution-boundary-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-25-startup-test-surface-classification-and-source-of-truth.md`
- `docs/plans/go-backend-rewrite/archive/phase-25-dev-startup-command-boundary-plan.md`
- `backend/setta/entrypoint.py`
- `backend/setta/start.py`
- `backend/setta/dev_start.py`
- `backend/setta/ssh_common.py`
- `frontend/backendStart.sh`
- `tests/start`

## Inventory Method

1. Re-read the current Phase 25 docs to confirm the active source/dev startup
   boundary after Slice 2.
2. Re-read `backend/setta/entrypoint.py` and `backend/setta/start.py` to map
   the current Go-owned dispatch boundary versus Python fallback.
3. Inspect current `tests/start/*` imports and invocations to separate direct
   legacy test anchoring from active workflow evidence.
4. Probe `setta.entrypoint.resolve_go_dispatch_command(...)` on representative
   help, plugin, reload, and unknown-command argv shapes to confirm which
   paths still fall through to `setta.start`.

## Findings

### 1. Active source/dev startup no longer routes through `setta.start`

Current source/dev boundary after Slice 2:

- `frontend/backendStart.sh` now uses `python -m setta` for normal startup
- reload startup now uses `python -m setta.dev_start`
- the explicit reload owner no longer delegates through `setta.start.cli`
- the later Phase 28 follow-on also removed the remaining active shared helper
  imports from `setta.start`

Rerank implication:

- the active repo-local startup workflow is no longer evidence that the large
  Click root in `backend/setta/start.py` must stay in place
- broad `start.py` cleanup should not be blocked by old assumptions about
  `pnpm start` or `pnpm startr`

### 2. Packaged entrypoint fallback still reaches `setta.start`, but only on a small root-level edge set

Current `backend/setta/entrypoint.py` behavior:

- command-specific shipped paths dispatch directly to the packaged Go binary
- representative examples confirmed as Go-owned:
  - `version --help`
  - `launcher --help`
  - `plugins list --help`
  - bare `--reload`

Current representative fallthrough cases confirmed to return `None` from
`resolve_go_dispatch_command(...)` and therefore execute `setta.start.cli`:

- root help:
  - `setta --help`
  - `setta -h`
- bare plugin-root help/navigation:
  - `setta plugins`
  - `setta plugins --help`
- unknown-command and unknown-flag handling:
  - `setta <unknown>`
  - `setta --unknown-flag`
- help-shaped variants that place `--help` before a routed command owner:
  - `setta --reload --help`

Rerank implication:

- the remaining active `start.py` reachability is much smaller than the file
  suggests
- the remaining active packaged fallback is concentrated at the root help /
  command-discovery / invalid-command boundary rather than the shipped command
  execution boundary

### 3. Direct `tests/start/*` imports are legacy anchors, not proof of active workflow reachability

Representative direct `setta.start` coverage still exists in:

- `test_start_backups.py`
- `test_start_tools.py`
- `test_start_status.py`
- `test_start_auth_api.py`
- `test_start_paths_env.py`
- `test_start_workspace_validation.py`
- `test_startup_helpers.py`
- `test_startup_message.py`
- `test_launcher_cli.py`
- `test_launch.py`

Those tests remain useful as reference coverage while cleanup is still under
discussion, but they do not by themselves prove that active shipped or active
source/dev workflows still need those Python command branches.

Rerank implication:

- direct legacy test coverage should continue to be treated as legacy fallback
  by default, matching
  `phase-25-startup-test-surface-classification-and-source-of-truth.md`
- if a future cleanup slice touches `start.py`, the active contract should be
  taken from current entrypoint/workflow behavior first, not from the full
  historical test tree

### 4. The remaining `start.py` question is now a narrow ownership decision, not a large cleanup mandate

After the Slice 2 boundary hardening and this reachability inventory:

- there is no evidence-backed reason to preserve the whole Click root by
  inertia
- there is also not yet a strong product/runtime reason to open a large code
  slice just to remove root help and unknown-command fallbacks

The remaining honest options are now explicit:

1. leave the small packaged fallback edge set in place for now and move to the
   distribution/install workflow track
2. open one narrow follow-on slice only if it is worth moving root help, bare
   `plugins`, and unknown-command handling out of `setta.start`

## Decisions Made

- treat active source/dev startup as closed for the current rewrite boundary
- treat remaining `start.py` reachability as a small packaged-entrypoint
  fallback question, not as broad startup ownership
- continue treating direct `tests/start/*` imports of `setta.start` as legacy
  anchor coverage unless a concrete workflow proves otherwise
- do not invent a broad `start.py` reduction implementation slice without a
  clearer product or packaging reason

Historical note:

- the narrow fallback-hardening option listed here was later selected and
  recorded in `phase-27-packaged-entrypoint-fallback-hardening-plan.md`

## Next Recommended Step

Use this doc as the historical inventory input for the now-landed Phase 27 and
Phase 28 slices, not as the current remaining-state doc.

If rewrite work continues from here, rerank whether any still-reachable
`backend/setta/start.py` ownership remains worth touching after that landed
fallback-hardening step.
