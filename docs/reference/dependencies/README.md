# Dependency Reference Seed Set

This folder contains the first local dependency reference set for the Go
rewrite. It is intentionally curated rather than a full mirror of upstream
documentation.

Acquisition policy:

- fetched from official package docs and official repos only
- stored as local notes, not full upstream copies
- intended for normal development with `yolo` on and web search off

Retrieved on:

- 2026-03-07

## Pinned In `go.mod`

- [chi.md](./chi.md)
  - `github.com/go-chi/chi/v5`
  - pinned locally at `v5.2.5`
- [coder-websocket.md](./coder-websocket.md)
  - `github.com/coder/websocket`
  - pinned locally at `v1.8.14`
- [go-pty.md](./go-pty.md)
  - `github.com/aymanbagabas/go-pty`
  - pinned locally at `v0.2.2`

## Planned Candidates

- [fsnotify.md](./fsnotify.md)
  - `github.com/fsnotify/fsnotify`
  - not yet pinned in `go.mod`
- [jsonschema-v6.md](./jsonschema-v6.md)
  - `github.com/santhosh-tekuri/jsonschema/v6`
  - not yet pinned in `go.mod`
- [gorilla-securecookie.md](./gorilla-securecookie.md)
  - `github.com/gorilla/securecookie`
  - not yet pinned in `go.mod`
- [modelcontextprotocol-go-sdk.md](./modelcontextprotocol-go-sdk.md)
  - `github.com/modelcontextprotocol/go-sdk`
  - not yet pinned in `go.mod`

## Ground Rules

- local installed source and types beat these notes if they disagree
- if a note is not enough for a high-stakes decision, do another safe
  acquisition pass and update the file
- when a dependency is added or upgraded in `go.mod`, refresh its note
