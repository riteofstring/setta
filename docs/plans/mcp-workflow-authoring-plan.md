# MCP Workflow Authoring Plan

Date: 2026-07-06

## Scope

This plan defines the target architecture for AI-authored workflows in Setta.
Users should be able to ask an agent to construct, validate, save, and run
workflows from inside Setta and from external agent harnesses while Setta is
running.

The current in-app Codex integration uses codex app-server dynamic tools for
Setta-owned actions. That surface is not the long-term workflow-authoring
interface.

## Compatibility Policy

This work is a clean break from workflow-authoring dynamic tools.

Do not add:

- backward compatibility paths
- legacy support
- migrations
- transitional adapters
- dual-read or dual-write behavior
- old-field aliases
- silent fallback behavior
- dynamic-tool shims that proxy workflow-authoring requests to MCP

If existing dynamic-tool code becomes obsolete for workflow authoring, remove
it. Do not preserve it behind feature flags or compatibility wrappers.

The only dynamic-tool behavior that may remain is behavior that is still part
of a separate runtime contract, such as workflow node result reporting, and only
if it is not being used as a workflow-authoring interface. If that behavior is
also replaced by MCP, remove the old dynamic-tool path in the same change.

## Recommendation

Use MCP as the canonical agent-facing workflow-authoring surface.

The backend workflow service remains the authority for persistence, validation,
execution, and app state updates. MCP is the tool boundary that agents use to
access that authority.

```text
In-app Codex
External agents: Codex CLI, Claude Code, OpenCode, OpenHands, and others
        |
        v
Setta local MCP server
        |
        v
Workflow tool facade
        |
        v
Workflow backend API / orchestrator
        |
        v
Persisted workflow definitions, validation, executions, and UI events
```

Do not make codex app-server dynamic tools part of the workflow-authoring
runtime architecture.

## Design Principles

MCP is the public agent contract. Any harness that can connect to MCP should be
able to author workflows without knowing about codex app-server internals.

The backend owns workflow correctness. Agents must not write
`.setta/workflows/*.json` directly as the primary path. MCP tools must call the
same backend-owned create, update, validate, and start logic used by Setta's UI.

Keep the tool surface small. Agents should operate on typed workflow drafts or
whole graph updates, then call validation. Do not expose every internal graph
mutation as a separate public tool.

Prefer deterministic contracts over prompt conventions. Schema, validation
diagnostics, capabilities, and saved definitions should come from typed API
responses, not from agent-invented JSON conventions.

## MCP Surface

Expose a focused set of tools:

```text
workflow.get_current_workspace
workflow.get_schema
workflow.list_definitions
workflow.read_definition
workflow.validate
workflow.save_definition
workflow.start
workflow.get_run
```

`workflow.save_definition` should handle both create and update with an explicit
request shape. It should validate the graph before saving and return validation
diagnostics when invalid.

Expose MCP resources only where they reduce repeated tool calls:

```text
workflow://schema/latest
workflow://node-types
workflow://templates
workflow://current-workspace
workflow://workflows/{id}
```

The schema and resource content must be generated from Go-owned workflow and
HTTP API contracts. Do not maintain hardcoded TypeScript or prompt-only mirrors.

## In-App Codex

In-app Codex should use the same MCP server as external agents.

```text
In-app Codex -> MCP -> workflow tool facade -> workflow backend
```

Do not keep codex app-server dynamic tools as a workflow-authoring fallback.
If the current in-app Codex path cannot use MCP for workflow authoring, update
that path to use MCP directly and remove the workflow-authoring dynamic tools.

Codex app-server remains relevant as the host protocol for chat, approvals,
streaming, and thread lifecycle. It should not own the workflow-authoring tool
contract.

## Workflow Tool Facade

Add a shared backend-facing facade for workflow authoring operations:

```text
CurrentWorkspace()
GetWorkflowSchema()
ListWorkflowDefinitions()
ReadWorkflowDefinition()
ValidateWorkflowGraph()
SaveWorkflowDefinition()
StartWorkflowExecution()
ReadWorkflowRun()
```

The MCP server should call this facade. Renderer UI and backend HTTP handlers
may continue calling the workflow service directly unless sharing the facade
reduces duplication without weakening ownership boundaries.

The facade must not bypass validation, ID generation, workspace resolution,
auth, app events, or existing workflow service invariants.

## Security And Permissions

The MCP server must require local runtime authorization. Use the existing
runtime auth and pairing model where possible.

Tool calls that mutate workflow definitions or start executions should be
auditable. Audit records should include the authenticated device/session, tool
name, workspace ID, affected definition ID, validation result, and execution ID
when applicable.

Workflow authoring is workspace mutation. Treat save and start operations as
write-capable tools, not read-only context.

## Implementation Phases

### Phase 1: Define The MCP Contract

Define the MCP tool and resource contracts around the existing workflow service.
Generate schema content from Go-owned contracts and value sets.

Remove any workflow-authoring dynamic-tool plan or code path from the target
architecture.

### Phase 2: Build The Local MCP Server

Run a local MCP server from Setta while the app/runtime is running.

The server should authenticate requests, expose the workflow tools/resources,
and call the workflow backend through the facade. Tool responses should return
typed data and validation diagnostics instead of prose-only summaries.

### Phase 3: Move In-App Codex To MCP

Update the in-app Codex workflow-authoring path to use MCP. Remove
workflow-authoring dynamic tools in the same change.

Do not add a compatibility bridge from dynamic tools to MCP.

### Phase 4: Remove Obsolete Dynamic Tool Code

Delete dynamic-tool definitions, handlers, tests, and prompt instructions that
exist only for workflow authoring.

Keep only dynamic-tool code that is still required for non-authoring runtime
contracts. If workflow result reporting moves to MCP, remove the old
`workflow_result` dynamic tool at the same time.

## Verification

This work touches chat behavior, Codex harness behavior, workflow authoring,
provider protocol handling, generated contracts, renderer workflow state, and
event streaming. Deterministic end-to-end Electron workflow coverage through
production main, preload, renderer, HTTP, store, and workflow paths is required.

Required coverage should include:

- external MCP client creates and validates a workflow
- in-app Codex creates and validates a workflow through MCP
- invalid graph diagnostics are returned and repaired
- saved workflows appear in the workflow UI without reload hacks
- workflow execution can start from an MCP-authored definition
- restart/reload preserves saved definitions and runtime auth behavior
- removed dynamic-tool authoring paths are not still reachable

Run live Codex E2E coverage when local Codex CLI is signed in with ChatGPT auth.
If ChatGPT auth is unavailable, report that live-provider tests were skipped and
do not treat the skip as provider integration proof.
