# Skills Browser Applicable + Active Status Plan

This plan makes the Skills/MCP viewer show two new status dimensions per skill:

- `Applicable`: usable by the currently selected engine based on skill root folder conventions.
- `Active`: confirmed as actually used by the current agent run/chat.

The plan is implementation-oriented and mapped to the current Setta codebase.

## Why This Needs Setta-Owned State

Based on official docs for Claude SDK, Codex app-server, and OpenCode SDK:

- There is no single cross-provider API that returns "currently active skills".
- Providers expose skill discovery/invocation primitives, but active state is either implicit or host-defined.

Therefore, Setta must compute and track these statuses itself.

## Goals

- Show `Applicable` and `Active` indicators in `ProjectChatSkillsMcpViewer`.
- Scope status to the current engine + chat context, not global guesses.
- Keep current skill discovery behavior intact (`/getAppGenSkills`, `/getAppGenSkillContent`).
- Be explicit about confidence:
  - Show `Active` only from concrete runtime signals.
  - Show `Unknown` when the provider does not emit enough signal.

## Non-Goals

- Replacing provider-native skill orchestration semantics.
- Parsing full skill bodies on every render.
- Building semantic relevance ranking from user prompt text in v1.

## Current State (as of Feb 18, 2026)

- Skill discovery:
  - Backend: `backend/setta/routers/app_gen_extensions.py`
  - Frontend viewer: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
- Existing data:
  - `AppGenSkillEntry` only includes path/name/description metadata.
  - No endpoint returns per-chat skill applicability/activity status.
- Engine behavior:
  - `setta_llm` currently has no native skill runtime (no `SKILL.md` loading/injection path).
  - External agents may use skills via their own host/runtime behavior.
- AI follow infrastructure exists, but only for section/codeObj ids:
  - `backend/setta/types/websocket.py`
  - `backend/setta/routers/ai.py`
  - `frontend/src/state/actions/aiFollow.ts`

## UX Contract

Each listed skill gets two badges:

- `Applicable`
  - Means: skill root path convention matches the active engine (Codex/Claude/OpenCode).
  - Includes a short reason on hover (example: "Applicable for Codex (.agents/skills root)").
- `Active`
  - Means: Setta observed concrete activation/usage signal for this chat.
- `Unknown` (for active state only)
  - Means: current provider does not expose reliable activation signal.

Status should be chat-specific for `Active`, and engine-specific for `Applicable`. Changing active chat or engine should refresh status.

## Data Model

Add backend models in `backend/setta/routers/app_gen_extensions.py` (or a new `backend/setta/types/skills.py` if preferred):

- `AppGenSkillApplicability`
  - `skillId: str`
  - `isApplicable: bool`
  - `reason: str`
- `AppGenSkillActivity`
  - `skillId: str`
  - `activeState: "active" | "inactive" | "unknown"`
  - `isActive: bool`
  - `source: str | None`
  - `lastActivatedAt: datetime | None`
- `AppGenSkillStatus`
  - `skillId: str`
  - `applicability: AppGenSkillApplicability`
  - `activity: AppGenSkillActivity`

Request model for status query:

- `GetAppGenSkillStatusRequest`
  - `projectConfigId: ID`
  - `chatId: ID | None`
  - `engineConfigId: ID | None`
  - `engineType: EngineType | None`

## Backend API Changes

Add a new route constant in `backend/setta/types/routes.py`:

- `GET_APP_GEN_SKILL_STATUS = "/getAppGenSkillStatus"`

Add route in `backend/setta/routers/app_gen_extensions.py`:

- `POST /getAppGenSkillStatus`
- Returns `list[AppGenSkillStatus]`
- Internally:
  - Reads current skill list (`list_app_gen_skills`).
  - Computes applicability from engine + root mapping.
  - Merges activity snapshot from runners.

Rationale: keep `/getAppGenSkills` as stable discovery and add status as a context-dependent layer.

## Applicability Engine (v1, folder-based)

Create `backend/setta/skills/applicability.py`:

- Input:
  - `AppGenSkillEntry`
  - active engine/tool type
- Rules (deterministic):
  - Codex engine:
    - applicable roots: `workspace_agents_skills`, `user_agents_skills`, `agents_home_skills`, `codex_home_skills`, `admin_codex_skills`
  - Claude engine:
    - applicable roots: `workspace_claude_skills`, `user_claude_skills`
  - OpenCode engine:
    - applicable roots: `workspace_opencode_skills`, `user_opencode_skills`
  - `setta_llm` (current state):
    - no applicable roots until Setta-native skill loading exists
- Output:
  - `isApplicable: bool`
  - concise reason string.

Performance constraints:

- No `SKILL.md` parsing required for applicability.
- Computation is root-id based and O(number of discovered skills).

## Activity Tracking Engine

Create `backend/setta/skills/activity_tracker.py` with in-memory chat-scoped state:

- Key: `(projectConfigId, chatId, skillId)`
- Value:
  - `activeState`
  - `source`
  - `lastActivatedAt`

Public methods:

- `mark_active(...)`
- `mark_inactive(...)`
- `mark_unknown(...)`
- `get_snapshot(project_config_id, chat_id | None)`

### Where to hook activity signals

1. `backend/setta/llm/agent_runner.py` (future phase)
- Defer until `setta_llm` skill loading exists.
- Once implemented, hook where `SKILL.md` is lazily injected (or skill tool equivalent) and mark active there.

2. `backend/setta/agentic/external_agent_runner.py`
- Hook in `_handle_stream_chunk` for:
  - `ToolCallDeltaEvent` (activation start)
  - `ToolResultEvent` (completion update)
- Use `_normalize_tool_name(...)` and arguments parsing to extract skill identifiers.

3. Adapter-specific extraction (best-effort):
- OpenCode (`backend/setta/agentic/external_adapters/opencode_sdk.py`):
  - detect tool name `skill` with argument `name`.
- Codex app-server (`backend/setta/agentic/external_adapters/codex_app_server.py`):
  - detect skill-like tool items; extend parser item types if needed to include `skill`.
  - detect explicit `turn/start` skill input if Setta sends it in future.
- Claude SDK (`backend/setta/agentic/external_adapters/claude_sdk.py`):
  - if no concrete skill-use signal exists, keep `unknown` instead of inferring `active`.

### Active heuristics behavior

- If a concrete skill invocation signal is observed for a known skill, mark `active`.
- If run completes with reliable signals and a skill was never observed, mark `inactive`.
- If provider does not offer reliable skill signals, keep `unknown`.

### Concrete examples

- Applicable:
  - selected engine = Codex, skill id = `workspace_agents_skills::ui-layout` -> applicable
  - selected engine = Codex, skill id = `workspace_claude_skills::handoff` -> not applicable
  - selected engine = `setta_llm`, any skill id -> not applicable (until Setta skill runtime exists)
- Active:
  - OpenCode stream shows tool call `tool_name="skill"` with `arguments={"name":"ui-layout"}` -> mark matching `ui-layout` skill `active`
  - Codex app-server emits explicit skill item or turn input skill reference for `frontend-design` -> mark matching skill `active`
  - Claude run with no reliable skill-use signal -> keep `activeState="unknown"`

### Source labels

Use stable source strings:

- `explicit_ui_selection`
- `opencode_skill_tool`
- `codex_skill_item`
- `codex_turn_input_skill`
- `setta_llm_skill_loader` (future)
- `claude_unknown`

## Realtime Transport (optional but recommended)

Add websocket message type for activity updates:

- Extend `WebsocketMsgTypeForFrontend` in `backend/setta/types/websocket.py`:
  - `SkillActivityUpdate`
- Add payload model:
  - `projectConfigId`
  - `chatId`
  - `skills: list[AppGenSkillActivity]`
- Add broadcaster in `backend/setta/websockets/msg_handlers/frontend_sender.py`.
- Handle in `frontend/src/state/actions/websocketReceive.ts`.

Fallback if websocket is deferred:

- Poll status endpoint on chat/engine changes and manual refresh only.

## Frontend Changes

### Component wiring

`frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`

- Pass current chat + engine context into viewer:
  - `chatId`
  - `effectiveEngineId`
  - `engineType`

`frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`

- Add status fetch call to `/getAppGenSkillStatus`.
- Merge status map with skills list by `skillId`.
- Render badges:
  - `Applicable` when `isApplicable`
  - `Active` / `Unknown` based on `activeState`
- Add concise status legend near filter input.
- Keep existing refresh button behavior; refresh both discovery + status.

`frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.ts`

- Add helpers:
  - `sortSkillsByStatus(...)` (Active first, then Applicable, then alphabetic)
  - status filter predicates.

### Generated API sync

After backend route/type updates:

- Run `source activate.sh && cd frontend && pnpm generate`

Then update imports in:

- `frontend/src/utils/generatedEndpoints.ts`
- `frontend/src/utils/generatedTypes.ts`
- consuming viewer/components.

## Testing Plan

### Backend tests

Extend `tests/routers/test_app_gen_extensions_routes.py`:

- status route returns entries for all discovered skills.
- applicability by engine/root matrix:
  - Codex engine marks only codex-family roots as applicable
  - Claude engine marks only claude roots as applicable
  - OpenCode engine marks only opencode roots as applicable
  - `setta_llm` marks none as applicable
- activity merge behavior:
  - active signal present
  - inactive state
  - unknown state
- permission-denied roots still do not break status endpoint.

Add targeted unit tests:

- `tests/skills/test_applicability.py`
- `tests/skills/test_activity_tracker.py`

### Frontend tests (Playwright)

Update `frontend/tests/e2e/overview/project-ai/project-ai-chat-skills-mcp-viewer.spec.ts`:

- mocks for `/api/getAppGenSkillStatus`.
- assert badge rendering for:
  - Active + Applicable
  - Applicable only
  - Unknown activity
- assert refresh re-fetches status endpoint.
- assert sorting prioritizes Active and Applicable correctly.

### Frontend tests (Vitest)

Add utility tests for sorting/filter logic in:

- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.test.ts`

## Rollout Phases

### Phase 1: Applicability only (fastest user value)

- Implement status endpoint with folder-based applicability.
- UI shows `Applicable`.
- `Active` behavior by engine:
  - external agents: `Unknown` until activity signals are wired.
  - `setta_llm`: `Unknown` (no skill runtime yet).
- Ship with tests.

### Phase 2: Active tracking from concrete external-agent runtime signals

- Add `activity_tracker`.
- Hook OpenCode + Codex signals.
- Claude remains `Unknown` unless explicit signals are available.
- Add websocket updates or periodic refresh.

### Phase 3: Add `setta_llm` skill loading + active signal

- Implement `setta_llm` skill runtime:
  - metadata index for discovery
  - lazy load/inject selected skill instructions
  - optional on-demand resource loading
- Emit `setta_llm_skill_loader` activity signal when a skill is actually loaded.
- Update UI so `setta_llm` can show real `Active` instead of `Unknown`.

### Phase 4: Explicit activation controls (optional)

- Let user explicitly mark/select skill in viewer before sending prompt.
- Emit `explicit_ui_selection` active source.
- (Optional) wire selected skills into provider-specific run inputs when supported.

## Acceptance Criteria

- Skills viewer continues to load even when some roots are unreadable.
- Every discovered skill shows stable status fields.
- `Applicable` updates when selected engine changes.
- `Active` appears only from concrete signals; otherwise `Unknown`.
- Until Phase 3 lands, `setta_llm` should not claim real active-skill state.
- No backend errors in logs for missing permissions or missing optional activity data.
- Existing skills browser tests continue passing.

## Documentation Updates

After implementation, update:

- `docs/reference/mcp-system-overview.md`
- `docs/reference/ai-follow.md` (if activity transport reuses similar patterns)
- `docs/reference/urls-and-routes.md` for new route.
