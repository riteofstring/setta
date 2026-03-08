# Chat State Machines Plan

## Goal
Add first-class, backend-owned state machine support for managed Chat sections so Setta can orchestrate workflows like:

1. reset three reviewer chats to new threads,
2. fan out the same review prompt to all three,
3. wait until all three managed runs finish,
4. send a consolidation/fix prompt to a fourth chat,
5. branch on a structured `retry` vs `done` decision,
6. loop until the exit condition is reached,
7. do all of the above even when the frontend is closed.

The first version should target managed Chat sections only. The runtime should be designed so Terminal or other time-varying section types can plug in later, but they should not be implemented in v1.

## Example Workflow To Support
Example machine for the review/fix loop:

1. a `Start` control section activates the machine
2. edges from `Start` trigger reviewer chats A/B/C with `send_prompt`, using `review_template`, per-edge `review_doc_path` bindings, and `threadStrategy = new_thread_before_send`
3. reviewer chat `run_completed` outputs feed an `AND` gate
4. the `AND` gate triggers fixer chat `send_prompt` for consolidation
5. fixer chat completion can trigger a second fixer prompt on the same thread for fix/commit/cleanup
6. fixer emits `report_state_machine_signal(signalName="merge_decision", payload={"decision":"retry"|"done"})`
7. filtered fixer signal outputs feed an `XOR` gate
8. the `XOR` retry branch loops back to the reviewer chat actions
9. the `XOR` done branch reaches `End`

Important detail:
- in this example, the `AND` gate waits on child run completion,
- in this example, the retry/done decision uses an explicit structured signal,
- more generally, all gate types should be able to consume any supported standardized section output.

## Current Codebase Findings

### Chat thread reset already exists
- Managed Chat sections already persist `chatId` on `ChatSectionImpl`, and setting it to `None` means "start a new thread on next send".
- Current references:
  - `backend/setta/types/section_impls.py`
  - `backend/setta/types/helpers_lvl2.py` (`set_chat_section_chat_id`)
  - `backend/setta/project_state/base_project_manager.py`
  - `backend/setta/routers/project_manager.py`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`

This is the correct primitive for loop resets. A state machine does not need a new chat-reset mechanism.

### Managed chat dispatch is backend-capable but not reusable enough yet
- `backend/setta/routers/ai.py:route_get_llm_response` already resolves engine config, loads prior messages, handles branch/continue semantics, builds prompts, and starts either `AgentRunner` or `ExternalAgentRunner`.
- The problem is that it returns only `chatId`, not a reusable `runId`.
- A state machine runner cannot robustly orchestrate chat sections until this route logic is extracted into a shared backend service that returns both identifiers.

### Prompt templates already exist and are the right prompt asset
- Prompt templates are persisted in the workspace DB:
  - `backend/setta/types/prompt.py`
  - `backend/setta/agentic/store.py`
  - `backend/setta/routers/agentic.py`
- Rendering already exists and is deterministic:
  - `backend/setta/llm/prompt_renderer.py`
- Prompt sections exist too, but `PromptSectionImpl.inputs` is currently `dict[str, str]` and is oriented toward manual editing, not runtime bindings.

Recommendation: use `PromptTemplate` as the canonical prompt asset for state machines. Do not invent a second template system.

### Persisted run infrastructure already exists
- `AgentRun` is already the durable run record:
  - `backend/setta/types/agentic.py`
- Internal managed runs already support `start_run`, `wait_for_run`, `stop_run`:
  - `backend/setta/llm/agent_runner.py`
- External managed runs already support the same lifecycle:
  - `backend/setta/agentic/external_agent_runner.py`
- There is already an orchestrator precedent:
  - `backend/setta/agentic/run_chain.py`

This means the state machine runtime should be another `AgentRun`-backed runner, not a frontend-only feature.

### Existing run chains are useful precedent but not the right execution model
- `RunChainRunner` is sequential and request-driven.
- It does not persist a project-owned workflow definition.
- It does not support fan-out, barriers, branching, looping, or explicit machine signals.

Recommendation: remove `RunChainRunner` first, then build `StateMachineRunner` as the only orchestration runtime. Do not overload or retain `RunChainRunner` in parallel. This repo does not need backward compatibility, and carrying both runners would create two overlapping execution models for the same problem.

### Existing custom runs are not a suitable foundation
- `frontend/src/state/actions/customRuns.ts` stores custom runs in local storage.
- `frontend/src/state/definitions.ts` shows the action set is only:
  - `runCodeBlock`
  - `triggerListenerForceRefresh`
- They are not project data, not backend-owned, and not expressive enough for orchestration.

Custom runs can later become shortcuts that call "start state machine", but they should not own execution state.

### Automatic prompt queueing for chats is missing in the way this feature needs it
- `frontend/src/components/Chat/ChatInput.tsx` has local queued draft UI state, but that queue is component-local and not persisted.
- `useAIStore.pendingProjectChatPrompt` exists only for Project Chat, not Chat sections, and is still frontend state.

Conclusion: "queued prompts already exist" is not true in a backend-orchestration sense. State machines need backend-owned prompt dispatch, one prompt submission per activated state-machine action.

### Existing edge models do not fit state-machine wiring
- `ProjectConfig.edges` are codegen/dataflow edges with source and target ports:
  - `backend/setta/types/edges.py`
- `ProjectConfig.agenticEdges` are chat-scope/context links and only validate chat-related endpoints:
  - `backend/setta/types/agentic_edges.py`
  - `docs/reference/agentic-edges.md`

Neither model is a clean match for "control-flow edge between top-level control/gate sections and action-capable sections" or "typed action edge targeting a chat section". This matters for frontend design.

However, the existing chat-side agentic handle locations and input/output mental model are still useful UI precedent. The best fit is:
- reuse the same chat-side handle positions visually,
- keep `StateMachineEdge` as a separate persisted edge family from `AgenticEdge`,
- validate state-machine compatibility explicitly instead of inferring it from current agentic-edge rules.

Important distinction:
- `AgenticEdge chat_chat` remains useful for peer-chat scope and visibility,
- `StateMachineEdge chat -> chat` means runtime activation or sequencing,
- both can exist between the same two chats because they solve different problems.

### Current tagging is only color tagging
- Sections have `tagColor`, not semantic string tags:
  - `backend/setta/types/section_impls.py`
  - `frontend/src/components/Panes/UiEditor/SectionConfig/SectionTagColorSettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectOverview/ProjectOverview.tsx`

So "group state machine gates by tag" cannot be built by reusing the current tag system. If group ids are needed, they must be explicit new fields.

### Backend-owned execution already works without the frontend
- Current agent runners live under `ServerState`:
  - `backend/setta/server_state.py`
- This is the right place for state machine execution.

The important caveat is restart semantics: current agent-run execution is backend-owned, not browser-owned, but in-flight runs are still backed by in-memory tasks. V1 state machines should inherit that same limitation unless explicit run recovery is added later.

## Recommended Product Answers

### Terminology
- Gate = a top-level logical section only. In v1, gates are `AND`, `OR`, and `XOR`.
- Control section = a top-level non-logical section used to make the graph operable and readable. In v1, this should be `Start` and `End`.
- Action = a predefined operation attached to a state-machine edge that targets a section. In v1, chat actions are `send_prompt` and `reset_thread`.
- Signal = a structured event emitted by a managed run, typically through a Setta MCP tool.
- Machine = the connected state-machine graph identified by `machineGroupId`.

This keeps the word "gate" strict. Gates are logical. Actions are not gates.

### What should be the unit of configuration?
For v1, the unit of configuration should be a project-level graph made of:
- top-level `Start` / `End` control sections,
- top-level logical gate sections,
- existing Chat sections as action-capable endpoints,
- a new `stateMachineEdges` collection on `ProjectConfig`.

Each machine should be identified by an explicit `machineGroupId`, not by `tagColor`.

Why:
- it matches the desired frontend mental model exactly,
- it makes gates visible as first-class sections on the main canvas,
- it keeps chat sections reusable as workflow endpoints,
- it gives the backend a stable machine identifier for start/stop/reset.

### How many gate types are necessary?
Very few.

The minimal useful logical gate set for v1 is:
- `AND` for joins/barriers,
- `OR` for any-of triggers,
- `XOR` for mutually exclusive routed branches such as `retry` vs `done`.

Do not add file-watch gates, arbitrary code gates, or terminal/terminal-like gates in v1. `Start` and `End` are control sections, not logical gates.

### How should gates receive inputs?
Every gate input should be driven by an explicit upstream output activation.

Gate behavior should be source-agnostic:
- `AND`, `OR`, and `XOR` all consume the same kind of upstream activations,
- the only difference between those gates is how they combine the activated inputs,
- no gate type should be restricted to only completion events or only structured signals.

For Chat sections, the relevant v1 outputs are:
- `run_completed`
- `run_failed`
- filtered structured signals such as `merge_decision.retry` or `merge_decision.done`

The backend runner should convert:
- child run completion into chat output activations,
- `report_state_machine_signal(...)` events into filtered signal-output activations.

Examples of valid wiring under this model:
- an `AND` gate waiting for three `run_completed` outputs,
- an `AND` gate waiting for three explicit `review_ready` signals,
- an `XOR` gate choosing between `run_completed` and `run_failed`,
- an `XOR` gate choosing between `merge_decision.retry` and `merge_decision.done`.

Gate lifecycle should also be explicit:
- a gate is `waiting` while its rule is not yet satisfied but is still achievable in the current iteration,
- a gate is `satisfied` when its combination rule is met,
- a gate is `blocked` when its rule can no longer be satisfied in the current iteration because one or more required upstream outcomes are now impossible.

Example:
- an `AND` gate waiting for `A.run_completed`, `B.run_completed`, and `C.run_completed` becomes `blocked` if `B.run_failed` is terminal and there is no valid path in this iteration that can still produce `B.run_completed`.

Recommended runtime behavior:
- do not let unsatisfied gates hang forever once they are provably unsatisfiable,
- mark the gate as `blocked`,
- mark the machine run as `blocked` or `failed`,
- surface which inputs were still required and which upstream terminal events made the gate unsatisfiable.

In contrast, v1 should not support gates that branch on unstructured assistant prose. If a workflow needs semantic routing, it should use explicit structured signals.

### How should logic be configured?
Use typed edges plus typed target actions. Do not use arbitrary Python, arbitrary JavaScript, or heuristic file/text watchers in v1.

Each state-machine edge should define:
- `machineGroupId`
- `sourceSectionId`
- `sourcePortId`
- `targetSectionId`
- `targetPortId`
- optional `sourceFilter`
- optional `targetAction`

Allowed v1 logic sources:
- child run terminal status,
- machine iteration count,
- explicit signal payload field comparisons,
- well-known prior outputs such as `chatId` or `runId`.

### What activates the machine, and how do you reset it?
Add machine run controls keyed by `machineGroupId`:
- `Start`
- `Stop`
- `Reset`

Recommended v1 UX:
- `Start` sections provide the most obvious visible control surface,
- any gate or control section in the same `machineGroupId` can still show machine status,
- `Reset` clears machine-run state and can optionally trigger configured `reset_thread` actions.

Activation semantics should be explicit:
- activating a `Start` section calls `StateMachineRunner` for that `machineGroupId`,
- `StateMachineRunner` persists the parent machine run using `AgentRun`,
- child chat actions are spawned later through `AgentRunner` or `ExternalAgentRunner` only when state-machine edges fire.

The state machine itself should not live inside the current custom-run system.

## Recommended V1 Architecture

### Example workflow mapped to top-level sections and logical gates
The review/fix loop should look like this on the canvas:

1. a `Start` section in machine group `review-loop`
2. edges from `Start` to reviewer chats A/B/C with `send_prompt` actions using `review_template`, `threadStrategy = new_thread_before_send`, and per-edge bindings like `review_doc_path=review-a.md`
3. reviewer chat `run_completed` outputs feed an `AND` gate section
4. the `AND` gate triggers fixer chat action `send_prompt` with a consolidation prompt
5. fixer chat `run_completed` can trigger a second fixer action `send_prompt` on the same chat using `threadStrategy = continue_current_thread` for fix/commit/cleanup
6. fixer chat emits `report_state_machine_signal(signalName="merge_decision", payload={"decision":"retry"|"done"})`
7. two filtered signal outputs from fixer feed an `XOR` gate:
   - `decision == retry`
   - `decision == done`
8. the `XOR` retry branch loops back to the reviewer chat actions
9. the `XOR` done branch reaches `End`

Important detail:
- review completion waits on persisted child run state,
- retry/done routing waits on explicit structured signals,
- no heuristic file watching or prose parsing is involved.

### 1) Add top-level control and gate section types
Add new section types and impls:
- `SectionType.StateMachineStart`
- `SectionType.StateMachineGate`
- `SectionType.StateMachineEnd`

Recommended persisted fields:
- `StateMachineStartSectionImpl`
  - `machineGroupId: str`
  - `label: str`
- `StateMachineGateSectionImpl`
  - `machineGroupId: str`
  - `gateType: "AND" | "OR" | "XOR"`
  - `label: str`
  - `ui: StateMachineGateUiState`
- `StateMachineEndSectionImpl`
  - `machineGroupId: str`
  - `label: str`

Recommendation:
- use one generic gate section type with a typed `gateType` field,
- keep gate semantics logical only,
- keep `Start` and `End` as separate control sections so the graph has explicit entry and exit points.

Recommended v1 graph constraints:
- exactly one `Start` section per `machineGroupId`,
- one or more `End` sections per `machineGroupId`,
- `Start` sections may have outgoing state-machine edges only,
- `End` sections may have incoming state-machine edges only.

These constraints should be enforced by project-state validation, not treated as loose UI conventions.

### 2) Add a new project-level `stateMachineEdges` model
Add a new edge collection on `ProjectConfig`:
- `stateMachineEdges: list[StateMachineEdge]`

This should be separate from both:
- `ProjectConfig.edges`
- `ProjectConfig.agenticEdges`

Recommended `StateMachineEdge` fields:
- `id`
- `machineGroupId`
- `sourceSectionId`
- `sourcePortId`
- `targetSectionId`
- `targetPortId`
- `sourceFilter: StateMachineSourceFilter | None`
- `targetAction: StateMachineTargetAction | None`

Port guidance:
- for Chat sections, `sourcePortId` and `targetPortId` should reuse the existing input/output workflow handle positions already familiar from agentic edges,
- `StateMachineEdge` should still remain a distinct model from `AgenticEdge`,
- direct `Chat -> Chat` state-machine edges and Chat self-loops should be valid in v1 when no logical gate is needed,
- gates should be required only for actual logical combination or routing,
- persisted edge type should remain explicit even if the UI infers it during creation.

Validation should reject:
- machine groups with zero or multiple `Start` sections,
- machine groups with zero `End` sections,
- edges that cross machine groups,
- outgoing edges from `End` sections,
- incoming edges to `Start` sections,
- unsupported endpoint combinations,
- gate inputs/outputs that do not match gate semantics,
- chat targets without a valid action spec,
- non-Chat section endpoints that are not supported action/gate/control participants in v1,
- signal filters that reference unsupported fields.

This is the key architectural change that makes top-level gate sections possible.

### 3) Make Chat sections action-capable workflow endpoints
Chat sections should participate in the machine graph without becoming gates.

For v1, the runner should support these chat target actions on incoming state-machine edges:
- `send_prompt`
- `reset_thread`

Recommended `send_prompt` options:
- `promptTemplateId` or `inlinePrompt`
- typed input bindings
- `threadStrategy`
- optional `engineConfigId`
- optional `agentProfileId`
- optional `permissionMode`
- optional `searchEnabled`

Recommended `reset_thread` options:
- `stopIfRunning: bool = false`

Chat sections should also expose a minimal standardized output surface to the runner:
- `run_completed`
- `run_failed`
- signal-derived outputs resolved from structured payload filters

All gate types should consume these outputs uniformly. This keeps actions section-specific and avoids inventing arbitrary executable code.

Direct `Chat -> Chat` transitions should also be allowed in v1:
- `ChatA.run_completed -> ChatB.send_prompt` is a valid state-machine edge,
- `Chat.run_completed -> Chat.send_prompt` self-loops are valid too,
- inserting a gate should be optional and only necessary when the workflow needs logical fan-in or branch semantics.

### 4) Add a dedicated `StateMachineRunner`
Implement a new backend runner:
- `backend/setta/agentic/state_machine_runner.py`

The runner should:
- start the machine when a `Start` section is activated,
- persist a parent `AgentRun` record with `runType = "state_machine"`,
- resolve the machine graph by `machineGroupId`,
- activate outgoing edges from `Start`,
- schedule chat actions when target edges fire,
- record gate input activations and evaluate `AND` / `OR` / `XOR`,
- detect when a gate is still waiting versus blocked,
- track iterations so prior-loop completions cannot satisfy current-loop joins,
- propagate stop to active child runs,
- persist an event log and compact output snapshot.

Recommended metadata on the parent run:
- `runType = "state_machine"`
- `projectConfigId`
- `machineGroupId`
- `startSectionId`
- `machineName`

Recommended metadata added to child chat runs:
- `stateMachineRunId`
- `machineGroupId`
- `stateMachineSourceEdgeId`
- `stateMachineTargetSectionId`
- `stateMachineIteration`
- `stateMachineParentRunType = "state_machine"`

That metadata is what makes joins, loops, and signal routing deterministic.

### 5) Extract a shared managed-chat dispatch service
Refactor the current logic in `route_get_llm_response` into a backend service used by both:
- the HTTP route,
- the new state machine runner.

Recommended new return type:
- `chatId`
- `runId`
- `engineType`
- `sectionId`

Required inputs:
- `projectConfigId`
- `sectionId`
- `message`
- `engineConfigId`
- `agentProfileId`
- `threadStrategy`
- `continueFromChatId`
- `branchParentChatId`
- `branchFromMessageId`
- `permissionMode`
- `searchEnabled`
- `frontendAffinityToken` when relevant

Thread strategy should be explicit:
- `continue_current_thread`
- `new_thread_before_send`
- `continue_from_chat_id`
- `branch_edit`

Do not make the state machine fake a frontend request. The runner should call the shared service directly.

### 6) Reuse prompt templates and add typed prompt bindings
Each `send_prompt` action should reference either:
- `promptTemplateId`, plus typed input bindings, or
- `inlinePrompt` for one-off cases.

Recommended v1 default: prefer `promptTemplateId`.

Recommended binding sources:
- literal value,
- machine constant,
- machine run metadata (`iteration`, `stateMachineRunId`),
- prior action output (`chatId`, `runId`),
- prior signal payload field.

This is enough to support examples like:
- the same review template with different output doc paths per reviewer,
- fixer prompts that include the known review-doc paths,
- loop-specific iteration numbers.

### 7) Add an explicit signal tool and filtered signal outputs
Add a new Setta MCP tool, for example:
- `report_state_machine_signal(signalName, payload, machineRunId=None, sectionId=None)`

Recommended behavior:
- state-machine child runs register ownership metadata,
- the tool resolves the owning machine context from the active run if ids are omitted,
- the tool appends a structured event to the parent machine run,
- matching source filters on outgoing chat edges are evaluated,
- resulting filtered outputs activate downstream gates.

This is better than heuristics because it avoids:
- keyword matching,
- file-appearance ambiguity,
- parsing assistant prose.

Important tool-allowlist note:
- completion reporting is currently treated as a required internal tool in managed/external runner allowlists,
- state-machine signaling should follow the same pattern if a machine edge depends on it,
- otherwise a profile/tool-allowlist mismatch can deadlock the machine.

### 8) Prefer `new_thread_before_send` over separate reset edges when immediate prompting follows
If a loop step should both clear the thread and immediately prompt the chat:
- prefer `send_prompt` with `threadStrategy = new_thread_before_send`.

Keep `reset_thread` as a separate action only when a machine truly needs a standalone reset without an immediate prompt.

### 9) Sequential prompts to the same chat should be explicit edges
Do not build v1 around a hidden chat prompt queue.

If the same chat should receive multiple prompts in order:
- represent them as separate `send_prompt` actions on separate edges,
- use `continue_current_thread` when they should remain on the same thread.

This keeps the workflow inspectable and avoids inventing a second queuing subsystem.

### 10) Multiple machines should be grouped explicitly
Multiple machines in one project should be represented by:
- separate `machineGroupId` values,
- separate connected components of gate/control sections and state-machine edges.

Do not reuse `tagColor` for this.

## Frontend Plan

### Canvas model
Add top-level control sections and logical gate sections to the main canvas:
- `Start`
- `End`
- gate sections with `AND`, `OR`, `XOR`

Chat sections remain ordinary sections, but they need visible workflow ports so state-machine edges can connect to them.

Recommended v1 UI detail:
- reuse the same left/right handle locations already used for agentic links on Chat sections,
- keep state-machine edges as a separate selectable/rendered edge family,
- allow non-Chat sections to keep their existing agentic handles without implying they are valid state-machine participants.

### Edge model and editing
Add a dedicated state-machine edge layer, rendered separately from:
- regular code/data edges,
- agentic edges.

Each edge inspector should support:
- machine group selection,
- source port selection,
- target port selection,
- chat action configuration when the target is a chat section,
- signal filter configuration when the source is a chat section.

Recommended creation-time inference rules:
- if an edge touches `Start`, `Gate`, or `End`, infer `StateMachineEdge`,
- if a user draws a Chat self-loop in workflow mode, infer `StateMachineEdge`,
- plain `Chat -> Chat` drawing is ambiguous between `AgenticEdge chat_chat` and `StateMachineEdge`, so the UI should require explicit mode or an explicit choice at creation time.

This should be canvas-native, not an embedded graph editor inside one section.

### Status and controls
Recommended v1 UX:
- `Start` sections show `Start`, `Stop`, and `Reset`,
- gate sections show machine-group status badges, including `waiting` and `blocked`, plus recent activity,
- chat sections can show small badges when a machine run is currently targeting them.

This gives each machine a visible control surface without adding a synthetic "machine summary" section.

## Backend API Plan

Add run-control routes in `backend/setta/routers/agentic.py`:
- `start_state_machine_run`
- `stop_state_machine_run`
- `reset_state_machine`
- `get_state_machine_run`

Recommended run-control inputs:
- `projectConfigId`
- `machineGroupId`
- optional `startSectionId`

The `start_state_machine_run` route should start `StateMachineRunner`, not `AgentRunner`. `AgentRunner` remains a child-run primitive used only when the state machine dispatches a chat action.

Add project-state CRUD for state-machine edges in the project-manager layer:
- `create_state_machine_edge`
- `update_state_machine_edge`
- `delete_state_machine_edges`
- `set_state_machine_edges`

Keep `getAgentRuns` as the initial source for UI status. Add filtered machine-run listing only if the global run list becomes too noisy or expensive.

Add a shared managed chat dispatch module, for example:
- `backend/setta/agentic/managed_chat_dispatch.py`

Add the signal MCP tool under:
- `backend/setta/mcp/tools/agentic_tools.py`

Wire the new runner into:
- `backend/setta/server_state.py`

## Data Model And File Blast Radius

Primary backend files likely to change:
- `backend/setta/types/section_impls.py`
- `backend/setta/types/project_config.py`
- new `backend/setta/types/state_machine_edges.py` (or equivalent)
- `backend/setta/types/agentic.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/routers/project_manager.py`
- `backend/setta/routers/ai.py`
- `backend/setta/routers/agentic.py`
- `backend/setta/server_state.py`
- `backend/setta/agentic/state_machine_runner.py` (new)
- `backend/setta/agentic/run_chain.py` (remove)
- `backend/setta/mcp/tools/agentic_tools.py`

Primary frontend files likely to change:
- `frontend/src/state/actions/sections/createSectionsHelper.ts`
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
- `frontend/src/components/Panes/UiEditor/SectionConfig/SectionConfig.tsx`
- new control/gate layout components under `frontend/src/components/Section/Layouts/`
- new state-machine settings components under `frontend/src/components/Panes/UiEditor/SectionConfig/`
- edge rendering/editor files for the new state-machine edge layer
- `frontend/src/forks/xyflow/controls/Controls.tsx`
- `frontend/src/components/Panes/Overview/RunInstructions.tsx` (optional later integration)

Cross-cutting "new section type" files that must not be missed:
- generated frontend/backend types after `pnpm generate`
- `backend/setta/ui_settings/section_ui_editor_tab_compatibility.json`
- `tests/ui_settings/test_section_ui_editor_tab_compatibility.py`
- `frontend/src/utils/constants.ts`
- `frontend/src/utils/constants.test.ts`
- `tests/types/test_section_defaults.py`

Codegen policy note:
- `StateMachineStart`, `StateMachineGate`, and `StateMachineEnd` should not be included in default section-codegen allowlists.
- Representation should likely be `expression` only, unless a later export/use case proves otherwise.

## Testing Plan

### Backend
Add focused tests for:
- `Start` / `Gate` / `End` section defaults and type registration,
- `stateMachineEdges` validation,
- start/stop/reset lifecycle,
- shared chat dispatch returning both `chatId` and `runId`,
- fan-out scheduling from `Start`,
- `AND` waiting for all required child completions,
- `AND` transitioning to `blocked` when a required completion becomes impossible,
- `OR` and `XOR` semantics,
- `OR` / `XOR` blocked behavior when their rules become unsatisfiable,
- chat `reset_thread` clearing `chatId`,
- chat `send_prompt` with `new_thread_before_send`,
- signal delivery to the right machine run,
- filtered signal-output routing,
- loop execution over multiple iterations,
- cancellation propagation to active child runs,
- fail-closed behavior when a required signal tool is unavailable,
- copy/delete/remap behavior for `stateMachineEdges`,
- refusal to use unsupported section action providers in v1.

Likely test directories:
- `tests/agentic/`
- `tests/project_state/`
- `tests/types/`
- `tests/routers/`

### Frontend Vitest
Add tests for:
- `Start` / `Gate` / `End` rendering and status states,
- blocked-gate status rendering,
- section settings editing helpers,
- state-machine edge validation UI,
- start/stop/reset button behavior,
- machine-group status rendering,
- chat workflow port rendering and edge-action editing.

### Playwright
Add at least one UI flow covering:
- create `Start`, `AND`, `XOR`, and `End` sections,
- wire them to reviewer/fixer chats,
- configure edge actions and signal filters,
- start the machine,
- observe status/log changes,
- stop/reset from the machine controls.

Deep orchestration assertions should stay mostly in backend tests unless a deterministic chat-run fixture is added for end-to-end state-machine execution.

## Delivery Phases

### Phase 0: Remove `RunChainRunner`
- delete `backend/setta/agentic/run_chain.py`,
- remove `run_chain_runner` wiring from server state and API routes,
- remove `RunChainSpec` / `RunChainStep` if nothing else needs them,
- remove unused frontend generated route usage for run chains and regenerate bindings,
- delete or replace `tests/agentic/test_run_chain.py`,
- confirm no product UI depends on run-chain endpoints before proceeding.

This should be done first so the codebase has one clear orchestration direction before the new runner lands.

### Phase 1: Type registration and section shell
- add `SectionType.StateMachineStart`,
- add `SectionType.StateMachineGate`,
- add `SectionType.StateMachineEnd`,
- add `ProjectConfig.stateMachineEdges`,
- add state-machine edge CRUD routes and request types,
- update section creation, section rendering, and section settings routing,
- run generation and fix new-section compatibility tests.

### Phase 2: Validation and canvas editing
- add validation for machine groups, endpoint combinations, gate semantics, source filters, and target actions,
- ship canvas-native edge editing UI,
- expose workflow ports on chat sections and control sections.

### Phase 3: Backend runner skeleton
- add `StateMachineRunner`,
- add run-control routes,
- persist machine runs in `AgentRun`,
- show machine run status on `Start` and gate sections.

### Phase 4: Shared chat dispatch and chat actions
- extract `route_get_llm_response` logic into a shared service,
- return both `chatId` and `runId`,
- implement `send_prompt`,
- implement `reset_thread`.

### Phase 5: Completion and logical gate evaluation
- schedule multiple ready edges in parallel,
- activate chat `run_completed` / `run_failed` outputs,
- implement `AND` / `OR` / `XOR`,
- implement gate `waiting` / `blocked` detection,
- attach child-run metadata to parent machine runs.

### Phase 6: Explicit signals and loop routing
- add `report_state_machine_signal`,
- add filtered signal-output routing,
- support `XOR` retry/done loops,
- add machine-event log UI.

### Phase 7: Looping polish and convenience integration
- add iteration guardrails and max-iteration support,
- add better failure summaries,
- optionally expose machine controls from Run Instructions or custom-run shortcuts.

## Deferred / Non-Goals For V1
- arbitrary Python/JavaScript conditions,
- arbitrary file-watch gates,
- keyword matching against assistant text,
- terminal/code section executors,
- backend restart recovery for in-flight machine runs,
- support for non-Chat action targets,
- reusing the current local queued-draft UI as the automation substrate.

## Bottom Line
The right first implementation is:
- remove `RunChainRunner` so there is only one orchestration runtime,
- add top-level `Start` / `End` control sections plus top-level logical gate sections,
- add a project-level `stateMachineEdges` graph keyed by `machineGroupId`,
- a dedicated `StateMachineRunner`,
- shared backend managed-chat dispatch,
- chat actions attached to edges (`send_prompt`, `reset_thread`),
- logical gating through `AND` / `OR` / `XOR`,
- explicit MCP-based machine signals,
- prompt-template reuse with typed bindings,
- runtime persistence in `AgentRun`, not frontend local state,
- no heuristics and no arbitrary programmable gates in v1.

That design cleanly supports the review/fix/retry example, matches the requested canvas model, and leaves a clear path toward future terminal support and richer section-specific action targets.
