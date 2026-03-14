# Dependency Reference Seed Set

This folder contains the first local dependency reference set for the Go
rewrite. It is intentionally curated notes plus selected raw upstream
snapshots, not a full mirror of upstream documentation.

Acquisition policy:

- fetched from official package docs, official API docs, and official repos
  only
- stored as local notes plus selected raw upstream files, not a full upstream
  mirror
- intended for normal development with `yolo` on and web search off

Retrieved on:

- 2026-03-07
- 2026-03-10
- 2026-03-12

## Pinned In `go.mod`

- [chi.md](./chi.md)
  - `github.com/go-chi/chi/v5`
  - pinned locally at `v5.2.5`
  - actual downloaded upstream pages live under `./chi-src/`
- [coder-websocket.md](./coder-websocket.md)
  - `github.com/coder/websocket`
  - pinned locally at `v1.8.14`
  - actual downloaded upstream pages live under `./coder-websocket-src/`
- [go-pty.md](./go-pty.md)
  - `github.com/aymanbagabas/go-pty`
  - pinned locally at `v0.2.2`
  - actual downloaded upstream pages live under `./go-pty-src/`
- [creack-pty.md](./creack-pty.md)
  - `github.com/creack/pty`
  - pinned locally at `v1.1.21`
  - actual downloaded upstream pages live under `./creack-pty-src/`
- [jsonschema-go.md](./jsonschema-go.md)
  - `github.com/google/jsonschema-go`
  - pinned locally at `v0.4.2`
- [modelcontextprotocol-go-sdk.md](./modelcontextprotocol-go-sdk.md)
  - `github.com/modelcontextprotocol/go-sdk`
  - pinned locally at `v1.4.0`
  - actual downloaded upstream pages live under `./modelcontextprotocol-go-sdk-src/`
- [gonja.md](./gonja.md)
  - `github.com/nikolalohinski/gonja/v2`
  - pinned locally at `v2.7.0`
- raw docs only:
  - `github.com/gofrs/flock`
  - pinned locally at `v0.12.1`
  - actual downloaded upstream pages live under `./gofrs-flock-src/`
- raw docs only:
  - `github.com/pelletier/go-toml/v2`
  - pinned locally at `v2.2.4`
  - actual downloaded upstream pages live under `./pelletier-go-toml-src/`
- raw docs only:
  - `github.com/shirou/gopsutil/v4`
  - pinned locally at `v4.26.2`
  - actual downloaded upstream pages live under `./shirou-gopsutil-src/`
- raw docs only:
  - `github.com/tree-sitter/go-tree-sitter`
  - pinned locally at `v0.25.0`
  - actual downloaded upstream pages live under `./tree-sitter-go-tree-sitter-src/`
- raw docs only:
  - `github.com/tree-sitter/tree-sitter-python`
  - pinned locally at `v0.25.0`
  - actual downloaded upstream pages live under `./tree-sitter-python-src/`
- raw docs only:
  - `golang.org/x/sys`
  - pinned locally at `v0.41.0`
  - actual downloaded upstream pages live under `./golang-x-sys-src/`
- raw docs only:
  - `gopkg.in/yaml.v3`
  - pinned locally at `v3.0.1`
  - actual downloaded upstream pages live under `./yaml-v3-src/`

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
- [openai-go.md](./openai-go.md)
  - `github.com/openai/openai-go/v3`
  - selected follow-on for Go-owned OpenAI provider edges; not yet pinned in
    `go.mod`
  - actual downloaded upstream pages live under `./openai-go-src/`

## Downloaded Upstream Files

Actual upstream doc HTML and repo README files now live under:

- `./chi-src/`
- `./coder-websocket-src/`
- `./creack-pty-src/`
- `./go-pty-src/`
- `./gofrs-flock-src/`
- `./golang-x-sys-src/`
- `./modelcontextprotocol-go-sdk-src/`
- `./openai-go-src/`
- `./pelletier-go-toml-src/`
- `./shirou-gopsutil-src/`
- `./tree-sitter-go-tree-sitter-src/`
- `./tree-sitter-python-src/`
- `./yaml-v3-src/`

Each raw-doc folder includes a `MANIFEST.md` with the fetched source URLs.
Some direct deps now have raw upstream docs even where this folder does not yet
have a separate curated note file for that dependency.

## Ground Rules

- local installed source and types beat these notes if they disagree
- if a note is not enough for a high-stakes decision, do another safe
  acquisition pass and update the file
- when a dependency is added or upgraded in `go.mod`, refresh its note
