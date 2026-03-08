# Phase 9 Packaged Go Entrypoint And Distribution Stage 1B

## Purpose

This doc narrows the remaining Stage 1 distribution work after the completed
Go-owned `cmd/setta` router and Go-owned launcher runtime/management slices.

The goal of this slice is to make the shipped Python-facing `setta` entrypoint
delegate the already-Go-owned command set to packaged Go binaries, so launcher
bootstrap/install scripts automatically bind to the Go contract without
reopening unrelated Python local-command groups.

## Why This Slice Exists

The earlier Phase 9 plan separated:

1. installer-script retargeting
2. shipped Python entrypoint/module-entrypoint switch

In practice those are coupled.

`setta launcher setup` binds launcher metadata to the executable that is
actually running. As long as the published `setta` entrypoint is still fully
Python-owned, installer/bootstrap scripts cannot really target the Go launcher
contract just by changing shell arguments.

That means the next coherent unit is:

1. package the Go `setta` and `setta-server` binaries into the shipped Python
   distribution
2. make the shipped `setta` and `python -m setta` entrypoints explicitly
   dispatch the Go-owned command set to the packaged Go `setta` binary
3. keep the still-Python local command groups on the Python side of that
   boundary for now

## In Scope

- current-platform packaging of:
  - `cmd/setta`
  - `cmd/setta-server`
- explicit packaged-binary location under `backend/setta`
- thin Python entrypoint dispatch for Go-owned commands:
  - `version`
  - `launcher`
  - `status`
  - `auth`
  - `tools`
  - `api`
  - `stop`
  - `connect`
  - `c`
- module-entrypoint dispatch (`python -m setta`)
- build/release helper updates needed so official package builds include those
  binaries
- focused tests for:
  - dispatch detection
  - module-entrypoint Go handoff
  - packaging/build script inclusion pathways touched by this slice

## Out Of Scope

- porting remaining Python local commands into Go:
  - default `setta`
  - `share`
  - `app`
  - `launch`
  - `backups`
  - `plugins`
  - `export-db`
- broad Click-tree shape preservation
- fallback heuristics that guess where a Go binary might exist
- launcher artifact/runtime changes

## Working Decisions

- use a thin Python wrapper as an explicit dispatch layer
  - this matches the existing Phase 9 boundary and keeps product semantics on
    the already-landed Go router
- package `setta` and `setta-server` as sibling binaries
  - `cmd/setta` already expects explicit `setta-server` sibling ownership for
    launcher runtime startup
- keep binary resolution deterministic
  - packaged path first
  - optional explicit env override for tests/dev only
  - no path guessing beyond that
- do not route unsupported commands into Go yet
  - if a command remains Python-owned, the wrapper should call Python
  - if a Go-owned command is requested and the packaged Go binary is missing,
    fail explicitly instead of silently re-owning launcher semantics in Python

## Implementation Steps

1. add this doc and refresh the Phase 9 plan/README references
2. add a small packaging helper that builds current-platform `cmd/setta` and
   `cmd/setta-server` into a packaged binary directory under `backend/setta`
3. include that packaged binary directory in distribution artifacts and cleanup
   flows
4. add a thin Python entrypoint module that:
   - detects when the command belongs to the Go-owned set
   - resolves the packaged Go binary path deterministically
   - executes the Go binary with the original argv
   - falls through to the Python Click tree only for still-Python commands
5. repoint:
   - `pyproject.toml` console script
   - `backend/setta/__main__.py`
6. run focused tests for the touched entrypoint/build surface
7. update the Phase 9 plan with landed behavior and the next remaining
   distribution step

## Verification Target

- Python tests for entrypoint dispatch and module-entrypoint behavior
- any focused script/workflow tests touched by packaging changes
- `git diff --check`

## Progress Notes

- 2026-03-08: completed this Stage 1B slice.
  - added packaged current-platform Go binary build helper:
    - `scripts/build_packaged_go_binaries.sh`
  - added focused distribution build helper for smoke/package flows:
    - `scripts/build_python_distribution_with_go_binaries.sh`
  - packaged `cmd/setta` and `cmd/setta-server` under `backend/setta/go_bin`
    via `build.sh` and `pyproject.toml` artifacts
  - switched the published Python entrypoints to the thin wrapper in
    `backend/setta/entrypoint.py`
  - updated `python -m setta` to use the same wrapper boundary
  - updated launcher release-smoke package creation to use the Go-binary-aware
    distribution helper
- 2026-03-08: decision confirmed.
  - the clean ownership boundary is a thin Python wrapper that execs the
    packaged Go router for the Go-owned command set
  - still-Python local commands remain on the Python side of that boundary for
    now

## Verification

- `source activate.sh && python -m pytest tests/start/test_module_entrypoint.py tests/start/test_desktop_launcher_install_scripts.py -q`
- `source activate.sh && ./scripts/build_python_distribution_with_go_binaries.sh --sdist`
- `tar -tzf dist/setta-0.0.18.tar.gz | rg 'backend/setta/go_bin/(setta|setta-server)$'`
- `source activate.sh && python -m setta version`
- `git diff --check`

## Recommended Next Step

After this slice lands, the remaining Phase 9 distribution work should be
smaller and more explicit:

1. refresh launcher bootstrap/native-installer scripts only where they still
   assume old build/package creation paths
2. decide whether remaining Python local commands should stay behind the thin
   wrapper longer or move to later Go slices
