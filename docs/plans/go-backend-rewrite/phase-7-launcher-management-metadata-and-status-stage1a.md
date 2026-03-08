# Phase 7 Launcher Management Metadata And Status Stage 1a

## Purpose

This doc narrows the broader Phase 7 launcher management/status cluster into a
first landable Stage 1a slice.

The goal is to move the launcher metadata/status owner to Go without dragging
platform artifact generation and removal into the same landing.

## Current Status

As of 2026-03-08:

- Stage 1a is complete.
- Go now owns:
  - launcher metadata parsing, validation, and persistence in
    `internal/launcher/metadata.go`
  - launcher metadata-only status/setup/repair/remove/update semantics in
    `internal/launcher/management.go`
  - IDE launcher management/status transport in
    `internal/httpapi/launcher_management_routes.go`
  - IDE app wiring for that route cluster in `internal/app/app.go`
- Stage 1a is now historically complete but superseded by Stage 1b for managed
  artifact mutation.
- Python still owns only the launch/bootstrap handoff routes outside this
  management slice.

## Inputs

- `docs/plans/go-backend-rewrite/phase-7-launcher-management-and-bootstrap-plan.md`
- `docs/plans/go-backend-rewrite/phase-7-runtime-surface-inventory.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/routers/status.py`
- `backend/setta/launcher_setup.py`
- `backend/setta/launcher_metadata.py`
- `backend/setta/launcher_artifacts/common.py`
- `backend/setta/launcher_artifacts/macos.py`
- `backend/setta/launcher_artifacts/linux.py`
- `backend/setta/launcher_artifacts/windows.py`
- `tests/routers/test_launcher_management_routes.py`
- `tests/start/test_launcher_setup.py`
- `frontend/src/components/Launcher/DesktopLauncherSettingsSection.tsx`

## Scope

Stage 1a moves the metadata/status owner only:

- implement Go-owned launcher metadata parsing, validation, and persistence
- implement Go-owned status collection and target validation
- serve Go-owned IDE routes for:
  - `GET /launcherStatus`
  - `POST /setupLauncher`
  - `POST /repairLauncher`
  - `POST /removeLauncher`
  - `POST /updateLauncher`
- preserve the current JSON response contract for that route cluster
- support no-artifact launcher installs end to end
- support update-capability reporting and in-app update for no-artifact
  `uv-tool` installs

## Explicit Non-Goals

Do not include:

- platform desktop artifact generation or installation
- platform desktop artifact removal/cleanup
- rewriting macOS/Linux/Windows launcher scripts or shortcut templates
- launcher-mode home/runtime routes
- `/launch`
- `/createWorkspaceLaunchIntent`
- bootstrap token/origin handoff work

## Stage 1a Behavior

Stage 1a should:

- treat launcher metadata as the source of truth
- allow setup/repair/remove/update when the install is metadata-only
- preserve existing metadata identity fields when omitted, matching current
  Python behavior
- report managed artifact state read-only when metadata already contains it
- fail explicitly when a request requires Go-owned artifact mutation that this
  stage does not yet implement
- default first-time `setupLauncher` requests to metadata-only install mode when
  `installArtifacts` is omitted, because Go does not yet own artifact-writing
  setup paths in this stage

## Working Decisions

- split launcher management before artifact ownership instead of inventing a
  half-port of the Python artifact layer
- keep the transport thin and put metadata/status semantics in
  `internal/launcher`
- reuse the current Go executable path as the launcher target contract for
  metadata ownership
- defer artifact-writing setup until Go has dedicated artifact templates built
  around the Go launcher command contract, not the Python `target_command ...
  launcher` shape
- implement update directly in Go service code instead of depending on a Go CLI
  `launcher setup` subcommand
- keep setup request decoding strict for this route so stale frontend or manual
  payload fields fail loudly instead of being silently ignored

## Recommended Landing Order

1. launcher metadata model, read/write, and status snapshot owner
2. metadata-only setup/repair/remove/update runtime owner
3. IDE launcher management HTTP transport
4. later Stage 1b artifact install/remove ownership

## Progress Notes

- 2026-03-08: created this focused Stage 1a doc after confirming that the full
  launcher-management cluster is too large for one landing and that the
  platform artifact layer should be split from metadata/status ownership.
- 2026-03-08: completed Stage 1a in Go. `GET /launcherStatus`,
  `POST /setupLauncher`, `POST /repairLauncher`, `POST /removeLauncher`, and
  `POST /updateLauncher` now route to Go-owned metadata/status logic; fresh
  setup defaults to metadata-only install mode; explicit artifact mutation now
  fails with `ArtifactMutationUnavailable`; in-app update is supported for
  metadata-only `uv-tool` installs.
- 2026-03-08: Stage 1b landed on top of this slice. Managed launcher artifact
  install/remove/update ownership no longer depends on Python, while this doc
  remains the historical record for the metadata-only landing.

## Recommended Next Step

Move to Stage 1b artifact ownership with a dedicated plan doc:
`phase-7-launcher-management-artifact-ownership-stage1b.md`.

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/launcher -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestApp(IDEModeManagesMetadataOnlyLauncherInstallOverHTTP|LauncherModeListsAndMutatesRecentWorkspacesOverHTTP)' -count=1 -timeout 420s`
