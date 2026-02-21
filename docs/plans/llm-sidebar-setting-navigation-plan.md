# LLM Side-Pane Setting Navigation + Highlight Plan

Last verified against the codebase on 2026-02-18.

## Goal
Enable Setta LLMs to reliably handle:
1. "Where is setting X?"
2. "Open the pane for setting X."
3. "Highlight setting X so I can see it."
4. "Set setting X to value Y."

This must work for core settings and plugin-contributed settings.

## Plugin status (current)
Plugins are no longer hypothetical here. The frontend runtime already supports `registerPane(...)` and renders plugin panes in the Overview rail.

The core planning conclusion still holds: we cannot model setting location as a closed enum of core tabs.

## Investigation summary (current state)

### LLM runtime and tool execution
- Managed chat runs through `AgentRunner` in `backend/setta/llm/agent_runner.py`.
- External-agent chat runs through `ExternalAgentRunner` in `backend/setta/agentic/external_agent_runner.py`.
- Both route MCP execution through `MultiMCPClient` in `backend/setta/mcp/client.py`.
- Tool registration and metadata are centralized in:
  - `backend/setta/mcp/tool_setup.py`
  - `backend/setta/mcp/tool_registry.py`
  - `backend/setta/mcp/server.py`

### What LLMs can do today
- Setta currently exposes 68 MCP tools (verified via `build_setta_tool_manager()` on 2026-02-18).
- Tool type split:
  - 8 init tools
  - 60 discoverable tools
- Access split from tool annotations:
  - 6 read
  - 25 write
  - 37 structural
- The tool set now includes plugin lifecycle tools (`install_plugin`, `update_plugin`, `rollback_plugin`, etc.) in addition to project-state/codegen/app-spec operations.
- Tool search (`search_mcp_tools`) is available and wired into managed chat execution.

### What LLMs cannot do today (feature gap)
- No MCP tool exists for "find UI setting" semantics.
- No MCP tool exists for "open side pane/tab for setting" semantics.
- No MCP tool exists for generic setting get/set by stable `settingId`.
- No websocket frontend message exists for "reveal this setting control".
- No stable setting-anchor contract exists in side-pane components (`data-setting-anchor` is absent).
- AI Follow is still intentionally scoped to `section` and `codeObj` IDs (`backend/setta/mcp/tool_metadata.py`), so it is not a fit for pane setting controls.

### Current side-pane architecture constraints
- Left-pane visibility and tab state live in local storage state:
  - `overviewVis`
  - `overviewTab`
  - defined in `frontend/src/state/definitions.ts`
- `overviewTab` is now `OverviewTabKey` (not just core enum values):
  - core tabs from `OverviewTabNameEnum`
  - plugin tabs encoded as `PluginPane:<pluginId>:<paneId>` via `buildPluginPaneOverviewTabName(...)`
  - defined in `frontend/src/utils/constants.ts`
- Right-pane visibility and tab state are still local storage state:
  - `uiEditorVis`
  - `uiEditorTab` keyed by section type
  - defined in `frontend/src/state/definitions.ts`
- Right-pane tabs require an active section selection to render meaningful content (`UiEditor` + `useUIEditorTab`).
- Left rail composition is mixed:
  - core tabs are hardcoded in `frontend/src/components/Panes/Overview/Overview.tsx`
  - plugin tabs are dynamic from `usePluginPaneTabs()` in `frontend/src/plugins/runtime.ts`
- Right rail tabs are still core-only and hardcoded in `frontend/src/components/Panes/UiEditor/UiEditor.tsx`.
- Websocket frontend message handling is centralized in `frontend/src/state/actions/websocketReceive.ts`.

### Plugin architecture implications
- Frontend plugins can register panes through host `registerPane(...)` in `frontend/src/plugins/runtime.ts`.
- Plugin panes are surfaced to Overview via computed `PluginPaneTabEntry` tab keys (`usePluginPaneTabs`).
- Backend plugin runtime payload (`PluginRuntimeResponse`) does not include concrete pane definitions; pane definitions are materialized in frontend runtime after loading plugin frontend modules.
- There is currently no backend-owned plugin setting registry or plugin reveal/mutation handler registration API for setting-level operations.
- Relevant references:
  - `frontend/src/plugins/runtime.ts`
  - `backend/setta/plugins/manager.py`
  - `docs/guides/plugin-authoring-golden-path.md`

## Design principles
1. Use stable setting IDs, not text matching against rendered labels.
2. Support full setting lifecycle (discover, reveal, read value, set value) through deterministic tool contracts.
3. Reuse existing frontend tab primitives (`OverviewTabKey`, `UIEditorTabName`) rather than inventing parallel enums.
4. Keep transport deterministic and testable without depending on model behavior.
5. Preserve compatibility with both managed and external-agent runs.
6. Keep plugin support explicit: plugin settings are only discoverable/revealable/readable/writable when the plugin is enabled and runtime-available.
7. Keep mutation safe: strict type validation, explicit writable policy, and structured errors for invalid requests.
8. Normalize approval behavior once: external-agent policy differences must map into one internal Setta MCP approval policy before tool execution.

## Proposed architecture

### 1) Add a canonical UI setting registry (backend-owned, plugin-aware)
Create a backend registry module, for example `backend/setta/ui_settings/registry.py`.

Each setting entry should include:
- `settingId`: stable ID (for example `core.project_ai_settings.enableChatTitles`)
- `title`: user-facing label
- `synonyms`: search aliases
- `description`: concise explanation
- `location`: deterministic pane/tab target using current frontend primitives
- `highlight`: how to locate/highlight in frontend
- `read`: backend resolver for current value
- `write`: backend mutator for value updates (when writable)
- `source`: `core` or `plugin`
- `pluginId`: nullable
- `mutability`: `readOnly` or `writable`
- `valueSchema`: value type/shape/range contract

Location descriptor (aligned with current UI implementation):
- `side`: `left` or `right`
- `overviewTabKey`: optional `OverviewTabKey` string for left-pane targets
- `uiEditorTabName`: optional right-pane tab key for right-pane targets
- `pluginId`: optional
- `paneId`: optional (for plugin overview panes)
- `requiresSectionSelection`: bool
- `preferredSectionType`: optional

Highlight descriptor:
- `strategy`: `dom_anchor` or `plugin_handler`
- `anchorId`: for `dom_anchor`
- `pluginRevealKey`: for `plugin_handler`

### 2) New MCP tools for setting discovery, reveal, and mutation
Add discoverable MCP tools in `backend/setta/mcp/tools/`:

`search_ui_settings`:
- Input: `query`, optional `limit`, optional `sourceFilter` (`core|plugin|all`)
- Output: ranked setting matches with location metadata
- Access type: `read`

`reveal_ui_setting`:
- Input: `settingId`, optional `durationMs`, optional `sectionIdToActivate`
- Behavior:
  - validate IDs
  - when revealing right-pane targets, if `sectionIdToActivate` is provided, set it active before emitting reveal
  - if a right-pane target requires section context and no active section is available, return structured failure so the caller can pick a section and retry
  - emit frontend reveal command
- Output: resolved reveal target and status
- Access type: `read` (or `structural`, but still non-mutating)

`get_ui_setting_value`:
- Input: `settingId`
- Behavior: resolve current value from backend state using registry read resolver
- Output: typed current value + mutability + value metadata
- Access type: `read`

`set_ui_setting_value`:
- Input: `settingId`, `value`, optional `revealAfterSet`
- Behavior:
  - check setting exists and is writable
  - validate/coerce value against `valueSchema`
  - persist via backend registry mutator
  - optionally trigger reveal/highlight so the user sees the changed control
- Output: old value, new value, changed flag, and reveal result (if requested)
- Access type: `write`

### 3) Add websocket contract for reveal intents
Add a new frontend websocket message type, for example `UISettingReveal`.

Backend:
- `backend/setta/types/websocket.py`
- `backend/setta/websockets/msg_handlers/frontend_sender.py`

Frontend:
- `frontend/src/state/actions/websocketReceive.ts`
- generated unions/types via `pnpm generate`

Payload should include:
- `projectConfigId`
- `chatId` (optional)
- `reveal`: reveal target descriptor
- `durationMs`
- `requestId`

Reveal target should include:
- `settingId`
- `side`
- `overviewTabKey` or `uiEditorTabName`
- `pluginId` / `paneId` when plugin-derived
- `strategy`
- `anchorId` or `pluginRevealKey`

No websocket mutation contract is required for setting writes; writes should go through backend mutators and existing state/update broadcast flows.

### 4) Frontend reveal runtime service
Implement a single reveal pipeline in frontend, for example `frontend/src/state/actions/uiSettingReveal.ts`.

Responsibilities:
- Open the correct side pane.
- Switch to the correct tab target.
- Wait for render/mount with bounded retry.
- Scroll target into view.
- Apply temporary highlight class.
- Auto-clear highlight after timeout.

Important implementation detail from current code:
- Do not call `onOverviewTabClick` / `getOnUIEditorTabClick` for reveal operations.
- Those handlers intentionally toggle panes closed when the selected tab is clicked again.
- Reveal flow should set `useLocalStorage` state directly and idempotently (`overviewVis=true`, target tab set, etc.).

Core-pane behavior:
- Left: set `overviewVis=true`, set `overviewTab` to `overviewTabKey`.
- Right: set `uiEditorVis=true`, set `uiEditorTab` for the active section type (or the section activated via `sectionIdToActivate`).

Plugin-pane behavior:
- For Overview plugin panes, set `overviewTab` to the plugin tab key.
- Delegate control-specific locate/highlight to plugin handler when strategy is `plugin_handler`.
- Return structured failure if plugin pane is unavailable in runtime.

### 4.1) Backend mutation execution model
Setting writes should not depend on frontend DOM interactions.

Execution model:
- Registry maps each `settingId` to typed backend read/write handlers.
- Core handlers call existing backend/project-manager mutation paths where possible.
- Plugin handlers are invoked only when plugin is enabled and exposes mutation capability.
- Mutators return structured results (`changed`, `oldValue`, `newValue`, `normalizedValue`).

Error model:
- `setting_not_found`
- `setting_read_only`
- `invalid_value_type`
- `invalid_value_range_or_enum`
- `plugin_unavailable`
- `mutation_failed`

### 5) Introduce setting anchors
Add stable anchor attributes in core side-pane settings UI:
- Attribute: `data-setting-anchor="<anchorId>"`
- Start with high-value settings in:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectLLMSettings.tsx`
  - `frontend/src/components/Panes/Overview/WatchCode/WatchCodePane.tsx`
  - `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`
  - right-pane settings surfaces as needed

Anchor rules:
- Anchor the semantic field container, not a transient child node.
- Keep IDs stable across refactors.
- Never derive IDs from visible copy.

### 6) Prompt guidance update
Update `backend/setta/mcp/system_prompt.md`:
- For "where is setting" tasks, call `search_ui_settings`.
- For "show/open/highlight", call `reveal_ui_setting`.
- For right-pane reveals, if no section is active, the LLM should pick an
  appropriate section and pass it as `sectionIdToActivate` to `reveal_ui_setting`.
- For "what is this setting currently", call `get_ui_setting_value`.
- For "set/change/update this setting", call `set_ui_setting_value`.
- After mutation, report exactly what changed and optionally reveal the setting when useful.

### 7) Keep AI Follow unchanged
Do not reuse AI Follow IDs for this feature:
- AI Follow is for graph entities (`section`, `codeObj`), not UI controls.
- Separate reveal/mutation contracts avoid coupling and ID-mapping complexity.

### 8) Approval/policy normalization for Setta MCP tools
This is a cross-cutting requirement for Setta MCP tools, including this settings toolset.

Execution model:
- Each external-agent adapter maps provider-specific approval policy values to one internal Setta policy.
- Mapping input: external policy value + yolo flag + whether the run has an approval channel.
- Mapping output: internal policy enum used by Setta tool execution.

Internal policy behavior:
- `allow_all`: execute all Setta MCP tools without approval prompts.
- `require_approval_for_destructive`: execute non-destructive tools directly; require approval for destructive tools.
- `deny_destructive_without_approval_channel`: execute non-destructive tools directly; reject destructive tools with structured tool failure when approval is required but unavailable.

Tool classification (v1):
- `approvalLevel=none`: default for most tools.
- `approvalLevel=destructive`: for operations such as project config deletion or section deletion.

Required yolo behavior:
- If yolo is on, internal policy resolves to `allow_all`, including destructive operations such as `delete_sections`.

User-facing behavior:
- Approval-required operations should surface as approval requests in chat when the channel exists.
- Rejections should surface as structured tool failures in chat (no separate UX surface required).

## Plugin-specific additions (current gap)

### Required extension points
To support plugin panes/settings cleanly:
1. Backend contribution hook so plugin settings metadata can enter the backend UI setting registry.
2. Frontend contribution hook for plugin reveal handlers (locate + highlight inside plugin-rendered DOM).
3. Plugin read/write hooks for plugin-owned setting values.
4. Stable plugin setting IDs namespaced by plugin ID.

Note: plugin pane registration already exists in frontend runtime. Backend now has
a v1 plugin-setting path via config-schema declarations and plugin config
persistence; richer plugin-owned runtime handlers remain follow-up work.

Current v1 contract implemented:
- Plugin settings can be declared in plugin config schema JSON under `x-setta-ui-settings`.
- Each declaration includes `settingId`, `title`, `description`, `paneId`, `revealKey`, and `configPath` (plus optional `synonyms`, `mutability`, `valueSchema`, `defaultValue`).
- Setting IDs are namespaced as `plugin::<pluginId>::<settingId>`.
- Read/write resolves through plugin config persistence (same path used by plugin config save APIs).

### Registry merge policy
- Include only enabled + runtime-healthy plugins.
- Namespace plugin setting IDs by plugin ID.
- Reject `settingId` collisions at load time with explicit errors.
- Return `source=plugin` in tool results for transparency.

### Failure handling
`reveal_ui_setting` and `set_ui_setting_value` should return structured failures:
- plugin missing
- plugin disabled
- plugin frontend not loaded / pane unavailable
- pane unavailable in current mode
- anchor not found / plugin reveal handler failed
- plugin read/write handler unavailable
- plugin mutation validation failed

### Why this is necessary
Without this abstraction, discovery/reveal/mutation logic will remain core-tab-centric and will miss plugin-contributed settings.

## Phased implementation plan

### Phase 0: Contracts and schema
- Define `UISettingEntry` schema.
- Define websocket `UISettingReveal` schema.
- Define ID/tab-key naming conventions aligned with `OverviewTabKey` and `UIEditorTabName`.
- Define value schema + mutation result/error schemas.

Deliverables:
- Schema modules and docs.
- Decision record on core + plugin setting ID policy.

### Phase 1: Core reveal + read pipeline
- Add backend core registry entries for high-value settings.
- Add websocket message + frontend reveal runtime.
- Add anchors in targeted core panes.
- Add backend read resolvers for those settings.

Deliverables:
- End-to-end discover + reveal + read for initial core settings.

### Phase 2: Core mutation tool integration
- Implement `search_ui_settings`, `reveal_ui_setting`, `get_ui_setting_value`, `set_ui_setting_value`.
- Register tools with search metadata.
- Update system prompt instructions.
- Ship core setting mutators for initial writable subset.
- Ensure these tools integrate with Setta MCP internal approval policy enforcement.

Deliverables:
- Managed and external-agent runs can discover/reveal/read/set core settings.

### Phase 3: Plugin setting integration
- Add plugin metadata contribution path into backend registry.
- Add plugin reveal handler registration in frontend runtime.
- Add plugin read/write handler registration.
- Add plugin-aware search/reveal/read/set behavior and failures.

Deliverables:
- Agents can discover/reveal/read/set plugin settings exposed in Overview plugin panes.

### Phase 4: Hardening and coverage expansion
- Expand core setting coverage.
- Finalize external-adapter -> internal approval policy mappings and destructive-operation coverage.

Deliverables:
- Production-ready reliability and broader setting + mutation coverage.

## Testing plan

### Backend (pytest)
- Registry tests:
  - ID uniqueness
  - core + plugin merge behavior
  - plugin enabled/disabled filtering
- Tool tests:
  - search ranking quality
  - reveal validation failures
  - right-pane reveal behavior with `sectionIdToActivate`
  - get-value correctness
  - set-value validation/coercion
  - read-only rejection
  - mode/policy rejection
  - internal approval policy enforcement (`none` vs `destructive`)
  - yolo bypass behavior for destructive tools (`allow_all`)
  - structured failure when destructive approval is required but no approval channel exists
  - mutation side-effect correctness
- Adapter mapping tests:
  - each supported external agent policy maps to expected internal Setta policy
- Websocket sender contract tests:
  - payload shape and required fields

Suggested locations:
- `tests/mcp/`
- `tests/websocket/`
- `tests/plugins/`

### Frontend (Vitest)
- Websocket receive path dispatches reveal actions.
- Deterministic pane-open/tab-select behavior (no toggle regressions).
- Left-pane core tab + plugin tab handling via `OverviewTabKey`.
- Right-pane behavior with and without active section.
- Highlight timing/cleanup.
- Retry behavior for delayed mounts.
- Plugin reveal handler dispatch/fallback behavior.
- UI reflects backend-driven setting changes correctly after mutation.

Suggested locations:
- `frontend/src/state/actions/*.test.ts`
- `frontend/src/components/Panes/**/*.test.tsx`
- `frontend/src/plugins/*.test.ts`

### Playwright
- Core reveal flow:
  - reveal opens pane + selects tab + highlights target + auto-clears
- Right-pane flow requiring active section selection
  - include path where the LLM picks a section and provides `sectionIdToActivate`
- Core mutation flow:
  - set value through tool path, verify setting value and UI state changed
- Plugin flow:
  - enabled plugin setting reveal succeeds
  - enabled plugin setting mutation succeeds
  - disabled/unavailable plugin setting returns expected error UX

Suggested location:
- `frontend/tests/e2e/overview/`
- `frontend/tests/e2e/overview/plugins/`

## Security and policy
- Keep discover/reveal/get tools non-mutating.
- Keep mutation tools explicitly write-scoped.
- Respect `allowLLM` and mode restrictions.
- Do not include sensitive setting values in reveal payloads.
- Treat plugin-contributed metadata as trusted only when plugin is enabled and runtime-validated.
- Enforce strict value validation before persisting writes.
- Require explicit writable allowlist by `settingId`.
- Return structured errors; do not silently coerce unsafe values.
- Enforce approval rules from normalized internal policy, not provider-specific policy strings.
- Keep destructive-tool classification explicit in tool metadata (no keyword-based inference).

## Scope boundaries
- This plan focuses on project-scoped UI settings (core + plugin-contributed).
- Global settings in `setta-settings.json` / Settings project are related architecture but out of scope for this plan's implementation phases.

## Performance and UX constraints
- O(1) lookup by `settingId`.
- Bounded DOM-query retry window.
- Query within active pane container only (avoid global scans).
- Lightweight highlight animation; honor reduced motion.
- Mutation path should avoid full project-state recomputation when a targeted update path exists.

## Acceptance criteria
1. Prompt "Where is setting X?" returns the correct pane/tab location.
2. Prompt "Show me setting X" opens the correct side pane and highlights the intended control.
3. Prompt "What is setting X?" returns the current value with correct typing.
4. Prompt "Set setting X to Y" updates the intended setting and reports the exact change.
5. Invalid set requests return clear validation errors without partial writes.
6. Highlight clears automatically.
7. Works for managed (`AgentRunner`) and external (`ExternalAgentRunner`) runs.
8. Plugin-provided settings are discoverable/revealable/readable/writable when plugin is enabled and runtime-ready.
9. New backend, frontend, and Playwright tests pass.

## Open decisions
No open decisions for current scoped plan.
