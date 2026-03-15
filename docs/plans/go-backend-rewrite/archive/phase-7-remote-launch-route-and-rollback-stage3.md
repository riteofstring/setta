# Phase 7 Remote Launch Route And Rollback Stage 3

## Purpose

This doc scopes the final Phase 7 SSH launch slice: wire the remote
`POST /launch` branch in Go on top of the completed `internal/sshx` runtime.

The goal is to finish launcher-driven SSH workspace launch ownership without
pulling in CLI parity or broad refactors outside the launch/runtime seam.

## Current Status

As of 2026-03-08:

- this Stage 3 slice is complete
- Go now owns:
  - the SSH/remote branch of `POST /launch` in
    `internal/workspacelaunch/remote_launch.go`
  - thin `/launch` response mapping for `remoteCmdResolved` in
    `internal/httpapi/workspace_launch_routes.go`
  - app-level SSH runtime wiring in `internal/app/app.go`
  - launcher trust-persistence rollback orchestration for newly started remote
    sessions and SSH tunnels
- there is no remaining Python-owned behavior inside this Stage 3 slice

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-7-ssh-remote-launch-and-rollback.md`
- `docs/plans/go-backend-rewrite/archive/phase-7-ssh-remote-connect-and-tunnel-runtime-stage2.md`
- `docs/plans/go-backend-rewrite/archive/phase-7-launch-intent-local-launch-and-bootstrap-handoff.md`
- `docs/plans/go-backend-rewrite/archive/phase-7-launcher-management-and-bootstrap-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-7-runtime-surface-inventory.md`
- `docs/reference/auth-and-sessions.md`
- `docs/reference/urls-and-routes.md`
- `backend/setta/routers/launch.py`
- `tests/routers/test_launch_routes.py`
- `tests/start/test_ssh_connect.py`
- `frontend/src/components/Pages/Launch/WorkspaceLaunchPage.tsx`
- `frontend/src/components/Modals/WorkspaceSwitcherModal/WorkspaceSwitcherModal.tsx`
- `internal/workspacelaunch/local_launch.go`
- `internal/httpapi/workspace_launch_routes.go`
- `internal/app/app.go`

## Scope

This slice should do only the remaining remote launch integration work:

- extend the Go launch owner so stored intents with `sshTarget` call the
  completed `internal/sshx` runtime
- require launcher-origin proof from remote connect info whenever a launcher
  origin is present
- append launcher-origin handoff to the returned bootstrap URL fragment
- persist launched-workspace trust for the launcher session
- roll back newly started remote sessions and tunnel side effects when trust
  persistence fails
- expose `remoteCmdResolved` on the existing `/launch` response
- keep `internal/httpapi` thin and avoid embedding SSH or rollback logic in the
  handler layer

## Explicit Non-Goals

Do not include:

- CLI `setta connect` or `setta stop` parity
- launcher management/status routes
- local launch refactors unrelated to the SSH branch
- renaming the launch service/package surface just for aesthetics
- heuristic SSH fallback behavior beyond the completed `internal/sshx` owners

## Design Decisions

- keep the existing launch service type and extend it with an explicit SSH
  runtime dependency instead of doing a broad rename churn in this slice
- keep remote launch orchestration in `internal/workspacelaunch`, with helper
  code split out of the local path if needed
- treat the completed `internal/sshx` service as the single source of truth for
  remote session/tunnel semantics
- map trust-store errors the same way as the local launch path:
  `TrustedFrontendOriginStoreUnavailable` for unavailable store failures and
  `TrustedFrontendOriginStoreInvalid` for invalid store-state failures
- only attempt remote rollback when trust persistence fails after a newly
  started remote session/tunnel was created
- do not add rollback for earlier failures such as malformed bootstrap URL
  fragments or missing launcher-origin proof; those are connect-info contract
  failures, not launched-session side effects

## Implementation Outline

1. Add the Stage 3 service seam.
   - extend `LocalLaunchServiceOptions` with an SSH runtime dependency
   - require that dependency in constructor wiring and tests

2. Implement the remote launch branch.
   - normalize the stored SSH launch intent fields
   - call `ConnectWorkspaceSession`
   - require `launcherOriginProof` when request origin is present
   - append launcher-origin handoff to the bootstrap URL fragment
   - trust the launched workspace origin for the current launcher session
   - on trust failure for `startedNew == true`, call
     `RollbackRemoteWorkspaceLaunch`

3. Keep transport and app assembly thin.
   - wire the SSH runtime in `internal/app`
   - populate `remoteCmdResolved` in the `/launch` HTTP response

4. Add focused verification.
   - `internal/workspacelaunch`: remote success, proof-required, trust failure
     rollback, rollback-failure mapping
   - `internal/httpapi`: remote launch route response shape
   - `internal/app`: focused IDE-mode remote launch HTTP integration using the
     existing SSH stub

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/workspacelaunch -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMode(LaunchesRemoteWorkspaceOverHTTP|CreatesWorkspaceLaunchIntentsOverHTTP|RejectsWorkspaceLaunchWithoutIntentTokenOverHTTP)' -count=1 -timeout 420s`
- `source activate.sh && python -m pytest tests/routers/test_launch_routes.py -q -k 'launch_over_ssh_returns_bootstrap_url or launch_over_ssh_requires_remote_launcher_origin_proof or launch_over_ssh_uses_request_origin_for_handoff or remote_rollback_failed'`

## Progress Notes

- 2026-03-08: created this focused Stage 3 plan after confirming the remaining
  Phase 7 gap is no longer SSH runtime ownership itself, but the `/launch`
  integration and trust-persistence rollback orchestration above it.
- 2026-03-08: completed this Stage 3 slice by extending
  `LocalLaunchService` with an explicit SSH runtime dependency, moving the
  remote branch into `internal/workspacelaunch/remote_launch.go`, wiring the
  thin transport/app layer updates, and adding focused runtime/HTTP/app tests.
- 2026-03-08: kept rollback scope explicit: only trust-persistence failures
  after `startedNew == true` trigger `RollbackRemoteWorkspaceLaunch`, matching
  the completed `internal/sshx` source-of-truth runtime instead of adding
  heuristic cleanup branches.

## Open Questions

None inside this slice. Any follow-up around CLI remote-connect or remote-stop
behavior should be planned separately instead of broadening this completed
route/runtime owner.

## Recommended Next Step

Return to `phase-7-runtime-surface-inventory.md` and confirm whether any
non-MCP backend runtime surface remains after the completed launcher/bootstrap
cluster. If remote CLI parity is still product scope, plan it as a separate
slice instead of extending this completed Stage 3 owner.
