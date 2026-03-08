# Phase 6 LLM Env-Parser Dependency Cleanup

## Purpose

This doc records the bounded `internal/llmconfig` follow-on after the landed
managed agent-run runtime foundation.

The goal of this slice was to remove `github.com/joho/godotenv` from the
module graph by replacing the single `ReadEnvFile(...)` parse path with a
small Go-owned `.env` parser, without reopening broader managed API-key store
or runtime scope.

## Current Status

Completed before this slice:

- Phase 6 managed agent-run foundation ownership in
  `phase-6-managed-agent-run-runtime-foundation.md`
- the rewrite-wide dependency inventory in
  `go-dependency-inventory-and-rationale.md`, which made the remaining direct
  dependency set explicit

Current Go state after this slice:

- `internal/llmconfig/env_parser.go`
  - now owns the bounded `.env` parsing behavior used by
    `ReadEnvFile(...)`
- `internal/llmconfig/config.go`
  - now reads managed runtime API-key snapshots without `godotenv`
- `go.mod`
  - no longer carries `github.com/joho/godotenv` as a direct dependency

## Scope

This slice delivered:

- a bounded Go-owned `.env` parser for the llmconfig API-key path
- replacement of the current `godotenv` import in `ReadEnvFile(...)`
- focused tests for supported Python-aligned `.env` forms:
  - `export KEY=value`
  - single-quoted and double-quoted values
  - trailing comments
  - blank assignments
  - escaped newline sequences in double quotes
  - literal `${...}` values without interpolation
- deterministic parse errors for malformed quoted lines
- module-graph cleanup via `go mod tidy`

## Non-Goals

- replacing Python `dotenv` usage elsewhere in the repo
- broadening into managed API-key write/store behavior
- adding interpolation, variable expansion, or general shell parsing
- changing managed-run runtime ownership or transport behavior

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-managed-agent-run-runtime-foundation.md`
- `docs/plans/go-backend-rewrite/go-dependency-inventory-and-rationale.md`
- `backend/setta/llm/api_keys.py`
- `backend/setta/llm/config.py`
- `tests/llm/test_config.py`
- `internal/llmconfig/config.go`
- `internal/llmconfig/config_test.go`
- `internal/app/app.go`
- `internal/agentruns/service.go`

## Working Decisions

- keep the owner local to `internal/llmconfig` instead of swapping in another
  third-party dotenv parser
- preserve the bounded `dotenv_values(..., interpolate=False)` behavior that
  this Go path actually depends on
- keep interpolation disabled and explicit instead of guessing at broader shell
  semantics
- treat malformed quoted `.env` lines as parse failures instead of silently
  accepting partial values

## Implementation Notes

1. Added `internal/llmconfig/env_parser.go`.
   - the new owner handles the supported assignment forms for this path:
     - optional `export`
     - quoted values
     - unquoted values with trailing comments
     - blank assignments
   - double-quoted escapes now support the bounded newline/tab/backslash cases
     this path may encounter

2. Kept the runtime behavior unchanged above parsing.
   - `ReadEnvFile(...)` still returns a `map[string]string`
   - `ResolveRuntimeAPIKeys(...)` and the managed-run wiring paths stayed
     unchanged

3. Expanded `internal/llmconfig` tests around real supported `.env` shapes.
   - quoted secrets
   - exported keys
   - literal `${HOME}`-style values
   - blank values
   - malformed quoted input

4. Removed the direct dependency.
   - `go mod tidy` dropped `github.com/joho/godotenv` from `go.mod`

## Verification

- `source activate.sh && ./scripts/go.sh test ./internal/llmconfig -count=1`
- `source activate.sh && ./scripts/go.sh test ./internal/agentruns -count=1`
- `source activate.sh && ./scripts/go.sh test ./internal/app -run 'ManagedAgentRun|RunChain|AppWiresManagedAgentRunFoundationInIDEMode' -count=1`
- `source activate.sh && ./scripts/go.sh test ./internal/mcpx -run 'AgentRun|UISetting|StreamAppDefinition' -count=1`
- `source activate.sh && ./scripts/go.sh test ./... -run '^$'`

## Decisions Made

- use a bounded internal `.env` parser for llmconfig instead of keeping a
  direct dependency for one read path
- preserve the supported Python dotenv semantics the managed-run API-key path
  already relies on, but only for that bounded scope
- leave broader repo-wide Python dotenv replacement as separate future work,
  not hidden inside this llmconfig cleanup

## Progress Notes

- 2026-03-09: opened this focused Phase 6 dependency cleanup slice after the
  direct-dependency inventory showed `godotenv` was only remaining for
  `internal/llmconfig.ReadEnvFile(...)`.
- 2026-03-09: landed the bounded internal `.env` parser, switched llmconfig
  over to it, and removed `godotenv` from `go.mod`.

## Next Recommended Step

- treat the llmconfig `.env` parser cleanup as complete for the current
  bounded rewrite scope
- use `go-dependency-inventory-and-rationale.md` as the current dependency
  source of truth
- only reopen this area if a later Go-owned caller needs broader dotenv
  semantics than the bounded llmconfig path now supports
