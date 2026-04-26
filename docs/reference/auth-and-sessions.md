# Auth and Sessions

Setta uses two auth paths depending on runtime mode:
- IDE mode uses a bootstrap token exchange to mint an auth cookie.
- Share mode uses share session ids instead of auth cookies.

## Bootstrap tokens (IDE mode)
- Bootstrap tokens are short-lived, one-time bearer tokens that include a
  session id, expiry, and nonce.
- Consume via `GET /__setta__/bootstrap` (HTML page) or
  `POST /__setta__/bootstrap/consume`.
- Tokens can be passed as `Authorization: Bearer <token>` or in a JSON body
  (`{"token": "..."}`).
- On success, the backend mints an auth cookie.

## Auth cookies
- Cookie name and settings come from `C` in
  `backend/setta/utils/constants.py` (name, max age, samesite, secure).
- Cookies are signed with the per-session secret loaded from the session
  registry.
- HTTP requests are gated by `AuthMiddleware`; bootstrap routes are exempt.
- Unauthorized API calls return JSON 401; non-API calls return a small HTML
  page that links to `/__setta__/bootstrap`.

## Dev auto-auth (IDE mode)
- In dev mode, requests from localhost with a matching frontend Origin/Referer
  automatically mint an auth cookie.
- This is meant for the local Vite frontend; non-local clients still need a
  bootstrap token.

## Refresh behavior
- If an API response is served with a valid cookie that expires within
  the configured refresh window, the backend sets a new cookie.
- The window is exposed via `GET /api/authRefreshStatus`.
- The frontend pings that endpoint periodically while connected to keep
  sessions fresh.

## Websockets (IDE mode)
- Websocket connections accept either the auth cookie or an
  `Authorization: Bearer` bootstrap token.
- Unauthorized sockets are closed with code 4401.

## Share sessions (share mode)
- AuthMiddleware is not used in share mode.
- Stateful routes and websockets require a share session id.
- The share session id is accepted via `X-Share-Session-Id` header,
  `shareSessionId` cookie, or `shareSessionId` query param.
