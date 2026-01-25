# Bootstrap + Loading Unification Plan

## Goals
- Replace the standalone bootstrap page with a single loading screen that can
  either spin or prompt for a bootstrap token.
- Provide easy "open in new browser" workflows via a CLI command and a UI menu
  action that mints a fresh bootstrap link and copies it.

## Scope Notes
- Bootstrap tokens remain single-use; auth cookies stay per browser/profile.
- API endpoints remain protected; only the SPA shell/assets should load without
  auth so the bootstrap UI can render.
- Share mode should remain unaffected.

## Plan
1. Audit the current bootstrap/auth flow and identify entry points:
   - Backend: `/__setta__/bootstrap`, `/__setta__/bootstrap/consume`,
     `AuthMiddleware`, and token minting in `start.py`.
   - Frontend: `GlobalWrapper` loading screen, `backendInitStatus` polling, and
     websocket auth loss handling.
2. Backend changes:
   - Adjust auth gating so the SPA shell + static assets can load without auth
     while `/api` and websocket routes still require it.
   - Replace the static bootstrap HTML with a redirect to the SPA entry route
     (keep `/__setta__/bootstrap` working for compatibility).
   - Add a protected API endpoint to mint a fresh bootstrap token + URL for the
     current session (used by the UI menu item).
   - Add a `setta open` CLI command that selects a session (latest/id/workspace)
     and opens a freshly minted bootstrap URL, with an optional browser
     selector and a print-only mode.
   - Update route definitions and regenerate frontend endpoints.
3. Frontend changes:
   - Introduce a bootstrap/auth-required state in store (e.g. set when
     `backendInitStatus` returns 401 or websocket closes with 4401).
   - Extend the loading screen to show the token input + instructions when
     auth is required, and hide the spinner in that state.
   - Auto-consume a token if present in the URL hash/query, then clear it and
     re-attempt init + websocket connection.
   - Add a menu item (File menu or similar) to request a new bootstrap link from
     the backend, copy it to clipboard, and show a success toast.
4. Verification:
   - Fresh browser with no cookie shows token input (no spinner) and succeeds.
   - Token in URL auto-consumes and lands in the app without a separate page.
   - Old/used tokens show a clear error and keep the input visible.
   - `setta open` launches the desired browser with a new link.
   - Share mode and existing deep links remain stable.
