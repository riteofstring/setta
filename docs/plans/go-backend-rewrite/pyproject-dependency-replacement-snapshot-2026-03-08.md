# Pyproject Dependency Replacement Snapshot

## Purpose

Record how each runtime dependency in the root `pyproject.toml` maps to the
current Go rewrite state at one specific repo point.

This is a snapshot, not a permanent architecture rule. The buckets reflect the
current dominant owner for each dependency's relevant behavior, not a guarantee
that every Python import is already gone.

## Snapshot Context

- captured at: `2026-03-08 21:49:45 PDT`
- repo commit: `d564cbb13cc3d6aeb456c425126ebaf8a2081194`
- worktree status when captured: dirty (`Phase 12` planning docs updated, pending commit)

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
  - Go-owned paths use `gopkg.in/yaml.v3`
- `toml`
  - Go-owned paths use `github.com/pelletier/go-toml/v2`
- `websockets`
  - Go realtime uses `github.com/coder/websocket`
- `fastapi`
  - Go HTTP transport uses `net/http` plus `github.com/go-chi/chi/v5`
- `uvicorn`
  - Go server startup uses `http.Server`
- `pywinpty`
  - Go terminal support uses `github.com/aymanbagabas/go-pty`
- `ptyprocess`
  - same Go PTY layer for non-Windows
- `psutil`
  - Go session/process inspection uses `github.com/shirou/gopsutil/v4`
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
  - rewritten Go surfaces use app-specific validation code rather than a
    generic JSON Schema runtime
- `lsprotocol`
  - Go LSP ownership uses a custom session and transport layer
- `bm25s`
  - tool search was rewritten as custom lexical scoring
- `rectangle-packer`
  - auto-layout packing was rewritten as custom Setta logic

## Bucket 3: Still Python

- `requests`
  - remaining Python CLI and helper paths still use it
- `basedpyright`
  - Go still launches the Python language server process
- `ruff`
  - Go still shells out to the Python formatter and linter executable
- `packaging`
  - remaining Python plugin-manager code still uses it

## Bucket 4: Not Replaced Yet Because That Feature Area Is Not In Go Yet

- `claude-agent-sdk`
  - external-agent Claude integration is still outside the current Go-owned
    backend slice
- `docstring_parser`
  - remaining docstring-driven signature and MCP metadata behavior is still
    Python-owned
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

- `PyYAML`, `toml`, and `psutil` still appear in Python code, but Go already
  owns analogous behavior for rewritten surfaces.
- `pywinpty` and `ptyprocess` map to the current Go `go-pty` runtime, but the
  rewrite planning docs now treat the PTY library choice as a bounded follow-up
  and prefer `creack/pty` for the Unix path rather than treating `go-pty` as a
  permanently settled dependency.
- `watchdog`, `pydantic`, and `jsonschema` also still exist in Python, but
  rewritten Go paths use custom Setta-owned replacements rather than a direct
  Go twin.
- `requests` overlaps with Go `net/http` in some rewritten areas, but the
  remaining Python owner is still substantial enough to keep it in `still
  Python`.

## Evidence Anchors

- `pyproject.toml`
  - source dependency list
- `go.mod`
  - Go library replacements in active use
- `internal/httpapi/httpapi.go`
  - Go HTTP router ownership
- `internal/realtime/websocket_hub.go`
  - Go websocket ownership
- `internal/llmconfig/config.go`
  - Go dotenv ownership
- `internal/localsessions/registry.go`
  - Go process/session inspection ownership
- `internal/tools/search.go`
  - custom Go replacement for tool search
- `internal/projectstate/auto_layout.go`
  - custom Go replacement for rectangle packing
- `internal/watchcode/service.go`
  - custom Go Watch Code runtime
- `internal/codeformat/python.go`
  - `ruff` still external and Python-backed
- `internal/lsp/current_process.go`
  - `basedpyright` still external and Python-backed
- `internal/pythonenv/runtime.go`
  - Python runtime still used for package and plugin inspection
- `backend/setta/api/hot_reload.py`
  - `watchfiles` still Python-owned
- `backend/setta/llm/prompt_renderer.py`
  - `Jinja2` still Python-owned
- `backend/setta/routers/code_info.py`
  - `docstring-to-markdown` route still Python-owned
- `docs/plans/go-backend-rewrite/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
  - records the rewrite decision to de-scope managed `setta_llm` in favor of
    external agents
