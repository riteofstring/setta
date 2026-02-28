# External Agents

Setta supports external agent adapters for Claude Code, Codex, and OpenCode.
Chat attachments are forwarded as inline text blocks or expiring download URLs
depending on the adapter. Agents that consume URLs must be able to reach the
Setta backend to fetch them.

## Runtime execution settings

External chat runs receive runtime execution settings from the composer:
- `permissionMode` (`minimal`, `yolo`, `config_toml_custom`)
- `searchEnabled` (included in run metadata/prompt policy text)

For external agents, Setta can override adapter approval policy at run time when
`permissionMode` is not `config_toml_custom`:

| Adapter/tool type | `minimal` override | `yolo` override |
| --- | --- | --- |
| `claude_code` | `default` | `bypassPermissions` |
| `opencode` | `ask` | `allow` |
| `codex` (and fallback) | `on-request` | `never` |

`config_toml_custom` preserves the configured adapter approval policy with no
runtime override.

Setta also applies a completion gate on finalized assistant messages for
create/scaffold flows: completion claims are rewritten when explicit check
results are missing or failing.

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

## Skill loading semantics (official docs)

Checked on 2026-02-19.

- OpenCode documents skills as a native `skill` tool:
  - "Skills are loaded on-demand via the native `skill` tool"
  - "The agent loads a skill by calling the tool: `skill({ name: \"...\" })`"
  - Tools reference also lists built-in `skill` as loading a `SKILL.md` file
    into the conversation.
- Codex app-server documents skill invocation through turn input conventions:
  - Invoke by putting `$<skill-name>` in the text input.
  - Recommended to include an additional `input` item with `type: "skill"`
    plus `name`/`path`.
  - App-server exposes explicit skill management RPC methods:
    `skills/list` and `skills/config/write`.
- Implication for Setta "Active skill" inference:
  - OpenCode: inferring activity from observed `skill` tool invocations is
    directly grounded in official docs.
  - Codex: docs do not guarantee a runtime tool-call event named `skill`; the
    primary documented mechanism is `$<skill-name>` + `type: "skill"` input
    items on `turn/start`. Treat tool-name-based active inference as heuristic.

References:
- https://opencode.ai/docs/skills
- https://opencode.ai/docs/tools
- https://developers.openai.com/codex/app-server
- https://developers.openai.com/api/docs/guides/tools-skills
