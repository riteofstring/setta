# Branch Intent

Compared against `main` at merge base `11cce61097bafc6845cdbbea53934a1674ee0f99`.

## Features

### 1. Project-backed workflows/state machines replace the old run-chain path

- What changed: before this branch, the backend exposed generic `startRunChain` and `stopRunChain` behavior and there was no project-authored workflow graph. After this branch, workflows are authored directly in project state as `StateMachineStart`, `StateMachineGate`, and `StateMachineEnd` sections plus `ProjectConfig.stateMachineEdges`, and they run through dedicated `startStateMachineRun`, `stopStateMachineRun`, `resetStateMachine`, and `getStateMachineRun` routes backed by `StateMachineRunner`.
- Why this appears intentional: `backend/setta/agentic/run_chain.py` and its tests are removed, `backend/setta/server_state.py` now instantiates `StateMachineRunner`, and both managed and external child-run completion paths are wired into it. The diff also adds new route types, persisted models, UI, frontend actions, and large route/E2E coverage.
- Files/endpoints/components involved: `backend/setta/agentic/state_machine_runner.py`, `backend/setta/server_state.py`, `backend/setta/routers/agentic.py`, `backend/setta/routers/project_manager.py`, `backend/setta/types/routes.py`, `backend/setta/types/state_machine_edges.py`, `backend/setta/types/section_impls.py`, `backend/setta/types/project_config.py`, `frontend/src/state/actions/stateMachineEdges.ts`, `frontend/src/state/actions/stateMachineRuns.ts`, `frontend/src/components/Section/Layouts/StateMachineNodeArea.tsx`, `frontend/tests/e2e/sections/state-machine-sections.spec.ts`.
- Default-value and flow details: workflow runs now surface as normal `AgentRun` rows with `runType: "state_machine"` and are keyed by project plus `machineGroupId`; starting a machine while its latest run is still running is intentionally idempotent and returns the existing run instead of spawning a duplicate.
- Reviewer guardrail: do not "simplify" this back to a generic run-spec API or treat the new workflow model as just a UI wrapper over ad hoc chain execution. The branch intent is that workflows are first-class persisted project structure.

### 2. Workflow sections and workflow edges are first-class canvas/editor UX

- What changed: before this branch, there were no workflow-specific node types, handles, or edge inspector. After this branch, workflow nodes can be created from the section menu, render with dedicated layouts/icons/status badges, expose dedicated workflow ports, and selecting a single workflow edge opens a purpose-built inspector in the UI editor instead of ordinary section config.
- Why this appears intentional: new section types were added end to end, the UI editor compatibility map was updated, new edge renderer/styles/docs were added, and there is targeted Vitest and Playwright coverage for authoring, editing, and run controls.
- Files/endpoints/components involved: `frontend/src/state/actions/sections/createSectionsHelper.ts`, `frontend/src/components/Section/Header/HeaderIcon.tsx`, `frontend/src/components/Section/Container/StateMachineEdgeHandles.tsx`, `frontend/src/components/Section/Container/ChatSharedEdgeHandles.tsx`, `frontend/src/components/Section/Layouts/StateMachineNodeArea.tsx`, `frontend/src/components/Panes/UiEditor/SectionConfig/StateMachineSectionSettings.tsx`, `frontend/src/components/Panes/UiEditor/StateMachineEdgeInspector.tsx`, `frontend/src/components/Panes/UiEditor/UiEditor.tsx`, `backend/setta/ui_settings/section_ui_editor_tab_compatibility.json`, `docs/reference/edge-styles.md`.
- Default-value and flow details: state-machine sections are top-level only; Start defaults to label `Start`, End defaults to `End`, Gate defaults to `AND`; the Overview pane now has a dedicated "Workflow Controls" accordion ahead of custom runs; selected workflow edges intentionally route the right pane into edge editing instead of section editing.
- Reviewer guardrail: do not collapse workflow editing back into generic edge/section editing. The explicit node layout, inspector, run controls, and top-level-only authoring model are part of the intended product surface.

### 3. Workflow edges can drive chat orchestration, not just static control flow

- What changed: before this branch, there was no persisted workflow edge model for chats. After this branch, workflow edges can connect Start/Gate/Chat/End nodes, filter chat outputs by `run_completed`, `run_failed`, or structured `signal`, optionally gate by zero-indexed source activation count, and perform chat-target actions such as `send_prompt` or `reset_thread`.
- Why this appears intentional: the backend adds strict validators for allowed endpoint types, port ids, signal payload filters, prompt source requirements, and thread/reset behavior; the frontend inspector exposes all of those settings; tests cover prompt-template, prompt-section, inline-prompt, signal, retry-loop, and gate-count cases.
- Files/endpoints/components involved: `backend/setta/types/state_machine_edges.py`, `backend/setta/types/helpers_lvl2.py`, `backend/setta/agentic/state_machine_runner.py`, `backend/setta/mcp/tools/agentic_tools.py`, `backend/setta/mcp/server.py`, `frontend/src/components/Panes/UiEditor/StateMachineEdgeInspector.tsx`, `frontend/src/state/actions/stateMachineEdges.ts`, `tests/types/test_state_machine_edges.py`, `tests/routers/test_state_machine_run_routes.py`.
- Default-value and flow details: creating a workflow edge from a Chat source defaults its source filter to `run_completed`; creating a workflow edge into a Chat target defaults its target action to `reset_thread`; if the action is switched to `send_prompt`, the prompt source must be exactly one of inline prompt, prompt template, or prompt section, and thread strategy defaults to `continue_current_thread`.
- Reviewer guardrail: do not prune this back to completion-only edges or inline-prompt-only dispatch without a new decision. The branch explicitly supports signal-driven branches, retry loops, prompt bindings, and per-edge execution overrides.

### 4. Prompt sections can link to prompt templates by id and can be edited directly in-canvas

- What changed: before this branch, picking a prompt template effectively copied template text and format into the prompt section, and prompt sections did not expose the new linked-source behavior. After this branch, prompt sections can store `promptTemplateId`, resolve live template text and format from the prompt-template store, show linked-source warnings and notes, offer "Make Local Copy" to detach, and render a Template/Preview tabbed editor directly in the section body.
- Why this appears intentional: the branch adds a new `setPromptTemplateLink` route, a shared prompt-resolution helper on both backend and frontend, direct section-body editor coverage, and regression tests proving linked sections read live saved template text rather than stale copied snapshots.
- Files/endpoints/components involved: `backend/setta/project_state/base_project_manager.py`, `backend/setta/routers/project_manager.py`, `backend/setta/project_state/project_manager_types.py`, `backend/setta/types/prompt_section_resolution.py`, `frontend/src/components/Panes/UiEditor/SectionConfig/PromptSettings.tsx`, `frontend/src/components/Section/Layouts/PromptArea.tsx`, `frontend/src/utils/promptSectionSource.ts`, `frontend/tests/e2e/sections/prompt-section.spec.ts`.
- Default-value and flow details: selecting a template in section settings now links by id instead of eagerly copying content; detaching preserves the currently resolved live template snapshot in the section; linked prompt sections are intentionally read-only in the section body until the link is removed.
- Reviewer guardrail: do not revert prompt-template selection back to copy-on-apply behavior unless the product decision changes. The new source of truth is the linked prompt template when `promptTemplateId` is present.

## Bug Fixes

### 1. Linked prompt consumers now resolve live saved template content instead of stale snapshots

- What changed: before this branch, consumers that read prompt section text could accidentally use the section's stored snapshot even after the underlying prompt template changed. After this branch, dependency graph/codegen, agentic context extraction, workflow prompt dispatch, and unlinking logic all resolve live prompt-template text and format through `promptTemplateId`.
- Why this appears intentional: a shared resolver was added and called from multiple subsystems, and tests assert that updated saved template text wins over stale section snapshots.
- Files/endpoints/components involved: `backend/setta/types/prompt_section_resolution.py`, `backend/setta/agentic/agentic_context.py`, `backend/setta/code_gen/dependency_graph.py`, `backend/setta/agentic/state_machine_runner.py`, `backend/setta/project_state/base_project_manager.py`, `tests/code_gen/test_dependency_graph_prompt.py`, `tests/agentic/test_agentic_context_payload.py`.
- Reviewer guardrail: any future logic that reads prompt section text must go through prompt-section resolution when the section is linked. Do not reintroduce direct reads from `PromptSectionImpl.template` for linked sections.

### 2. Managed chat history now reacts correctly to workflow-driven thread changes

- What changed: before this branch, workflow or external managed activity could leave a chat section stuck in History view or showing stale current-thread data. After this branch, History auto-closes when the managed chat binding changes or when the current thread starts responding again, and the current thread reloads when matching run updates land for the same section, chat id, and run type.
- Why this appears intentional: the branch adds dedicated `shouldExitManagedChatHistory` and `getManagedChatRunRefreshKey` helpers, component tests, and Playwright coverage for workflow-resumed threads.
- Files/endpoints/components involved: `frontend/src/components/Section/Layouts/ChatArea.tsx`, `frontend/src/components/Section/Layouts/ChatArea.test.tsx`, `frontend/tests/e2e/chat/chat-composer-controls.spec.ts`.
- Reviewer guardrail: do not assume only local clicks change the active managed thread. Workflow-driven run updates must continue to pull the section back to the live conversation automatically.

### 3. Workflow child dispatch now flushes queued project-state writes before reading chat settings

- What changed: before this branch, a workflow child dispatch could read stale backend project state if section updates were still queued, which could make freshly configured chat settings invisible to the child run. After this branch, `StateMachineRunner` explicitly calls `finish_pending_operations()` before resolving project state for managed child dispatch.
- Why this appears intentional: there is an inline comment explaining the stale-state failure mode and a route test covering it.
- Files/endpoints/components involved: `backend/setta/agentic/state_machine_runner.py`, `tests/routers/test_state_machine_run_routes.py`.
- Reviewer guardrail: do not remove this flush as "extra" backend work. Workflow child dispatch is meant to see the latest persisted chat configuration, not a stale snapshot.

### 4. Workflow validation now fails in the right places instead of over-blocking edits or under-validating runs

- What changed: before this branch, there was no workflow-specific validation split. After this branch, CRUD and config routes allow incomplete draft machine groups while users are still laying out nodes and edges, but run start still rejects missing machine groups, missing End sections, multiple Start sections, and incompatible reused chat histories.
- Why this appears intentional: helper validation, node warning UI, router behavior, and tests all encode the edit-time-versus-run-time split.
- Files/endpoints/components involved: `backend/setta/types/helpers_lvl2.py`, `frontend/src/state/actions/stateMachineDraftValidation.ts`, `frontend/src/components/Section/Layouts/StateMachineNodeArea.tsx`, `tests/routers/test_state_machine_edge_routes.py`, `tests/routers/test_state_machine_run_routes.py`.
- Reviewer guardrail: do not "fix" warning-producing drafts by making canvas edits impossible, and do not make runtime start permissive again. The intent is permissive drafting plus strict execution validation.

## Intentional Behavior Changes To Preserve

### 1. Workflow nodes are a distinct section family and are top-level only

- Before this branch, Start, Gate, and End nodes did not exist.
- After this branch, `StateMachineStart`, `StateMachineGate`, and `StateMachineEnd` are real section types with their own defaults, icons, layouts, sizing policy, create-menu entries, section-config UI, and top-level-only restriction.
- Files/endpoints/components involved: `backend/setta/types/section_impls.py`, `backend/setta/types/core.py`, `frontend/src/state/actions/sections/createSectionsHelper.ts`, `frontend/src/components/Section/Header/HeaderIcon.tsx`, `frontend/src/components/Section/Layouts/StateMachineNodeArea.tsx`.
- Reviewer guardrail: do not make these child-capable or fold them back into generic `Group` or `ListRoot` semantics without a new design decision.

### 2. Workflow edges and agentic edges are intentionally separate families

- Before this branch, only codegen/data edges and agentic edges mattered.
- After this branch, workflow edges live in `ProjectConfig.stateMachineEdges`, use separate handles, renderer, routes, and validation, and state-machine nodes are explicitly rejected as agentic-edge endpoints.
- Files/endpoints/components involved: `backend/setta/types/helpers_lvl2.py`, `frontend/src/state/actions/agenticEdges.ts`, `frontend/src/state/actions/stateMachineEdges.ts`, `frontend/src/forks/xyflow/core/container/StateMachineEdgeRenderer.tsx`.
- Reviewer guardrail: do not let agentic edges connect to state-machine nodes or merge the two edge models accidentally in later cleanup and refactors.

### 3. Chat-to-chat drag behavior is intentionally mode-based when both edge families are valid

- Before this branch, chat-to-chat drag only created agentic relationships.
- After this branch, chat nodes expose shared handles; if a chat-to-chat drag could be either agentic or workflow, the app chooses based on persisted `chatSharedEdgeMode`. The default is `agentic`, but users can toggle the mode in canvas controls. If only one family is valid, that family wins regardless of mode.
- Files/endpoints/components involved: `frontend/src/components/Section/Container/ChatSharedEdgeHandles.tsx`, `frontend/src/state/actions/chatSharedEdges.ts`, `frontend/src/state/actions/chatSharedHandleIds.ts`, `frontend/src/forks/xyflow/controls/Controls.tsx`, `frontend/src/state/definitions.ts`.
- Reviewer guardrail: do not "simplify" ambiguous chat-to-chat connections back to agentic-only behavior. The explicit mode toggle is intentional.

### 4. Workflow machine groups can merge on connection

- Before this branch, separate machine groups had no workflow merge behavior.
- After this branch, creating a workflow edge between compatible sections can merge previously separate machine groups, and the chosen edge `machineGroupId` becomes canonical across connected workflow sections and edges.
- Files/endpoints/components involved: `backend/setta/types/helpers_lvl2.py`, `frontend/src/state/actions/stateMachineEdges.ts`, `tests/types/test_state_machine_edges.py`, `tests/routers/test_state_machine_edge_routes.py`.
- Reviewer guardrail: do not treat every machine-group mismatch as a hard rejection in creation paths. Connected-machine merge behavior is deliberate and backed by tests.

### 5. Workflow runs are authoritative by machine group, and reset means "treat latest run as cleared/idle"

- Before this branch, there was no machine-group-scoped latest-run flow.
- After this branch, run controls and node badges select the latest `state_machine` run by project plus `machineGroupId`; `reset` can stop active children, clear chat state, mark the latest run as `machineStateCleared`, and the UI then renders the machine as idle rather than "stopped forever."
- Files/endpoints/components involved: `backend/setta/agentic/state_machine_runner.py`, `frontend/src/state/actions/stateMachineRuns.ts`, `frontend/src/components/Section/Layouts/stateMachineNodePresentation.ts`, `frontend/src/components/Section/Layouts/StateMachineNodeArea.tsx`.
- Reviewer guardrail: do not interpret a reset-cleared run as still-active machine state for badges, controls, or polling.

### 6. Managed chat submission now returns structured dispatch metadata, not just a chat id string

- Before this branch, `/getLLMResponse` returned only the chat id.
- After this branch, managed chat dispatch is centralized in `ManagedChatDispatcher`, and the route returns `chatId`, `runId`, `engineType`, and `sectionId`. Workflow child dispatch, run tracking, and frontend submit flows now depend on that structured response.
- Files/endpoints/components involved: `backend/setta/agentic/managed_chat_dispatch.py`, `backend/setta/routers/ai.py`, `frontend/src/state/actions/ai.ts`, `frontend/src/state/actions/aiSubmitMessage.test.ts`, `frontend/src/state/actions/aiWebsocketAffinitySubmit.test.ts`.
- Reviewer guardrail: do not collapse this response contract back to a bare string or bypass the shared dispatcher in follow-up branches.

### 7. Edge styling is intentionally simplified to family-level meaning

- Before this branch, a reviewer could reasonably expect different visual styles for different agentic kinds or workflow action and filter subtypes.
- After this branch, the style rules are intentionally family-level only: codegen/data edges are thin gray, agentic edges are dashed blue, workflow edges are solid amber, and selected/running/missing overlays are the only major visual modifiers. Workflow `send_prompt` versus `reset_thread`, signal filters, and agentic kind subtypes are not supposed to have distinct stroke styles.
- Files/endpoints/components involved: `docs/reference/edge-styles.md`, `docs/reference/ai-follow.md`, `frontend/src/forks/xyflow/core/styles/style.css`, `frontend/src/forks/xyflow/core/container/StateMachineEdgeRenderer.tsx`.
- Reviewer guardrail: do not "restore" subtype-specific edge styling in follow-up review unless a new visual design decision is made.

### 8. Workflow child runs now carry parent run id into MCP and tool context, and child chats can report structured workflow signals

- Before this branch, agentic context carried project, chat, and section scope but not child run id, and there was no workflow signal-report tool.
- After this branch, `runId` is threaded through managed and external runner context headers and MCP resolution, and `report_state_machine_signal` lets a child chat report structured signals back into its parent workflow.
- Files/endpoints/components involved: `backend/setta/llm/agent_runner.py`, `backend/setta/agentic/external_agent_runner.py`, `backend/setta/mcp/agentic_context_headers.py`, `backend/setta/mcp/server.py`, `backend/setta/mcp/tools/agentic_tools.py`, `backend/setta/agentic/state_machine_signals.py`.
- Reviewer guardrail: do not remove `runId` propagation from agentic context or signal-report tool access. Workflow signal routing depends on it.
