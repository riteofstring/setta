# Sharing Mode Refactor Plan (Simplification)

This plan targets simplification of the sharing-mode branch without losing
functionality. The focus is on removing duplicated logic and consolidating
ownership of session state, while keeping share-mode behavior unchanged.

## Goals
- Reduce duplicated share-policy checks and listener-emit handling.
- Make share-session lifecycle ownership explicit and single-source.
- Keep share-mode behavior and routing intact.
- Minimize diff size in future changes.

## Non-goals
- No behavior changes or new features.
- No changes to share policy semantics or defaults.
- No backward-compat shims.

## Proposed Refactors

### 0) Unify share/IDE runtime flow behind adapters
Problem: Share and IDE modes duplicate a lot of core flow (session scoping,
policy checks, persistence, and broadcasting). This causes drift and inflates
future diffs.

Proposal:
- Introduce a `RuntimeContext` that exposes:
  - mode (share vs IDE)
  - policy source/enforcer
  - session resolver (share session id vs IDE "main" session)
  - path scoping + persistence strategy
  - scoped frontend sender (session id optional)
- Consolidate to a single session-backed project manager:
  - IDE mode uses a single implicit session.
  - Share mode uses per-session overlays.
- Route listener emit + websocket flows through the same pipeline:
  - Session scoping resolved by the runtime context.
  - Policy enforcement via the shared policy guard.
- Move "if share_mode" branches into the adapters (policy, persistence, paths).

Status: completed.

Completed:
- Added `RuntimeContext` + scoped sender adapters.
- Introduced `SessionProjectManager` as the unified session-backed manager.
- Replaced IDE + share manager wiring with session-backed managers.
- Updated listener websocket flow to resolve session managers directly.
- Deleted legacy managers: `project_manager.py`, `settings_project_manager.py`,
  `share_session_project_manager.py`, and
  `share_session_project_manager_switcher.py`.
- Route policy enforcement and manager access now use `RuntimeContext`.
- Share-mode conditionals in routers are replaced with context calls.

Remaining: none.

Impact:
- `backend/setta/runtime/context.py` (new)
- `backend/setta/runtime/scoped_sender.py` (new)
- `backend/setta/project_state/session_project_manager.py` (new)
- `backend/setta/project_state/share_project_manager.py` (shrink/merge)
- `backend/setta/project_state/project_manager_switcher.py`
- `backend/setta/websockets/msg_handlers/python_script_receiver.py`
- `backend/setta/routers/*` (replace share/IDE branches with context calls)
- `backend/setta/share/policy.py` (shared guard entry point)

Notes:
- No backward compatibility needed; delete duplicated pathways outright.
- IDE mode can still keep persistent storage via the persistence adapter.

### 1) Consolidate share session manager ownership
Problem: Both `ShareProjectManager` and `ShareSessionProjectManagerSwitcher`
track session managers. This causes lifecycle drift and adds boilerplate.

Proposal:
- Pick a single owner for session managers (recommended: the switcher).
- Remove `_session_managers` and `register_session_manager` from
  `ShareProjectManager`.
- Add an explicit accessor on the switcher (ex: `get_for_session(session_id)`)
  so other components can request a session manager when needed.
- Update listener emit flow (share mode) to route through the session manager
  instead of `ShareProjectManager` so LSP state stays in sync without the
  manager map in `ShareProjectManager`.

Status: completed.

Completed:
- Session managers now live in `ProjectManagerSwitcher`.
- Removed the share session switcher and session manager classes.
- Session cleanup now drops session managers via the unified switcher.

Impact:
- `backend/setta/project_state/share_project_manager.py`
- `backend/setta/project_state/project_manager_switcher.py`
- `backend/setta/websockets/msg_handlers/python_script_receiver.py`
- `backend/setta/share/session_cleanup.py`

Notes:
- For share-mode listener emits, have `WMHPythonScriptReceiver` request the
  session manager from the switcher using the share session id and call a
  new `apply_listener_emit_updates` method on the session manager.
- This keeps per-session LSP state updated without duplicating manager maps.


### 2) Centralize share-policy enforcement for project-manager routes
Problem: Most routes in `project_manager.py` duplicate policy gating logic.
This inflates the diff and is easy to get wrong on new endpoints.

Proposal:
- Create a shared policy guard helper with explicit mapping from request type
  to policy flag and section-id extraction.
- Replace repeated calls to `ensure_share_*_allowed` with one guard call that
  takes `(state, manager, request, guard)`.
- Keep explicit errors for share-only restrictions (ex: deleting variants),
  but move the common checks into the guard.

Implementation sketch:
- New module `backend/setta/share/policy_guards.py`:
  - `SharePolicyGuard` enum: param, variant, layout, structural, run, lsp.
  - `resolve_section_ids(request, manager)` with explicit cases.
  - `enforce_share_policy_guard(state, manager, request, guard)`.
- In `project_manager.py`, replace per-route policy calls with one guard call.

Impact:
- `backend/setta/routers/project_manager.py`
- `backend/setta/share/policy.py`
- `backend/setta/share/policy_guards.py` (new)

Status: completed.

Completed:
- Added `SharePolicyGuard` + guard helper to centralize policy checks and
  section-id resolution.
- Updated project-manager routes to use the guard instead of per-route checks.
- Removed unused share-policy enforcement helpers tied to the old flow.

Remaining: none.


### 3) Unify listener emit policy checks
Problem: Listener emit policy checks live in both `BaseProjectManager` and
`SessionProjectManager`, with slight behavior differences.

Proposal:
- Add a single helper that accepts dependency updates, artifact updates,
  project state, policy, and optional `share_session_id` and does:
  - resolve section ids
  - enforce policy
  - enforce artifact scope
- Use this helper from both share and IDE paths.

Impact:
- `backend/setta/share/policy.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/session_project_manager.py`

Notes:
- Pass `share_session_id` into the helper so notifications are scoped to the
  active session instead of all share viewers.

Status: completed.

Completed:
- Added `ensure_share_listener_emit_updates_allowed` in
  `backend/setta/share/policy.py`.
- `BaseProjectManager` + `SessionProjectManager` now use the shared helper
  instead of duplicating policy enforcement.

Remaining: none.


### 4) Normalize share session id handling
Problem: Session id extraction is repeated across routers and websocket paths.

Proposal:
- Use a single dependency for share session id resolution and context setting.
- Expose a common helper for websocket paths so errors are consistent.

Impact:
- `backend/setta/routers/dependencies.py`
- `backend/setta/routers/terminals.py`
- `backend/setta/routers/websocket.py`
- `backend/setta/websockets/msg_handlers/base.py`
- `backend/setta/websockets/msg_handlers/frontend_receiver.py`
- `backend/setta/websockets/msg_handlers/python_script_receiver.py`

Status: completed.

Completed:
- Centralized websocket share-session validation in dependencies.
- Scoped websocket processing with a share-session context token.
- Reused the shared helper in websocket receivers to enforce consistent errors.

Remaining: none.


### 5) Consolidate frontend share-policy gating
Problem: Multiple components repeat policy flag checks.

Proposal:
- Add `useShareCapabilities()` in `frontend/src/state/hooks/share.ts` that
  returns common booleans (canRun, canEditParams, canEditVariants, etc.).
- Replace direct `useSharePolicyFlag` usage where it is purely gating UI.

Impact:
- `frontend/src/state/hooks/share.ts`
- UI components that gate on share policy.


## Sequencing
0. Unify share/IDE runtime flow behind adapters (done).
1. Session manager ownership consolidation (done).
2. Listener emit policy helper (done).
3. Route policy guard helper and router cleanup (done).
4. Session id normalization (done).
5. Frontend gating cleanup.

## Validation
- `source activate.sh && python -m unittest discover`
- Manual share-mode check: load share URL, change params, run (if allowed),
  verify other sessions are isolated.
