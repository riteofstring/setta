# Go Dependency Inventory And Rationale

## Purpose

Explain the current Go dependency set in `go.mod`, why each dependency is
present, and which ones are deliberate direct choices versus transitive baggage.

This document is about the actual module graph in this worktree, not the older
recommendation docs. If this file disagrees with planning notes, `go.mod` wins.

## Dependency Preference

- Prefer the Go stdlib or widely used, well-established libraries.
- Avoid obscure Go libraries when a simpler or more proven option exists.
- If an obscure library appears in this document, treat that as current-state
  documentation, not a recommendation.
- Specifically, `github.com/aquasecurity/go-pep440-version` is present in the
  current implementation, but it is not a desired long-term dependency.
  Replace it when the plugin version/specifier path is revisited.

## Snapshot Context

- captured at: `2026-03-09 09:55:40 PDT`
- repo commit: `dfa94fd46ad80a67c8e8da6155787b6a10d0ba29`
- module totals: `15` direct, `19` indirect, `34` total
- source of truth:
  - `go.mod`
  - current import sites under `internal/` and `cmd/`
  - locally cached upstream `go.mod` files for transitive provenance

## Reading Guide

- `direct` means we pinned the module explicitly in `go.mod`.
- `indirect` means the module is pulled in by another dependency or by that
  dependency's module graph; we usually do not import those modules directly.
- Some older docs still describe `github.com/creack/pty` as only a planned
  candidate. That is stale. It is a direct dependency now.
- Some recommendation docs mention future candidates such as
  `santhosh-tekuri/jsonschema/v6`, `fsnotify`, and `gorilla/securecookie`.
  Those are not current dependencies because they are not pinned in `go.mod`.

## Direct Dependencies

| module | version | why we use it | main owners |
| --- | --- | --- | --- |
| `github.com/go-chi/chi/v5` | `v5.2.5` | Small `net/http`-native router and middleware tree for the Go HTTP and websocket surfaces. | `internal/httpapi`, `internal/wsapi`, `internal/app` |
| `github.com/aquasecurity/go-pep440-version` | `v0.0.1` | Current implementation detail for PEP 440 parsing and specifier checks in plugin compatibility. This conflicts with the preference to avoid obscure libraries and should be treated as a replacement candidate. | `internal/plugins/authoring.go` |
| `github.com/aymanbagabas/go-pty` | `v0.2.2` | Windows PTY backend for terminal sessions. | `internal/terminals/pty_backend_windows.go` |
| `github.com/coder/websocket` | `v1.8.14` | WebSocket transport for realtime frontend/listener connections. | `internal/realtime`, `internal/wsapi` |
| `github.com/creack/pty` | `v1.1.21` | Unix PTY backend for terminal sessions. | `internal/terminals/pty_backend_unix.go` |
| `github.com/gofrs/flock` | `v0.12.1` | Cross-process file locking for launcher state, trusted frontend origins, and workspace-launch intent coordination. | `internal/launcher/home.go`, `internal/frontendorigins/service.go`, `internal/workspacelaunch/intents.go` |
| `github.com/google/shlex` | `v0.0.0-20191202100458-e7afc7fbc510` | Shell-style tokenization for SSH command parsing. | `internal/sshx/foundation.go` |
| `github.com/joho/godotenv` | `v1.5.1` | `.env` loading for LLM and MCP-related config resolution. | `internal/llmconfig/config.go` |
| `github.com/modelcontextprotocol/go-sdk` | `v1.4.0` | MCP protocol types plus server/client transport support. | `internal/mcpx` |
| `github.com/pelletier/go-toml/v2` | `v2.2.4` | TOML decoding/encoding for external-agent configs, Codex config files, deploy publish outputs, and plugin `pyproject.toml` metadata. | `internal/externalagentconfigs`, `internal/externalagents/codex_executor.go`, `internal/deployments/share_publish.go`, `internal/plugins/authoring.go` |
| `github.com/shirou/gopsutil/v4` | `v4.26.2` | Process inspection for session registry, SSH tunnel ownership, and local-launch process status. | `internal/localsessions`, `internal/sshx`, `internal/workspacelaunch` |
| `github.com/tree-sitter/go-tree-sitter` | `v0.25.0` | Tree-sitter parser bindings used to analyze Python code from Go. | `internal/watchcode/python_callables.go`, `internal/codegen/python_expression_refs.go` |
| `github.com/tree-sitter/tree-sitter-python` | `v0.25.0` | Python grammar for the tree-sitter bindings above. | `internal/watchcode/python_callables.go`, `internal/codegen/python_expression_refs.go` |
| `golang.org/x/sys` | `v0.41.0` | Direct OS syscall/constants access not covered cleanly by the stdlib. | `internal/terminals/interrupt_unix.go`, `internal/watchcode/file_identity_windows.go` |
| `gopkg.in/yaml.v3` | `v3.0.1` | YAML serialization for share publish and export flows. | `internal/deployments/share_publish.go`, `internal/settacmd/export_db.go` |

## Direct-Dependency Notes

### Why both PTY libraries are direct

The current codebase intentionally splits PTY ownership by platform:

- Unix builds use `github.com/creack/pty`
- Windows builds use `github.com/aymanbagabas/go-pty`

That is not accidental duplication. It reflects the actual build-tag split in
`internal/terminals/pty_backend_unix.go` and
`internal/terminals/pty_backend_windows.go`.

### Why `golang.org/x/sys` is direct instead of only transitive

Several upstream libraries depend on `x/sys`, but we also import it directly
for platform-specific behavior. It is part of our chosen dependency surface,
not just a passive transitive.

### Why `modelcontextprotocol/go-sdk` is direct even though we wrap it

We still want the official MCP SDK for transport and typed protocol support.
The wrapper boundary lives in `internal/mcpx`, but the SDK itself is still a
conscious dependency choice.

### Why `go-pep440-version` is called out separately

This module is in `go.mod` because the current plugin authoring flow uses it
for PEP 440 parsing, not because it matches the preferred dependency bar.

The intended reading is:

- it is present today
- it explains the current graph
- it should be considered technical debt rather than a recommendation

## Indirect Dependencies

These modules are present in `go.mod` but are not part of the deliberate public
shape of the rewrite. They mostly come from four roots:

- the MCP SDK
- `gopsutil`
- `go-pty`
- a small amount of upstream test-support baggage

| module | comes from | why it is here |
| --- | --- | --- |
| `github.com/aquasecurity/go-version` | `github.com/aquasecurity/go-pep440-version` | Lower-level version parsing/comparison used by the PEP 440 package. |
| `github.com/ebitengine/purego` | `github.com/shirou/gopsutil/v4` | Upstream low-level syscall glue used by `gopsutil` on some platforms. |
| `github.com/go-ole/go-ole` | `github.com/yusufpapurcu/wmi` via `gopsutil` | Windows COM support used by upstream WMI access. |
| `github.com/google/jsonschema-go` | `github.com/modelcontextprotocol/go-sdk` | Schema support inside the MCP SDK. This is not the app-side JSON Schema library discussed in older planning docs. |
| `github.com/kr/text` | `github.com/gofrs/flock` -> `gopkg.in/check.v1` -> `github.com/kr/pretty` | Upstream test-only pretty-print helper retained by the module graph. |
| `github.com/lufia/plan9stats` | `github.com/shirou/gopsutil/v4` | Upstream cross-platform process/stat support. |
| `github.com/mattn/go-pointer` | tree-sitter bindings | Cgo pointer bridge required by tree-sitter Go bindings. |
| `github.com/power-devops/perfstat` | `github.com/shirou/gopsutil/v4` | Upstream AIX perf-stat support. |
| `github.com/rogpeppe/go-internal` | `github.com/gofrs/flock` -> `gopkg.in/check.v1` -> `github.com/kr/pretty` | Upstream test-support helper retained by the module graph. |
| `github.com/segmentio/asm` | `github.com/segmentio/encoding` via MCP SDK | Low-level optimization dependency used by `segmentio/encoding`. |
| `github.com/segmentio/encoding` | `github.com/modelcontextprotocol/go-sdk` | Encoding helpers used by the SDK. |
| `github.com/tklauser/go-sysconf` | `github.com/shirou/gopsutil/v4` | Sysconf helpers used by `gopsutil`. |
| `github.com/tklauser/numcpus` | `github.com/tklauser/go-sysconf` via `gopsutil` | CPU-count helper used by upstream sysconf code. |
| `github.com/u-root/u-root` | `github.com/aymanbagabas/go-pty` | PTY/terminal support pulled in by the Windows PTY implementation. |
| `github.com/yosida95/uritemplate/v3` | `github.com/modelcontextprotocol/go-sdk` | URI-template handling used by the SDK. |
| `github.com/yusufpapurcu/wmi` | `github.com/shirou/gopsutil/v4` | Windows WMI access used by `gopsutil`. |
| `golang.org/x/crypto` | `github.com/aymanbagabas/go-pty` | Upstream crypto/terminal helpers needed by `go-pty`. |
| `golang.org/x/oauth2` | `github.com/modelcontextprotocol/go-sdk` | OAuth support included by the SDK. |
| `golang.org/x/xerrors` | `github.com/aquasecurity/go-pep440-version` | Upstream error helpers used by the PEP 440 package. |

## What This Means In Practice

- The direct dependency list is the part we should debate intentionally.
- `github.com/aquasecurity/go-pep440-version` is the clearest example of a
  direct dependency that exists today but does not meet the preferred library
  bar.
- The indirect list is mostly explanatory. We should avoid importing those
  packages directly unless we intentionally promote them to first-class
  dependencies.
- If we switch major roots, the indirect set will change automatically:
  - replacing the MCP SDK changes the schema, encoding, URI-template, and
    OAuth transitives
  - replacing `gopsutil` changes most of the platform-stat transitives
  - replacing `go-pty` changes the Windows PTY transitives

## Not Currently In `go.mod`

These are mentioned elsewhere in rewrite planning, but they are not current Go
dependencies and should not be described as active parts of the implementation:

- `github.com/santhosh-tekuri/jsonschema/v6`
- `github.com/fsnotify/fsnotify`
- `github.com/gorilla/securecookie`

If any of those land later, this inventory should be updated from `go.mod`, not
from the older recommendation docs.
