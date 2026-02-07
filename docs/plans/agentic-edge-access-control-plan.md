# Agentic Edge Access Control Plan (visibility, modification, context)

This plan turns agentic edges into hard scope boundaries for chat agents. The
same edge graph that is already rendered in the UI will determine what sections
an agent can read, modify, and receive as automatic context. Enforcement must
be server-side, with UI affordances that make the boundaries obvious.

## Goals
- Enforce read/write scope for agents based on agentic edges.
- Prevent agents from modifying sections outside their allowed scope.
- Prevent agents from seeing sections outside their allowed scope when using
  MCP tools (especially project summary/state tools).
- Use edge `contextMode` to control what content is auto-injected into prompts.
- Keep the scope derivation deterministic and explainable in the UI.
- Work for managed LLM agents and external agents (Claude/Codex/OpenCode).
- Ensure the Setta CLI (`setta api`) path is covered, since it maps to MCP tool
  calls.

## Non-goals
- Hard sandboxing of the host filesystem beyond existing share mode rules.
- Fine-grained ACLs for human users or IDE operations.
- Automatic policy inference beyond the edge graph (no heuristics).
- Full cross-agent orchestration or delegation beyond shared context rules.

## Current state (Feb 2026)
- Agentic edges are stored in `ProjectConfig.agenticEdges` and render in the
  canvas UI, but do not affect tool access or prompts.
- Managed LLM tools call MCP directly with no scope guard except tool allowlist.
- External agents get a system prompt and an optional tool allowlist, but no
  section-level scope enforcement.
- `get_latest_project_state_summary` always returns the full project summary.

## Policy model
### Access types
- **Read**: view section metadata and content via MCP tools.
- **Write**: mutate section content, params, or per-section state.
- **Structural**: create/delete/move sections or edges, or change view modes.
- **Context**: auto-injected prompt context (does not imply write).

### Edge semantics
- `section_chat` (Section -> Chat)
  - Grants **Read** + **Context** on the source section.
  - `contextMode` controls how (or if) text is injected.
- `chat_section` (Chat -> Section)
  - Grants **Write** + **Read** on the target section.
  - `contextMode` is ignored unless we later support “output summaries.”
- `chat_chat` (Chat <-> Chat)
  - Grants **Read** access to peer chat summaries and tool call trails.
  - Treated as bidirectional regardless of stored direction.

### Enforcement baseline
- Chat sections always run in strict mode: agentic edges are the only allowlists.
- If a Chat section has no edges, it has no project access.
- Project Chat (left side) is the full-access escape hatch for “control everything.”

## Data model additions
- `AgenticScope` (new derived model, not persisted):
  - `readSectionIds`, `writeSectionIds`, `contextSectionIds`,
    `peerChatSectionIds`, `structuralAllowed`.
- Tool metadata additions in `SettaToolAnnotations`:
  - `accessType`: `read` | `write` | `structural`.
  - `idPathsByType`: reuse AIFollow-style paths for `section` and `codeObj` ids.
  - Annotate every MCP tool with `accessType` + `idPathsByType`; default to
    `structural` if unset.

## Scope resolution
Add `resolve_agentic_scope(project_state, chat_section_id)`:
- Collect all agentic edges touching the chat.
- Build read/write/context sets from edge kinds.
- For `chat_chat`, add the peer chat section id to `peerChatSectionIds`.
- If there are no edges, return empty sets.
- Optionally treat singleton/gen-code sections as always readable (to keep
  tool flows working), but not writable.
- If `chat_section_id` is `None` (Project Chat), bypass scope and allow full access.

## Enforcement architecture
### 1) Managed LLM tool calls
- Add an `AgenticScopeGuard` in the managed tool-call pipeline:
  - Inject scope into `AgentRunContext` and `ExecuteToolCallsAction`.
  - Before invoking tools, extract targeted ids using `idPathsByType`.
  - Map `codeObjId` -> owning sections using project state helpers.
  - If any targeted section is outside the allowed set, return a disallowed
    tool result (do not call MCP).
  - For `structural` tools (no section ids), require `structuralAllowed`.
- Filter tool lists before sending to the LLM when scope is empty or narrow:
  - Hide structural tools if `structuralAllowed` is false.
  - Optionally hide tools that always return full project state.

### 2) MCP server-side enforcement
- Extend MCP tool wrappers (in `project_state_registry` or `SettaFastMCP`):
  - Read agentic context metadata from the MCP call `meta`.
  - Resolve scope for the calling chat section id.
  - Apply the same `AgenticScopeGuard` logic inside the tool wrapper.
  - If blocked, raise a clear error or return an error result.
- Add an init tool `set_agentic_context` that external agents call once per MCP
  session to register `{projectConfigId, chatId, sectionId}`.
- Store per-session agentic context in MCP server state keyed by MCP session id.
  If context is missing, default to strict mode with no access.
- Note: the Setta CLI (`setta api`) calls `/__setta__/tools/call`, which is the
  MCP tool-call endpoint; scope enforcement here automatically applies to CLI
  workflows.

### 3) Project summary filtering
- Update `get_latest_project_state_summary` to accept optional agentic context
  (via MCP meta or a new request field) and return a filtered summary:
  - Only include sections in `readSectionIds`.
  - Filter `parentSectionMap`, `singletonSections`, and `shownParamVariantIds`
    to the allowed set.
  - Keep `projectConfig` but strip section/variant maps for disallowed ids.

## Context injection (what agents receive)
- Add `build_agentic_context_blocks(scope, project_state)`:
  - For each `contextSectionId`, build a content block based on section type.
  - `inline_text`: include raw text/code (truncate by tokens/lines).
  - `summary`: include a summary generated at chat start and reused for that chat.
  - `reference_only`: include a brief reference line (name + id) only.
- Insert context blocks as a system or user message right before the user
  message that triggers the run (managed + external). Keep it deterministic.
- Defer summary caching until we have performance profiling data.

## External agent specifics
- Update external adapters to call `set_agentic_context` during startup or before
  the first tool call (Codex/Claude/OpenCode).
- Ensure the same scope filtering is applied in MCP server for external tools.
- Surface “blocked by scope” responses as tool results so external agents learn
  boundaries quickly.

## Frontend UX
- Add an “Agentic Scope” panel in Chat settings:
  - Read/Write/Context lists with clear icons and counts.
  - Warnings when scope resolves to empty (“No edges = no access”).
  - A note directing users to Project Chat for full access.
- Add edge-level context mode controls in the Context & Links panel:
  - Allow switching `reference_only` / `inline_text` / `summary` per edge.
- On the canvas, highlight allowed read/write sections when a chat is selected
  or streaming (distinct strokes for read vs write).
- When a tool call is blocked by scope, show a toast and highlight the missing
  edge(s).
- Visual styling polish for edges and highlights should be done last; prioritize
  data structures, enforcement, and test coverage first.

## Observability
- Log scope resolutions and blocked tool calls with `projectConfigId`,
  `chatId`, `sectionId`, tool name, and blocked ids.
- Emit AI follow updates when context blocks are injected so the UI can
  highlight context sources.

## Rollout strategy
- Enforce scope by default for Chat sections (always strict).
- Project Chat remains full access for workflows that need unrestricted control.

## Testing plan
### Development approach
- Use test-driven development when practical (unit first, then integration).
- Regardless of TDD feasibility, deliver a comprehensive suite of unit,
  integration, and Playwright tests.

### Backend unit tests
- `resolve_agentic_scope` with mixed edge kinds and no-edge cases.
- Tool guard extracts ids correctly from annotations and blocks disallowed calls.
- `get_latest_project_state_summary` filtering preserves valid relationships.

### Backend integration tests
- Managed LLM tool call blocked outside scope returns an error tool result.
- External agent MCP call blocked when context registered (strict by default).

### Frontend tests
- Context mode updates for edges persist and render correctly.
- Playwright: create edges, attempt an out-of-scope tool call (mocked) and verify
  UI warning + “use Project Chat for full access” note.

## Open questions
- Should `chat_chat` edges allow tool-driven edits in the peer chat’s linked
  sections, or be read-only for now?
- Do we need a dedicated “project-level scope” edge or node for structural tools?
- Should context summaries be computed locally or via an LLM helper tool?
