# Setta external agent orchestration plan

This plan extends docs/plans/setta-agentic-plan.md to let Setta control Claude Code, Codex, and OpenCode as external agents.

Related: `docs/plans/setta-agentic-plan.md` defines the core agent runner and
data model that external adapters depend on.

## Goals
- Allow Setta to launch, stream, and resume runs in Claude Code, Codex, and OpenCode.
- Normalize event streams (messages, tool calls, file edits, shell commands, approvals) into Setta RunEvents.
- Support both ephemeral runs (one-shot tasks) and long-lived sessions (multi-turn threads).
- Respect tool-specific approval/sandbox systems while keeping Setta as the control plane.
- Keep configuration and credentials out of project state; use env variables and workspace-level settings.

## External agent docs (reference links)
### Claude Code
- https://code.claude.com/docs/en/overview
- https://platform.claude.com/docs/en/agent-sdk/overview
- https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk

### Codex
- https://developers.openai.com/codex/sdk/
- https://developers.openai.com/codex/guides/agents-sdk/
- https://developers.openai.com/codex/mcp/
- https://developers.openai.com/resources/docs-mcp/

### OpenCode
- https://opencode.ai/docs/
- https://opencode.ai/docs/server/
- https://opencode.ai/docs/sdk/

## Feature preservation contract (non-negotiable)
Backward compatibility is not required, but user-visible features must be preserved. External agents are additive and must not replace existing chat behavior.

- Preserve managed and scriptable Chat section modes and their UI controls (LLM config selection, deep-think, new chat).
- Keep chat toolkit helpers and routes used by listeners and Chat section state sync.
- Maintain `LLMStreamingResponse` semantics and AIFollow updates; external events must map into existing stream types.
- Do not remove Chat section state fields or routes unless an explicit migration preserves behavior.

## Non-goals (for this plan)
- Replacing Setta's native agent runner.
- Building full UI parity with each external tool's native UI.
- Supporting remote multi-tenant hosting; initial scope is local developer machines.

## External tool control surfaces (doc-backed summary)

### Claude Code
- Claude Agent SDK (Python/TypeScript) exposes the same agent loop and built-in tools as Claude Code.
- TypeScript SDK uses `query()` async iteration and supports options like `systemPrompt`, `allowedTools`,
  and session resume/continuation.
- TypeScript SDK package: `@anthropic-ai/claude-agent-sdk`.
- Agent SDK can load Claude Code filesystem config (skills, commands, memory) when enabled via settings.
- Auth via ANTHROPIC_API_KEY; optional provider environment variables for Bedrock/Vertex/Foundry.

### Codex
- Codex can run as an MCP server with `codex` and `codex-reply` tools.
- MCP tool parameters include approval policy, sandbox mode, model overrides, config overrides, and cwd.
- Codex SDK (TypeScript, Node 18+) provides threaded runs via `startThread`, `run`, and `resumeThread`.
- Codex SDK package: `@openai/codex-sdk`.

### OpenCode
- `opencode serve` runs a headless HTTP server exposing an OpenAPI 3.1 spec and SSE events.
- Server exposes session, message, command, shell, and permissions endpoints for control.
- `/session/:id/init` can analyze a repo and create `AGENTS.md`.
- SDK provides `createOpencode` (start server + client) and `createOpencodeClient` (connect to existing server).
- OpenCode SDK package: `@opencode-ai/sdk`.

### Doc findings (Jan 2026, official)
- SDKs are available for all three tools (Claude Code, Codex, OpenCode), so SDK-only execution is viable.
- Claude Code SDK streams via `query()` and supports session resume/continuation plus tool allowlists.
- Codex SDK requires Node 18+ and exposes threaded runs (start/run/resume).
- OpenCode SDK provides `createOpencode` (server + client) and `createOpencodeClient` (client-only).

### Decision: SDK-only
- External agent adapters are SDK-only. No CLI fallback will be implemented or supported.

## Architecture

### Unifying abstraction
Add an ExternalAgentAdapter interface that normalizes:
- start_run(prompt, options) -> run_id / session_id
- resume_run(session_id, prompt)
- stream_events(run_id) -> RunEvent[]
- cancel_run(run_id)
- get_capabilities() -> features, supported options, tool limits

Adapters:
- ClaudeCodeAdapter (SDK-only)
- CodexAdapter (SDK primary, MCP secondary)
- OpenCodeAdapter (SDK primary, server secondary)

### Execution modes
- SDK mode (primary): use Python/TS SDKs to get structured events and better session control.
- Server mode: connect to OpenCode's HTTP API and SSE stream.
- MCP mode: register external MCP servers inside Setta's MultiMCPClient and treat them as tools.
- No CLI fallback (SDK-only policy).

### Control plane
- Setta owns runs, metadata, and approvals.
- External tools are treated as execution engines.
- Setta mediates tool permissions and sandbox choices.
- All external events are persisted into Setta's AgentRun log format.

## Fit with existing Setta architecture

### Streaming contract alignment
- Normalize external agent streams into Setta's existing chat stream event types
  (`LLMStreamingResponse` / `StreamingEventType`) so current UI and reducers
  work without a parallel rendering path.
- Prefer reusing `ManagedStreamAssembler` + `ManagedActionExecutor` where possible.
- If new event types are required (e.g., file edit previews, approvals), extend
  the shared stream schema and update both backend sender and frontend reducers.

### Tooling, MCP, and AIFollow
- Route external tool calls through Setta MCP when possible to keep AIFollow
  highlighting and tool metadata consistent.
- For tools that do not go through Setta MCP, add a mapping layer that converts
  tool-call metadata into AIFollow updates.
- Keep tool names namespaced so external tool calls do not collide with Setta
  tools, matching existing MCP namespacing rules.

### Project state integrity
- Prefer external agent actions that call Setta tools (project manager routes
  and MCP tools) instead of raw filesystem edits.
- If external agents edit files directly, constrain edits to Setta canonical
  code paths so file watchers can reload sections and keep the UI in sync.
- Avoid bypassing Setta state when the change should reflect as a section or
  param update; use `emit_to_frontend` or section routes instead.

### Filesystem permissions (decision)
- Respect whatever permissions the user has configured for the external tool.
- If a user grants broad permissions in Claude Code / Codex / OpenCode, Setta
  will not attempt to further restrict them.
- Mitigations:
  - Surface permission level in the run header and store it in run metadata.
  - After each run, show a file-change summary with a "Sync to project state"
    action (diff + apply lives here rather than a separate UX track).
  - Flag edits outside Setta-managed paths as "external edits not tracked in
    project state."

### Share mode and policy gates
- Decision: reuse `allowLLM` for external agent gating in share mode.
- When share mode blocks external agents, surface a clear UI error and a
  backend log event.

## Developer experience goals

### Config and setup
- Mirror `llm_config.json` with `setta_files/external_agents.json` and a watcher
  so changes hot-reload without a server restart.
- Store only env var names in config (values sourced from `.env`), matching the
  existing LLM config pattern.
- Add a health-check endpoint per tool to report availability, version, and
  missing env vars.

### Local testing harness
- Provide a minimal SDK harness to run an adapter against a prompt and emit
  normalized stream events (no UI required) for fast iteration.
- Route adapter errors through the standard backend log event pipeline.

### Adapter ergonomics
- Keep adapters single-responsibility: "translate X into Setta stream/events."
- Provide a shared parser utility for JSONL/SSE streams to reduce duplication.

## User experience goals

### Unified entry points
- In Project Chat and Chat sections, add an "Engine" selector (Setta LLM,
  Claude Code, Codex, OpenCode) so users do not learn separate UX paths.
- MVP decision: ship the selector in both Project Chat and Chat sections from
  day one (no staged rollout).
- Preserve existing managed vs scriptable modes; external agents are an option
  within managed mode.

### Clear run visibility
- Show a single stream view for external agent runs with tool calls, file edits,
  and approvals inline.
- Provide run metadata (tool, model, sandbox, approvals, duration).

### Approvals and safety
- Decision: approvals are inline in the chat stream (no separate approvals panel).
- Require explicit user approval before loosening sandbox/permissions per run.

### AIFollow parity
- Goal: AIFollow should work with external events, not just native MCP tool calls.

## Acceptance checks (minimum)
- Existing managed and scriptable chats still work unchanged when no external engine is selected.
- External agent runs render in the same stream UI without breaking AIFollow.
- Listener-based chat workflows still compile and run using the chat toolkit.

## Key risks and mitigations

### Streaming incompatibility
- Risk: external event formats do not map to current streaming schema.
- Mitigation: normalize to existing stream events; only extend schema when
  there is a clear UI need and update both backend and frontend in lockstep.

### Project state drift
- Risk: external agents edit files in ways Setta cannot map to sections/params.
- Mitigation: prefer Setta tool calls; constrain edits to canonical paths;
  add diff review before applying changes.

### Approval dead-ends
- Risk: external tools request approvals out-of-band and the run appears stuck.
- Mitigation: route approvals through Setta UI with explicit controls and logs.

### Share-mode policy bypass
- Risk: external agent endpoints allow LLM access in share mode.
- Mitigation: enforce share-policy flags on all external agent routes.

## Data model additions
- ExternalAgentConfig (per-tool):
  - tool_id, tool_type (claude_code | codex | opencode)
  - run_mode (mcp | server | sdk)
  - command_path / base_url
  - default_model
  - sandbox_policy / approval_policy
  - env_var_whitelist (names only, values resolved at runtime)
  - working_dir_strategy (project root, temp dir, or custom)
- ExternalAgentRun:
  - run_id, tool_id, tool_session_id, thread_id
  - prompt, inputs, outputs, status
  - event_log_path (run artifacts)

Storage:
- setta_files/external_agents.json
- setta_files/external_runs/<run_id>.json

## Run ownership (no-duplication strategy)
- External runs are stored only as AgentRun artifacts.
- Chat UI is fed by a "virtual chat view" that projects AgentRun events into
  `BaseChatMessageUnion` without writing to `setta_files/chats/`.
- Implement a ChatStore-like adapter that reads AgentRun logs and exposes
  chat-shaped responses for run ids (or add run-specific chat endpoints that
  return chat-shaped payloads).
- This avoids duplicated persistence while preserving existing chat UX.
- Decision: persist external session/thread ids so runs can be resumed across
  Setta restarts where supported.

## Tool-specific integration details

### Claude Code
- Agent SDK adapter (primary):
  - Use Python SDK for tighter integration where available.
  - Enable `setting_sources=["project"]` to read `.claude/` and `CLAUDE.md` when desired.
  - Map AgentProfile -> ClaudeAgentOptions (allowed_tools, model, permissions, etc).
  - Ensure Claude Code SKILL.md files are discovered and honored (project `.claude/skills`
    and any user-configured skill paths).

### Codex
- SDK adapter (primary):
  - Node 18+ sidecar using `@openai/codex-sdk`.
  - Use `startThread` and `run` to maintain thread affinity.
- MCP adapter (secondary):
  - Run `codex mcp-server` as a subprocess registered with MultiMCPClient.
  - Use `codex` tool for new sessions and `codex-reply` for continuation.
  - Store threadId returned in structuredContent for resuming.

### OpenCode
- SDK adapter (primary):
  - Use `createOpencode` to start server + client, or `createOpencodeClient` to attach.
  - Use `session.prompt` for main calls and `session.prompt` with `noReply: true` for context injection.
- Server adapter (secondary):
  - Run `opencode serve` in headless mode, capture SSE from `/global/event`.
  - Use `/session` and `/session/:id/message` to create runs and stream outputs.
  - Handle permission requests with `/session/:id/permissions/:permissionID`.
  - Use `/session/:id/init` to generate AGENTS.md when required.

## Permissions and safety
- Default to the most restrictive sandbox/approval settings available for each tool.
- Allow per-run overrides only when explicitly approved by the user.
- Surface approvals in the UI and log them in run artifacts.
- For OpenCode, ensure basic auth is supported via env vars when the server is exposed.
- Decision: tool allowlists live on AgentProfile (no per-run overrides in MVP).

## UI and UX
- Add an External Agents panel with:
  - Tool selection (Claude Code, Codex, OpenCode)
  - Run mode selection (SDK default; MCP/Server behind advanced settings)
  - Model, sandbox, and approval settings
  - Environment variable status (present/missing)
- Add run detail view:
  - Live stream of external events
  - Tool calls, command executions, and file edits
  - Approval prompts inline
- Allow running an AgentProfile in an external tool (one-click run in selected tool).

### SKILL.md integration (external skills only)
- Goal: surface external SKILL.md assets without introducing a new Setta skill schema.
- Add a Skills panel (per engine) that indexes SKILL.md from each tool's discovery
  paths and shows name, description, scope/location, and enabled/disabled status.
- Skill detail view:
  - Render frontmatter + instructions.
  - List supporting files (scripts/references/assets) when present.
  - Provide "Open in editor" and "Reveal in file tree."
  - Show validation warnings based on each engine's rules.
- Invocation UX:
  - Claude Code: model-invoked; provide a "Suggest skill" helper that inserts
    a short prompt hint (no explicit call required).
  - Codex: allow explicit invocation (slash or $ mention) and show implicit use.
  - OpenCode: provide a "Load skill" action that calls the skill tool.
- Permissions visibility:
  - Show skill-level tool/permission constraints alongside AgentProfile allowlist.
  - Surface engine-specific flags (for example allowed-tools, user-invocable, or
    permission patterns) directly in the skill UI.
- Run trace:
  - Emit a stream event when a skill is loaded or used.
  - Persist the list of skills used in the run metadata.

## Observability and artifacts
- Persist raw external event stream (JSONL/SSE) alongside normalized RunEvents.
- Store per-run metadata: duration, tokens (if provided), errors, tool calls.
- Capture external tool versions at run start for reproducibility.

## Phased implementation

### Phase 0: Preflight and config
- Add ExternalAgentConfig models and storage helpers.
- Add detection endpoints to check tool availability and version.
- Add environment variable validation (names only, no secrets persisted).

### Phase 1: SDK-first foundation
- Implement Codex SDK adapter (Node sidecar) and map structured events to RunEvents.
- Implement Claude Agent SDK adapter if viable in Setta backend.
- Implement OpenCode SDK adapter (start server + client via SDK).
- Add basic UI for tool selection + run (Project Chat + Chat sections).

### Phase 2: SDK expansion + safety
- Normalize approval workflows for SDK adapters and wire into chat stream UI.
- Add tool allowlists and sandbox policies to SDK calls.
- Implement MCP adapter for Codex as a secondary execution path.

### Phase 3: Unified orchestration
- Add ExternalAgentRun to AgentRunner to support cross-tool composition.
- Allow multi-step workflows that chain Setta agent runs and external tool runs.
- Add cross-tool trace viewer and run replay.

## Testing and validation
- Add integration tests gated by tool availability (skip if SDK/server not installed).
- Manual QA checklist:
  - Run each tool in read-only mode and verify event stream mapping.
  - Run each tool with approval prompts and verify UI roundtrip.
  - Resume a run for each tool.
  - Verify generated AGENTS.md flows for OpenCode.

## Open questions
- Do we accept a required Node sidecar for SDKs that are not Python-native?
- How should Setta map AgentProfile + prompt templates and Claude SKILL.md config
  into each tool's runtime options?
- Should Setta expose its own MCP server to these tools by default?
