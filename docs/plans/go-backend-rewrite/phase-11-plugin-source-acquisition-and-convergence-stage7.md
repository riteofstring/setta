# Phase 11 Plugin Source Acquisition And Convergence Stage 7

## Purpose

This doc scopes the seventh bounded Phase 11 implementation slice after the
completed plugin lockfile-write migration.

The goal is to move the remaining unblocked plugin mutation and convergence
commands onto the shipped Go CLI by landing the missing production
source-acquisition owner plus lockfile-apply ownership, without broadening
into restart-hook work.

## Current Status

As of 2026-03-08:

- Go already owns the shipped CLI router in:
  - `cmd/setta`
  - `internal/settacmd`
  - `backend/setta/entrypoint.py`
- Go already owns the completed plugin status/read slice:
  - `list`
  - `rescan`
  - `restart-required`
- Go already owns the completed plugin lifecycle-controls slice:
  - package-manager-aware discovery
  - `enable`
  - `disable`
  - `uninstall`
  - `rollback`
- Go already owns the completed plugin authoring/local-link slice:
  - `init`
  - `validate`
  - `link`
- Go already owns the completed lockfile-write slice:
  - shared lockfile models and deterministic lockfile writing in
    `internal/plugins`
  - `setta plugins lock write` in `internal/settacmd`
- Go already owns the core mutation service shape in `internal/plugins` for:
  - `Install`
  - `Update`
  - `Rollback`
  - scoped metadata/history persistence
  - pending-restart bookkeeping
- the shipped Go CLI still does not wire a production candidate provider into
  `internal/plugins`
  - `internal/settacmd.resolvePluginsService` constructs
    `plugins.NewService(...)` without `CandidateProvider`
  - shipped `install`/`update`/`pin` would currently fail with
    `PLUGIN_SOURCE_FETCH_FAILED` instead of performing real source acquisition
- Go does not yet own lockfile convergence/apply
- Python still owns the remaining plugin commands:
  - `install`
  - `update`
  - `pin`
  - `lock apply`
  - `restart`

## Inputs

- `docs/plans/go-backend-rewrite/phase-11-maintenance-command-inventory.md`
- `docs/plans/go-backend-rewrite/phase-11-plugin-lock-write-stage6.md`
- `docs/plans/go-backend-rewrite/phase-6-plugin-management-runtime-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-plugin-management-mutation-owner.md`
- `docs/plans/go-backend-rewrite/phase-6-plugin-management-tool-parity.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `backend/setta/entrypoint.py`
- `backend/setta/plugins/manager.py`
- `tests/start/test_start_plugins.py`
- `tests/start/test_module_entrypoint.py`
- `tests/plugins/test_plugin_manager.py`
- `internal/plugins/service.go`
- `internal/plugins/source_specs.go`
- `internal/plugins/lockfile.go`
- `internal/plugins/discovery.go`
- `internal/pythonenv/runtime.go`
- `internal/settacmd/plugins.go`

## Problem Shape

The remaining plugin CLI surface is still split across two different runtime
dependencies.

1. source acquisition is the real missing production owner
   - Go service methods for `Install` and `Update` already exist
   - the shipped runtime does not yet provide a real `CandidateProvider`
   - routing `install`/`update`/`pin` to Go before that lands would only ship
     an explicit unavailable error, not working behavior

2. `lock apply` depends on the same source-acquisition boundary and adds a real
   convergence loop
   - Python `apply_lockfile` is not a thin wrapper
   - it validates the lockfile, plans installs/uninstalls/reconciliations,
     skips externally managed entries, preserves disabled state, and batches
     mutations behind one final rescan
   - Go currently owns only `WriteLockfile`

3. `restart` remains separate
   - Go status payloads already report manual vs programmatic restart
     capability accurately
   - the shipped local runtime still exposes only the manual capability path
   - `plugins restart` should stay out of scope unless a later slice
     intentionally lands a manual-only command or a real restart hook

That makes source acquisition plus lockfile convergence the next coherent
bounded slice.

## Scope

This stage should cover only:

- a production Go-owned `CandidateProvider` for supported plugin source specs:
  - `github:<owner>/<repo>[#ref]`
  - `pypi:<package>[==version]`
- the supporting source-acquisition/runtime helpers needed by that provider:
  - GitHub fetch with explicit timeout and non-interactive auth prompt policy
  - PyPI staging over the active Python runtime plus selected installer backend
  - safe archive extraction
  - package metadata and manifest identity/version validation
- shared Go-owned lockfile convergence in `internal/plugins`
  - lockfile load/validation
  - plan/apply loop
  - duplicate scope/plugin rejection
  - package-manager-managed skip rules
  - disabled-state preservation
  - single final rescan after apply
- thin Go CLI transport for:
  - `setta plugins install`
  - `setta plugins update`
  - `setta plugins pin`
  - `setta plugins lock apply`
- selective Python entrypoint dispatch for only those completed subcommands

Do not include:

- `plugins restart`
- programmatic restart-hook ownership
- plugin authoring/local-link work
- package-manager discovery redesign
- any Python fallback for remote source acquisition

## Working Decisions

- keep the candidate-provider boundary explicit
  - source acquisition belongs under `internal/plugins`, not in CLI handlers
  - do not route remaining mutations back through Python as a compatibility
    bridge
- use robust source-of-truth paths for acquisition and validation
  - for GitHub, shell out to native `git` with prompt suppression and explicit
    timeout
  - for PyPI, use the selected installer backend (`pip` or `uv`) to stage the
    candidate and validate from real package metadata plus manifest contents,
    not filename guessing
- keep PyPI runtime selection anchored on `internal/pythonenv`
  - the current interpreter/runtime boundary already exists there
  - extend it only as needed for bounded temp install/download helpers; do not
    invent a second Python command-dispatch layer inside `internal/plugins`
- preserve the current product rules around source validation
  - fail on missing manifest
  - fail on multiple plugin manifests in one artifact
  - fail on metadata identity/version mismatch
  - reject archive traversal and symbolic-link escapes
  - keep installer-backend availability explicit
- keep lockfile convergence owned by `internal/plugins`
  - CLI should only parse flags, call service methods, and render payloads
- keep package-manager-managed plugins out of Setta-managed convergence
  - current runtime discovery already marks those entries explicitly
  - `lock apply` should continue skipping current package-manager entries and
    lockfile entries that intentionally represent external management

## Implementation Shape

1. add production source-acquisition ownership in `internal/plugins`
   - implement a real `CandidateProvider`
   - add bounded helpers for:
     - GitHub clone/fetch and VCS metadata stripping
     - PyPI staging through `pip`/`uv`
     - safe artifact extraction and metadata reads
   - return fully validated `CandidatePlugin` values to the existing mutation
     service

2. extend service/runtime coverage for acquisition failures
   - add explicit service errors for:
     - installer unavailable
     - archive traversal
     - invalid/missing lockfile data
   - keep candidate resolution outside the mutation lock so runtime/status reads
     stay responsive

3. add lockfile convergence ownership in `internal/plugins`
   - add lockfile-apply result types
   - load and validate the lockfile from the existing store path
   - plan/apply installs, source reconciliations, digest reconciliations, and
     uninstalls using the existing mutation service methods with `rescan=false`
   - run one final rescan after successful apply

4. extend the shipped CLI and entrypoint dispatch
   - add `install`, `update`, `pin`, and `lock apply` parsing/output in
     `internal/settacmd/plugins.go`
   - wire the production candidate provider into
     `resolvePluginsService(...)`
   - update `backend/setta/entrypoint.py` so only the newly completed plugin
     subcommands route to Go

## Test Strategy

- add focused `internal/plugins` tests for:
  - GitHub candidate acquisition, missing `git`, and clone timeout handling
  - PyPI candidate staging with `pip`, `uv`, and auto-backend fallback
  - package metadata identity/version mismatch failures
  - archive traversal rejection
  - lockfile apply duplicate-entry rejection
  - lockfile apply disabled-state preservation
  - lockfile apply package-manager skip behavior
  - lockfile apply single-final-rescan behavior
- add focused `internal/settacmd` tests for:
  - `plugins install` text and JSON output
  - `plugins update` and `plugins pin` text and JSON output
  - `plugins lock apply` text and JSON output
  - nested `plugins lock apply` validation and `--check`
- extend `tests/start/test_module_entrypoint.py`
  - route `plugins install`
  - route `plugins update`
  - route `plugins pin`
  - route `plugins lock apply`
  - keep `plugins restart` on Python

## Explicit Non-Goals

- `plugins restart`
- manual-only restart-command transport
- launcher/share/app restart integration
- plugin UI work
- changing the plugin on-disk layout
- broad Python environment management beyond what candidate staging requires

## Open Questions

- whether the later follow-on slice after Stage 7 should keep `plugins restart`
  as a manual-only UX command, or wait for a real Go restart hook
- whether any shared helper extracted for PyPI staging belongs in
  `internal/pythonenv`, or should stay private to `internal/plugins` after the
  first production implementation lands

## Progress Notes

- 2026-03-08: created this Stage 7 plan to keep the remaining plugin CLI work
  split along the actual missing production dependency.
  - the next bounded slice is now explicitly `install`, `update`, `pin`, and
    `lock apply`
  - the stage is centered on a real production `CandidateProvider` plus
    lockfile convergence ownership
  - `plugins restart` remains intentionally separate

## Recommended Next Step

Implement this Stage 7 slice in order:

1. land the production candidate provider and supporting acquisition helpers
2. add shared `lock apply` convergence ownership in `internal/plugins`
3. expose `install`, `update`, `pin`, and `lock apply` through the shipped Go
   CLI and partial Python entrypoint dispatch
