# External Agents

Setta supports external agent adapters for Claude Code, Codex, and OpenCode.

## Claude Code (SDK)

Claude Code runs through the Python SDK.

Key points:

- Run mode: `sdk`
- Transport: Claude SDK streaming events
- Settings files: `.claude/settings.local.json` (managed local) or
  `.claude/settings.json` (managed project)
- MCP config: Setta writes a temporary `.mcp.json` with the Setta MCP SSE URL and
  passes it via the `mcpConfig` input
- Approvals: handled via SDK permission callbacks; AskUserQuestion responses are
  sent back through the SDK

## Codex (app-server)

Codex runs via the `codex app-server` CLI subcommand (JSON-RPC over stdio). Setta
manages `CODEX_HOME` so the app-server inherits the same Codex CLI config files
and policies.

Key points:

- Run mode: `app_server`
- Transport: JSON-RPC 2.0 over JSONL stdio (no `jsonrpc` field)
- Threading: `thread/start` or `thread/resume`, then `turn/start`
- Approvals: server-initiated JSON-RPC requests (`item/*/requestApproval`)
- Config output: `setta_files/external_agent_settings/codex/<id>/config.toml`

## OpenCode (SDK)

OpenCode runs through a Node sidecar that uses `@opencode-ai/sdk`.

Key points:

- Run mode: `sdk` (spawn local server) or `server` (connect to `baseUrl`)
- Transport: JSONL events emitted by the SDK client
- Config output: `setta_files/external_agent_settings/opencode/<id>/opencode.json`
- Config loading: Setta sets `OPENCODE_CONFIG` so the SDK picks up the generated
  `opencode.json` (or it can use `opencode.json` in the working directory)
- Permissions: Setta writes the `permission` map and merges tool allowlists into
  OpenCode permission rules
- Tool naming: MCP tools are surfaced as `<serverId>_<toolName>`
