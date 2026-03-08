# Backend Feature Checklist Audit Plan

Last verified: `2026-03-10`

Purpose: keep `backend-feature-checklist.md` current-caller-accurate instead
of drifting into "Go has an internal equivalent somewhere" claims.

## Source-of-truth inputs

- Python route inventory:
  - `backend/setta/types/routes.py`
  - `backend/setta/routers/*.py`
- Go HTTP and websocket transport inventory:
  - `internal/httpapi/*.go`
  - `internal/wsapi/routes.go`
- Current frontend caller inventory:
  - `frontend/src/utils/generatedEndpoints.ts`
  - non-test `frontend/src/**` call sites that import generated endpoints
  - direct websocket callers such as
    `frontend/src/state/actions/websocketReceive.ts` and
    `frontend/src/state/hooks/terminals/terminal.ts`

## Audit rules

- `Complete` means the current caller reaches the Go-owned transport/runtime
  today.
- `Partial` means Go owns a bounded slice, but the repo still documents active
  limitations or deferred follow-up work.
- `Missing` means the current caller still depends on Python, or no Go-owned
  equivalent exists.
- Do not upgrade a feature to `Complete` solely because Go has internal logic;
  the active transport and caller path must also be Go-owned.
- Websocket checks must include direct frontend route usage, not only generated
  endpoint helpers.

## Minimum audit pass

1. Diff the Python route inventory against Go route constants.
2. Identify which frontend callers still use routes or websocket paths that Go
   does not register.
3. Re-read the relevant Go runtime packages to confirm whether missing transport
   is truly absent or only unused by the current caller.
4. Update `backend-feature-checklist.md` and `CURRENT.md` in the same change if
   the scope summary changed.
5. Refresh the `Snapshot date` / `Last verified` stamps when the audit is
   substantive.

## Expected hot spots

- Python-era websocket paths:
  - `/api/frontend`
  - `/api/share/frontend`
  - `/{projectConfigId}/{sectionId}/{id}`
- App-definition REST and app-spec streaming helpers.
- Attachment/default-project/file helper routes.
- Helper/admin routes such as `restartLanguageServer`, `typeCheck`,
  `docstringToMarkdown`, and `revealPathInOsFileExplorer`.
- Large project-mutation tails that still bypass the Go HTTP surface.
