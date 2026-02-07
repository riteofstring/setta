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
  canvas UI.
- Managed LLM tool calls are guarded by agentic scope before calling MCP.
- MCP server-side tool calls are guarded by agentic scope (including CLI flows),
  with a strict “missing context = blocked” default.
- External agents can provide agentic context via MCP `meta`, HTTP headers, or
  the `set_agentic_context` init tool.
- `get_latest_project_state_summary` and `get_latest_lsp_diagnostics` are scoped
  when agentic context is present.

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
  - `summary`: include a true summary (not just “shorter truncation”).
  - `reference_only`: include a brief reference line (name + id) only.
- Insert context blocks as a system or user message right before the user
  message that triggers the run (managed + external). Keep it deterministic.

### True summary generation (LLM + deterministic fallback)
`contextMode=summary` should exist to keep prompts low-token and high-signal
while still preserving the important constraints of a section.

Implementation constraints:
- The injected context must be deterministic across runs for the same section
  content (avoid “summary drift” that changes agent behavior).
- Summary generation must not require users to configure a separate LLM by
  default.
- Summary generation must work even when no LLM is available (external-agent
  only, offline, etc.) via a deterministic fallback.

#### Summary model selection (no extra user configuration by default)
- Default: use the same engine/model that the chat section is already using
  when the chat is managed by Setta (`EngineType.setta_llm`).
- Optional override (advanced): allow a separate engine/model for summarization
  (for example, “cheap model for summaries, strong model for chats”). This can
  live on an EngineConfig, AgentProfile, or global default.
- External-agent chats (`EngineType.external_agent`): prefer a Setta-managed
  summarizer if available; otherwise fall back to deterministic summaries.

#### Determinism and caching
To avoid summary drift and keep latency/cost bounded:
- Cache by `{projectConfigId, sectionId, sectionVariantId, contentHash}`.
- Compute `contentHash` from the extracted “summary input” payload (see below),
  not raw section JSON, so hash changes reflect real semantic input changes.
- Generate with a constrained format and low randomness (temperature=0).
- If a cached summary exists, always reuse it for prompt injection.

Cache fill strategy (pick one; both are viable):
- Synchronous fill: when a chat run starts and a summary is missing, generate it
  inline (adds latency but is simplest and always correct).
- Lazy fill: if missing, inject `reference_only` (or a deterministic fallback)
  and queue background generation; use cached summary on subsequent runs.

#### Deterministic (non-LLM) summary baseline
Always produce a deterministic “facts block” per section type. The LLM summary
step (if enabled) can be treated as optional compression of these facts.

Suggested per-type deterministic inputs:
- TextBlock: raw `text` (bounded by lines/tokens) + label/type/id.
- Prompt: `renderedText` (or `template` + key `inputs`) + label/type/id.
- Code/GenPython*/GlobalVariables: code outline + key exports + label/type/id
  (avoid “first N lines” as a summary; prefer structure).
- Dict/MetaControl/params-heavy sections: parameter name + value preview list
  (already derivable from `build_project_state_summary`).
- Callable: callable reference (codeObj id/name/description) plus parameter
  list/value previews and any binding info needed to locate the implementation.
- Chart: `dataPath` + chartSettings summary; optionally include deterministic
  computed stats if reading data is safe and in-scope.
- Draw/Image: metadata-only by default (layer names/counts, `imagePath` /
  `renderedImagePath`). Do not attempt semantic interpretation without a vision
  model.
- Group/ListRoot: children list/count + label/type/id.
- Browser/Social/IFrame/Terminal: reference-only or simple metadata (folder/url,
  view mode). Avoid dumping large outputs into summaries.

LLM summary prompt should:
- Be explicit about format (for example: 5-12 bullet constraints).
- Prohibit speculation/hallucination (“only summarize what is present”).
- Include the deterministic facts block, not arbitrary deep project reads.

## External agent specifics
- Support providing agentic context via MCP `meta`, HTTP headers, or
  `set_agentic_context`:
  - Prefer stateless propagation (meta/headers) when possible to avoid session
    coupling and extra init calls.
  - Keep `set_agentic_context` as a fallback for clients that cannot reliably
    send meta/headers.
- Ensure the same scope filtering is applied in MCP server for external tools.
- Surface “blocked by scope” responses as tool results so external agents learn
  boundaries quickly.

## Conversation titles (Project Chat history)
We can reuse the same “deterministic input + optional LLM compression + caching”
pipeline to generate chat titles.

Purpose:
- Replace “first 30 chars of the first message” labels with short, meaningful
  titles in the Project Chat history pane.

Data model:
- Persist titles on the run as `AgentRun.outputs.name` (frontend already prefers
  this when present).

Generation rules:
- Deterministic fallback (always available):
  - Use the first user message text normalized (trim, collapse whitespace),
    truncated to a small bound (for example 30-60 chars).
- Optional LLM title:
  - Generate a single short phrase (for example 4-10 words).
  - No quotes, no trailing punctuation, no newline, max length bound (for
    example <= 60 chars).
  - Use the same model-selection rules as “True summary generation” above
    (default to the chat’s managed model; external-agent uses Setta summarizer if
    configured; otherwise deterministic-only).

Caching/invalidation:
- Cache/persist the title once computed; do not regenerate on every run.
- Invalidate only when the “title input hash” changes (for example: first N
  user messages change due to branching, or the chat is recreated).

Scope constraints:
- Title generation must only use the chat’s own messages and the agentic context
  that would have been injected anyway (no extra project reads), to avoid
  accidentally leaking out-of-scope content into global history labels.

Tests:
- Unit: title generation formatting rules and deterministic fallback.
- Integration: a run with no outputs.name gets a generated title once and is
  stable across subsequent runs.

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
- Log summary cache hits/misses and title generation events (project/chat/section
  ids plus content hashes).

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
