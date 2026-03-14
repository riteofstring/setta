# Go Dependency Inventory And Rationale

## Purpose

Explain the current Go dependency set in `go.mod`, why each dependency is
present, and which ones are deliberate direct choices versus transitive baggage.

This document is about the actual module graph in this worktree, not the older
recommendation docs. If this file disagrees with planning notes, `go.mod` wins.

## Dependency Preference

- Prefer the Go stdlib or widely used, well-established libraries.
- Dependency count is not a goal by itself.
- Keep a direct dependency when it provides clear value for transport, OS
  integration, mature parsing/encoding support, or another well-bounded
  infrastructure concern.
- Avoid obscure Go libraries when a simpler or more proven option exists.
- Replace a dependency only when it is obscure, carries disproportionate
  baggage for one tiny bounded helper, or no longer provides meaningful value
  over a small Go-owned owner.
- If an obscure library appears in this document, treat that as current-state
  documentation, not a recommendation.
- the earlier `github.com/aquasecurity/go-pep440-version` plugin-compatibility
  debt has now been removed from `go.mod`

## Snapshot Context

- captured at: `2026-03-12 01:18 PDT`
- module totals: `13` direct, `24` indirect, `37` total
- source of truth:
  - `go.mod`
  - current import sites under `internal/` and `cmd/`
  - locally cached upstream `go.mod` files for transitive provenance

## Reading Guide

- `direct` means we pinned the module explicitly in `go.mod`.
- `indirect` means the module is pulled in by another dependency or by that
  dependency's module graph; we usually do not import those modules directly.
- `github.com/google/jsonschema-go` is now a normal direct dependency in
  `go.mod`; the older indirect/import mismatch note is stale.
- Some older docs still describe `github.com/creack/pty` as only a planned
  candidate. That is stale. It is a direct dependency now.
- Some recommendation docs mention future candidates such as
  `santhosh-tekuri/jsonschema/v6`, `fsnotify`, and `gorilla/securecookie`.
  Those are not current dependencies because they are not pinned in `go.mod`.

## Direct Dependencies

| module | version | why we use it | main owners |
| --- | --- | --- | --- |
| `github.com/go-chi/chi/v5` | `v5.2.5` | Small `net/http`-native router and middleware tree for the Go HTTP and websocket surfaces. | `internal/httpapi`, `internal/wsapi`, `internal/app` |
| `github.com/aymanbagabas/go-pty` | `v0.2.2` | Windows PTY backend for terminal sessions. | `internal/terminals/pty_backend_windows.go` |
| `github.com/coder/websocket` | `v1.8.14` | WebSocket transport for realtime frontend/listener connections. | `internal/realtime`, `internal/wsapi` |
| `github.com/creack/pty` | `v1.1.21` | Unix PTY backend for terminal sessions. | `internal/terminals/pty_backend_unix.go` |
| `github.com/gofrs/flock` | `v0.12.1` | Cross-process file locking for launcher state, trusted frontend origins, and workspace-launch intent coordination. | `internal/launcher/home.go`, `internal/frontendorigins/service.go`, `internal/workspacelaunch/intents.go` |
| `github.com/google/jsonschema-go` | `v0.4.2` | JSON Schema resolution and validation for Go-owned plugin config writes. | `internal/plugins/config_write.go` |
| `github.com/modelcontextprotocol/go-sdk` | `v1.4.0` | MCP protocol types plus server/client transport support. | `internal/mcpx` |
| `github.com/nikolalohinski/gonja/v2` | `v2.7.0` | Bounded Jinja-compatible prompt rendering and parsing support for Go-owned prompt-section helper mutations. | `internal/promptrender`, `internal/projectstate/prompt_sections.go` |
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

### Why plugin version-range parsing is no longer a module dependency

Plugin `settaVersionRange` validation now uses the bounded internal owner in
`internal/plugins/version_specifiers.go`.

That cleanup removed the previous direct `go-pep440-version` dependency and its
transitive baggage instead of swapping it for another third-party parser.

### Why SSH arg splitting is no longer a module dependency

SSH argument parsing now uses the bounded internal splitter in
`internal/sshx/shell_split.go`.

That cleanup removed the previous direct `google/shlex` dependency instead of
keeping a module around for a single shell-style tokenization helper.

### Why llmconfig dotenv parsing is no longer a module dependency

The managed-run `.env` read path now uses the bounded internal parser in
`internal/llmconfig/env_parser.go`.

That cleanup removed the previous direct `godotenv` dependency instead of
keeping a module around for one bounded llmconfig read helper.

### Why `google/jsonschema-go` is direct

The landed plugin config-write path now imports
`github.com/google/jsonschema-go/jsonschema` directly in
`internal/plugins/config_write.go`.

That means it belongs in the direct dependency list. Treat it as a deliberate
plugin-config infrastructure choice, not as accidental MCP SDK baggage.

### Why `gonja` is direct

Go-owned prompt-section helper mutations now need Jinja-compatible template
parsing plus strict missing-variable behavior.

`internal/promptrender` wraps `github.com/nikolalohinski/gonja/v2` behind a
bounded renderer API so Setta-specific prompt semantics stay repo-owned while
the template parser/runtime stays library-owned.

## Indirect Dependencies

These modules are present in `go.mod` but are not part of the deliberate public
shape of the rewrite. They mostly come from five roots:

- the MCP SDK
- `gopsutil`
- `go-pty`
- `gonja`
- a small amount of upstream test-support baggage from `gopkg.in/yaml.v3`

| module | comes from | why it is here |
| --- | --- | --- |
| `github.com/dustin/go-humanize` | `github.com/nikolalohinski/gonja/v2` | Upstream helper retained by the prompt-rendering library. |
| `github.com/ebitengine/purego` | `github.com/shirou/gopsutil/v4` | Upstream low-level syscall glue used by `gopsutil` on some platforms. |
| `github.com/go-ole/go-ole` | `github.com/yusufpapurcu/wmi` via `gopsutil` | Windows COM support used by upstream WMI access. |
| `github.com/json-iterator/go` | `github.com/nikolalohinski/gonja/v2` | Upstream JSON helper retained by the prompt-rendering library. |
| `github.com/kr/text` | `gopkg.in/yaml.v3.test` -> `gopkg.in/check.v1` -> `github.com/kr/pretty` | Upstream YAML-package test-support baggage retained by the module graph. |
| `github.com/lufia/plan9stats` | `github.com/shirou/gopsutil/v4` | Upstream cross-platform process/stat support. |
| `github.com/mattn/go-pointer` | tree-sitter bindings | Cgo pointer bridge required by tree-sitter Go bindings. |
| `github.com/modern-go/concurrent` | `github.com/json-iterator/go` via `github.com/nikolalohinski/gonja/v2` | Upstream support package retained by the prompt-rendering library's JSON dependency. |
| `github.com/modern-go/reflect2` | `github.com/json-iterator/go` via `github.com/nikolalohinski/gonja/v2` | Upstream reflection helper retained by the prompt-rendering library's JSON dependency. |
| `github.com/pkg/errors` | `github.com/nikolalohinski/gonja/v2` | Upstream error-wrapper dependency retained by the prompt-rendering library. |
| `github.com/power-devops/perfstat` | `github.com/shirou/gopsutil/v4` | Upstream AIX perf-stat support. |
| `github.com/rogpeppe/go-internal` | `gopkg.in/yaml.v3.test` -> `gopkg.in/check.v1` -> `github.com/kr/pretty` | Upstream YAML-package test-support helper retained by the module graph. |
| `github.com/segmentio/asm` | `github.com/segmentio/encoding` via MCP SDK | Low-level optimization dependency used by `segmentio/encoding`. |
| `github.com/segmentio/encoding` | `github.com/modelcontextprotocol/go-sdk` | Encoding helpers used by the SDK. |
| `github.com/sirupsen/logrus` | `github.com/nikolalohinski/gonja/v2` | Upstream logging dependency retained by the prompt-rendering library. |
| `github.com/tklauser/go-sysconf` | `github.com/shirou/gopsutil/v4` | Sysconf helpers used by `gopsutil`. |
| `github.com/tklauser/numcpus` | `github.com/tklauser/go-sysconf` via `gopsutil` | CPU-count helper used by upstream sysconf code. |
| `github.com/u-root/u-root` | `github.com/aymanbagabas/go-pty` | PTY/terminal support pulled in by the Windows PTY implementation. |
| `github.com/yosida95/uritemplate/v3` | `github.com/modelcontextprotocol/go-sdk` | URI-template handling used by the SDK. |
| `github.com/yusufpapurcu/wmi` | `github.com/shirou/gopsutil/v4` | Windows WMI access used by `gopsutil`. |
| `golang.org/x/crypto` | `github.com/aymanbagabas/go-pty` | Upstream crypto/terminal helpers needed by `go-pty`. |
| `golang.org/x/exp` | `github.com/nikolalohinski/gonja/v2` | Upstream experimental helpers retained by the prompt-rendering library. |
| `golang.org/x/oauth2` | `github.com/modelcontextprotocol/go-sdk` | OAuth support included by the SDK. |
| `golang.org/x/text` | `github.com/nikolalohinski/gonja/v2` | Upstream text/casing helpers retained by the prompt-rendering library. |

## What This Means In Practice

- We are not trying to minimize `go.mod` for its own sake.
- The direct dependency list is the part we should debate intentionally.
- Widely used dependencies that solve real infrastructure problems cleanly are
  desirable, not suspect.
- The right question is whether a dependency is well established and earning
  its keep, not whether we can remove it at all costs.
- the previous `go-pep440-version` exception is gone, so dependency debates
  should start from the current direct list instead of stale notes about that
  removed module
- the previous `google/shlex` SSH-helper exception is also gone for the same
  reason
- the previous `godotenv` llmconfig-helper exception is also gone for the same
  reason
- Those removals were bounded helper cleanups, not a rewrite-wide policy
  against using libraries.
- The indirect list is mostly explanatory.
- We should avoid importing indirect packages directly unless we
  intentionally promote them to first-class dependencies.
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
