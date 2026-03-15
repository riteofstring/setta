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
- `docs/plans/go-backend-rewrite/archive/phase-1-foundation-runtime.md`
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
- split share-session extraction into `internal/modes` now that mode policy is growing beyond pure auth concerns

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

Later outcome:

- the live `GET /api/authRefreshStatus` read is now Go-owned through
  `phase-2-status-meta-read-route-closeout.md`
- the other deferred items above remain out of scope for that closeout

### Slice 3: Mode Policy And Share Session Extraction

Deliver:

- mode-policy helpers for IDE/share/app/launcher
- share-session extraction from header/cookie/query
- explicit error contracts for missing/invalid share sessions

Acceptance:

- protected IDE routes are blocked in non-IDE modes where appropriate
- share-mode routes can require a share session via a clear request-context contract

Status:

- complete

Completed:

- added `internal/modes` for:
  - IDE/share/app/launcher policy helpers
  - typed request-context access for mode/share-session data
  - share-session extraction from header, cookie, and query param
  - share-session validation/touching through a store interface
- added HTTP mode middleware helpers in `internal/httpapi` for:
  - IDE-mode route gating
  - launcher-mode route gating
  - share-session requirement and request-context injection
- injects mode request context for all HTTP requests so later handlers can depend on a stable mode contract

Error contracts:

- missing deployment share session:
  - `400`
  - code `missing_share_session`
- unknown deployment share session:
  - `404`
  - code `unknown_share_session`
- mode-forbidden routes:
  - `403`
  - code `mode_forbidden`

Tests:

- policy and share-session extraction precedence in `internal/modes/modes_test.go`
- HTTP route-gating and share-session middleware integration in `internal/httpapi/httpapi_test.go`

Deferred:

- real share session store/runtime wiring
- share/app route migration
- websocket share-session extraction

### Slice 4: Websocket Auth Entry Points

Deliver:

- websocket auth helpers for bootstrap token or auth cookie
- deployment websocket handshake helpers that resolve share-session identity without cookie/bootstrap auth
- close-code behavior for unauthorized sockets
- request/websocket auth policy alignment

Acceptance:

- unauthorized websocket connections close with the chosen auth code
- bootstrap token and cookie auth both work for websocket setup in IDE mode
- deployment websocket setup requires a share session and returns explicit close codes for missing/unknown sessions

Status:

- complete

Completed:

- added `internal/wsapi` around `github.com/coder/websocket` for:
  - authenticated websocket accepts
  - pre-handler mode/share-session resolution
  - websocket-context injection for `internal/modes` and `internal/auth`
- aligned websocket auth with the settled HTTP contracts:
  - non-deployment websocket setup accepts either the session-scoped auth cookie or a bootstrap bearer token
  - deployment websocket setup does not use cookie/bootstrap auth and instead requires share-session identity
- reused `internal/auth.Service` for websocket token/cookie validation so HTTP and websocket auth share the same session-secret source of truth
- chose explicit websocket close-code contracts:
  - `4400` for missing deployment share session
  - `4401` for unauthorized session-auth websocket setup
  - `4403` for mode-forbidden websocket setup
  - `4404` for unknown deployment share session

Tests:

- websocket auth and mode integration in `internal/wsapi/wsapi_test.go`:
  - unauthorized close code
  - bootstrap bearer token auth
  - auth-cookie auth
  - deployment share-session resolution
  - missing vs unknown deployment share-session close codes
- full Go suite passes with `./scripts/go.sh test ./...`

Deferred:

- concrete websocket route migration and registration
- share-session keepalive touches during long-lived websocket message loops
- launcher-specific websocket route gating once concrete launcher websocket endpoints exist

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
- websocket route-loop keepalive tests
- concrete frontend/CLI websocket route integration tests

## Exit Criteria

- IDE bootstrap auth works over real HTTP
- request handlers can read auth/session context without manual token parsing
- mode-policy helpers exist and are ready to gate real route families
- Phase 3 can assume authenticated request context is already available where needed

## Open Questions

- Do we need the HTML bootstrap page immediately for a real launcher/browser flow, or is the JSON consume endpoint still sufficient for the current phase?

## Next Recommended Step

Move to Phase 3 planning.

Specifically:

- write a `phase-3-project-state-core.md` implementation plan before broad state work starts
- define the first project-state slice around load/save/revision behavior without pulling in LSP, MCP, or websocket fan-out yet
- keep realtime route migration, websocket loop behavior, and trusted-origin/bootstrap-page parity deferred unless a real client path forces them in
