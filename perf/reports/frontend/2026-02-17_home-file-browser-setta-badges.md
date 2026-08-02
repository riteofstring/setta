# Home File Browser Setta Badges Toggle

Date: 2026-02-17
Area: frontend
Branch/Commit: workspace-navigation-file-manager (working tree, uncommitted)
Related PR: n/a

Code paths touched:
- `frontend/src/components/Pages/Home/HomePage.tsx`
- `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
- `backend/setta/routers/artifact.py`

## Goal

Reduce default Home file-browser folder load overhead by avoiding eager per-folder `setta_files` probes, while keeping the badge feature available on demand.

## Scenario

- Entry point (URL/route/screen): `/home`
- Steps to reproduce (deterministic):
  1. Open Home page with workspace browser visible.
  2. Observe initial `POST /api/getFolderContents` request payload/body and response headers.
  3. Toggle "Show Setta badges" and observe the next `POST /api/getFolderContents` request payload/body.
- Data set / project used: repository root as file-browser root.
- Browser + OS: Chrome 144 on macOS (via chrome-devtools-mcp).
- Notes: Dev server, no throttling.

## Before (baseline)

- Measurement method (DevTools panels used, settings):
  - CDP Network request inspection via `chrome-devtools-mcp` (`get_network_request`).
- Key metrics:
  - Initial `getFolderContents` request body included `"includeSettaInitialized": true` by default.
  - Initial response header `content-length: 7360` for root listing.
  - Folder entries included `isSettaInitialized` for each folder.
- Observations:
  - Home root load always paid the per-folder initialization-check cost, even when badges were not required by the user.

## After

- Key metrics:
  - Initial `getFolderContents` request body now includes `"includeSettaInitialized": false` by default.
  - Initial response header `content-length: 7145` for the same root listing.
  - Folder entries omit `isSettaInitialized` when badges are off.
  - After enabling "Show Setta badges", a refetch is triggered and request body switches to `"includeSettaInitialized": true`.
  - Badge-on response header measured `content-length: 7361`.
- Observations:
  - Default path is leaner (smaller payload and no badge probes).
  - Badge feature remains available on demand with immediate refresh after toggling.

## Conclusion

- What improved:
  - Default Home browser path no longer eagerly requests/returns Setta-initialization flags.
  - Per-folder initialization checks are opt-in, reducing default hot-path overhead.
- What regressed (if any) + why it is acceptable:
  - No regression observed; badge data now requires explicit toggle.
- Follow-ups:
  - If needed, persist the badge-toggle preference in local storage.

## Raw Artifacts (local-only)

- CDP network captures from `http://127.0.0.1:3025/home` (request ids sampled during run: baseline `682`, after-default `1465`, toggle-on `1467`).

## Automated Perf Tests

- Playwright spec(s): `frontend/tests/e2e/home/home-file-manager.spec.ts`
- Vitest test(s) / bench(es): n/a
- Budgets/assertions added:
  - Home badge behavior now asserts default-off and toggle-on flow in E2E.
