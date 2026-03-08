# Phase 8 CLI Closeout And Launcher Distribution Boundary

## Purpose

This doc closes the Phase 8 helper-command migration after the completed Go CLI
landings for `status`, `auth`, `tools`, `api`, `stop`, and `connect`.

The goal is to record the remaining Python-owned CLI/distribution surface
precisely, so future work does not reopen the completed helper/runtime slices
under a vague "CLI parity" label.

## Current Status

As of 2026-03-08:

- Go owns the completed backend runtime surface through Phase 7 in:
  - `cmd/setta-server/main.go`
  - `internal/app`
  - `internal/httpapi`
  - `internal/launcher`
  - `internal/workspacelaunch`
  - `internal/sshx`
- Go owns the completed helper-command CLI surface in:
  - `cmd/setta-cli/main.go`
  - `internal/settacli/cli.go`
  - `internal/settacli/remote_stop.go`
  - `internal/settacli/remote_connect.go`
- Go now also owns the shipped top-level `setta` command surface in:
  - `cmd/setta`
  - `internal/settacmd`
  - `backend/setta/entrypoint.py`
  - completed Go-owned default `setta`, `launch`, `share`, `app`,
    `backups`, `export-db`, `launcher`, and `plugins`
- Python no longer owns shipped command semantics in `backend/setta/start.py`
  for the packaged CLI surface
  - current packaged command ownership is Go behind the thin module-entrypoint
    wrapper
- Python/shell/PowerShell still own distribution and installer workflows in:
  - `scripts/install_desktop_launcher.sh`
  - `scripts/install_desktop_launcher.ps1`
  - `scripts/install_linux_launcher.sh`
  - `scripts/install_macos_launcher.sh`
  - `scripts/install_windows_launcher.ps1`
  - `scripts/uninstall_linux_launcher.sh`
  - `scripts/uninstall_macos_launcher.sh`
  - `scripts/uninstall_windows_launcher.ps1`
  - `scripts/release/*`

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-7-closeout-and-cli-follow-up-boundary.md`
- `docs/plans/go-backend-rewrite/phase-8-cli-remote-stop-and-connect-foundation.md`
- `docs/plans/go-backend-rewrite/phase-8-cli-connect-runtime-and-output-modes.md`
- `docs/reference/setta-cli-commands.md`
- `pyproject.toml`
- `backend/setta/start.py`
- `tests/start/test_launcher_cli.py`
- `tests/start/test_launcher_setup.py`
- `tests/start/test_launcher_metadata.py`
- `tests/start/test_desktop_launcher_install_scripts.py`
- `tests/start/test_linux_launcher_scripts.py`
- `tests/start/test_module_entrypoint.py`
- `scripts/install_desktop_launcher.sh`
- `cmd/setta-server/main.go`
- `cmd/setta-cli/main.go`

## Ownership Inventory

1. The helper-command migration is complete
   - Go `cmd/setta-cli` now owns:
     - `status`
     - `auth`
     - `tools`
     - `api`
     - `stop`
     - `connect`
     - alias `c`
   - the supporting runtime logic is in Go, not in Python shims

2. The shipped top-level product entrypoint was still fully Python-owned at
   Phase 8 closeout time
   - follow-up note:
     - Phase 9 later moved the published entrypoint to
       `setta = "setta.entrypoint:main"`
     - the current shipped boundary is a thin Python wrapper that dispatches
       Go-owned launcher/helper commands into packaged Go binaries

3. The remaining Python CLI surface is not one thing
   - follow-up note:
     - Phases 9, 10, and 11 later moved the shipped local command surface to
       Go
     - the remaining adjacent Python/shell ownership from this boundary is now
       installer/release workflow code, not packaged command semantics

4. The remaining Python surface is no longer a backend blocker
   - `cmd/setta-server` already runs Go-owned IDE/share/app/launcher runtime
     modes
   - `cmd/setta-cli` already owns the helper-command cluster that previously
     depended on Python SSH/runtime helpers
   - the remaining gap is entrypoint packaging and product-command ownership,
     not hidden backend/runtime behavior

## Working Decisions

- close Phase 8 for the helper-command migration
- do not reopen completed SSH/helper/runtime slices under a broad "finish the
  CLI" label
- treat future work as a separate post-Phase-8 product/distribution track
- keep launcher/distribution ownership separate from local command-group
  migration; they touch different risks and should not be bundled casually
- if a future Go-owned shipped `setta` entrypoint is needed, prefer a thin
  command router over recreating the entire Click tree by default

## Recommended Next Step

Use this doc as a historical closeout boundary only.

The follow-on Phase 9, Phase 10, and Phase 11 command migrations are now
complete. Do not reopen Phase 8 under a broad "finish the CLI" label.

If more rewrite work is needed next, choose it from the broader rewrite plan
or an explicit subsystem spike rather than from this already-completed CLI
closeout.

## Progress Notes

- 2026-03-08: created this closeout doc after the completed Phase 8 helper
  slices to record that the remaining Python-owned CLI surface is now mostly
  shipped entrypoint, launcher/distribution, and unrelated local command
  groups, not SSH helper behavior.
- 2026-03-08: the active follow-up is now captured in
  `phase-9-shipped-entrypoint-and-launcher-distribution-plan.md` so this doc
  remains a closeout/inventory boundary instead of carrying implementation
  scope.
- 2026-03-08: later follow-up note.
  - Phases 9, 10, and 11 completed the shipped command migration tracked from
    this boundary
  - the packaged CLI surface is now Go-owned end-to-end
  - the remaining adjacent Python/shell ownership from this track is
    distribution/install workflow code, not packaged command semantics

## Verification

- docs-only update; runtime tests not needed
- `git diff --check`
