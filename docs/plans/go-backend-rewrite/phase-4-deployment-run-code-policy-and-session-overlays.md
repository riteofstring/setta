# Phase 4 Deployment Run-Code Policy And Session Overlays

## Purpose

This doc narrows the remaining Phase 4 `runCode` work to deployment-mode
foundations: deployment metadata loading, per-session overlay ownership,
deployment policy, and per-session run-slot bookkeeping.

The current Go rewrite already covers the IDE `runCode` path. The next gap is
not another terminal tweak. It is the missing deployment runtime boundary that
Python currently spreads across share policy helpers, share runtime state, and
session-scoped project managers.

## Status

Current repo status as of 2026-03-06:

- Go already owns the IDE `runCode` path under:
  - `internal/runs`
  - `internal/httpapi/terminal_routes.go`
  - `internal/terminals`
- Go project state already includes:
  - in-memory overlay runtimes via `internal/projectstate.OpenOverlayRuntime`
  - per-session overlay registry support via
    `internal/projectstate.OpenSessionOverlayRegistry`
  - deployment path-policy helpers under `internal/projectstate/paths.go`
- Go mode handling already includes:
  - deployment-mode identification under `internal/modes.Policy`
  - share-session extraction and touch hooks under
    `internal/modes/share_session.go`
  - websocket-side share-session enforcement under `internal/wsapi`
- Go now includes the first deployment runtime foundation under:
  - `internal/deployments`
  - deployment manifest loading
  - deployment policy loading with deployment defaults
  - rejection of deployment `runSnapshotMode=never`
  - base in-memory deployment project runtime opened from deployment
    `project.json`
  - per-session overlay creation/deletion on top of that base runtime
  - share-session existence/touch semantics
  - per-session run-count reservation, increment, and rollback
- the current Go deployment gap is now concentrated in remaining transport:
  - deployment `runCode` now uses the Go deployment runtime and share-session
    overlays
  - current deployment-session bootstrap now exists in Go
  - deployment session expiry cleanup now exists in Go
  - deployment state/project-config transport is still missing
  - deployment terminal delete/interrupt transport is still IDE-only
- Python still owns deployment/share `runCode` semantics across:
  - `backend/setta/routers/terminals.py`
  - `backend/setta/share/policy.py`
  - `backend/setta/project_state/share_runtime_state.py`
  - `backend/setta/project_state/session_project_manager.py`

## Scope

This focused plan covers:

- defining the missing Go deployment runtime boundary for run-code work
- loading deployment manifest/policy/project state from deployment roots
- owning share-session state needed by deployment-mode `runCode`
- sequencing the first implementation slices before route migration

## Non-Goals

- full share/app route migration in one slice
- deployment session HTTP transport in the first slice
- LLM, listener, or file-download deployment policy migration
- parameter-override support in Go
- detached-run migration

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-4-realtime-and-terminal-runtime.md`
- `docs/plans/go-backend-rewrite/phase-4-terminal-run-code-migration.md`
- `docs/reference/share-policy-flags.md`
- `docs/reference/sharing-mode-vs-ide-mode.md`
- `backend/setta/routers/terminals.py`
- `backend/setta/share/policy.py`
- `backend/setta/project_state/share_runtime_state.py`
- `backend/setta/project_state/session_project_manager.py`
- `backend/setta/types/share_deployment.py`
- `tests/share/test_policy.py`
- `tests/project_state/test_share_project_manager.py`
- `tests/routers/test_share_policy_routes.py`

## Working Decisions

- do not thread deployment policy through handlers as ad hoc booleans
  - load `policy.json` once into a Go-owned deployment runtime boundary
- keep session-scoped overlay ownership under project-state-adjacent runtime code
  - `internal/runs` should depend on an explicit runtime/service, not on raw
    header values
- validate deployment `runSnapshotMode` when the deployment runtime loads
  - do not wait until each route call to discover unsupported deployment
    configuration
- keep deployment session run-count bookkeeping explicit
  - no heuristic reuse of terminal state as a proxy for “already ran”
- do not broaden this slice into public deployment session route transport until
  the runtime boundary exists
- keep the first deployment startup contract explicit
  - support `--deployment-root` first
  - defer `--deployment-name/--version/--latest` selection until a later
    deployment transport slice

## Dependency Finding

The earlier Phase 4 run-code doc correctly identified deployment/share policy as
the next remaining semantic gap, but current code inspection shows a lower-level
dependency that must be handled first:

- Python deployment `runCode` depends on a share runtime object that already
  owns:
  - deployment metadata
  - loaded policy
  - per-session overlay project state
  - per-session run counters
- Go has the raw ingredients for overlays and share-session extraction, but not
  the runtime object that ties them together
- without that runtime boundary:
  - `internal/app.New` cannot boot share/app mode correctly
  - `internal/httpapi/terminal_routes.go` cannot enforce deployment policy from
    a source of truth
  - `internal/runs` cannot plan against session-scoped project state or
    deployment-scoped snapshot roots cleanly

That makes deployment runtime foundation the highest-leverage first slice.

The next inspection pass after Slice 1 found one more prerequisite inside Slice
2 itself:

- even with `internal/deployments`, Go cannot yet start share/app mode because
  `internal/config` and `cmd/setta-server` still only know IDE-style
  `setta_files` inputs
- Python supports both explicit deployment roots and deployment-name/version
  discovery, but only the explicit-root path is required to boot the runtime
  from a source of truth
- the bounded Slice 2 path is therefore:
  - add explicit `--deployment-root` startup support
  - derive the deployment runtime root from deployment manifest metadata when no
    explicit runtime root override is supplied
  - wire `internal/app.New` to open the Go deployment runtime in share/app mode
  - defer deployment-name/version/latest discovery until later

## Proposed Go Boundaries

### `internal/deployments`

Own:

- deployment manifest loading
- deployment policy loading + validation
- in-memory base deployment project runtime
- per-session overlay registry
- share-session existence/touch bookkeeping
- per-session run-count reservation, increment, and rollback

Do not own:

- terminal PTY behavior
- route-level request decoding
- run-command planning logic

### `internal/runs`

Later depend on deployment runtime for:

- session-scoped runtime selection
- deployment snapshot-root selection
- deployment policy-derived snapshot defaults

### `internal/httpapi`

Later use deployment runtime only for:

- requiring share sessions
- mapping deployment policy failures to request errors

## Implementation Slices

### Slice 1: Deployment Runtime Foundation

Deliver:

- `internal/deployments` package with:
  - manifest loading
  - policy loading with deployment defaults
  - rejection of deployment `runSnapshotMode=never`
  - base in-memory deployment project runtime
  - per-session overlay creation/deletion
  - share-session existence/touch methods
  - per-session run-count reservation and rollback methods

Acceptance:

- Go can load deployment roots without mutating deployment `project.json`
- creating a session gives Go a stable overlay runtime for that session
- per-session run-slot reservation is explicit and atomic
- deleting a session removes both overlay state and run-count state

Status:

- complete

Completed:

- added `internal/deployments` with:
  - manifest loading and validation
  - policy loading and validation
  - deployment project document loading through an in-memory base runtime
  - manifest-default-project application against the loaded document
  - per-session overlay lifecycle
  - share-session existence/touch methods
  - per-session run-count reservation, increment, and rollback

Tests:

- `./scripts/go.sh test ./internal/deployments ./internal/projectstate ./internal/modes -count=1`

### Slice 2: App Wiring For Deployment Runtime

Deliver:

- `internal/app.New` mode-aware boot for share/app:
  - accept an explicit deployment root from startup/config
  - derive the deployment runtime root when share/app mode does not override it
  - load deployment runtime instead of IDE main project-state registry
  - provide share-session store to HTTP and websocket handlers
  - expose deployment runtime metadata to later route dependencies

Acceptance:

- share/app mode can resolve and touch real deployment sessions in Go
- websocket and HTTP middleware use the same share-session source of truth

Status:

- complete

Completed:

- added explicit `--deployment-root` startup support in
  `cmd/setta-server` and `internal/config`
- added deployment runtime-root derivation from deployment manifest metadata
  when share/app mode does not override `--runtime-root`
- made `internal/app.New` mode-aware:
  - IDE/launcher still open the `setta_files` project-state registry
  - share/app now open `internal/deployments.Runtime` instead
- wired the same deployment session store into:
  - websocket connection resolution under `internal/wsapi`
  - app-exposed share-session dependencies for HTTP middleware
- exposed deployment runtime metadata through `internal/app.App` and
  `api/runtimeInfo`

Tests:

- `./scripts/go.sh test -p 1 ./internal/app ./internal/httpapi ./internal/wsapi ./internal/config ./internal/deployments -count=1`

### Slice 3: Deployment `runCode` Route Migration

Deliver:

- deployment-mode `POST /api/runCode` in Go with:
  - `allowRun` enforcement
  - `allowMultipleRuns` reservation and rollback
  - deployment override validation for section variants
  - explicit rejection of `paramOverrides` until Go owns parameter state
  - session-scoped planning against the deployment overlay runtime
  - deployment-scoped snapshot roots

Acceptance:

- deployment `runCode` no longer depends on Python
- failed run startup rolls back reserved single-run state
- successful startup increments session run counts according to policy

Status:

- complete

Completed:

- mounted deployment-mode `POST /api/runCode` through Go HTTP transport with
  share-session middleware instead of `RequireFullIDERuntime`
- moved deployment policy enforcement into `internal/runs`:
  - `allowRun` denial
  - `allowMultipleRuns=false` reservation and rollback
  - variant-override denial when `allowVariantChanges=false`
- kept `paramOverrides` explicitly unsupported until Go owns parameter state
- planned deployment runs against per-session overlay runtimes from
  `internal/deployments.Runtime`
- snapped deployment runs under `share_runs/<shareSessionId>/...` using
  deployment-root code bindings and deployment artifact roots
- added explicit backend-owned terminal command dispatch so deployment runs can
  start commands while websocket/user input remains disabled

Tests:

- `./scripts/go.sh test -p 1 ./internal/terminals ./internal/runs ./internal/httpapi ./internal/app -count=1`

## Open Questions

- should deployment session creation and cleanup transport move in the same wave
  as Slice 2, or remain outside the first Go `runCode` migration?
- should deployment run-count state live inside the deployment runtime directly,
  or in a separate session-state helper owned by that runtime?

## Next Recommended Step

- Continue with
  `docs/plans/go-backend-rewrite/phase-4-deployment-state-routes-and-projectstate-transport.md`:
  deployment `runCode`, current-session bootstrap, expiry cleanup, richer
  project-state source fields, and frontend single-config projection are now
  Go-owned; the remaining deployment gap is the share/app state and
  project-config route migration on top of that boundary.
