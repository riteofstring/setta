# Backend Capability Coverage Checklist Audit Plan

Last verified: `2026-03-10`

Purpose: keep `backend-capability-coverage-checklist.md` complete as a broader
runtime/service ownership inventory, without collapsing back into a caller-only
route checklist.

This plan complements
`caller-backed-backend-surface-checklist-audit-plan.md`.
Use that doc for "does the active caller reach Go?" audits; use this doc for
"where does backend ownership live overall?" audits.

## Required evidence sources

- Go runtime and package inventory:
  - `internal/*`
  - `cmd/*`
- Python backend/runtime inventory:
  - `backend/setta/*`
- Active rewrite working docs:
  - `docs/plans/go-backend-rewrite/CURRENT.md`
  - `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
  - `docs/plans/go-backend-rewrite/caller-backed-backend-surface-checklist.md`
  - `docs/plans/go-backend-rewrite/backend-capability-coverage-checklist.md`
- Registration and startup wiring where ownership is ambiguous:
  - `internal/app/*`
  - `internal/httpapi/*`
  - `internal/wsapi/*`
  - `cmd/setta-server/*`
- Packaging/startup wrappers when distribution/runtime boundaries matter:
  - repo-root scripts such as `build.sh`, `verify_install.sh`, `dev_install.sh`,
    `frontend/backendStart.sh`, and related startup wrappers

## Audit invariants

- `Go-owned` means Go owns the active runtime/service implementation for the
  capability area, even if some legacy callers still reach Python transport.
- `Partial` means Go owns a substantial slice of the capability area, but a
  bounded rewrite gap remains and the notes must state that boundary
  explicitly.
- `Shared boundary` means Go owns the main implementation, but Python and/or an
  external runtime still participates by design in the supported runtime path.
- `Python-owned` means the active implementation still lives under
  `backend/setta`.
- `Deferred` means the capability is intentionally outside the current rewrite
  scope, not merely missing by accident.
- Do not downgrade a capability from `Go-owned` to `Shared boundary` solely
  because the legacy caller path still hits Python transport; that distinction
  belongs in the caller-backed checklist.
- Do not upgrade a capability to `Go-owned` solely because a Go transport
  exists; the underlying runtime/service ownership must also be Go-owned.
- Do not mark a capability `Python-owned` merely because Python still has old
  helper routes for it if the main active implementation moved to Go.
- Do not mark a capability `Deferred` unless the current rewrite docs or code
  make that omission explicit.
- When a capability row depends on external providers, sidecars, OS services,
  or subprocesses as part of the intended runtime, prefer `Shared boundary` or
  `External` language in the notes rather than pretending Setta owns the whole
  stack.

## Required investigation workflow

1. Build the subsystem inventory.
   - Enumerate top-level `internal/*`, `cmd/*`, and `backend/setta/*`
     directories.
   - Group them by runtime capability area rather than by package name alone.

2. Confirm current ownership, not historical intent.
   - Re-read the current Go package cluster for each capability.
   - Re-read the matching Python package cluster when Python ownership or a
     shared boundary is plausible.
   - Use current docs only for rewrite rules, clean-break defaults, and
     doc-level definitions, not as the sole evidence.

3. Classify each capability area.
   - Go-owned active implementation
   - Shared Go/Python or Go/external boundary
   - Python-owned active implementation
   - Deferred/omitted by design

4. Check for caller/runtime divergence.
   - If Go owns the runtime but the current caller still hits Python transport,
     keep this checklist on the broader ownership classification and ensure the
     caller-backed checklist documents the transport gap.
   - If the runtime is still Python-owned, both checklists should agree that Go
     does not own it yet.

5. Audit explicit retained boundaries.
   - Dev-only Python startup/reload
   - Thin packaged Python dispatch
   - Python sidecars/tool executables invoked by Go
   - External provider/process/runtime dependencies
   - Deliberately omitted feature families

6. Update related docs together.
   - Update `backend-capability-coverage-checklist.md`.
   - Update `caller-backed-backend-surface-checklist.md` if caller reachability
     or transport status also changed.
   - Update `CURRENT.md` if the canonical doc list, clean-break defaults, or
     workflow guidance changed.

## Completeness gates

Do not consider the audit complete until all of the following are true:

- Every major top-level backend capability cluster has a home in the checklist.
- Every status marked `Go-owned` is backed by actual Go runtime/service
  ownership, not just transport presence.
- Every status marked `Partial` states the concrete boundary that keeps the
  capability from being fully Go-owned.
- Every status marked `Shared boundary` states what remains shared and why.
- Every status marked `Python-owned` points to a real active Python boundary.
- Every status marked `Deferred` is explicitly supported by current rewrite
  docs or code.
- The capability checklist and caller-backed checklist do not contradict one
  another about the same subsystem; they may answer different questions, but
  the answers must be logically compatible.
- Explicit retained Python/external boundaries are called out somewhere in the
  checklist, not assumed to be obvious.

## Expected hot spots

- Areas where Go owns the runtime but old Python transport still exists:
  app-definition/app-spec, websocket/live-update paths, legacy helper routes.
- Areas with intentional subprocess/provider boundaries:
  managed AI, external agents, transcription, PTY/SSH, Python sidecars.
- Packaging/startup/distribution edges where shell or Python wrappers still
  participate even though Go owns the runtime target.
- Large Python package areas whose remaining ownership is easy to overstate or
  understate without re-reading the code.

## Common false positives to avoid

- "A Python route still exists, so the whole capability is still Python-owned."
- "A Go package exists, so the capability is fully Go-owned."
- "A capability is caller-incomplete, so it cannot be Go-owned overall."
- "An external provider dependency means Setta owns nothing here."
- "A deferred capability is just missing documentation."
