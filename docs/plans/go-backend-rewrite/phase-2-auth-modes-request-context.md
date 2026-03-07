# Phase 2: Auth, Modes, And Request Context

## Purpose

Phase 2 turns the Phase 1 HTTP skeleton into a backend that can enforce identity,
runtime mode, and request-scoped access rules without dragging product logic into
handlers.

This phase should settle:

- how IDE-mode bootstrap auth works end-to-end
- how signed auth cookies are minted, validated, and refreshed
- how share/app/launcher mode access rules are expressed
- how request-scoped auth/context reaches later services and handlers

## Scope

This phase should deliver:

- bootstrap token mint/consume validation primitives
- signed auth cookie codec and cookie-writing helpers
- current-session metadata/secret loading from the runtime sessions root
- HTTP auth middleware for IDE mode
- request-scoped auth/context injection
- first mode-policy helpers for IDE/share/app/launcher
- share-session extraction primitives
- websocket auth entry points aligned with the chosen request auth model

## Non-Goals

- full share-session business rules across every route family
- websocket subscription fan-out or replay semantics
- trusted-frontend-origin persistence, launcher-origin handoff, or dev auto-auth unless needed for a specific slice
- browser/bootstrap HTML parity with Python unless product requirements force it
- broad route migration across the full API surface

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-1-foundation-runtime.md`
- `docs/reference/auth-and-sessions.md`
- `backend/setta/auth/*.py`
- `backend/setta/middleware/auth.py`
- `backend/setta/sessions/*.py`
- `tests/auth`
- `tests/middleware/test_auth_cookie_refresh.py`

## Phase 2 Working Decisions

- keep the cookie/token cryptography custom for now:
  - deterministic JSON payload encoding
  - HMAC signatures
  - explicit expiry checks
- keep auth/session semantics in our code instead of pulling in a generic session framework
- do not preserve the Python HTML bootstrap page unless it is needed by a real client integration
- do not implement heuristic request trust or keyword-based mode decisions
- keep session-scoped IDE auth cookie names:
  - base cookie name defaults to `setta_auth`
  - the actual cookie name is `<base>_<sessionId>`
- resolve the current IDE session from explicit runtime metadata:
  - use `SETTA_SESSION_ID`
  - use `SETTA_SESSIONS_ROOT` when present
  - otherwise read from `<runtimeRoot>/sessions`
- gate IDE HTTP at the `/api/*` router boundary instead of scattering auth checks across handlers

## Implementation Slices

### Slice 1: IDE Bootstrap And Protected HTTP

Deliver:

- bootstrap token manager
- auth cookie manager
- current-session metadata/secret loader from the sessions root
- IDE auth middleware for HTTP
- `POST /__setta__/bootstrap/consume`
- one protected API route verified end-to-end

Acceptance:

- unauthenticated protected API requests return structured `401`
- bootstrap consume mints a valid auth cookie
- protected API requests succeed after bootstrap consume
- invalid/expired/replayed tokens fail cleanly

Status:

- complete

Completed:

- added `internal/auth` for:
  - bootstrap token mint/consume with nonce replay tracking
  - signed auth cookie mint/validate
  - current-session metadata/secret loading from the runtime sessions directory
  - request-scoped auth context helpers
- wired `POST /__setta__/bootstrap/consume`
  - accepts JSON body token input
  - accepts `Authorization: Bearer <token>`
  - sets a session-scoped auth cookie on success
- protected `/api/*` in IDE mode through middleware instead of per-handler checks
- verified request auth context reaches later handlers

Tests:

- token round-trip, replay rejection, expiry rejection, and cookie round-trip in `internal/auth/service_test.go`
- HTTP bootstrap consume and protected-route integration in `internal/httpapi/httpapi_test.go`
- full Go suite passes with `./scripts/go.sh test ./...`

Deferred:

- bootstrap HTML page parity
- auth cookie refresh window behavior
- trusted frontend origin persistence
- dev auto-auth
- websocket auth entry points

### Slice 2: Request Auth Context And Refresh

Deliver:

- request-scoped auth/session context helper
- cookie refresh window handling on API responses
- route exemptions expressed through explicit policy instead of path-condition sprawl

Acceptance:

- fresh cookies are not rewritten
- near-expiry cookies are refreshed on API responses
- handlers can read current session/auth state from request context without knowing middleware internals

Status:

- complete

Completed:

- extended request auth context with:
  - auth source
  - session metadata
  - auth expiry timestamp
- added request-level auth helpers:
  - `RequestInfoFromRequest`
  - `RequireRequestInfo`
- moved refresh policy into `internal/auth` so handlers and middleware do not need to know cookie timing rules
- refreshes near-expiry auth cookies on `/api/*` responses only
- keeps fresh cookies untouched
- keeps route policy explicit by mounting IDE auth middleware at the `/api/*` boundary instead of adding path-condition exceptions inside handlers

Tests:

- unit coverage for refresh decision behavior and request-auth accessor failure in `internal/auth/service_test.go`
- integration coverage for refreshed-vs-fresh cookie behavior in `internal/httpapi/httpapi_test.go`

Deferred:

- `GET /api/authRefreshStatus`
- trusted frontend origin expiry refresh
- non-API auth refresh behavior
- share-mode request-context helpers

### Slice 3: Mode Policy And Share Session Extraction

Deliver:

- mode-policy helpers for IDE/share/app/launcher
- share-session extraction from header/cookie/query
- explicit error contracts for missing/invalid share sessions

Acceptance:

- protected IDE routes are blocked in non-IDE modes where appropriate
- share-mode routes can require a share session via a clear request-context contract

### Slice 4: Websocket Auth Entry Points

Deliver:

- websocket auth helpers for bootstrap token or auth cookie
- close-code behavior for unauthorized sockets
- request/websocket auth policy alignment

Acceptance:

- unauthorized websocket connections close with the chosen auth code
- bootstrap token and cookie auth both work for websocket setup in IDE mode

## First Recommended Work Item

Start with Slice 1 only.

That is the highest-leverage step because it establishes the token/cookie/session
contract that later request context, websocket auth, and share-mode policy can build on.

## Test Plan

### Unit-Level

- bootstrap token mint/consume
- auth cookie mint/validate
- session metadata/secret loading
- auth cookie name and cookie-writing helpers

### Integration-Level

- bootstrap consume sets a cookie that unlocks a protected API route
- invalid or expired bootstrap tokens return `401`
- protected API routes stay blocked without a valid cookie

### Later Expansion

- cookie refresh tests
- share-session extraction tests
- websocket auth tests

## Exit Criteria

- IDE bootstrap auth works over real HTTP
- request handlers can read auth/session context without manual token parsing
- mode-policy helpers exist and are ready to gate real route families
- Phase 3 can assume authenticated request context is already available where needed

## Open Questions

- Do we need the HTML bootstrap page immediately for a real launcher/browser flow, or is the JSON consume endpoint still sufficient for the current phase?
- When Phase 2 reaches share mode, do we keep share-session extraction in `internal/auth` or split it into `internal/modes` once mode policies become more complex?

## Next Recommended Step

Move to Slice 3.

Specifically:

- add mode-policy helpers for IDE/share/app/launcher
- introduce share-session extraction from header/cookie/query through a typed request-context contract
- keep auth refresh/status endpoints deferred unless a real frontend caller forces them into scope
