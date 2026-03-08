# Phase 27 Packaged Entrypoint Fallback Hardening Plan

## Purpose

This doc records the bounded follow-on that Phase 26 deliberately left
unselected until a real decision was made to move the remaining packaged
`python -m setta` fallback/help edge set out of `backend/setta/start.py`.

The goal is not broad CLI parity work. It is to close the last active
packaged-entrypoint fallback that still routes root command discovery through
legacy Python code.

## Current Status

Completed before this slice:

- Phase 25 source/dev startup hardening removed active `setta.start` ownership
  from normal dev and reload startup
- Phase 25 reachability inventory narrowed the remaining active packaged
  fallback to:
  - root help
  - bare `plugins`
  - unknown command / unknown flag handling
- Phase 26 rerank kept that fallback separate from the now-closed
  distribution/install workflow track

What remains active at the start of this slice:

- `backend/setta/entrypoint.py` still falls through to `setta.start.cli` for
  root help, bare `plugins`, and invalid root argv shapes
- shipped Go CLI behavior for root/plugins help and invalid root argv shapes
  is not yet the explicit source of truth for the packaged module entrypoint

Completed during this slice:

- `internal/settacmd` now owns explicit root, `plugins`, and `plugins lock`
  usage rendering for the packaged CLI boundary
- Go root/plugins invalid argv handling now prints usage once and returns
  typed non-zero exit codes without falling back to Python Click output
- `backend/setta/entrypoint.py` now dispatches root help, bare `plugins`,
  `plugins lock`, and invalid root argv shapes to the packaged Go binary
- the packaged module entrypoint no longer has a live import/branch back into
  `setta.start`; it is now an unconditional thin launcher for the packaged Go
  binary
- focused Go and Python regression coverage now guards that boundary

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-25-start-py-reachability-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/phase-26-post-startup-and-distribution-ownership-rerank.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/entrypoint.py`
- `backend/setta/start.py`
- `cmd/setta/main.go`
- `internal/settacmd/cli.go`
- `internal/settacmd/plugins.go`
- `internal/settacmd/cli_test.go`
- `internal/settacmd/plugins_test.go`
- `tests/start/test_module_entrypoint.py`

## Scope

In scope:

- make the Go CLI the source of truth for packaged root help and packaged
  invalid root argv handling
- make the Go CLI the source of truth for packaged `plugins` root navigation
  and `plugins lock` root navigation
- retarget `backend/setta/entrypoint.py` so those argv shapes dispatch to the
  packaged Go binary instead of `setta.start`
- add focused Go and Python entrypoint regression coverage

Out of scope:

- broad `backend/setta/start.py` cleanup
- subcommand-by-subcommand Go help text redesign
- Python package artifact boundary changes
- release/install workflow changes

## Implementation Plan

1. Add explicit root/plugins/`plugins lock` help renderers in
   `internal/settacmd`.
2. Make root and plugin invalid argv handling print usage once and return typed
   exit codes without Python fallback.
3. Retarget `backend/setta/entrypoint.py` so root help, bare `plugins`,
   `plugins lock`, and invalid root argv shapes dispatch to Go.
4. Add focused tests in:
   - `internal/settacmd/cli_test.go`
   - `internal/settacmd/plugins_test.go`
   - `tests/start/test_module_entrypoint.py`

## Decisions

- prefer explicit Go-owned help/error rendering over preserving Click-shaped
  root help output
- keep the Python module entrypoint thin; do not add new Python-side help or
  error shims
- treat this as a bounded ownership slice, not a mandate to normalize every Go
  subcommand help surface in the same turn

## Open Questions

- none for this bounded slice

## Verification

- `./scripts/go.sh test ./internal/settacmd -run 'TestRun(VersionPrintsVersion|RootHelpPrintsUsage|DelegatesToolsToSettacli|RejectsUnknownCommand|RejectsUnknownGlobalFlagOnce)|TestRunPlugins(HelpNavigationPrintsUsage|LockHelpNavigationPrintsUsage|RejectsUnknownSubcommandWithUsage|LockRejectsUnknownSubcommandWithUsage)|TestParseGlobalFlagsSupportsWorkspaceAlias' -count=1`
- `source activate.sh && ./scripts/run_backend_tests.sh tests/start/test_module_entrypoint.py`

## Next Recommended Step

Do not broaden this into general CLI help normalization by inertia.

The next honest step is a rerank of whether any caller-backed or
workflow-backed `backend/setta/start.py` ownership worth touching remains at
all now that the last active packaged entrypoint fallback has moved to Go.
