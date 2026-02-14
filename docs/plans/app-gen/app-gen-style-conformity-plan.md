# App Generation Style Conformity (JSON Render) Plan

## Goals
- Default generated apps should match Setta’s look/feel and behave like standalone web apps.
- “Views” (Setta view modes) should map to app “pages” by default.
- Pages should be reachable via a mobile-first nav bar with a hamburger menu on mobile, and a desktop-friendly layout.
- Generated layouts should avoid ultra-wide stretching and should use responsive multi-column organization on desktop.
- App generation should respect user-facing visibility: if the project has a user-facing view mode, prefer its visible sections.

## Non-Goals (For This Pass)
- Full “design-from-image” theming pipeline (only make space for it in prompts/defaults).
- Major new JSON-render catalog components (we’ll build navigation in the app shell, not the spec).

## Implementation Steps
1. **App Shell Navigation (runtime)**
   - Update `frontend/src/components/Pages/App/AppPage.tsx` to:
     - Replace the current “App Mode” header with a standalone-friendly top bar.
     - Render route navigation when `appDefinition.routes.length > 0`.
     - Provide a hamburger menu on mobile, inline nav on desktop.
     - Make route matching resilient to deployments hosted under a path prefix by supporting suffix matching and computing a base prefix for links.

2. **Routes Editing + Defaults (authoring UI)**
   - Update `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx` to:
     - Add a “Routes JSON” editor (list of `{ path, name, rootKey }`).
     - Include `routes` in Validate + Save payloads.
     - Keep validation errors local (invalid JSON) and rely on backend validation for semantic issues.

3. **Better Default Spec Template**
   - Update `buildDefaultSpec()` in `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx` to output:
     - A centered `Container` root.
     - A responsive `Grid` that stacks on mobile and becomes multi-column on desktop.
     - Cards for “Inputs” and “Output”, consistent with Setta theme variables.

4. **Generation Prompt Improvements (AI-driven app generation)**
   - Update the “Generate App” prompt in `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx` to:
     - Explicitly require mobile-first + desktop-friendly responsive layouts (Container + responsive Grid).
     - Instruct the agent to create routes/pages based on Setta view modes:
       - If there are tab view modes (`isTab: true`), create one route per tab view mode.
       - Prefer user-facing view modes (`isUserFacing: true`) when deciding what to include.
       - Organize content based on view mode top-level section ordering and section hierarchy.
     - Clarify that the app shell provides navigation/header chrome (so the spec should focus on page content).
     - State: use Setta default look/feel unless a style reference (image/palette/user request) is provided.
   - Add prompt context helpers:
     - A view-mode summary (names, ids, `isUserFacing`, `isTab`, and top-level section ids).
     - A section hierarchy summary (ordered top-level sections + children) with param ids.

5. **Streaming Tool Support For Routes**
   - Update `backend/setta/mcp/tools/app_tools.py` `stream_app_definition` to accept optional `routes` (and pass through to `set_app_definition`) so streaming generation can create multi-page apps too.

6. **Backend Route Validation**
   - Extend `backend/setta/app/definition_diagnostics.py` `validate_app_definition_payload()` to validate `definition.routes`:
     - Unique, non-empty paths (normalized).
     - If `rootKey` is set, it must exist in `app_spec.elements` when available.
     - Warn when `name` is missing or blank.

7. **Tests + Verification**
   - Frontend:
     - Update `frontend/src/components/Pages/App/AppPage.test.tsx` expectations for the new header/nav UI.
     - Add coverage for route suffix matching and hamburger markup.
   - Backend:
     - Add a focused test file under `tests/app/` for route validation diagnostics.
   - Run:
     - `source activate.sh && python -m pytest tests/app`
     - `pnpm -C frontend exec vitest run frontend/src/components/Pages/App/AppPage.test.tsx`
   - CDP visual check:
     - Attempt chrome-devtools-mcp verification of the new app shell header/nav (if CDP is available).

