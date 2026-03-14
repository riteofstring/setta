# coder/websocket

- Module: `github.com/coder/websocket`
- Local status: pinned in `go.mod`
- Local version: `v1.8.14`
- Retrieved: 2026-03-07
- Official package docs: https://pkg.go.dev/github.com/coder/websocket
- Official repo: https://github.com/coder/websocket

## Why It Exists In This Rewrite

- RFC 6455 transport handling only
- explicit accept/dial API that keeps websocket ownership out of product logic
- good fit for the Go-owned realtime and terminal websocket boundary

## APIs We Use Now

- `websocket.Accept`
- `websocket.Dial`
- `Conn.Read`
- `Conn.Write`
- `Conn.Close`
- `websocket.CloseStatus`
- `websocket.StatusCode`
- `websocket.MessageText`
- `AcceptOptions`
- `DialOptions`

Current repo call sites:

- `internal/wsapi/wsapi.go`
- `internal/wsapi/routes.go`
- `internal/realtime/websocket_hub.go`
- websocket tests under `internal/wsapi`, `internal/realtime`, and `internal/app`

## Usage Rules For This Repo

- transport stays thin; frontend message envelopes remain custom repo code
- keep auth, mode checks, and share-session scoping outside the library
- handle close codes explicitly and translate them into repo-owned websocket
  policy errors where needed
- prefer context-driven cancellation and shutdown over ad hoc connection state

## Relevant Upstream Guidance

- `Accept` is the server entry point
- `Dial` is the client/test entry point
- upstream docs point to examples as the primary learning resource
- `wsjson` helpers exist, but we are not using them in the rewrite

## Gotchas

- do not let websocket frame handling leak product semantics into transport
- use `websocket.CloseStatus(err)` when interpreting close paths in loops
- Wasm caveats exist upstream, but they are not relevant to this backend server
