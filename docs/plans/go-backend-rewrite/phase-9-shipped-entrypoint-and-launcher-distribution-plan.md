# Phase 9 Shipped Entrypoint And Launcher Distribution Plan

## Purpose

This doc scopes the next rewrite track after the completed Phase 8 helper-command
migration.

The goal is to move the shipped `setta` product entrypoint and launcher/distribution
surface onto an explicit Go-owned command contract without reopening the completed
backend runtime or SSH helper slices.

## Current Status

As of 2026-03-08:

- Go already owns:
  - the backend runtime in `cmd/setta-server` plus `internal/app`
  - launcher metadata, managed artifacts, artifact-run contract, and workspace-open
    runtime in `internal/launcher`
  - helper commands in `cmd/setta-cli` / `internal/settacli`:
    - `status`
    - `auth`
    - `tools`
    - `api`
    - `stop`
    - `connect`
    - alias `c`
- Go now also owns the first shipped-entrypoint slice in:
  - `cmd/setta`
  - `internal/buildinfo`
  - `internal/settacmd`
  - direct `version` handling
  - direct routing for the already-completed Go helper-command cluster
  - launcher run behavior at the `setta launcher` root
  - launcher management commands:
    - `launcher setup`
    - `launcher status`
    - `launcher repair`
    - `launcher remove`
    - `launcher update`
- Go now also owns the shipped launcher/helper command contract at the published
  Python entrypoints:
  - `pyproject.toml` now publishes `setta = "setta.entrypoint:main"`
  - `backend/setta/__main__.py` now also enters through `setta.entrypoint`
  - the Python entrypoint is now a thin explicit wrapper, not the owner of the
    Go-owned launcher/helper command semantics
- Go now also owns the current native-installer package-binding slice:
  - `scripts/release/build_macos_installer.sh`
  - `scripts/release/build_windows_installer.ps1`
  - native installers now bundle the packaged current-platform Setta sdist and
    bootstrap that exact artifact instead of a bare index package name
- Python still owns the shipped launcher entrypoint path in `backend/setta/start.py`,
  but only as the temporary owner of still-Python local command groups
  behind the thin wrapper boundary
- installer/release scripts still exist, but their launcher bootstrap contract
  now binds to the Go-owned command surface through the thin wrapper or the
  packaged Go router:
  - `scripts/install_desktop_launcher.sh`
  - `scripts/install_desktop_launcher.ps1`
  - platform launcher install/uninstall scripts
  - `scripts/release/*`
- unrelated local command groups still remain Python-owned:
  - default `setta` local server start
  - `share`
  - `app`
  - `launch`
  - `backups`
  - `plugins`
  - `version`
  - `export-db`

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-8-cli-closeout-and-launcher-distribution-boundary.md`
- `docs/plans/go-backend-rewrite/phase-9-packaged-go-entrypoint-and-distribution-stage1b.md`
- `docs/plans/go-backend-rewrite/phase-9-native-installer-bundled-package-stage2.md`
- `docs/reference/setta-cli-commands.md`
- `pyproject.toml`
- `build.sh`
- `backend/setta/start.py`
- `backend/setta/__main__.py`
- `cmd/setta-server/main.go`
- `cmd/setta-cli/main.go`
- `internal/launcher/management.go`
- `internal/launcher/artifact_launch.go`
- `internal/launcher/open_workspace.go`
- `tests/start/test_module_entrypoint.py`
- `tests/start/test_launcher_cli.py`
- `tests/start/test_launcher_setup.py`
- `tests/start/test_launcher_metadata.py`
- `tests/start/test_desktop_launcher_install_scripts.py`
- `tests/start/test_linux_launcher_scripts.py`
- `tests/start/test_macos_launcher_scripts.py`
- `tests/start/test_windows_launcher_scripts.py`

## Problem Shape

The remaining gap is not "port the rest of the CLI" as one task. It is three
coupled but distinct ownership problems:

1. shipped entrypoint ownership
   - what installed users actually execute when they run `setta`
   - what `python -m setta` does inside launcher/bootstrap workflows

2. launcher CLI ownership
   - `setta launcher ...` contract used by install/update/remove flows
   - launcher run/setup/status/repair/remove/update JSON and text behavior

3. distribution workflow ownership
   - shell/PowerShell/native-installer scripts that currently assume the Python
     `setta` CLI contract

The completed Go runtime pieces already exist. The remaining work is command
routing, packaging, and script integration.

## Boundary Choice

Do not combine this track with the unrelated Python local command groups
(`backups`, `plugins`, default local `setta`, `share`, `app`, `launch`,
`export-db`) unless a concrete dependency forces it.

The first bounded owner should be:

1. a Go-owned user-facing command router for the shipped `setta` entrypoint
2. Go-owned `launcher` CLI behavior on top of the already-completed
   `internal/launcher` runtime
3. installer/release scripts retargeted to that Go-owned launcher contract

This keeps the next slice focused on shipped entrypoint and launcher/distribution
ownership, which is the smallest coherent unit that removes the current Python
packaging dependency.

## Stage 1 Scope

Stage 1 should add:

- a new Go user-facing executable:
  - `cmd/setta`
- a dedicated internal command-router package for the shipped CLI:
  - direct routing to Go-owned helper commands
  - direct routing to Go-owned `launcher` commands
  - direct `version` handling
- Go-owned launcher subcommands using `internal/launcher`:
  - `launcher`
  - `launcher setup`
  - `launcher status`
  - `launcher repair`
  - `launcher remove`
  - `launcher update`
- a clear packaging/dispatch contract for installed environments:
  - either ship `cmd/setta` directly as the primary executable
  - or use a tiny Python wrapper that execs the packaged Go binary
- focused test coverage for:
  - entrypoint routing
  - launcher CLI JSON/text contracts
  - module-entrypoint behavior
  - desktop installer script delegation

## Stage 1 Explicit Non-Goals

Do not include in Stage 1:

- `backups`
- `plugins`
- `export-db`
- broad local runtime flag parity for default `setta`, `share`, `app`, or `launch`
- preserving the full Click command tree shape internally
- mixed launcher/distribution plus plugin/backups migration in one slice

## Stage 2 Scope

After Stage 1 is complete, Stage 2 should:

- bundle the exact packaged current-platform Setta artifact into native macOS
  and Windows installer payloads
- make native-installer bootstrap execute that bundled artifact rather than a
  bare `setta` package name
- keep the existing bootstrap scripts as the only installer command boundary
- verify native-installer smoke against the installer version under test

## Working Decisions

- introduce `cmd/setta` instead of overloading `cmd/setta-cli`
  - `cmd/setta` is the shipped user-facing entrypoint
  - `cmd/setta-cli` remains a narrower helper-command surface unless/until it
    is folded in deliberately
- keep `cmd/setta-server` as the backend runtime executable; do not turn it into
  a user-facing umbrella command
- prefer an explicit dispatch boundary over silently preserving the Python Click
  tree
- if a temporary Python wrapper is needed for wheel/module packaging, keep it
  minimal and make it exec the Go binary instead of re-owning command semantics
- port `launcher` before the unrelated local command groups because:
  - the runtime semantics are already Go-owned
  - installer/release scripts already depend on it
  - it is the main remaining distribution blocker after the helper-command work

## Recommended Landing Order

1. add this doc and refresh the README ordering
2. build `cmd/setta` plus an internal router for:
   - helper commands already owned in Go
   - launcher subcommands
   - version
3. port `launcher` CLI behavior onto the existing `internal/launcher` services
4. add entrypoint/module-entrypoint and installer-script coverage for the new
   command contract
5. retarget packaging/install scripts to the Go-owned launcher contract
6. only then decide whether the remaining local command groups should move to
   Go or stay explicitly Python-owned for longer

## Recommended First Implementation Slice

Do not start by changing `pyproject.toml` blindly.

Start with a bounded first slice:

1. add `cmd/setta`
2. route helper commands and `version` to Go
3. port `launcher setup|status|repair|remove|update` to Go
4. keep launcher run plus packaging-switch work for the next slice if that
   boundary still proves too large

This first slice is the highest-leverage implementation unit because it creates
the actual Go command tree that installer scripts can target next.

## Progress Notes

- 2026-03-08: created this plan after the completed Phase 8 helper-command
  migration and the closeout inventory confirmed that the remaining rewrite
  boundary is shipped entrypoint plus launcher/distribution ownership, not
  backend or SSH-helper runtime behavior.
- 2026-03-08: completed the first bounded implementation slice. `cmd/setta`
  now exists, `version` and the completed helper-command cluster route directly
  to Go, and launcher management (`setup|status|repair|remove|update`) is now
  Go-owned in `internal/settacmd` over the existing `internal/launcher`
  service layer.
- 2026-03-08: completed the next bounded Stage 1 slice. `setta launcher` root
  run behavior is now Go-owned in `internal/settacmd`, reusing the explicit
  `internal/launcher` session/bootstrap runtime while starting either IDE-mode
  or launcher-mode backend sessions as needed.
- 2026-03-08: the remaining Stage 1 boundary is now packaging/module-entrypoint
  ownership plus installer-script retargeting. The open rewrite gap is
  distribution wiring, not launcher runtime semantics.
- 2026-03-08: narrowed the next active slice into
  `phase-9-packaged-go-entrypoint-and-distribution-stage1b.md`. The practical
  dependency is that installer-script retargeting and Python-entrypoint switch
  have to land together around packaged Go binary delivery; shell-argument-only
  script changes are not enough.
- 2026-03-08: completed the packaged-binary and thin-wrapper Stage 1B slice.
  Current-platform builds now package `cmd/setta` plus `cmd/setta-server`
  under `backend/setta/go_bin`, the published `setta` and `python -m setta`
  entrypoints dispatch the Go-owned command set through that packaged binary,
  and the launcher-smoke workflow now builds local package artifacts through the
  Go-binary distribution helper instead of raw `python -m build`.
- 2026-03-08: fixed the remaining wheel packaging gap for that Stage 1B slice.
  Wheel builds now require packaged Go binaries to be present before build, and
  the built wheel is marked platform-specific through a Hatch build hook rather
  than incorrectly publishing a universal `py3-none-any` artifact.
- 2026-03-08: completed the next bounded Stage 2 distribution slice in
  `phase-9-native-installer-bundled-package-stage2.md`.
  Native macOS/Windows installers now bundle the packaged Setta sdist built in
  the same workflow, bootstrap that exact artifact during install, and native
  installer smoke verifies that launcher metadata reports the matching Setta
  version.
- 2026-03-08: after the bundled-installer slice, the remaining Phase 9
  question is no longer release-artifact binding; it is whether the
  still-Python local command groups should remain behind the thin wrapper or
  move into later Go slices.

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/settacmd ./internal/launcher ./cmd/setta -count=1 -timeout 300s`
- `source activate.sh && python -m pytest tests/start/test_module_entrypoint.py tests/start/test_desktop_launcher_install_scripts.py -q`
- `source activate.sh && python -m pytest tests/start/test_packaged_distribution.py -q`
- `source activate.sh && ./scripts/build_python_distribution_with_go_binaries.sh --sdist`
- `source activate.sh && ./scripts/build_packaged_go_binaries.sh`
- `source activate.sh && python -m build --wheel --outdir /tmp/setta-wheel-check.<suffix>`
- `tar -tzf dist/setta-0.0.18.tar.gz | rg 'backend/setta/go_bin/(setta|setta-server)$'`
- `python - <<'PY' ... inspect setta-0.0.18.dist-info/WHEEL ... PY`
- `source activate.sh && python -m setta version`
- `git diff --check`

## Recommended Next Step

Use the completed distribution boundary from this doc as the handoff point and
decide the next separate slice explicitly:

1. keep the remaining Python local command groups behind the thin wrapper for
   now and close Phase 9 distribution work
2. or open a later Go CLI slice for selected local commands (`setta`, `share`,
   `app`, `launch`, `backups`, `plugins`, `export-db`) only if product
   priorities justify it
