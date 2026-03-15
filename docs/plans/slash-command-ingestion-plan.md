# Slash Command Ingestion Plan (Codex, Claude Code, OpenCode)

## Goal
Implement robust slash-command ingestion and execution routing for external-agent engines in Setta, with one normalized command model across:
- Claude Code (`claude_code`)
- OpenCode (`opencode`)
- Codex (`codex`)

This plan turns command discovery into a first-class capability (instead of passive run-metadata scraping) and keeps command execution deterministic per agent.

## Current State (Setta)
- Setta already has local composer slash commands (`/new`, `/resume`, `/model`, `/permissions`, `/search`, `/help`) in `frontend/src/components/Chat/chatComposerControls.ts`.
- External-agent native command metadata is currently best-effort and mostly sourced from Go-owned external-agent run/runtime metadata in `internal/externalagents` and shown in `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`.
- Codex adapter explicitly reports native slash commands as unsupported in app-server mode (`backend/setta/agentic/external_adapters/codex_app_server.py`).
- There is no dedicated backend API for command ingestion by selected engine/config.

## Scope
1. Add a backend command discovery API for external agents.
2. Add adapter-level command ingestion implementations.
3. Normalize command shape and lifecycle (status, caching, refresh).
4. Wire command lists into composer/picker UX.
5. Keep execution routing explicit and agent-correct.

## Non-Goals
1. Replacing Setta local slash commands.
2. Adding heuristic keyword fallbacks when official command surfaces are unavailable.
3. Backward-compat behavior shims for deprecated command systems.

## Architecture

### 1. Shared command model
Add a typed shared schema (backend + generated frontend types) with:
- `agent`: `codex | claude_code | opencode`
- `invocation`: canonical display token with leading slash when slash-style (for example `/compact`, `/my-plugin:cmd`)
- `key`: stable machine key (no leading slash)
- `title`, `description`, `argumentHint` (optional)
- `origin`: `builtin | custom_file | skill | app_connector | plugin`
- `exec.kind`: `prompt | http | jsonrpc`
- `exec.meta`: adapter-specific routing metadata
- `status`: `available | none | not_supported | error`
- `statusDetail`: optional machine-safe explanation

Implementation targets:
- `backend/setta/types/external_agents.py`
- `backend/setta/types/routes.py` (new route enum)
- `frontend/generation/*` + `frontend/src/utils/generatedTypes.ts`

### 2. Discovery endpoint
Add `route_get_external_agent_commands` (name must match generated endpoint rules) to return normalized command snapshots per selected engine/config.

Suggested request fields:
- `engineConfigId` (required)
- `forceReload` (optional, default `false`)

Suggested response fields:
- `engineConfigId`
- `toolType`
- `commands: CommandSpec[]`
- `status`
- `statusDetail`
- `discoveredAt`

Implementation targets:
- `backend/setta/routers/agentic.py`
- `backend/setta/types/routes.py`
- `frontend/src/utils/generatedEndpoints.ts` (via `pnpm generate`)

### 3. Adapter contract extension
Extend the adapter protocol with explicit command discovery:
- `list_commands(context, force_reload) -> AgentCommandDiscoveryResult`

Implementation target:
- `backend/setta/agentic/external_adapters/base.py`

Runner integration target:
- `internal/externalagents/run_service.go`

## Agent-specific ingestion

### Claude Code
Source of truth:
- SDK init system message `slash_commands`.

Plan:
1. Run a lightweight init query and read slash commands from init payload.
2. Normalize namespaced entries and ensure leading `/` for display.
3. Parse optional metadata from:
   - `.claude/commands/*.md`
   - `~/.claude/commands/*.md`
4. Merge metadata onto discovered commands by key.

Execution mapping:
- `exec.kind = prompt`
- Send command text (with raw args preserved) as prompt.

### OpenCode
Source of truth:
- `GET /command` when server API is available.

Plan:
1. For server mode (`runMode=server`), call `GET /command` and normalize returned commands.
2. For SDK mode, use a robust API path only.
3. If SDK mode cannot provide authoritative command enumeration without a server surface, return `status=not_supported` with explicit detail (no heuristic fallback).
4. Optional metadata enrichment from `.opencode/commands/*.md` and `~/.config/opencode/commands/*.md` only when command IDs are confirmed by authoritative discovery.

Execution mapping:
- Preferred: `exec.kind = http`, `POST /session/:id/command` when session id and server mode are available.
- Fallback in same adapter family: `exec.kind = prompt` only when server command execution endpoint is unavailable and the platform contract confirms prompt execution semantics.

### Codex (app-server)
Source of truth constraints:
- App-server does not expose slash command definitions directly.

Plan:
1. Keep slash-native status explicit: `not_supported` for direct native slash enumeration.
2. Ingest dynamic command-like entities from app-server:
   - `skills/list` -> `$skill` canonical invocations (plus optional slash alias policy for UI only)
   - `app/list` -> connector mentions
3. Include static built-in CLI command table as curated `origin=builtin` entries, version-stamped in code with update policy.
4. Optionally ingest deprecated custom prompts from `~/.codex/prompts/*.md` as `/prompts:<name>` (`origin=custom_file`).

Execution mapping:
- `exec.kind = jsonrpc` for app-server-integrated commands/items.
- Prompt mention form remains canonical for skills/connectors in turn input payload.

## Normalization Rules
1. Always display slash commands with leading `/`.
2. `key = invocation` without the first `/` when slash-style.
3. Preserve namespaced command keys (`my-plugin:cmd`) without rewriting separators.
4. Preserve raw argument string; do not pre-parse quotes/placeholders.
5. Deduplicate by `(agent, key)` while preserving highest-fidelity metadata source.
6. Status semantics:
   - `available`: authoritative list returned
   - `none`: authoritative empty set
   - `not_supported`: no authoritative discovery surface for current mode
   - `error`: discovery path exists but failed

## Composer and UI integration

### 1. Parser and suggestion updates
Current parser is constrained to hardcoded command shape. Update parser to resolve from provided command definitions so namespaced commands (for example `/my-plugin:custom-command`) are supported.

Implementation targets:
- `frontend/src/components/Chat/chatComposerControls.ts`
- `frontend/src/components/Chat/ChatInput.tsx`
- related tests under `frontend/src/components/Chat/*.test.tsx`

### 2. Engine-aware command source
When external engine tab/selection changes:
1. Fetch `route_get_external_agent_commands`.
2. Merge with Setta local commands for that surface.
3. Render grouped sections in picker:
   - Setta commands
   - Agent-native commands
   - Skills/connectors (Codex)

Implementation targets:
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.ts`

### 3. Refresh model
- Claude: refresh on explicit user action or new SDK session init.
- OpenCode: refresh on explicit user action and after config/server-mode changes.
- Codex: refresh on explicit user action, with `forceReload` support for app-server lists.

## Execution Routing Plan
1. If command is Setta-local -> execute client-side as today.
2. If command is external-agent command:
   - Route via `exec.kind` (`prompt`, `http`, `jsonrpc`) from normalized spec.
   - Keep `rawArgs` intact and append exactly once.
3. Log executed command key + routing kind in run metadata for auditability.

## Testing Plan

### Backend (pytest)
1. Command normalization unit tests for all status modes.
2. Claude discovery tests:
   - init list parsing
   - custom command frontmatter merge
3. OpenCode discovery tests:
   - `/command` success/failure
   - server-mode auth handling
4. Codex discovery tests:
   - `skills/list` + `app/list` mapping
   - explicit `not_supported` native slash status
5. Route tests for `route_get_external_agent_commands`.

### Frontend (Vitest)
1. Parser accepts namespaced slash commands and dynamic command sets.
2. Suggestions and help rendering with merged command groups.
3. Engine switch updates displayed command inventory deterministically.
4. Keep large-command-list perf test coverage (extend existing slash perf tests).

### Playwright
1. External engine selected -> command panel loads from discovery endpoint.
2. Running a discovered command uses correct execution path and produces expected run metadata.

## Rollout Phases

### Phase 0: API/spec scaffolding
- Add types + route contract + generated frontend bindings.
- No UI behavior change yet.

### Phase 1: Adapter discovery implementations
- Implement Claude/OpenCode/Codex discovery backends.
- Return status-rich snapshots.

### Phase 2: UI + composer integration
- Replace metadata-only view with route-driven inventory.
- Update parser/suggestions to dynamic command definitions.

### Phase 3: execution routing hardening
- Execute by `exec.kind` and record metadata.
- Add regression tests for command execution paths.

### Phase 4: docs + cleanup
- Update `docs/reference/external-agents.md` and `docs/reference/chat-sections.md`.
- Remove obsolete local-storage-only assumptions for native command discovery.

## Definition of Done
1. Command inventory is discoverable on-demand per selected external engine.
2. Namespaced commands are supported end-to-end in suggestions and execution.
3. No heuristic fallback is used where authoritative agent surfaces exist.
4. Backend + frontend tests added/updated and passing.
5. Playwright coverage includes at least one external-engine command flow.

## Open Decisions
1. OpenCode SDK-mode command discovery: expose authoritative endpoint vs report `not_supported`.
2. Codex UI policy: whether to show slash aliases for skills/apps or keep `$`-only invocations.
3. Static Codex built-in command source update cadence and ownership.
