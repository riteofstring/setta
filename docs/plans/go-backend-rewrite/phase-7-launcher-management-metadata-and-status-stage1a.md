# Phase 7 Launcher Management Metadata And Status Stage 1a

## Purpose

This doc narrows the broader Phase 7 launcher management/status cluster into a
first landable Stage 1a slice.

The goal is to move the launcher metadata/status owner to Go without dragging
platform artifact generation and removal into the same landing.

## Current Status

As of 2026-03-08:

- Go owns the launcher runtime/browser prerequisite:
  - launcher-mode recent workspaces and directory browsing
  - local IDE/launcher session registration
  - bootstrap HTML at `GET /__setta__/bootstrap`
  - `POST /openLauncherWorkspace`
- Python still owns IDE launcher management/status through:
  - `backend/setta/routers/status.py`
  - `backend/setta/launcher_setup.py`
  - `backend/setta/launcher_metadata.py`
- the full launcher-management cluster is not a good single-step landing
  because platform artifact install/remove is large, OS-specific, and still
  coupled to Python-shaped launcher command templates

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

## Recommended Landing Order

1. launcher metadata model, read/write, and status snapshot owner
2. metadata-only setup/repair/remove/update runtime owner
3. IDE launcher management HTTP transport
4. later Stage 1b artifact install/remove ownership

## Progress Notes

- 2026-03-08: created this focused Stage 1a doc after confirming that the full
  launcher-management cluster is too large for one landing and that the
  platform artifact layer should be split from metadata/status ownership.

## Recommended Next Step

Implement Stage 1a from this doc: Go-owned launcher metadata/status routes and
runtime, with metadata-only setup/repair/remove/update support.

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/launcher -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestApp.*Launcher' -count=1 -timeout 300s`
