# Phase 7 Launcher Management Artifact Ownership Stage 1b

## Purpose

This doc scopes the next bounded launcher-management slice after the completed
Stage 1a metadata/status landing.

The goal is to move managed launcher artifact ownership to Go without mixing it
with launch/bootstrap handoff work.

## Current Status

As of 2026-03-08:

- Stage 1b is complete.
- Go owns launcher metadata/status plus managed and metadata-only
  setup/repair/remove/update through:
  - `internal/launcher/metadata.go`
  - `internal/launcher/management.go`
  - `internal/launcher/artifacts.go`
  - `internal/launcher/artifact_launch.go`
  - `internal/httpapi/launcher_management_routes.go`
- Go now owns:
  - planned artifact paths, trusted-root validation, and uniqueness checks
  - ownership marker writes/removals and cleanup on metadata-write failure
  - managed artifact install/remove/repair/update behavior behind the launcher
    management routes
  - a dedicated launcher artifact command contract via
    `--launcher-artifact-run`
- Python still owns only the later launch/bootstrap handoff slice.

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
- managed launcher artifacts now target a Go-owned helper contract:
  `targetCommand ... --launcher-artifact-run --setta-home <settaHome>`
- that helper uses dedicated launcher-managed runtime roots under
  `<settaHome>/launcher/{setta_files,runtime}` so desktop artifacts do not have
  to infer launcher session state heuristically

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
- 2026-03-08: completed Stage 1b in Go by adding Go-owned platform artifact
  planning/install/remove helpers, ownership markers, managed artifact update
  support, a dedicated `--launcher-artifact-run` executable path, and focused
  launcher/route/app coverage.

## Recommended Next Step

Return to `phase-7-launcher-management-and-bootstrap-plan.md` and move to the
remaining launcher gap: launch/bootstrap handoff ownership.

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/launcher -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEModeManages(MetadataOnlyLauncherInstallOverHTTP|LauncherArtifactsOverHTTP)' -count=1 -timeout 420s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./cmd/setta-server -count=1 -timeout 300s`
