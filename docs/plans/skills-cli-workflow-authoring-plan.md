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

Progress on 2026-07-06:

- Added the authenticated backend `ReadWorkflowSchema` contract at
  `GET /workflows/schema`.
- The response is owned by the orchestrator and generated from Go workflow
  graph contracts, registered value sets, runner descriptors/capabilities, and
  built-in Codex permission presets. It returns the graph JSON schema, value
  sets, action schemas, and permission presets without hardcoded TypeScript or
  prompt-only mirrors.
- Regenerated the backend TypeScript contract surface and HTTP contract
  snapshot; backend protocol version is now `8`.
- Verification: `./scripts/go.sh test ./internal/orchestrator ./internal/httpapi`,
  `pnpm -C desktop build`, and
  `node desktop/tests/electron/run-workflows.mjs --workflow workflow-graph-smoke`
  passed.
- Remaining Phase 1 work: define the remaining CLI-facing request/response
  shapes, especially the explicit create/update save input and structured error
  handling for CLI commands. Phase 2 should then implement `setta workflow
  schema` against this endpoint before broadening to list/read/validate/save
  and execution commands.

### Phase 2: Build The Workflow CLI

Implement the `setta workflow` command group.

The CLI should authenticate to the local runtime, expose the workflow commands,
and call the workflow backend through the backend API. Command responses should
return typed data and validation diagnostics instead of prose-only summaries.

Progress on 2026-07-06:

- Added `setta workflow schema [--app-data-dir DIR]` as the first
  workflow-authoring CLI command.
- The command reads the local serve state, verifies the runtime identity, mints
  a short-lived command-specific CLI auth session, calls the authenticated
  backend `GET /workflows/schema` contract, validates the typed response, and
  prints the schema as JSON.
- Added a focused CLI integration test that starts a disposable local runtime
  and exercises the command through the real CLI dispatch and backend HTTP
  route.
- Verification: `./scripts/go.sh test ./cmd/setta` and
  `./scripts/go.sh test ./cmd/setta ./internal/httpapi ./internal/orchestrator`
  passed. The final pre-commit gates `./scripts/format.sh` and
  `./check_quality.sh --git-changes` passed after reducing top-level CLI
  dispatch complexity. `node desktop/tests/electron/run-workflows.mjs
  --workflow workflow-graph-smoke` also passed as a production app-path
  workflow sanity check.

Progress on 2026-07-06:

- Added `setta workflow current-workspace [--app-data-dir DIR]`.
- The command reads the local serve state, verifies the runtime identity, mints
  a short-lived command-specific CLI auth session, calls the authenticated
  backend `GET /workspace-session` contract, validates that the selected
  workspace is active, and prints the selected `WorkspaceSummary` as JSON.
- Added focused CLI integration tests for an opened current workspace and the
  no-selected-workspace failure path through real CLI dispatch, runtime auth,
  and backend HTTP routes.
- Verification: `./scripts/go.sh test ./cmd/setta`, `./scripts/format.sh`,
  `./check_quality.sh --git-changes`, and
  `node desktop/tests/electron/run-workflows.mjs --workflow
  workflow-graph-smoke` passed.

Progress on 2026-07-06:

- Added `setta workflow definitions list [--app-data-dir DIR]`.
- The command reads the local serve state, verifies the runtime identity, mints
  a short-lived command-specific CLI auth session, reads the selected workspace
  through `GET /workspace-session`, calls the authenticated backend
  `POST /workflows/definitions/list` contract with that workspace ID, validates
  the typed list response, and prints `ListWorkflowDefinitionsResponse` as JSON.
- Added a focused CLI integration test that starts a disposable local runtime,
  opens a temporary workspace, creates a workflow definition through the
  backend-owned HTTP route, and verifies the new CLI command lists it through
  real CLI dispatch, runtime auth, and backend HTTP.
- Verification: `./scripts/go.sh test ./cmd/setta`,
  `./scripts/go.sh test ./cmd/setta ./internal/httpapi ./internal/orchestrator`,
  and `node desktop/tests/electron/run-workflows.mjs --workflow
  workflow-graph-smoke` passed. The final pre-commit gates
  `./scripts/format.sh` and `./check_quality.sh --git-changes` passed after
  splitting response validation to satisfy the Go complexity check.
- Audit follow-up: added focused CLI integration coverage for listing an opened
  workspace with no workflow definitions, verifying the command returns an
  empty JSON array through real CLI dispatch, runtime auth, and backend HTTP.

Progress on 2026-07-06:

- Added `setta workflow definitions read [--app-data-dir DIR] <definition-id>`.
- The command reads the local serve state, verifies the runtime identity, mints
  a short-lived command-specific CLI auth session, reads the selected workspace
  through `GET /workspace-session`, calls the authenticated backend
  `POST /workflows/definitions/read` contract with that workspace ID and the
  requested definition ID, validates the typed workflow definition response, and
  prints the definition as JSON.
- Added focused CLI integration tests for reading an existing definition and
  for the missing-definition failure path through real CLI dispatch, runtime
  auth, and backend HTTP.
- Verification: `./scripts/go.sh test ./cmd/setta`,
  `./scripts/go.sh test ./cmd/setta ./internal/httpapi ./internal/orchestrator`,
  and `node desktop/tests/electron/run-workflows.mjs --workflow
  workflow-graph-smoke` passed.

Progress on 2026-07-07:

- Added `setta workflow definitions validate --graph <path> [--app-data-dir
  DIR]`.
- The command reads a workflow graph JSON file with strict single-value
  decoding, reads the selected workspace through `GET /workspace-session`,
  calls the authenticated backend `POST /workflows/definitions/validate`
  contract with that workspace ID, validates the typed validation response, and
  prints `WorkflowValidationResult` as JSON.
- Added focused CLI integration tests for a valid graph and an invalid graph
  that returns structured backend-owned diagnostics through real CLI dispatch,
  runtime auth, and backend HTTP.
- Verification: `./scripts/go.sh test ./cmd/setta`,
  `./scripts/go.sh test ./cmd/setta ./internal/httpapi ./internal/orchestrator`,
  and `node desktop/tests/electron/run-workflows.mjs --workflow
  workflow-graph-smoke` passed.
- Remaining Phase 2 work: add definitions save with the explicit create/update
  save input and structured diagnostics, then execution start/read. Add the
  broader workflow-authoring Electron coverage as mutating CLI commands are
  introduced and the in-app path moves to this surface.

Progress on 2026-07-07:

- Added the backend-owned `SaveDefinition` workflow operation and authenticated
  `POST /workflows/definitions/save` contract.
- Added generated `WorkflowDefinitionSaveInput`,
  `WorkflowDefinitionSaveResult`, and `WorkflowDefinitionSaveOperation`
  surfaces. The save input uses an explicit `create` or `update` operation;
  update requires `definitionId`, and create rejects `definitionId`.
- Save validates the workflow graph before persistence. Invalid graphs return
  `saved: false`, `definition: null`, and the structured backend validation
  diagnostics without writing a definition. Valid create/update saves return
  `saved: true`, the validation result, and the saved definition.
- Added `setta workflow definitions save --input <path> [--app-data-dir DIR]`.
  The command reads a strict single JSON save input, resolves the selected
  workspace, calls the authenticated backend save contract, validates the typed
  response, and prints `WorkflowDefinitionSaveResult` as JSON.
- Regenerated the backend TypeScript contract surface and HTTP contract
  snapshot; backend protocol version is now `9`.
- Verification: `./scripts/go.sh test ./internal/orchestrator
  ./internal/httpapi ./cmd/setta`, `pnpm -C desktop build`, and
  `node desktop/tests/electron/run-workflows.mjs --workflow
  workflow-graph-smoke` passed.
- Audit follow-up: the save command now uses command-specific runtime auth and
  returns structured validation results, but full mutation audit records and
  machine-readable CLI error envelopes are still remaining CLI/API contract
  work. Audit records must capture the authenticated device/session, command
  name, workspace ID, affected definition ID, validation result, and execution
  ID when applicable before Phase 2 is treated as complete.

Progress on 2026-07-07:

- Added `setta workflow executions start [--app-data-dir DIR] <definition-id>`
  and `setta workflow executions read [--app-data-dir DIR] <execution-id>`.
- Both commands read the local serve state, verify the runtime identity, mint a
  command-specific CLI auth session, resolve the selected workspace through
  `GET /workspace-session`, call the existing authenticated backend
  `POST /workflows/executions/start` or `POST /workflows/executions/read`
  contract, validate the typed `WorkflowExecution` response, and print it as
  JSON.
- Added focused CLI integration coverage that starts a disposable runtime,
  opens a temporary workspace, creates a workflow definition through the
  backend-owned HTTP route, starts it through real CLI dispatch, reads the
  execution back through real CLI dispatch, and verifies the
  missing-execution failure path returns the backend-owned error code.
- Audit follow-up: clarified positional-command usage so optional flags appear
  before the required ID, added focused coverage for the missing-definition
  start failure path, and made read commands reject mismatched backend response
  IDs explicitly.
- Audit verification: `./scripts/go.sh test ./cmd/setta`,
  `./scripts/go.sh test ./cmd/setta ./internal/httpapi ./internal/orchestrator`,
  `./scripts/format.sh`, and `./check_quality.sh --git-changes` passed.
- Verification: `./scripts/go.sh test ./cmd/setta`,
  `./scripts/go.sh test ./cmd/setta ./internal/httpapi ./internal/orchestrator`,
  `./scripts/go.sh test ./internal/runtime -run
  TestBackendAppWorkflowWithLiveCodex -count=1 -v`, and
  `node desktop/tests/electron/run-workflows.mjs --workflow
  workflow-graph-smoke` passed. The final pre-commit gates
  `./scripts/format.sh` and `./check_quality.sh --git-changes` also passed. The
  live Codex test ran with local ChatGPT auth; it did not use `OPENAI_API_KEY`.
- Remaining Phase 2 work: add full mutation audit records and structured CLI
  error output, then broaden workflow-authoring Electron coverage as the in-app
  path moves to this CLI/API surface.

Progress on 2026-07-07:

- Added machine-readable JSON error envelopes for the `setta workflow` command
  group. Workflow command failures now write the shared backend
  `ErrorResponse` shape to stderr with stable error codes and messages while
  keeping usage failures on exit code 2.
- Backend workflow API failures are preserved as typed error responses instead
  of being flattened into prose, including backend-owned error codes and
  structured fields such as active execution summaries when present.
- Added explicit local workflow CLI error codes for missing or unreachable
  local runtimes, CLI auth session creation failures, missing selected
  workspaces, invalid current workspace responses, workflow graph file read or
  decode failures, save input read or decode failures, and malformed backend
  error responses.
- Added focused CLI coverage that decodes stderr as JSON for local workflow
  failures, backend workflow failures, and workflow usage errors through real
  CLI dispatch and runtime/backend paths where applicable.
- Audit follow-up: added CLI coverage for an active workflow execution
  conflict, verifying the backend-owned `activeExecution` summary survives the
  workflow CLI error envelope through real CLI dispatch, runtime auth, and
  backend HTTP.
- Verification: `./scripts/go.sh test ./cmd/setta`,
  `./scripts/go.sh test ./cmd/setta ./internal/httpapi ./internal/orchestrator`,
  and `node desktop/tests/electron/run-workflows.mjs --workflow
  workflow-graph-smoke` passed. The final pre-commit gates
  `./scripts/format.sh` and `./check_quality.sh --git-changes` also passed
  after splitting workflow CLI error and response-validation helpers out of the
  command file to keep the changed files within repository size limits.
- Remaining Phase 2 work: add full mutation audit records, then broaden
  workflow-authoring Electron coverage as the in-app path moves to this
  CLI/API surface.

Progress on 2026-07-07:

- Added backend-owned workflow command audit records for mutating workflow CLI
  operations.
- Added an append-only `internal/workflowaudit` store at
  `runtime/workflow-command-audit.jsonl` under the app data directory. The
  audit store is not a runtime-auth database migration.
- Runtime startup now wires the workflow audit store into the HTTP backend.
  `POST /workflows/definitions/save` and
  `POST /workflows/executions/start` require the audit service and record
  command audit entries after backend-owned save/start logic returns.
- Audit entries include the authenticated runtime device session, command name,
  workspace ID, affected definition ID, save operation, saved/unsaved result,
  backend validation result and diagnostics where available, execution ID for
  successful starts, active execution conflict details where present, and stable
  error code/message for failed attempts.
- Added unit coverage for the audit store, HTTP coverage for valid save,
  invalid save, and execution start audit records, and real CLI/runtime
  coverage for save create/update audit records plus execution start success
  and missing-definition failure audit records.
- Verification: `./scripts/go.sh test ./internal/workflowaudit`,
  `./scripts/go.sh test ./internal/httpapi -run
  'TestWorkflowEndpointSaveAndStartRecordCommandAudit|TestWorkflowEndpointSaveDefinitionValidatesBeforePersisting|TestWorkflowEndpointStartExecutionConflictIncludesActiveExecution'`,
  `./scripts/go.sh test ./cmd/setta -run
  'TestWorkflowDefinitionsSaveCommandCreatesAndUpdatesDefinition|TestWorkflowExecutionsStartAndReadCommandIntegration|TestWorkflowExecutionsStartCommandFailsForMissingDefinition'`,
  `./scripts/go.sh test ./internal/workflowaudit ./internal/httpapi
  ./cmd/setta ./internal/runtime`, `./scripts/go.sh test ./internal/runtime
  -run TestBackendAppWorkflowWithLiveCodex -count=1 -v`, and
  `node desktop/tests/electron/run-workflows.mjs --workflow
  workflow-graph-smoke` passed. The live Codex test ran with local ChatGPT
  auth and did not use `OPENAI_API_KEY`. The final pre-commit gates
  `./scripts/format.sh` and `./check_quality.sh --git-changes` passed after
  extracting runtime workflow-service/audit setup to keep
  `buildRuntimeServices` within the repository complexity limit.
- Remaining work: Phase 3 should add the workflow-builder skill. Broader
  workflow-authoring Electron coverage, in-app Codex movement to the
  skill/CLI/API path, and removal of obsolete dynamic-tool authoring paths
  remain Phase 4/5 work.

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
