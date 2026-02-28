# Fault-Line Contract Consolidation Plan

## Goal
Eliminate repeated patching in three recurring fault lines by enforcing single authoritative contracts and removing duplicate fallback logic.

## Scope
- In scope:
  - Project chat hydration/provenance authority flow in `ProjectChat`/`ProjectChatCore`.
  - Managed API-key snapshot/error handling in frontend AI actions.
  - Codex MCP payload canonicalization path in backend config handling.
  - Targeted Vitest and pytest updates for the refactors.
- Out of scope:
  - New backend chat hydration endpoints.
  - LLM config schema redesign.
  - Unrelated UI/style changes.

## Fault Lines To Close
1. Project chat hydration state is derived from multiple loosely-coupled props (`runType`, provenance readiness, blocked error, metadata revision), which allows callsite drift.
2. Managed API-key error handling is duplicated across load/refresh/save paths, causing subtle state divergence risk.
3. Codex MCP table canonicalization is implemented in multiple places instead of one shared authority.

## Contract Decisions
1. Project chat will use one hydration authority object per selected thread:
- `status`: `ready | unknown | blocked`
- `hydrationRunType`: `llm_chat | external_agent | null`
- `blockedErrorCode`: typed blocked reason or `null`
- `metadataRevision`: deterministic contract revision key

2. Managed API-key state updates will go through a single reducer path for both success snapshots and typed backend errors.

3. Codex MCP payload key-shape canonicalization (`mcp_servers` vs `mcpServers`) will be centralized in `setta.mcp.codex_config` and reused by external-agent settings generation.

## Implementation Steps
1. Add a shared project-chat hydration authority module.
- Create `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationAuthority.ts`.
- Move selected-thread compatibility logic into this module.
- Add a resolver that returns the full hydration authority object.

2. Wire `ProjectChat` and `ProjectChatCore` to the new authority contract.
- Replace multi-prop hydration inputs with one `hydrationAuthority` prop.
- Remove local run-type/provenance-status recomposition in `ProjectChatCore`.
- Keep existing retry/backoff behavior, but gate hydration strictly on authority status.

3. Unify managed API-key frontend state transitions.
- Add shared helpers in `frontend/src/state/actions/ai.ts` to parse typed backend API-key errors.
- Route load/refresh/save failure branches through the same state-application helper.
- Keep CAS/retry semantics intact; remove duplicated branch-specific state mutation logic.

4. Centralize Codex MCP payload canonicalization.
- Add canonicalization helper in `backend/setta/mcp/codex_config.py`.
- Replace duplicate canonicalization logic in `backend/setta/agentic/external_agent_settings.py` with the shared helper.

5. Update tests.
- Vitest:
  - `projectChatThreadVisibility.test.ts` and `projectChatExecutionSettings.test.ts` for hydration authority behavior.
  - `aiSaveLLMApiKeys.test.ts` and related guards for unified API-key error/snapshot transitions.
- Pytest:
  - targeted external-agent/Codex settings tests to confirm canonicalization behavior remains correct.

## Verification
1. `pnpm -C frontend exec vitest run` on the affected test files.
2. `source activate.sh && ./scripts/run_backend_tests.sh` with targeted Codex settings tests.
3. If any visible UI behavior changes in Project Chat flows, run Playwright targets and a CDP visual check; otherwise report no visual delta.

## Acceptance Criteria
- Project chat hydration decisions are produced from one authoritative object instead of independent props.
- Managed API-key error handling uses one reducer path across load/refresh/save.
- Codex MCP canonicalization exists in one backend module and callsites consume it.
- Updated targeted tests pass.
