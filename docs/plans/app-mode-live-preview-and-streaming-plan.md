# App Mode Live Preview + json-render Streaming Plan

## Context (As Of 2026-02-07)

Setta App mode v1 is already implemented (catalog + validator + AppRenderer + App Config pane + App preview).

What is missing is:
- Live updates of the App preview while editing draft JSON (without clicking Save).
- A first-class streaming generation flow that uses json-render's `useUIStream` contract (JSONL patch streaming).

This plan covers both, and they are not mutually exclusive.

## Goals

- **Approach A (Live Draft Preview):** When App preview is visible, edits in the App Config pane update the preview within ~200-400ms, without persisting anything.
- **Approach B (Streaming Generation):** Support a "Generate (Streaming)" flow where the preview updates progressively as the server streams JSONL patch ops, compatible with `@json-render/react` `useUIStream`.
- Keep the runtime contract deterministic and safe:
  - Specs still must validate against the catalog.
  - Streaming endpoint must be IDE-only (not available in share/app deployments).

## Non-Goals

- Allowing arbitrary React/Tailwind class injection from JSON beyond what's already supported.
- Turning the App Config pane into a full WYSIWYG editor.

## Current Implementation Touchpoints

Frontend:
- App Config editor: `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`
- App preview surface: `frontend/src/components/Pages/Project/AppPreview.tsx`
- App renderer: `frontend/src/components/App/AppRenderer.tsx`
- App preview state: `frontend/src/state/definitions.ts` (`useAppPreview`, `useAppDefinition`)

Backend:
- Catalog + validation: `backend/setta/app/catalog.py`, `backend/setta/app/spec_validation.py`
- App definition CRUD: `backend/setta/project_state/base_project_manager.py`

json-render:
- Setta uses `@json-render/react@0.4.3`
- `useUIStream` expects a POST endpoint that returns newline-delimited JSON patch ops and applies them client-side.

## Approach A: Live Draft Preview (No Save Required)

### UX

- When **App Preview** is enabled, the preview should reflect:
  - Draft App Spec JSON textarea edits (after debounce).
  - Draft Theme JSON edits (after debounce), including theme mode selection.
  - Draft Assets JSON edits (optional; see "Assets Safety" below).
- If the draft JSON is invalid:
  - Do not crash the preview.
  - Keep rendering the last valid parsed preview (or a clear "invalid draft" placeholder).
  - Show a small error indicator near the editor.

### Data Model

Do not overwrite the persisted app state in `useAppDefinition` on every keystroke.
Instead, introduce a preview override state that AppPreview can read.

Recommended shape (one of):

Option 1 (extend `useAppPreview`):
- `useAppPreview` gains:
  - `previewSpecOverride: unknown | null`
  - `previewThemeOverride: unknown | null`
  - `previewAssetsOverride: unknown[] | null`
  - `draftParseError: string | null` (optional)

Option 2 (new store):
- Add `useAppDraftPreview` store with the same fields to keep `useAppPreview` minimal.

### Implementation Steps

1. Add preview override store fields (Option 1 or Option 2).
2. In `AppConfigPane`, debounce-parse:
  - `draftSpec` -> set `previewSpecOverride` when JSON parses.
  - `draftTheme` + `themeMode` -> set `previewThemeOverride` when JSON parses (and inject `mode`).
  - `draftAssets` -> set `previewAssetsOverride` when JSON parses.
3. Update `AppPreview` to prefer overrides:
  - Spec source priority: `previewSpecOverride` -> `useAppDefinition.appSpec`
  - Theme/assets priority: override -> persisted `useAppDefinition.appDefinition`
4. Clear overrides in these cases:
  - App preview hidden
  - "Load" replaces the editor content from backend
  - "Save" succeeds (draft matches persisted state now)
  - "Create Default" and similar should set overrides naturally via the same parsing pipeline.

### Assets Safety (Preview)

Assets inject `<link>` tags via `AppAssets` and can include external URLs.

Recommended v1 behavior:
- Preview uses the existing filtering behavior (no external URLs unless explicitly allowed).
- Add a preview-only toggle "Allow external assets in preview" (default off), or always force it off in IDE preview.

## Approach B: Streaming Generation (json-render `useUIStream`)

### UX

Add a new flow in App Config:
- Button: `Generate (Streaming)`
- Opens a small prompt input (or uses a default prompt template derived from catalog + sections).
- While generating:
  - Preview updates progressively.
  - Provide `Stop`/`Cancel` that aborts the stream.
- When complete:
  - Provide `Accept` to copy the generated spec into the App Spec JSON textarea (draft).
  - Optional: auto-run `Validate` and show result.

### Frontend Plan

1. Add a small component owned by `AppConfigPane`:
  - Maintains `promptText`.
  - Uses `useUIStream({ api: <streaming endpoint> })`.
2. While `useUIStream().isStreaming`:
  - Set the preview override spec to `useUIStream().spec` (or render directly from that state).
  - Show a spinner + "Stop" button.
3. On completion:
  - `setDraftSpec(JSON.stringify(spec, null, 2))`
  - Optionally clear the preview override so Approach A takes over immediately.

### Backend API Contract (Compatible With `useUIStream`)

`useUIStream` sends:
- Method: `POST`
- Request JSON:
  - `prompt: string`
  - `context: object` (optional; can include `previousSpec`)
  - `currentSpec: { root: string, elements: Record<string, UIElement> }`

Response:
- HTTP 200 OK
- Streaming body: newline-delimited JSON patch ops, e.g.
  - `{"op":"set","path":"/root","value":"app-root"}`
  - `{"op":"set","path":"/elements/app-root","value":{...UIElement...}}`
  - `{"op":"remove","path":"/elements/old-key"}`

Notes:
- The client ignores blank lines and lines starting with `//`.
- The client buffers until newline; partial JSON on a line is fine as long as a complete JSON object appears before newline.

### Generation Strategy (Phased)

Phase 1 (robust MVP, still uses streaming contract):
- Server generates a full AppSpec JSON (single-shot LLM call).
- Server validates it using existing validators.
- Server computes a patch sequence (diff) and streams it as JSONL.
  - This yields a progressive build effect without relying on "LLM emits valid patch JSON per line".

Phase 2 (true incremental generation):
- Server asks the model to emit JSONL patch ops directly.
- Server forwards only complete parseable JSON objects (per-line) to the client.
- Server optionally validates as it goes (warnings-only) and validates fully at end.

### Backend Endpoint Placement

Add a new route under project-manager-ish scope (IDE-only):
- Example: `POST /streamAppSpec` (exact name TBD)

Hard requirements:
- Deny in share/app mode deployments (IDE only).
- Enforce existing "LLM allowed" checks (same gate as project chat).
- Use an explicit engine config selection:
  - either accept `engineConfigId` in the request,
  - or derive it from project AI settings and avoid UI duplication.

## Validation + Error UX

Live preview:
- Parse errors should be local (no backend calls).
- Optional "soft validate" after debounce by calling `validateAppDefinition` (but only if it won't spam the backend).

Streaming generation:
- Validate the final spec server-side before completion (Phase 1).
- Return structured failure with a clear `detail` message on HTTP error.
- Frontend surfaces the error inline and preserves the last valid draft.

## Testing Plan

Frontend (Vitest):
- Add unit tests for preview override priority and parse error behavior.
- Add unit tests that `Accept` copies the streamed spec into the draft editor.

Frontend (Playwright):
- `App Config` typing updates preview without Save (assert a visible element changes).
- Streaming generation:
  - Use a test-only backend fixture route or network mocking to stream a deterministic patch sequence.
  - Assert preview updates at least twice before completion.

Backend (pytest):
- Streaming endpoint:
  - Streams valid JSONL lines.
  - Diff mode produces removes/sets as expected.
  - Denies in share/app mode.

## Rollout / Flags

Recommended:
- Ship Approach A first (pure frontend).
- Ship Approach B behind a feature flag (or hidden behind an "Experimental" toggle) until stable.

## Open Questions

- Should live preview also update `dataBindings`/`actions` draft editing if we later add editors for them?
- How do we pick the engine config for streaming generation (reuse project AI settings vs dedicated selection)?
- Should external assets ever be allowed in IDE preview by default?

