# Skills + CLI Workflow Authoring Plan

Date: 2026-07-06

## Scope

This plan defines the target architecture for AI-authored workflows in Setta.
Users should be able to ask an agent to construct, validate, save, and run
workflows from inside Setta and from external agent harnesses.

The current in-app Codex integration uses codex app-server dynamic tools for
Setta-owned actions. That surface is not the long-term workflow-authoring
interface.

## Compatibility Policy

This work is a clean break from workflow-authoring dynamic tools and from the
previous MCP-first plan.

Do not add:

- backward compatibility paths
- legacy support
- migrations
- transitional adapters
- dual-read or dual-write behavior
- old-field aliases
- silent fallback behavior
- dynamic-tool shims that proxy workflow-authoring requests
- MCP servers, MCP tools, MCP resources, or MCP adapters for workflow authoring

If existing dynamic-tool code becomes obsolete for workflow authoring, remove
it. Do not preserve it behind feature flags or compatibility wrappers.

The only dynamic-tool behavior that may remain is behavior that is still part
of a separate runtime contract, such as workflow node result reporting, and only
if it is not being used as a workflow-authoring interface. If that behavior is
also replaced by the CLI/API workflow, remove the old dynamic-tool path in the
same change.

## Recommendation

Use a workflow-builder skill plus a deterministic CLI/API as the canonical
agent-facing workflow-authoring architecture.

The backend workflow service remains the authority for persistence, validation,
execution, and app state updates. The CLI is the deterministic execution
surface. The skill teaches agents how to use that surface correctly.

```text
In-app Codex
External agents: Codex CLI, Claude Code, OpenCode, OpenHands, and others
        |
        v
workflow-builder skill
        |
        v
setta workflow CLI
        |
        v
Workflow backend API / orchestrator
        |
        v
Persisted workflow definitions, validation, executions, and UI events
```

Do not make codex app-server dynamic tools or MCP part of the workflow-authoring
runtime architecture.

## Design Principles

The CLI/API is the contract. Humans, CI, local scripts, and agents should be
able to run the same commands and get the same typed results.

The skill owns workflow procedure, not application authority. It should explain
how to inspect the schema, draft a graph, validate it, repair diagnostics, save
the workflow, and optionally start it. It must not carry hardcoded mirrors of
Go-owned workflow contracts.

The backend owns workflow correctness. Agents must not write
`.setta/workflows/*.json` directly as the primary path. CLI commands must call
the same backend-owned create, update, validate, and start logic used by
Setta's UI.

Prefer deterministic contracts over prompt conventions. Schema, validation
diagnostics, capabilities, and saved definitions should come from typed CLI/API
responses, not from agent-invented JSON conventions.

## CLI Surface

Expose a focused workflow command set:

```text
setta workflow current-workspace
setta workflow schema
setta workflow definitions list
setta workflow definitions read <definition-id>
setta workflow definitions validate --graph <path>
setta workflow definitions save --input <path>
setta workflow executions start <definition-id>
setta workflow executions read <execution-id>
```

CLI commands should support machine-readable JSON output by default or through
an explicit `--json` flag. Error responses should include stable error codes
and structured validation diagnostics.

`setta workflow definitions save` should handle both create and update with an
explicit request shape. It should validate the graph before saving and return
validation diagnostics when invalid.

The schema content must be generated from Go-owned workflow and HTTP API
contracts. Do not maintain hardcoded TypeScript or prompt-only mirrors.

## Skill Surface

Add a workflow-builder skill that instructs agents to use the CLI lifecycle:

```text
Read the current workspace.
Read the workflow schema.
Draft a workflow graph.
Validate the graph.
Repair diagnostics.
Validate again.
Save the workflow only when the user asked to create or update it.
Start the workflow only when the user explicitly requested a run.
```

The skill may include small examples and references, but examples must be
treated as illustrative. The current schema from `setta workflow schema` is
authoritative.

The skill should instruct agents to fail loudly when the CLI is unavailable,
the current workspace cannot be resolved, validation fails after repair, or the
requested workflow requires capabilities the schema does not support.

## In-App Codex

In-app Codex should use the same skill and CLI/API path as external agents.

```text
In-app Codex -> workflow-builder skill -> setta workflow CLI -> workflow backend
```

Do not keep codex app-server dynamic tools as a workflow-authoring fallback.
If the current in-app Codex path cannot run the CLI for workflow authoring,
update that path to use the same backend API contract directly and remove the
workflow-authoring dynamic tools.

Codex app-server remains relevant as the host protocol for chat, approvals,
streaming, and thread lifecycle. It should not own the workflow-authoring tool
contract.

## Backend API

The CLI should be a thin wrapper over backend-owned workflow operations:

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

The CLI must not bypass validation, ID generation, workspace resolution, auth,
app events, or existing workflow service invariants.

Renderer UI and backend HTTP handlers may continue calling the workflow service
directly unless sharing a facade reduces duplication without weakening ownership
boundaries.

## Security And Permissions

The CLI must use local runtime authorization. Use the existing runtime auth,
pairing, and local runtime discovery model where possible.

Commands that mutate workflow definitions or start executions should be
auditable. Audit records should include the authenticated device/session,
command name, workspace ID, affected definition ID, validation result, and
execution ID when applicable.

Workflow authoring is workspace mutation. Treat save and start operations as
write-capable commands, not read-only context.

## Implementation Phases

### Phase 1: Define The CLI/API Contract

Define the workflow command request and response contracts around the existing
workflow service. Generate schema content from Go-owned contracts and value
sets.

Keep workflow-authoring dynamic tools and MCP out of the target architecture.

### Phase 2: Build The Workflow CLI

Implement the `setta workflow` command group.

The CLI should authenticate to the local runtime, expose the workflow commands,
and call the workflow backend through the backend API. Command responses should
return typed data and validation diagnostics instead of prose-only summaries.

### Phase 3: Add The Workflow-Builder Skill

Add the workflow-builder skill with instructions for the schema, draft,
validate, repair, save, and start lifecycle.

The skill must call the CLI for authoritative schema and validation instead of
embedding workflow contract mirrors.

### Phase 4: Move In-App Codex To Skills + CLI/API

Update the in-app Codex workflow-authoring path to use the workflow-builder
skill and CLI/API contract. Remove workflow-authoring dynamic tools in the same
change.

Do not add a compatibility bridge from dynamic tools to the CLI/API.

### Phase 5: Remove Obsolete Dynamic Tool Code

Delete dynamic-tool definitions, handlers, tests, and prompt instructions that
exist only for workflow authoring.

Keep only dynamic-tool code that is still required for non-authoring runtime
contracts. If workflow result reporting moves to the CLI/API workflow, remove
the old `workflow_result` dynamic tool at the same time.

## Verification

This work touches chat behavior, Codex harness behavior, workflow authoring,
provider protocol handling, generated contracts, renderer workflow state, and
event streaming. Deterministic end-to-end Electron workflow coverage through
production main, preload, renderer, HTTP, store, and workflow paths is required.

Required coverage should include:

- external shell-driven agent workflow creates and validates a workflow through
  the CLI
- in-app Codex creates and validates a workflow through the skill and CLI/API
  path
- invalid graph diagnostics are returned and repaired
- saved workflows appear in the workflow UI without reload hacks
- workflow execution can start from a CLI-authored definition
- restart/reload preserves saved definitions and runtime auth behavior
- removed dynamic-tool authoring paths are not still reachable
- no MCP server, MCP tool, MCP resource, or MCP adapter is introduced for
  workflow authoring

Run live Codex E2E coverage when local Codex CLI is signed in with ChatGPT auth.
If ChatGPT auth is unavailable, report that live-provider tests were skipped and
do not treat the skip as provider integration proof.
