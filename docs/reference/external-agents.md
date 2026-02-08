# External Agents

Setta supports external agent adapters for Claude Code, Codex, and OpenCode.
Chat attachments are forwarded as inline text blocks or expiring download URLs
depending on the adapter. Agents that consume URLs must be able to reach the
Setta backend to fetch them.

## Claude Code (SDK)

Claude Code runs through the Python SDK.

Key points:

- Run mode: `sdk`
- Transport: Claude SDK streaming events
- Settings files: `.claude/settings.local.json` (managed local) or
  `.claude/settings.json` (managed project). Note: `.claude/` is gitignored by
  default.
- MCP config: Setta writes a temporary `.mcp.json` with the Setta MCP SSE URL and
  passes it via the `mcpConfig` input. The config includes auth + agentic
  context headers (`x-setta-*`) so tool calls are scoped.
- Approvals: handled via SDK permission callbacks; AskUserQuestion responses are
  sent back through the SDK
- Attachments: provided via `attachmentText` (text files inlined, non-text files
  summarized with metadata placeholders)

## Codex (app-server)

Codex runs via the `codex app-server` CLI subcommand (JSON-RPC over stdio). Setta
manages `CODEX_HOME` so the app-server inherits the same Codex CLI config files
and policies.

Key points:

- Run mode: `app_server`
- Transport: JSON-RPC 2.0 over JSONL stdio (no `jsonrpc` field)
- Threading: `thread/start` or `thread/resume`, then `turn/start`
- Approvals: server-initiated JSON-RPC requests (`item/*/requestApproval`)
- Config output (shared): `setta_files/external_agent_settings/codex/<id>/config.toml`
- Config output (scoped session runs):
  `setta_files/external_agent_settings/codex/<id>/sessions/<chat_id>/config.toml`
  (Setta points `CODEX_HOME` at the session folder so per-run headers/prompts do
  not accumulate in the shared config).
- MCP headers: Setta injects auth + agentic context headers (`x-setta-*`) into
  the `mcp_servers.setta.http_headers` entry so tool calls are scope-enforced.
- Attachments: `attachmentTextNoImages` is appended as extra text input, and
  image attachments are passed as `image` inputs using URLs from
  `attachmentUrls`

## OpenCode (SDK)

OpenCode runs through a Node sidecar that uses `@opencode-ai/sdk`.

Key points:

- Run mode: `sdk` (spawn local server) or `server` (connect to `baseUrl`)
- Transport: JSONL events emitted by the SDK client
- Config output (shared):
  `setta_files/external_agent_settings/opencode/<id>/opencode.json`
- Config output (scoped session runs):
  `setta_files/external_agent_settings/opencode/<id>/sessions/<chat_id>/opencode.json`
- Config loading: Setta sets `OPENCODE_CONFIG` so the SDK picks up the generated
  `opencode.json` (or it can use `opencode.json` in the working directory)
- Permissions: Setta writes the `permission` map and merges tool allowlists into
  OpenCode permission rules
- Tool naming: MCP tools are surfaced as `<serverId>_<toolName>`
- MCP headers: Setta injects auth + agentic context headers (`x-setta-*`) into
  the MCP server entry so tool calls are scope-enforced.
- Attachments: sent as `file` parts with `mime`, `url`, and optional filename
  (from `attachmentUrls`)
