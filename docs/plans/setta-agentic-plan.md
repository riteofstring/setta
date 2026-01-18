# Setta agentic plan

Related: `docs/plans/setta-external-tools-plan.md` covers external orchestration
for Claude Code, Codex, and OpenCode (including SKILL.md support). This plan
focuses on internal agent primitives that external adapters build on.

## Deep dive summary (current system)
- The backend exposes an MCP server (`backend/setta/mcp/server.py`) that registers init and discoverable tools, injects docstrings into schemas, and handles ID translation between canonical and temporary IDs.
- The LLM stack (`backend/setta/llm/llm_chat_manager.py`) injects the system prompt, streams tool calls/results, and supports tool search with deferred loading for Anthropic.
- Chat sections already support managed vs scriptable flows, store `chatId` on the section impl, and the chat toolkit (`docs/chat-sections.md`, `docs/chat-toolkit.md`) provides listener-friendly streaming/tool helpers.
- Tool discovery uses a BM25 search index with tags and categories, and MCP tool calls stream through `MultiMCPClient` to any configured server.
- AIFollow highlights sections touched by tool calls and keeps the viewport in sync (`docs/ai-follow.md`).
- Project state is the canonical source of truth (sections, params, variants, artifacts), with codegen + LSP sync (`backend/setta/project_state/base_project_manager.py`).
- Listeners provide a realtime event loop with dependency keys, actions, and `emit_to_frontend` to push UI updates (`docs/setta-realtime-behavior.md`).

## Re-assessed gaps for a prompter's paradise
- No first-class agent profiles or sub-agent orchestration; the chat is single-agent per conversation.
- No prompt template assets or versioning; prompts live as chat history only.
- No eval harness for running prompts over datasets or scoring outputs.
- No run/replay artifact that captures inputs, tool calls, and results in one place.
- No per-agent tool allowlists or sandbox profiles beyond the per-LLM-config MCP server filters.
- No explicit context budget controls or memory lenses for prompt construction.

## Feature preservation contract (non-negotiable)
Backward compatibility is not required, but user-visible features must be preserved. Agentic features are additive and must not delete or bypass existing chat behavior.

- Preserve managed and scriptable Chat section modes (behavior, not specific fields).
- Preserve the ability to chat with Setta's internal LLM stack (litellm) without relying on external agents.
- Keep the chat toolkit surface usable for listeners (`ChatSession`, `ChatSectionSyncClient`, `on_chat_send_event`, and streaming helpers).
- Specific routes and storage fields do not need to be preserved; the API surface can change as long as the UI/toolkit behavior is preserved.
- Maintain the `LLMStreamingResponse` contract, `sectionId`-based updates, and AIFollow behavior.
- If a replacement is necessary, provide a migration path and explicitly list feature parity before removal.

## Acceptance checks (minimum)
- A managed chat still streams LLM responses into the Chat section UI with tools and AIFollow.
- A scriptable chat still works via listeners using the chat toolkit helpers.
- Selecting an internal engine config and reasoning options still affects managed chat behavior.
- Chat sections still support "new chat" and persisted chat history.
- Deferred: share-mode LLM supports minimal read-only Q&A about the project (post-refactor).

## Completion definition (what counts as "done")
This plan is complete when ALL of the following are true:
- The Acceptance checks above pass.
- Phases 1-4 are implemented, except any items explicitly marked "Deferred" or listed
  under "Future work" (those are OUT OF SCOPE and do NOT block completion).

Important: Future work and Deferred items are not prerequisites. They are explicitly
non-blocking and should never be used to mark this plan as incomplete.

## Completion rules (read this first)
Use this section as the source of truth when deciding if the plan is done.

Blocking requirements (must be true):
- Acceptance checks pass.
- Phase 1-4 deliverables implemented, excluding anything marked "Deferred" or listed
  under "Future work".

Non-blocking items (do NOT prevent completion):
- Anything under "Future work".
- Anything explicitly marked "Deferred".
- Any additional polish or enhancements not required by the Acceptance checks.

## Plan

### Phase 1: Agent primitives (implemented)
- Add data models in `backend/setta/types/agentic.py`:
  - `EngineConfig` (name, engineType, settaLlmConfig: { llmConfigId }, externalAgentConfigId, defaults: { deepThink })
  - `AgentProfile` (name, description, systemPrompt, engineConfigId, toolAllowlist, memoryScope)
  - `AgentRun` and `RunEvent` (inputs, outputs, tool calls, timestamps, status, costs)
- Extend `backend/setta/database/db_objs.py` with paths and helpers for:
  - `setta_files/engine_configs.json`
  - `setta_files/agent_profiles.json`
  - `setta_files/agent_runs/*.json`
- Add prompt asset paths:
  - `setta_files/prompts/*.json`
  - Optional `setta_files/prompts.example.json` fixture
- Add watchers similar to `LLMConfigWatcher` to broadcast engine config + agent updates.
- Add REST routes in `backend/setta/routers/agentic.py`:
  - CRUD for engine configs.
  - CRUD for agent profiles.
  - Start/stop agent runs and fetch run history.
- Add MCP tools in `backend/setta/mcp/tools/agentic_tools.py`:
  - `list_agent_profiles`, `get_agent_profile`, `run_agent_profile`.

### Phase 2: Agent runner and sub-agents (implemented)
- Implement `AgentRunner` in `backend/setta/llm/agent_runner.py`:
  - Accepts `AgentProfile` + `EngineConfig` + input payload and streams `RunEvent`s.
  - Supports sub-agent calls by spawning child runs with isolated tool state.
  - Reuse `setta.llm.chat_toolkit.managed` (stream assembler + action executor) so tool execution, previews, and AIFollow stay consistent.
  - Enforce tool allowlists by filtering tool definitions before LLM requests and passing `allowed_server_ids` into managed tool execution.
- Extend `LLMChatManager` with a `run_sub_agent` method used by `run_agent_profile`.
- Persist run logs to `setta_files/agent_runs` with the project snapshot and temporary ID map for replay.

### Phase 3: Prompt assets (implemented)
- Introduce prompt templates as workspace assets:
  - Store templates in `setta_files/prompts/*.json` with explicit input schema and metadata.
  - Bind them to UI via an agent panel.
- Add a dedicated prompt section:
  - Create `SectionType.Prompt` + `PromptSectionImpl` with fields for `template`, `format` (Jinja), `inputs`, and `renderedText`.
  - Treat it like TextBlock in the dependency graph (literal output) to minimize codegen churn.
  - Add variable extraction + validation UI (missing vars, defaults).
  - Render on update (store `renderedText`, `missingVariables`, `renderError`) instead of at runtime.

### Phase 4: UI for agents and runs (partially implemented)
- Add a new Overview tab or sidebar panel for agent profiles and runs.
- Add a run history viewer and a trace view that shows tool calls and results.
- Run-chain authoring + step-level trace are handled in the agentic graph UI
  (no standalone run-chain UI).
- Surface per-run metadata (model, tokens, cost, duration, status).
- Integrate runs into Chat sections as the default entry point (agentic sessions per chat section).
- Keep ProjectLevelAI for project-level setup/automation workflows.
- Deferred: canvas-based agentic graph UI (sections + edges), active path
  highlighting, and run-chain authoring/trace.

## Future work (out of scope)
All items below are explicitly out of scope for plan completion and are not required to
consider this plan finished.

### Context and memory controls
- Add per-agent context sources:
  - Project summary (current default).
  - Selected sections or file snippets.
  - Memory cards with explicit pin/forget controls.
- Add a context budget preview in the chat UI (tokens per source).

### Eval harness
- Add an eval runner:
  - Accepts JSONL datasets with input and expected output.
  - Runs an agent profile against each row.
  - Writes results to an artifact (JSONL + summary metrics).
- Add MCP tools to start/inspect eval runs (`run_eval`, `get_eval_results`).

### Agentic graph UI (sections + edges)
- Add a dedicated agentic edge type for context/flow, separate from codegen deps.
- Visualize active context paths during runs (AIFollow-driven highlights).
- Own run-chain authoring + trace UI (see `docs/plans/agentic-graph-ui-plan.md`).
- See `docs/plans/agentic-graph-ui-plan.md`.

## Detailed implementation map

### Prompt section schema
- Add `Prompt` to `backend/setta/types/section_impls.py` and create `PromptSectionImpl`.
- Extend `backend/setta/project_state/project_manager_types.py` with prompt mutation requests.
- Add helper functions in `backend/setta/types/helpers_lvl2.py` to set prompt template and inputs.
- Update `backend/setta/types/helpers_lvl1.py` with prompt type guards as needed.
- Update `backend/setta/code_gen/dependency_graph.py` and `backend/setta/code_gen/value_codec.py` to emit `renderedText`.
- Allow prompt section updates in `backend/setta/project_state/listener_dependency_updates.py` if we want listener emits to edit prompts.
- Regenerate frontend types with `source activate.sh && cd frontend && pnpm generate`.

### Prompt rendering
- Add a Jinja renderer in `backend/setta/llm/prompt_renderer.py` with strict undefined.
- Cache `renderedText`, `missingVariables`, and `renderError` on the section impl.
- Keep prompt rendering out of generated code so LSP and codegen remain unchanged.

### Asset storage
- Add prompt JSON helpers to `backend/setta/database/db_objs.py`.
- Add a watcher similar to `LLMConfigWatcher` for prompts and agent profiles.
- Add REST routes for prompt CRUD in `backend/setta/routers/agentic.py`.

### Chat section integration
- Keep a stable chat identity per section (chatId or run id), but do not require specific field names.
- Add linkage fields on `ChatSectionImpl` as needed (for example `engineConfigId`, `agentProfileId`, `agentRunId`) and update project manager requests if we need to persist them.
- Update `frontend/src/components/Section/Layouts/ChatArea.tsx` to branch between internal engine runs and external engine runs based on engine selection.
- Chat section settings expose managed/engine config/reasoning controls; add the agent profile picker and define how it interacts with engine config selection.

### Frontend updates
- Add `PromptArea` layout in `frontend/src/components/Section/Layouts/PromptArea.tsx`.
- Add prompt config UI in `frontend/src/components/Panes/UiEditor/SectionConfig/PromptSettings.tsx`.
- Wire `SectionTypeEnum.Prompt` into `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`.
- Add prompt icons and header behavior in `frontend/src/components/Section/Header/HeaderIcon.tsx`.
- Add Prompt creation in `frontend/src/components/Utils/FloatingBox.tsx` and `frontend/src/state/actions/sections/createSectionsHelper.ts`.
- Add prompt section handling to `frontend/src/components/Section/Header/SectionHeader.tsx`.

### Tests
- Add backend tests under `tests/llm` for prompt rendering and agent runs.
- Add router tests under `tests` for agentic CRUD and Chat section routes.
- Add frontend smoke checks for Prompt section creation and Chat section runs.

## Testing and validation
- Backend tests:
  - `tests/llm/test_agent_runner.py` for tool filtering, sub-agent runs.
  - `tests/llm/test_prompt_renderer.py` for Jinja rendering and error paths.
  - `tests/routers/test_agentic.py` for CRUD and run lifecycle.
- Integration tests:
  - End-to-end run from Chat section -> backend -> run log -> UI refresh.
- Manual QA:
  - Create a Prompt section, render it, run an agent profile, verify AIFollow, and replay from run history.

## Decisions
- Agent profiles and prompt assets are workspace-scoped (not per project config).
- Engine configs are workspace-scoped and unify internal Setta LLM and external agents.
- Prompt templates start as `setta_files/prompts/*.json`.
- Use Jinja-style templates (`{{ var }}`) as the default.
- Chat sections are the default entry point for agentic projects.
- Skip tags in the MVP; add optional tagging later only if filtering becomes a need.
- Use a dedicated `SectionType.Prompt` for first-class prompt nodes on the canvas.

## Engine config example
Example structure for `setta_files/engine_configs.json`:
```json
[
  {
    "id": "engine-setta-default",
    "name": "Setta LLM",
    "engineType": "setta_llm",
    "settaLlmConfig": {
      "llmConfigId": "primary"
    },
    "defaults": {
      "deepThink": true
    }
  },
  {
    "id": "engine-codex-sdk",
    "name": "Codex SDK",
    "engineType": "external_agent",
    "externalAgentConfigId": "external-codex-1"
  }
]
```

## Migration notes (llmConfigId -> engineConfigId)
- Replace any per-section `llmConfigId` selection with `engineConfigId`.
- Internal engine configs should reference existing `llm_config.json` entries via `settaLlmConfig.llmConfigId`.
- Agent profiles should move from `llmConfigId` to `engineConfigId`.
- External engine configs reference existing `external_agents.json` entries.
