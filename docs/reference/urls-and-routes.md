# URLs and Routes

This doc describes the public-facing frontend URL paths and how they map into
the router. Backend API routes are separate and live under `/api`.

## Frontend Paths

Routes are defined in `frontend/src/components/Pages/router.tsx`.

- `/`
  - Index route. In share mode it may redirect to `/home` or the default project
    (see `ShareIndexRedirect`).
- `/home`
  - Home page.
- `/:projectConfigName`
  - Primary project config view.
- `/:projectConfigName/view/:viewModeName`
  - Deep link into a named view mode for that project.

The same paths are used in IDE and share modes; the router wraps them with
`ModeWrapper` to pick the correct container.

## URL Encoding + Matching

The project and view mode names are URL-encoded with `encodeURIComponent` when
building paths. Matching is exact (case-sensitive) against the stored names.

If `/:projectConfigName/view/:viewModeName` does not match an existing view mode,
the app keeps the current active view mode and replaces the URL with that active
name once state is loaded.

## View Mode URL Sync

When the app is on the `/view` route, `useViewModeUrlSync`
(`frontend/src/state/hooks/viewModeUrl.ts`) keeps the URL and active view mode in
sync:

- URL -> state: navigating to `/view/<name>` switches the active view mode (if
  the viewer has permission to change variants).
- State -> URL: switching the active view mode replaces the current `/view` path
  with the active view mode name.

Navigation uses `replace: true` to avoid stacking history entries. Query string
and hash are not preserved during the replace (current behavior).

## Backend API Routes

Frontend routes above are **not** the same as backend API routes. Backend routes
use the `Route` enum (`backend/setta/types/routes.py`) and are called via
`/api/<route>` using the generated endpoint helpers in
`frontend/src/utils/generatedEndpoints.ts`.

For git route details (`/api/git/*`), see `docs/reference/git-pane.md`.
