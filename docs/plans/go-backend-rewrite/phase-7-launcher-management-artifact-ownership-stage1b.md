# Phase 7 Launcher Management Artifact Ownership Stage 1b

## Purpose

This doc scopes the next bounded launcher-management slice after the completed
Stage 1a metadata/status landing.

The goal is to move managed launcher artifact ownership to Go without mixing it
with launch/bootstrap handoff work.

## Current Status

As of 2026-03-08:

- Go owns launcher metadata/status plus metadata-only
  setup/repair/remove/update through:
  - `internal/launcher/metadata.go`
  - `internal/launcher/management.go`
  - `internal/httpapi/launcher_management_routes.go`
- Stage 1a deliberately fails artifact mutation with
  `ArtifactMutationUnavailable`
- Python still owns:
  - platform artifact planning/install/remove/update in
    `backend/setta/launcher_artifacts/`
  - artifact ownership markers and cleanup behavior in
    `backend/setta/launcher_setup.py`

## Inputs

- `docs/plans/go-backend-rewrite/phase-7-launcher-management-and-bootstrap-plan.md`
- `docs/plans/go-backend-rewrite/phase-7-launcher-management-metadata-and-status-stage1a.md`
- `docs/plans/go-backend-rewrite/phase-7-runtime-surface-inventory.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/launcher_artifacts/common.py`
- `backend/setta/launcher_artifacts/macos.py`
- `backend/setta/launcher_artifacts/linux.py`
- `backend/setta/launcher_artifacts/windows.py`
- `backend/setta/launcher_setup.py`
- `tests/start/test_launcher_setup.py`
- `tests/routers/test_launcher_management_routes.py`

## Scope

Stage 1b should:

- replace Stage 1a's artifact-mutation placeholder errors with Go-owned
  artifact behavior for current platforms
- own planned artifact paths, trusted-root validation, uniqueness checks, and
  ownership-marker writes/removals
- own managed artifact install/remove/repair/update behavior behind:
  - `POST /setupLauncher`
  - `POST /repairLauncher`
  - `POST /removeLauncher`
  - `POST /updateLauncher`
- keep launcher metadata as the source of truth
- preserve the current launcher-management JSON route contract

## Explicit Non-Goals

Do not include:

- launcher-mode home routes
- `/launch`
- `/createWorkspaceLaunchIntent`
- bootstrap token/origin handoff
- backward-compatibility shims for Python artifact scripts or route behavior

## Working Decisions

- Stage 1b should generate platform artifacts around the Go launcher contract,
  not the Python `target_command ... launcher` command shape
- transport stays thin; artifact semantics belong in `internal/launcher`
- metadata-only installs remain valid; Stage 1b adds artifact ownership without
  removing Stage 1a's metadata-only path
- trusted-root and ownership-marker validation should stay explicit and
  deterministic; do not add heuristic cleanup fallbacks

## Recommended Landing Order

1. define the Go launcher artifact command contract and per-platform planned
   artifact paths
2. implement ownership markers plus install/remove helpers
3. thread managed-artifact behavior back through setup/repair/remove/update
4. add focused tests for metadata, launcher service, HTTP routes, and any
   platform-specific edge cases that are stable in CI

## Progress Notes

- 2026-03-08: created this Stage 1b doc after completing Stage 1a metadata and
  status ownership. The remaining launcher-management gap is now artifact
  ownership, not metadata/status transport.

## Recommended Next Step

Implement Stage 1b from this doc: Go-owned managed launcher artifact planning,
install/remove/update behavior.

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/launcher -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestApp.*Launcher' -count=1 -timeout 420s`
