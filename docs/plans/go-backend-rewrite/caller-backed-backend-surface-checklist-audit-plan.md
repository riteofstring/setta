# Caller-Backed Backend Surface Checklist Audit Plan

Last verified: `2026-03-10`

Purpose: keep `caller-backed-backend-surface-checklist.md`
current-caller-accurate instead of drifting into "Go has an internal
equivalent somewhere" claims.

This document is intentionally procedural. A future audit should be able to
follow it and reproduce a complete backend status check without relying on
memory or prior chat context.

## Required evidence sources

- Python transport inventory:
  - `backend/setta/types/routes.py`
  - `backend/setta/routers/*.py`
- Go transport inventory:
  - `internal/httpapi/*.go`
  - `internal/wsapi/routes.go`
  - `internal/httpapi/httpapi.go`
  - active route/websocket registration wiring under `internal/app/`
- Current frontend caller inventory:
  - `frontend/src/utils/generatedEndpoints.ts`
  - `frontend/src/utils/generatedTypes.ts` (`RouteEnum` and related generated
    route constants)
  - `frontend/src/utils/endpointUtils.ts`
  - non-test `frontend/src/**` call sites, including:
    - imports from `generatedEndpoints`
    - direct `RouteEnum` usage
    - `replaceAddressParams(...)` callers
    - direct `get(...)`, `post(...)`, `getBinary(...)`, `fetch(...)`, or raw
      path usage
    - direct websocket callers such as
      `frontend/src/state/actions/websocketReceive.ts` and
      `frontend/src/state/hooks/terminals/terminal.ts`
- Go runtime owner packages:
  - relevant `internal/*` packages for whichever feature is being classified
- Working docs:
  - `docs/plans/go-backend-rewrite/caller-backed-backend-surface-checklist.md`
  - `docs/plans/go-backend-rewrite/backend-capability-coverage-checklist.md`
  - `docs/plans/go-backend-rewrite/CURRENT.md`
  - `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md` when rewrite
    rules, clean-break defaults, or reopening rules matter

## Audit invariants

- `Complete` means the current caller reaches the Go-owned transport/runtime
  today.
- `Partial` means Go owns a bounded slice, but the repo still documents active
  limitations or deferred follow-up work.
- `Missing` means the current caller still depends on Python, or no Go-owned
  equivalent exists.
- Do not upgrade a feature to `Complete` solely because Go has internal logic;
  the active transport and caller path must also be Go-owned.
- Do not upgrade a feature to `Complete` solely because a Go route constant or
  handler exists; the route must be part of the active registered server
  surface.
- Do not upgrade a feature to `Complete` solely because `generatedEndpoints.ts`
  exports a helper; an exported helper with no non-test caller is not an active
  frontend dependency.
- If Go replaces a Python HTTP route with a different transport shape
  (MCP/tool-call boundary, websocket route, plugin runtime, or different HTTP
  path), that only counts as `Complete` when the current caller actually uses
  the Go replacement.
- Websocket checks must include direct frontend route usage, not only generated
  endpoint helpers.
- If a feature depends on broadcast/request-response traffic over a replacement
  websocket route, do not mark it `Complete` until the current frontend
  actually connects to that websocket route.
- Mode-specific behavior matters. Verify whether the caller and transport are
  IDE-only, launcher-only, share/app deployment, or cross-mode.

## Required investigation workflow

1. Build the Python inventory.
   - Enumerate every Python HTTP/websocket route from
     `backend/setta/types/routes.py`.
   - Read the Python routers to confirm which route families are still
     real/owned in Python and which are legacy wrappers.

2. Build the actual Go transport inventory.
   - Enumerate Go HTTP and websocket route constants from `internal/httpapi`
     and `internal/wsapi`.
   - Confirm registration in the active server wiring (`internal/httpapi`,
     `internal/app`, and related route registration code).
   - Treat an unregistered constant as nonexistent for checklist purposes.

3. Build the current frontend caller inventory from non-test code.
   - Find all `generatedEndpoints` imports and their call sites.
   - Find direct `RouteEnum` usage.
   - Find direct `replaceAddressParams(...)` callers.
   - Find direct `get(...)`, `post(...)`, `getBinary(...)`, `fetch(...)`, and
     raw websocket creation (`new WebSocket(...)`) call sites.
   - Include deployment/share wrappers and mode-specific pages, not just the
     main IDE shell.

4. Classify every current caller path before editing the checklist.
   - Exact Go transport exists and the caller uses it today.
   - Go replacement exists, but the caller still uses the Python-era route or
     websocket shape.
   - No Go transport exists.
   - Generated helper exists, but no current non-test caller was found.

5. Re-read the relevant Go runtime owner packages for each disputed feature.
   - Confirm whether Go truly owns the runtime behavior or only a transport
     shell.
   - Confirm any explicit limitations that should keep the feature `Partial`.
   - Confirm whether a Go capability lives behind MCP/tools rather than direct
     HTTP parity.

6. Audit by feature area, not only by route diff.
   - The checklist is feature-oriented, so do not stop after matching paths.
   - Verify that every checklist row is backed by transport evidence, caller
     evidence, and runtime-owner evidence.
   - Verify that unresolved current-frontend callers are either listed in the
     relevant section or grouped in the remaining Python-only families section.

7. Update the docs together.
   - Update `caller-backed-backend-surface-checklist.md`.
   - Update `backend-capability-coverage-checklist.md` when runtime/service
     ownership changed beyond caller transport status.
   - Update `CURRENT.md` in the same change if the canonical doc list,
     clean-break defaults, or workflow guidance changed.
   - Refresh the `Snapshot date` / `Last verified` stamps only after a
     substantive audit pass.

## Completeness gates

Do not consider the audit complete until all of the following are true:

- Every checklist row marked `Complete` has all three:
  - evidence of an active current caller or active product surface
  - evidence of a registered Go transport
  - evidence of Go runtime ownership for that feature
- Every checklist row marked `Partial` states the concrete boundary that keeps
  it from being `Complete`.
- Every checklist row marked `Missing` is missing for a concrete reason:
  - current frontend still hits Python
  - no Go transport exists
  - Go only has a different transport/runtime that the caller does not yet use
- Every active non-test frontend caller that still relies on Python-owned
  transport appears somewhere in the checklist, either in a feature row or in
  the grouped remaining-route section.
- Every legacy route family that is described as dormant or omitted has been
  checked for current non-test frontend callers, not assumed dormant because a
  generated helper exists.
- Every websocket statement in the checklist was checked against actual
  frontend websocket creation code.
- Any claim about "Go owns this now" was checked against active server
  registration, not just package contents.

## Recommended audit output style

- Prefer explicit route/function names when calling out current Python-owned
  callers.
- Prefer feature-group summaries only after the concrete callers have been
  enumerated.
- If a feature moved from direct HTTP parity to MCP or another transport, say
  that directly and state whether the current caller already uses the
  replacement.
- If you cannot prove a caller is active, do not describe it as active.
  Classify it as dormant/unproven instead.

## Expected hot spots

- Python-era websocket paths:
  - `/api/frontend`
  - `/api/share/frontend`
  - `/{projectConfigId}/{sectionId}/{id}`
- Feature rows that depend on replacement websocket delivery, especially
  settings broadcasts, UI-setting reveals/results, LLM streaming, and AI
  follow/tool-preview updates.
- App-definition REST and app-spec streaming helpers.
- Attachment/default-project/file helper routes.
- Helper/admin routes such as `restartLanguageServer`, `typeCheck`,
  `docstringToMarkdown`, and `revealPathInOsFileExplorer`.
- Large project-mutation tails that still bypass the Go HTTP surface.
- Features where Go owns an MCP/tool/runtime replacement but not direct HTTP
  parity.
- Mode-specific transport differences, especially launcher vs IDE vs share/app
  deployment.

## Common false positives to avoid

- "A generated endpoint exists, so the frontend still uses it."
- "A Go route constant exists, so the server exposes it."
- "A Go package implements the logic, so the feature is complete."
- "A Go MCP tool exists, so the legacy HTTP route is no longer relevant."
- "Go emits the live websocket message, so the feature is complete even though
  the core frontend still connects to the old websocket path."
- "A feature is dormant because it feels old."
