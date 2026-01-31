# Attachment policy partial unification plan

This plan unifies attachment policy + validation while preserving distinct
attachment flows (chat vs dropzone, stateful vs stateless). The goal is
consistent behavior and less duplicated logic without forcing a single
attachment model.

## Goals
- Centralize attachment policy (limits, MIME rules, labels) with per-scope
  overrides.
- Reuse shared frontend + backend helpers for validation, formatting, and upload
  handling.
- Keep attachment flows intact (chat message attachments, dropzone stateful
  artifacts, dropzone stateless realtime payloads).
- Make share-mode gating for attachments explicit and consistent.

## Non-goals
- Converting stateless dropzone attachments into artifact-backed uploads.
- Rewriting the chat/dropzone UX or payload types.
- Introducing new share policy flags unless required.

## Current behavior summary (baseline)
- Chat attachments:
  - UI: `frontend/src/components/Chat/ChatInput.tsx`.
  - Limits + MIME filtering: `frontend/src/utils/attachments.ts` (from `C`).
  - Upload path: `route_binary_upload` -> `route_update_artifacts` with
    `uploadScope: "chat"`.
  - Server enforcement: `backend/setta/routers/artifact.py` uses
    `C.CHAT_ATTACHMENTS_*` and MIME prefix filtering.
  - Share mode: attachments rely on `allowParamChanges` because
    `Route.UPDATE_ARTIFACTS` is gated; chat responses gated by `allowLLM`.

- Dropzone stateful attachments:
  - UI: `frontend/src/components/Params/ParamUIs/DropzoneInput.tsx`.
  - Limits are hardcoded in the component (25MB file, etc.).
  - Upload path: `route_binary_upload` -> `route_update_artifacts` with
    `uploadScope: "generic"`.
  - Server enforcement: size only (generic), no MIME filtering.

- Dropzone stateless attachments:
  - UI: `DropzoneInput.tsx` uses stateless payload + binary frames.
  - Limits are hardcoded in the component; no artifact updates.
  - Listener payloads defined in `docs/reference/meta-controls.md` and
    `docs/reference/listener-flows.md`.

## Proposed direction
Introduce a **shared attachment policy** with per-scope overrides, reused on
both frontend and backend.

### Policy scopes
- `chat`
- `dropzone_stateful`
- `dropzone_stateless`

### Example policy fields
- `max_files` (int | null)
- `max_file_bytes` (int)
- `max_total_bytes` (int | null) — used for stateless payloads
- `allowed_mime_prefixes` (list[str])
- `label` strings for UI messaging

## Implementation plan

### Phase A — Define policy constants in backend
- Add dropzone limits to `backend/setta/utils/constants.py`, e.g.
  - `DROPZONE_STATEFUL_MAX_FILE_BYTES`
  - `DROPZONE_STATELESS_MAX_FILE_BYTES`
  - `DROPZONE_STATELESS_MAX_TOTAL_BYTES`
  - Optional: `DROPZONE_ALLOWED_MIME_PREFIXES` (if we decide to enforce MIME)
- Regenerate frontend constants via `pnpm generate` (per repo instructions).
- This immediately removes hardcoded numbers in the UI.

### Phase B — Backend policy helper
- Add `backend/setta/utils/attachment_policy.py`:
  - `get_attachment_policy(scope, *, dropzone_mode=None)` returns a typed
    object with limits + allowed MIME.
  - `enforce_upload_policy(file_size, mime_type, scope, ...)` to replace
    scattered checks in `backend/setta/routers/artifact.py`.
- Update `route_update_artifacts` and `route_import_files_to_artifacts` to use
  the helper.
- Keep `uploadScope` values as `chat`/`generic`, but map to policy scope
  internally (generic -> dropzone stateful by default).

### Phase C — Frontend policy helper
- Add `frontend/src/utils/attachmentPolicy.ts`:
  - `getAttachmentPolicy(scope)` pulls from `C` constants and returns a
    normalized policy object.
  - Shared helpers for formatting and allowed MIME checks.
- Refactor `ChatInput.tsx` and `DropzoneInput.tsx` to use the shared helper.
- Replace local `formatBytes` in `DropzoneInput.tsx` with
  `formatBytes` from `frontend/src/utils/attachments.ts`.

### Phase D — Consistent share-mode gating
- Make chat attachment actions respect `useShareCapabilities().canEditParams`
  (similar to dropzone params).
- Add clear UI messaging when attachments are blocked by share policy.

### Phase E — Tests + docs
- Update/add unit tests for policy helpers:
  - `frontend/src/utils/attachments.test.ts` (or new test file).
  - New backend tests under `tests/` for policy enforcement paths.
- Add/update doc references:
  - `docs/reference/chat-sections.md` and `docs/reference/meta-controls.md`
    to mention shared policy + per-scope limits.

## Behavior decisions (need agreement)
- **MIME rules:** should dropzone uploads inherit chat MIME restrictions or
  remain permissive? If unified, add `DROPZONE_ALLOWED_MIME_PREFIXES` in `C`.
- **Limit alignment:** keep current values (chat 25MB, dropzone stateful 25MB,
  dropzone stateless 5MB) or normalize to a single value per scope?
- **Scope naming:** keep `uploadScope` as `chat|generic` or introduce explicit
  `dropzone_stateful` and map internally?

## Recommendation (default path)
- Keep per-scope limits as-is (chat 25MB, dropzone stateful 25MB, dropzone
  stateless 5MB + total payload cap). This preserves the stateless realtime
  constraints while still unifying policy logic.
- Do not enforce MIME restrictions on dropzone by default. Keep it permissive
  unless explicitly configured. Chat remains MIME-gated as today.

### UX impact of the recommendation
- Minimal visible change: uploads that work today continue to work.
- More consistent warnings/labels across chat + dropzone when limits are hit.
- Share mode clarity: chat attachment actions can be disabled up-front when
  `allowParamChanges=false`, matching backend enforcement.
- No new “file type not allowed” surprises for dropzone users.

## Risks & mitigations
- Risk: enforcing MIME on dropzones could break existing workflows.
  - Mitigation: keep permissive defaults unless explicitly configured.
- Risk: changing limits impacts large uploads.
  - Mitigation: preserve current defaults and document overrides.
- Risk: share-mode gating change could surprise users.
  - Mitigation: show a clear UI warning when blocked by share policy.

## Rollout strategy
- Land phases A–C first (no behavior change, mostly refactors).
- Decide behavior alignment (MIME + limits) and land Phase D updates.
- Add tests + docs last, after final decisions are set.

## Open questions
- Should dropzone stateful uploads be treated as “attachments” for policy
  purposes (same MIME checks as chat)?
- Do we need a dedicated `allowAttachments` share policy flag, or is
  `allowParamChanges` sufficient?
- Should stateless dropzone payload limits be configurable per project?

## Success criteria
- One canonical policy source (constants + helpers) drives all attachment
  validation.
- Chat + dropzone share the same formatting and limit logic.
- Reduced duplicated logic in `ChatInput.tsx` and `DropzoneInput.tsx`.
- No functional regressions in existing attachment flows.
