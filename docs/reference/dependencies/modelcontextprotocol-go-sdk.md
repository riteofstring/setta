# modelcontextprotocol/go-sdk

- Module: `github.com/modelcontextprotocol/go-sdk`
- Local status: pinned in `go.mod`
- Pinned version: `v1.4.0`
- Retrieved: 2026-03-07
- Official module docs: https://pkg.go.dev/github.com/modelcontextprotocol/go-sdk
- Official `mcp` package docs: https://pkg.go.dev/github.com/modelcontextprotocol/go-sdk/mcp
- Official repo: https://github.com/modelcontextprotocol/go-sdk

## Why It Is In Use

- official Go SDK for MCP client/server work after the rewrite spike approved it
- attractive because it already models client/server/session boundaries and
  transports, which fits the rewrite's explicit runtime direction

## API Surface To Evaluate First

- `mcp.NewServer`
- `mcp.AddTool`
- `Server.Run`
- `mcp.NewClient`
- `Client.Connect`
- `mcp.CommandTransport`
- session-level tool calls such as `CallTool`

Only for custom transports:

- `jsonrpc` package

## Usage Rules For This Repo

- keep SDK usage tightly wrapped under `internal/mcpx`
- do not let MCP SDK types become general-purpose domain types across the repo
- transport and protocol wiring may use the SDK; product semantics remain repo
  code
- keep server and client roles wrapped separately even though the dependency is
  now pinned

## Repo-Local Usage

- current Slice 2 server transport uses:
  - `mcp.NewServer`
  - low-level `Server.AddTool`
  - `mcp.NewSSEHandler`
  - `mcp.SSEClientTransport` in black-box tests
- custom Setta tool metadata is exposed through tool `_meta.setta`
  while generic MCP hints use `ToolAnnotations`
- auth is still enforced by repo middleware before the SDK handler runs

## Relevant Upstream Guidance

- module docs point to `mcp` as the primary package for client/server work
- `AddTool` can bind typed Go functions and auto-populate/validate tool schemas
- sessions are created per transport connection
- upstream examples cover stdio and command-based client/server flows

## Gotchas

- if we need custom transports, evaluate `jsonrpc` separately instead of
  assuming the high-level package covers everything
- authentication and OAuth support live in adjacent packages; do not widen the
  first spike unnecessarily
- keep the spike honest about whether the SDK helps both server and client
  roles, or only one of them
- if HTTP middleware wraps the response writer around SSE handlers, preserve
  `http.Flusher` or the SDK cannot flush the initial SSE endpoint event
