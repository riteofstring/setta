# State Machine Workflows

State-machine workflows add a second edge graph on top of the canvas. They are
for control-flow and chat orchestration, not codegen/dataflow.

The graph is stored on `ProjectConfig.stateMachineEdges` and is rendered as the
solid amber workflow-edge family documented in
`docs/reference/edge-styles.md`.

## Section types

Workflow graphs use three dedicated control-node section types plus regular Chat
sections:

- `StateMachineStart`
- `StateMachineGate`
- `StateMachineEnd`
- `Chat` as a runnable source/target node

Control-node defaults:

- Start sections default to label `Start`.
- Gate sections default to `AND` gate mode.
- End sections default to label `End`.
- Each control node carries a `machineGroupId`.

Current structure rules:

- State-machine sections are top-level only. They cannot be created as child
  sections.
- A runnable workflow draft needs exactly one Start section and at least one
  End section per `machineGroupId`.
- The UI allows incomplete drafts while editing, but Start/Gate nodes show a
  draft warning until the machine is structurally valid and can reach an End.

## Machine groups

`machineGroupId` is the workflow identity:

- Start/Gate/End nodes with the same `machineGroupId` belong to the same
  workflow.
- Each workflow edge also stores a `machineGroupId`.
- Creating a workflow edge can merge previously separate machine groups when
  the new edge connects them into one graph.

Section settings for control nodes are persisted through
`route_set_state_machine_section_settings`:

- Start: `machineGroupId`, `label`
- Gate: `machineGroupId`, `label`, `gateType`
- End: `machineGroupId`, `label`

## Edge model

Workflow edges live on `ProjectConfig.stateMachineEdges` as `StateMachineEdge`
objects.

Core fields:

- `id`
- `machineGroupId`
- `sourceSectionId` / `targetSectionId`
- fixed workflow port ids: `workflow-source` and `workflow-target`
- `sourceFilter`
- `sourceActivationCountCondition`
- `targetAction`
- UI metadata such as `hidden`, `zIndex`, and `selected`

CRUD routes:

- `Route.CREATE_STATE_MACHINE_EDGE`
- `Route.UPDATE_STATE_MACHINE_EDGE`
- `Route.DELETE_STATE_MACHINE_EDGES`
- `Route.SET_STATE_MACHINE_EDGES`

## Connection rules

Allowed source section types:

- `Chat`
- `StateMachineStart`
- `StateMachineGate`

Allowed target section types:

- `Chat`
- `StateMachineGate`
- `StateMachineEnd`

Important validation rules:

- End sections cannot be edge sources.
- Start sections cannot be edge targets.
- Non-chat self-loops are rejected.
- Chat self-loops are allowed.
- Edge endpoints must resolve to one machine group.
- Edge validation fails loudly on missing sections, invalid port ids, duplicate
  ids in bulk replacement, or incompatible machine-group wiring.

Default edge behavior on drag-connect:

- Chat sources default to `run_completed`.
- Non-chat sources default to no source filter.
- Chat targets default to `reset_thread`.
- Non-chat targets default to no target action.

## Source filters

Source filters describe when an edge can activate:

- `run_completed`
- `run_failed`
- `signal`

Signal filters support additional fields:

- `signalName`
- `payloadField`
- `equals`

Rules:

- `signalName` is required for signal filters.
- Payload matching requires both `payloadField` and `equals`.
- `sourceActivationCountCondition` is optional, but when present it must use a
  non-negative integer value with one of `lt`, `lte`, `eq`, `gte`, or `gt`.

## Target actions

Chat targets support two action families:

- `reset_thread`
- `send_prompt`

`send_prompt` requires exactly one prompt source:

- `inlinePrompt`
- `promptTemplateId`
- `promptSectionId`

Additional `send_prompt` fields:

- `promptInputs`
- `threadStrategy`
- `stopIfRunning`
- `engineConfigId`
- `agentProfileId`
- `permissionMode`
- `searchEnabled`

Validation rules:

- Saved prompt-template ids must exist.
- Prompt-template and prompt-section prompt sources must render successfully.
- Rendered prompt text must not be empty.
- `threadStrategy` can either continue the current thread or force a new thread
  before sending.

## Chat behavior inside workflows

Chat sections can act as both workflow sources and targets:

- As sources, they activate edges on terminal child-run events or on structured
  signals reported back from the child run.
- As targets, they can reset their thread state or dispatch a managed chat run
  with prompt text resolved from inline text, a saved prompt template, or a
  Prompt section.

If a target chat has signal-filtered outgoing workflow edges, the selected
agent profile must allow the `report_state_machine_signal` MCP tool. The runner
fails closed if that tool is unavailable.

## Signal reporting

Structured signal routing is part of the workflow runtime:

- The MCP tool name is `report_state_machine_signal`.
- It can only be called with active agentic context from a child run.
- Signals are recorded onto the parent workflow run and can activate
  signal-filtered edges.

The workflow run stores signal/debug state on its outputs, including:

- `signalEvents`
- `gateStatusBySectionId`
- `failureSummary`
- `machineStateCleared`

## Run lifecycle

Workflow runs are addressed by `projectConfigId` plus `machineGroupId`.

Run-control routes:

- `Route.START_STATE_MACHINE_RUN`
- `Route.STOP_STATE_MACHINE_RUN`
- `Route.RESET_STATE_MACHINE`
- `Route.GET_STATE_MACHINE_RUN`

Start requests can optionally specify `startSectionId` when a workflow needs to
launch from a particular Start node.

The frontend surfaces run control in two places:

- Start-node cards on the canvas
- the Overview pane's `Workflow Controls` accordion, which lists top-level
  Start sections with non-empty `machineGroupId`

Presentation behavior:

- Runs are stored as normal `AgentRun` records with `runType = "state_machine"`.
- Start/Gate nodes show `Idle`, `Running`, `Completed`, `Failed`, or `Stopped`
  status based on the latest workflow run.
- Gates additionally show `Waiting`, `Satisfied`, or `Blocked`, plus input
  progress derived from run outputs.
- Reset marks the latest run as `machineStateCleared`; the frontend then treats
  the workflow as having no active/latest run for presentation purposes.

## Share/deployment behavior

Workflow editing is structural and remains IDE-only:

- edge CRUD routes deny deployment-mode structural writes
- control-node settings use the layout share-policy guard
- start/stop/reset runtime-control routes remain IDE-only

Deployment runtime reads remain share-session aware:

- workflow runs in deployment mode are scoped by `shareSessionId`
- `getStateMachineRun` only returns runs belonging to the current share session

## Related docs

- `docs/reference/chat-sections.md`
- `docs/reference/edge-styles.md`
- `docs/reference/prompt-sections.md`
