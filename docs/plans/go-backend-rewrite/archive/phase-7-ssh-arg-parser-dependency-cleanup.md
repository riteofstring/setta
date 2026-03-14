# Phase 7 SSH Arg-Parser Dependency Cleanup

## Purpose

This doc records the bounded SSH follow-on after the completed Phase 7 remote
runtime and launch slices.

The goal of this slice is to remove `github.com/google/shlex` from the module
graph by replacing its single `internal/sshx.ParseSSHArgs(...)` use with a
small Go-owned shell-style splitter, without reopening the SSH runtime or
transport scope.

## Current Status

Completed before this slice:

- Phase 7 SSH runtime ownership in
  `phase-7-ssh-remote-connect-and-tunnel-runtime-stage2.md`
- Phase 7 `/launch` remote orchestration ownership in
  `phase-7-remote-launch-route-and-rollback-stage3.md`
- the rewrite-wide dependency inventory in
  `go-dependency-inventory-and-rationale.md`, which now makes the remaining
  direct dependency set explicit

Current Go state after this slice:

- `internal/sshx/foundation.go`
  - now routes `ParseSSHArgs(...)` through a bounded local shell-style
    splitter
- `internal/sshx/shell_split.go`
  - now owns the SSH arg parsing behavior for quoted, escaped, and invalid
    shell-style inputs
- `internal/sshx/runtime.go`
  - reuses `ParseSSHArgs(...)` when building SSH command prefixes and tunnel
    keys
- `go.mod`
  - no longer carries `github.com/google/shlex` as a direct dependency

## Scope

This slice delivered:

- a bounded Go-owned shell-style SSH arg splitter under `internal/sshx`
- replacement of the current `google/shlex` import in the SSH foundation
- focused tests for quoted, escaped, and invalid SSH arg forms
- module-graph cleanup via `go mod tidy`

Do not include:

- SSH runtime behavior changes
- remote launch route changes
- generic shell parsing for other subsystems
- terminal shell parsing changes

## Inputs

- `docs/plans/go-backend-rewrite/go-dependency-inventory-and-rationale.md`
- `docs/plans/go-backend-rewrite/archive/phase-7-ssh-remote-connect-and-tunnel-runtime-stage2.md`
- `backend/setta/ssh_common.py`
- `tests/start/test_ssh_connect.py`
- `internal/sshx/foundation.go`
- `internal/sshx/foundation_test.go`
- `internal/sshx/runtime.go`

## Working Decisions

- preserve the bounded Python `shlex.split(...)` behavior that the SSH launch
  path actually depends on:
  - whitespace splitting
  - single-quoted and double-quoted tokens
  - backslash escapes for shell-style literal arguments
  - deterministic failure for unterminated quotes or dangling escapes
- keep the owner local to `internal/sshx` instead of introducing another
  dependency just to replace `google/shlex`
- do not broaden this into a reusable general shell-parser package unless a
  later caller requires that explicitly

## Implementation Notes

1. Added `internal/sshx/shell_split.go`.
   - the new owner handles:
     - whitespace splitting
     - single-quoted and double-quoted segments
     - shell-style backslash escapes
     - deterministic errors for dangling escapes and unterminated quotes

2. Kept the transport and runtime behavior unchanged.
   - only `ParseSSHArgs(...)` changed
   - SSH runtime, tunnel, and `/launch` orchestration behavior stayed intact

3. Expanded SSH foundation tests around real supported input shapes.
   - escaped spaces in option values
   - quoted `ProxyCommand` values
   - concatenated quoted/unquoted token fragments
   - dangling escape failures

4. Removed the direct module dependency.
   - `go mod tidy` dropped `github.com/google/shlex` from the module graph

## Decisions Made

- use a bounded internal owner for SSH arg parsing instead of keeping a direct
  dependency for one helper
- preserve the supported Python `shlex.split(...)` behavior the SSH subsystem
  actually relies on, without turning this into a general shell parser
- keep the cleanup inside `internal/sshx` so no unrelated subsystem takes on
  the new owner by accident

## Progress Notes

- 2026-03-09: opened this focused Phase 7 dependency cleanup slice after the
  direct-dependency inventory made it clear that `google/shlex` only remained
  for `internal/sshx.ParseSSHArgs(...)`.
- 2026-03-09: landed the bounded internal SSH arg splitter, switched the SSH
  foundation over to it, and removed `google/shlex` from `go.mod`.

## Verification

- `source activate.sh && ./scripts/go.sh test ./internal/sshx -count=1`
- `source activate.sh && ./scripts/go.sh test ./internal/workspacelaunch -count=1`
- `source activate.sh && ./scripts/go.sh test ./... -run '^$'`

## Next Recommended Step

- treat the SSH arg-parser dependency cleanup as complete for the current
  bounded rewrite scope
- use `go-dependency-inventory-and-rationale.md` as the current dependency
  source of truth
- only reopen this area if a later SSH caller needs explicit shell-parsing
  behavior beyond the bounded owner now in `internal/sshx`
