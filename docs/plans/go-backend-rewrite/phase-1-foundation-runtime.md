# Phase 1: Foundation Runtime

## Purpose

Phase 1 builds the minimum Go backend foundation that later phases can stand on.
This phase is about runtime skeleton, not feature completeness.

## Scope

This phase should deliver:

- the main Go server executable
- config and path resolution
- application startup and shutdown wiring
- middleware stack
- logging and error-envelope conventions
- basic health/status endpoints
- filesystem helpers for atomic writes and path policy

## Non-Goals

- full auth/session behavior
- project-state mutation flows
- websocket realtime fan-out
- MCP server/client support
- LLM orchestration
- PTY, LSP, or plugin runtime behavior
- legacy route compatibility

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-0-capability-inventory-and-harness.md`
- `backend/setta/server.py`
- `backend/setta/server_state.py`
- `backend/setta/start.py`
- `docs/reference/setta-files.md`
- `docs/reference/auth-and-sessions.md`

## Locked Decisions For This Phase

- HTTP stack:
  - `net/http`
  - `github.com/go-chi/chi`
- logging:
  - `log/slog`
- filesystem watchers:
  - not part of this phase except for interface placement
- persistence:
  - file-backed by default

## Core Outputs

### 1. Executable And App Wiring

Deliver:

- `cmd/setta-server`
- clean startup path
- clean shutdown path
- explicit dependency wiring

The wiring should not recreate a single giant app-state object.

### 2. Package Skeleton

Minimum packages expected in this phase:

- `internal/app`
- `internal/config`
- `internal/httpapi`
- `internal/runtime`
- `internal/observability`
- `internal/statefs`

Optional if they help avoid churn:

- `internal/contracts`
- `internal/modes`

### 3. Config And Path Policy

Deliver:

- env parsing
- config/profile structure
- workspace root handling
- app-state root handling
- runtime root handling
- validation and normalization rules

The result should be intentionally specified, not inherited accidentally from Python.

### 4. HTTP Conventions

Deliver:

- route registration pattern
- middleware order
- request context injection
- error envelope format
- JSON encoding conventions
- upload/download conventions

### 5. Runtime Supervision

Deliver:

- startup lifecycle
- shutdown lifecycle
- background-task supervision pattern
- cancellation model
- logging hooks for task failures

This should be explicit and boring.

### 6. Filesystem Helpers

Deliver:

- atomic write helper
- path normalization helper
- allowed-root policy helper
- file-lock strategy interface

These helpers exist so later phases do not scatter filesystem policy everywhere.

## Suggested Initial Route Set

This phase should expose only a very small route surface, likely:

- health/status
- server mode/runtime info
- one simple config/path info endpoint if useful

Do not pull in real product subsystems just to make the server feel more complete.

## Design Constraints

- no FastAPI-style dependency injection recreation
- no huge global singleton
- no ORM/persistence abstraction theater
- no mode-specific branching spread across handlers

## Test Plan

### Unit-Level

- config parsing and validation
- path normalization and path-policy helpers
- error envelope formatting
- middleware ordering and request context plumbing
- startup/shutdown supervision behavior

### Integration-Level

- server boots with minimal config
- status route responds
- structured errors render consistently
- atomic-write helper behaves correctly in temporary directories

### Cross-Platform Checks

- path normalization
- file locking interface assumptions
- startup/shutdown behavior

## Exit Criteria

- a Go server binary starts and stops cleanly
- package skeleton and runtime wiring are stable enough that Phase 2 can build on them
- config/path behavior is intentionally defined and tested
- no Phase 1 package obviously wants to become a `server_state` clone

## Risks

- too much premature route work
- accidental recreation of Python lifecycle complexity
- pushing auth or project-state logic into foundation packages

## Open Questions

- Should `cmd/setta-cli` exist in wave 1, or stay out of scope until later?
- Which mode distinctions belong in Phase 1 versus Phase 2?
- Do we want a single `internal/contracts` package, or should transport DTOs live closer to handlers?
