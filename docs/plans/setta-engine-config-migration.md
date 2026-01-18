# Setta EngineConfig migration plan (clean break)

This plan replaces per-feature config fields (llmConfigId / externalAgentConfigId)
with a unified EngineConfig selection across managed chat and agent runs. Backward
compatibility is **not** required; existing configs and chat section fields are not
migrated automatically.

## Goals
- Unify internal Setta LLM and external agents under a single EngineConfig model.
- Preserve managed vs scriptable Chat modes, chat toolkit helpers, AIFollow,
  project chat, and external agent integrations.
- Keep UI/UX parity: internal engines still expose LLM config picker + deep
  thinking; external engines show external-specific status.

## Non-goals
- Automatic migration of existing agent profiles or chat sections.
- Backward compatibility for persisted fields or routes.
- Evals or prompt section changes (handled elsewhere).

## Phase 1: Backend data model + storage + watchers
1) Add models in `backend/setta/types/agentic.py`:
   - `EngineConfig` (id, name, engineType, settaLlmConfig, externalAgentConfigId, defaults)
   - `EngineConfigList`
2) Add `engine_configs.json` path + helpers in `backend/setta/database/db_objs.py` and
   `backend/setta/agentic/store.py`.
3) Add `EngineConfigWatcher` + websocket message type in
   `backend/setta/types/websocket.py` and frontend generated types.
4) Add CRUD routes in `backend/setta/routers/agentic.py`:
   - `GET /getEngineConfigs`
   - `POST /getEngineConfig`
   - `POST /createEngineConfig`
   - `POST /updateEngineConfig`
   - `POST /deleteEngineConfig`

## Phase 2: Replace config fields
1) Replace `AgentProfile.llmConfigId` with `engineConfigId`.
2) Replace `ChatSectionImpl.llmConfigId` + `externalAgentConfigId` with
   `engineConfigId`.
3) Update project manager requests and helpers to set/get engine config selection.
4) Regenerate frontend types (`source activate.sh && cd frontend && pnpm generate`).

## Phase 3: Engine resolution + unified execution
1) Add a backend resolver:
   - Input: `engineConfigId`
   - Output: either internal LLM config or external agent config + run mode
2) Unify managed run submission:
   - Replace separate LLM/external run code paths with a single “start engine run”
     entry point (internal routing by engine type).
3) Keep scriptable chat unchanged; only managed flows use EngineConfig.
4) Update AIFollow snapshot merging to include external runs as before.

## Phase 4: Frontend updates
1) Replace engine selectors to use engine configs everywhere:
   - `ProjectChat` engine dropdown
   - Chat section managed settings
2) For internal engines, show LLM config picker + deep thinking as before.
3) For external engines, surface preflight status and errors.
4) Hydrate engine configs in `useHydrateAgenticState`.

## Phase 5: Clean break cleanup
1) Remove deprecated routes and fields:
   - `llmConfigId`, `externalAgentConfigId` references in managed chat flows
2) Remove legacy UI state + reducer branches tied to the old fields.
3) Ensure generated types no longer expose old fields.

## Acceptance checks
- Managed chat still streams into Chat sections with tools + AIFollow.
- Scriptable chat still works via listeners using chat toolkit helpers.
- Project chat can select internal and external engines and stream responses.
- External runs still persist session/thread IDs across messages.
- Prompt sections and prompt assets are unaffected.

## Risks
- Breaking existing saved projects that referenced `llmConfigId` or
  `externalAgentConfigId`. This is expected under clean break.
- UI/UX drift if engine configs are not fully hydrated before rendering.

## Follow-ups (optional)
- Add a workspace migration utility later if needed.
- Add engine config import/export for reproducible setup.
