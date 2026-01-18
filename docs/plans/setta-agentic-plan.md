# Setta agentic plan

## Deep dive summary (current system)
- The backend exposes an MCP server (`backend/setta/mcp/server.py`) that registers init and discoverable tools, injects docstrings into schemas, and handles ID translation between canonical and temporary IDs.
- The LLM stack (`backend/setta/llm/llm_chat_manager.py`) injects the system prompt, streams tool calls/results, and supports tool search with deferred loading for Anthropic.
- Tool discovery uses a BM25 search index with tags and categories, and MCP tool calls stream through `MultiMCPClient` to any configured server.
- AIFollow highlights sections touched by tool calls and keeps the viewport in sync (`docs/ai-follow.md`).
- Project state is the canonical source of truth (sections, params, variants, artifacts), with codegen + LSP sync (`backend/setta/project_state/base_project_manager.py`).
- Listeners provide a realtime event loop with dependency keys, actions, and `emit_to_frontend` to push UI updates (`docs/setta-realtime-behavior.md`).

## Re-assessed gaps for a prompter's paradise
- No first-class agent profiles or sub-agent orchestration; the chat is single-agent per conversation.
- No skill registry or reusable prompt/tool packages that can be invoked as a unit.
- No prompt template assets or versioning; prompts live as chat history only.
- No eval harness for running prompts over datasets or scoring outputs.
- No run/replay artifact that captures inputs, tool calls, and results in one place.
- No per-agent tool allowlists or sandbox profiles beyond the MCP server list.
- No explicit context budget controls or memory lenses for prompt construction.

## Plan

### Phase 1: Agent and skill primitives
- Add data models in `backend/setta/types/agentic.py`:
  - `AgentProfile` (name, description, system_prompt, llm_config_id, tool_allowlist, memory_scope)
  - `SkillSpec` (name, description, input_schema, output_schema, agent_profile_id, prompt, tool_allowlist)
  - `AgentRun` and `RunEvent` (inputs, outputs, tool calls, timestamps, status, costs)
- Extend `backend/setta/database/db_objs.py` with paths and helpers for:
  - `setta_files/agent_profiles.json`
  - `setta_files/skills/*.json`
  - `setta_files/agent_runs/*.json`
- Add prompt asset paths alongside skills:
  - `setta_files/prompts/*.json`
  - Optional `setta_files/prompts.example.json` fixture
- Add a watcher similar to `LLMConfigWatcher` to broadcast agent/skill updates.
- Add REST routes in `backend/setta/routers/agentic.py`:
  - CRUD for agent profiles and skills.
  - Start/stop agent runs and fetch run history.
- Add MCP tools in `backend/setta/mcp/tools/agentic_tools.py`:
  - `list_agent_profiles`, `get_agent_profile`, `list_skills`, `get_skill`, `run_skill`.

### Phase 2: Agent runner and sub-agents
- Implement `AgentRunner` in `backend/setta/llm/agent_runner.py`:
  - Accepts `AgentProfile` + input payload and streams `RunEvent`s.
  - Supports sub-agent calls by spawning child runs with isolated tool state.
  - Enforces tool allowlists by filtering tool definitions before LLM requests.
- Extend `LLMChatManager` with a `run_sub_agent` method used by `run_skill`.
- Persist run logs to `setta_files/agent_runs` with the project snapshot and temporary ID map for replay.

### Phase 3: Prompt assets and eval harness
- Introduce prompt templates as workspace assets:
  - Store templates in `setta_files/prompts/*.json` with explicit input schema and metadata.
  - Bind them to UI via an agent/skill panel.
- Add a dedicated prompt section:
  - Create `SectionType.Prompt` + `PromptSectionImpl` with fields for `template`, `format` (Jinja), `inputs`, and `renderedText`.
  - Treat it like TextBlock in the dependency graph (literal output) to minimize codegen churn.
  - Add variable extraction + validation UI (missing vars, defaults).
  - Render on update (store `renderedText`, `missingVariables`, `renderError`) instead of at runtime.
- Add an eval runner:
  - Accepts JSONL datasets with input and expected output.
  - Runs a skill or agent profile against each row.
  - Writes results to an artifact (JSONL + summary metrics).
- Add MCP tools to start/inspect eval runs (`run_eval`, `get_eval_results`).

### Phase 4: UI for agents, skills, and runs
- Add a new Overview tab or sidebar panel for agent profiles and skills.
- Add a skill builder UI (prompt editor, input schema editor, tool allowlist).
- Add a run history viewer and a trace view that shows tool calls and results.
- Surface per-run metadata (model, tokens, cost, duration, status).
- Integrate runs into Chat sections as the default entry point (agentic sessions per chat section).
- Keep ProjectLevelAI for project-level setup/automation workflows.

### Phase 5: Context and memory controls
- Add per-agent context sources:
  - Project summary (current default).
  - Selected sections or file snippets.
  - Memory cards with explicit pin/forget controls.
- Add a context budget preview in the chat UI (tokens per source).

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
- Add prompt and skill JSON helpers to `backend/setta/database/db_objs.py`.
- Add a watcher similar to `LLMConfigWatcher` for prompts and skills.
- Add REST routes for prompt CRUD in `backend/setta/routers/agentic.py`.

### Chat section integration
- Add a map from chat section id to chat id in `setta_files/chat_sections.json`.
- Add routes to create/attach chat sessions for Chat sections.
- Update `frontend/src/components/Section/Layouts/ChatArea.tsx` to call the agentic chat routes.
- Add agent profile and LLM config pickers in the Chat section config pane.

### Frontend updates
- Add `PromptArea` layout in `frontend/src/components/Section/Layouts/PromptArea.tsx`.
- Add prompt config UI in `frontend/src/components/Panes/UiEditor/SectionConfig/PromptSettings.tsx`.
- Wire `SectionTypeEnum.Prompt` into `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`.
- Add prompt icons and header behavior in `frontend/src/components/Section/Header/HeaderIcon.tsx`.
- Add Prompt creation in `frontend/src/components/Utils/FloatingBox.tsx` and `frontend/src/state/actions/sections/createSectionsHelper.ts`.
- Add prompt section handling to `frontend/src/components/Section/Header/SectionHeader.tsx`.

### Tests
- Add backend tests under `tests/llm` for prompt rendering and skill runs.
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
  - Create a Prompt section, render it, run a skill, verify AIFollow, and replay from run history.

## Decisions
- Skills and prompt assets are workspace-scoped (not per project config).
- Prompt templates start as `setta_files/prompts/*.json`.
- Use Jinja-style templates (`{{ var }}`) as the default.
- Chat sections are the default entry point for agentic projects.
- Skip tags in the MVP; add optional tagging later only if filtering becomes a need.
- Use a dedicated `SectionType.Prompt` for first-class prompt nodes on the canvas.

## Open questions
- Should Prompt sections be callable by default in skills, or opt-in via tool selection?
