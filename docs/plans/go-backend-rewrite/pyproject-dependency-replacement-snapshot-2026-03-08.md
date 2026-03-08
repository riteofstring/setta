# Pyproject Dependency Replacement Snapshot

## Purpose

Record how each runtime dependency in the root `pyproject.toml` maps to the
current Go rewrite state at one specific repo point.

This is a snapshot, not a permanent architecture rule. The buckets reflect the
current dominant owner for each dependency's relevant behavior, not a guarantee
that every Python import is already gone.

## Snapshot Context

- captured at: `2026-03-09 09:55:40 PDT`
- repo commit: `dfa94fd46ad80a67c8e8da6155787b6a10d0ba29`
- worktree status when captured: clean

## Classification Rule

Each dependency is placed in exactly one bucket.

- `1. replaced with Go library`
  - the rewritten Go surface uses a Go library or stdlib replacement
- `2. replaced with our own logic`
  - the rewritten Go surface uses Setta-specific Go code rather than a direct
    library twin
- `3. still Python`
  - the hybrid runtime still intentionally depends on Python for that job
- `4. not replaced yet because that feature area is not in Go yet`
  - the relevant product/runtime slice is still Python-owned
- `5. not replaced because we no longer need that feature area`
  - only use this when the repo shows the feature itself is no longer needed

Some dependencies are mixed. For example, Go may already own the rewritten
surface while Python still imports the old dependency for unported paths. In
those cases, the bucket below reflects the dominant rewrite story.

## Bucket 1: Replaced With Go Library

- `PyYAML`
  - Go-owned YAML flows use `gopkg.in/yaml.v3`
- `toml`
  - Go-owned config and publish flows use `github.com/pelletier/go-toml/v2`
- `websockets`
  - Go realtime uses `github.com/coder/websocket`
- `fastapi`
  - Go HTTP transport uses `net/http` plus `github.com/go-chi/chi/v5`
- `uvicorn`
  - Go server startup uses `http.Server`
- `pywinpty`
  - Go Windows terminal support uses `github.com/aymanbagabas/go-pty`
- `ptyprocess`
  - Go Unix terminal support uses `github.com/creack/pty`
- `psutil`
  - Go session and process inspection uses `github.com/shirou/gopsutil/v4`
- `python-dotenv`
  - Go config loading uses `github.com/joho/godotenv`
- `mcp`
  - Go MCP ownership uses `github.com/modelcontextprotocol/go-sdk`

## Bucket 2: Replaced With Our Own Logic

- `click`
  - CLI parsing and dispatch are now Go-owned in `settacmd` and `settacli`
- `watchdog`
  - Go Watch Code ownership uses a custom polling and diff runtime
- `pydantic`
  - rewritten Go surfaces use Go structs plus explicit normalization and
    validation
- `jsonschema`
  - rewritten Go surfaces currently use app-specific validation code rather
    than a generic JSON Schema runtime
- `lsprotocol`
  - Go LSP ownership uses a custom session and transport layer
- `bm25s`
  - tool search was rewritten as custom lexical scoring
- `rectangle-packer`
  - auto-layout packing was rewritten as custom Setta logic
- `packaging`
  - plugin compatibility and version-range handling currently use
    `github.com/aquasecurity/go-pep440-version` plus explicit Setta manifest
    parsing and validation code; the library choice should be treated as
    transitional because the rewrite prefers non-obscure Go dependencies
- `docstring_parser`
  - Go now uses explicit MCP tool metadata plus LSP-derived callable signature
    payloads instead of parsing Python docstrings on rewritten surfaces

## Bucket 3: Still Python

- `requests`
  - remaining Python startup and helper paths still use it
- `basedpyright`
  - Go still launches the Python language server process
- `ruff`
  - Go still shells out to the Python formatter and linter executable
- `claude-agent-sdk`
  - the Go external-agent runtime now exists, but the Claude edge still runs
    through the bounded Python sidecar around the official SDK

## Bucket 4: Not Replaced Yet Because That Feature Area Is Not In Go Yet

- `Jinja2`
  - prompt rendering is still Python-owned
- `docstring-to-markdown`
  - the route for this remains Python-owned
- `watchfiles`
  - listener hot reload remains Python-owned

## Bucket 5: Not Replaced Because We No Longer Need The Feature Area

- `litellm`
  - the rewrite no longer plans a Go-owned managed `setta_llm` runtime and now
    treats external agents as the intended AI surface

## Coverage Check

The root `pyproject.toml` dependency list contained `27` runtime dependencies.
This snapshot accounts for all `27`.

## Mixed Cases To Remember

- `packaging` and `docstring_parser` still exist in Python code, but the active
  Go rewrite no longer depends on them for the rewritten plugin, MCP, and
  callable-signature surfaces.
- `packaging` currently maps to `go-pep440-version` plus custom Go logic, but
  that specific library is not the desired long-term dependency choice.
- `pywinpty` and `ptyprocess` now split cleanly in Go by platform:
  `go-pty` on Windows and `creack/pty` on Unix.
- `requests` overlaps with Go `net/http` in rewritten areas, but the remaining
  Python owner is still large enough to keep it in `still Python`.
- `claude-agent-sdk` is no longer outside the Go rewrite boundary. The Go
  runtime owns the Claude executor, but it intentionally keeps the official SDK
  behind a narrow Python sidecar.
- `litellm` still appears in the legacy Python runtime, but the rewrite plan
  no longer treats managed `setta_llm` as a Go target.

## Evidence Anchors

- `pyproject.toml`
  - source dependency list
- `go.mod`
  - Go library replacements in active use
- `internal/httpapi/httpapi.go`
  - Go HTTP router ownership
- `internal/realtime/websocket_hub.go`
  - Go websocket ownership
- `internal/terminals/pty_backend_unix.go`
  - Unix PTY ownership via `creack/pty`
- `internal/terminals/pty_backend_windows.go`
  - Windows PTY ownership via `go-pty`
- `internal/localsessions/registry.go`
  - Go process/session inspection ownership
- `internal/llmconfig/config.go`
  - Go dotenv ownership
- `internal/plugins/authoring.go`
  - Go plugin version/specifier handling and TOML parsing
- `internal/lspsignature/service.go`
  - Go callable signature synthesis
- `internal/mcpx/server.go`
  - explicit Go MCP tool metadata and descriptions
- `internal/watchcode/service.go`
  - custom Go Watch Code runtime
- `internal/tools/search.go`
  - custom Go replacement for tool search
- `internal/projectstate/auto_layout.go`
  - custom Go replacement for rectangle packing
- `internal/codeformat/python.go`
  - `ruff` still external and Python-backed
- `internal/externalagents/claude_executor.go`
  - Go-owned Claude runtime using a Python sidecar
- `internal/lsp/current_process.go`
  - `basedpyright` still external and Python-backed
- `backend/setta/llm/prompt_renderer.py`
  - `Jinja2` still Python-owned
- `backend/setta/routers/code_info.py`
  - `docstring-to-markdown` route still Python-owned
- `backend/setta/api/hot_reload.py`
  - `watchfiles` still Python-owned
- `docs/plans/go-backend-rewrite/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
  - records the rewrite decision to de-scope managed `setta_llm` in favor of
    external agents
