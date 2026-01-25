# External agent test gaps + tool coverage plan

This plan captures current testing gaps between the Codex app-server adapter and the Claude SDK adapter, plus the requested TodoWrite tool coverage. It is scoped to backend tests only.

## Goals
- Document current gaps/asymmetries in Codex vs Claude adapter tests.
- Align test coverage with the official tool inventories for Claude Code and Codex app-server.
- Add/extend tests so every documented tool or item type is recognized and parsed correctly.
- Preserve special UI support expectations (AskUserQuestion, TodoWrite) while keeping other tools generic.

## Non-goals
- Frontend UI rendering of TodoWrite/checklist items.
- Refactoring adapter behavior.

## Current coverage snapshot (high level)
- Codex adapter has unit-level parsing/mapping tests in `tests/agentic/test_codex_app_server_adapter.py` and integration tests in `tests/agentic/test_codex_app_server_adapter_integration.py`.
- Claude SDK adapter has unit-level parsing/prompt tests in `tests/agentic/test_claude_sdk_adapter.py` and integration tests in `tests/agentic/test_claude_sdk_adapter_integration.py`.
- Shared runner/settings/preflight coverage exists in `tests/agentic/test_external_agent_runner.py`, `tests/agentic/test_external_agent_settings.py`, `tests/agentic/test_external_agent_preflight.py`, and `tests/routers/test_agentic_routes.py`.

## Official tool inventories (from docs)

### Claude Code tools (Claude Code settings docs)
Tools listed as available to Claude Code:
- AskUserQuestion
- Bash
- TaskOutput
- Edit
- ExitPlanMode
- Glob
- Grep
- KillShell
- MCPSearch
- NotebookEdit
- Read
- Skill
- Task
- TaskCreate
- TaskGet
- TaskList
- TaskUpdate
- WebFetch
- WebSearch
- Write
- LSP

Notes:
- AskUserQuestion is explicitly listed in the settings docs (keep UI coverage).
- We will only build schema-based tests for tools with published schemas (see below). Other tools remain generic/unverified.

### Claude Code Todo tracking (Claude Code SDK todo-tracking docs)
- The Agent SDK reference includes a full TodoWrite input/output schema, even though the settings docs list does not mention TodoWrite.
- Treat TodoWrite as supported until the docs converge; keep checklist UI compatibility.

### Claude Agent SDK tool schemas (Python reference)
Tools with explicit input/output schemas in the Agent SDK reference:
- Task
- AskUserQuestion
- Bash
- Edit
- Read
- Write
- Glob
- Grep
- NotebookEdit
- WebFetch
- WebSearch
- TodoWrite
- BashOutput
- KillBash
- ExitPlanMode
- ListMcpResources
- ReadMcpResource

Missing from the Agent SDK schema section (need separate docs):
- TaskCreate / TaskGet / TaskList / TaskUpdate / TaskOutput
- Skill
- MCPSearch
- LSP

### Codex app-server item types (Codex app-server docs)
Common item types the server emits:
- userMessage
- agentMessage
- reasoning
- commandExecution
- fileChange
- mcpToolCall
- collabToolCall
- webSearch
- imageView
- enteredReviewMode
- exitedReviewMode
- compacted

The Codex app-server docs also describe an experimental `tool/requestUserInput` method.

## Gaps / asymmetries
- Codex approvals are only exercised via mapping/runner checks; no integration run triggers an approval request and calls `respond_to_approval`.
- Claude AskUserQuestion is covered end-to-end; Codex has no equivalent user-question tool coverage.
- Structured output schema is tested for Codex integration; no Claude SDK equivalent.
- MCP tool calls are parsed for Codex at unit level but not covered by integration tests; Claude integration uses an empty MCP config and does not validate MCP tool calls.
- Codex thread ID persistence/reuse is tested; Claude has no multi-run continuity test (if supported).
- Claude settings file creation is validated in integration; Codex config generation is covered by unit tests, but app-server integration does not validate the generated config is used.
- Codex adapter does not currently map all documented app-server item types (collabToolCall, webSearch, imageView, enteredReviewMode, exitedReviewMode, compacted) into recognizable tool/message events. Tests cannot cover these until adapter support exists.

## Proposed tests

### 1) Claude schema tool parsing (unit)
Add unit tests in `tests/agentic/test_claude_sdk_adapter.py` that assert any `tool_use` block for each tool with a published schema is captured as a tool call and that a matching `tool_result` block is emitted as a `ToolResultEvent`.

### 2) Claude TodoWrite integration (checklist UI path)
Add an integration test to `tests/agentic/test_claude_sdk_adapter_integration.py`.

Test outline:
- Require `claude-agent-sdk` and `ANTHROPIC_API_KEY` (reuse `_require_claude_sdk`).
- Start a run with `allowedTools = ["TodoWrite"]` and a prompt that explicitly instructs TodoWrite usage with a small todo list payload.
- Assert:
  - At least one assistant message contains a tool call with name `TodoWrite`.
  - A tool result for `TodoWrite` is present (if emitted by the SDK), or the tool call arguments contain the todo list shape expected by the SDK.
  - No tool error messages appear in `outputs.messages`.

Notes:
- The TodoWrite payload shape is documented in the Agent SDK reference (todos array with content/status).

### 3) Codex item type parsing (unit)
Extend `tests/agentic/test_codex_app_server_adapter.py` to cover all documented item types, including:
- collabToolCall
- webSearch
- imageView
- enteredReviewMode
- exitedReviewMode
- compacted

This may require adapter updates to map these item types into either message events or tool call/result events so the frontend can render them generically.

### 4) Codex tool/item integration (conditional)
Add conditional integration tests to `tests/agentic/test_codex_app_server_adapter_integration.py` for item types we can reliably trigger from prompts.

Test outline:
- Run a short prompt that explicitly requests the model to invoke a todo/checklist tool (name candidates: `TodoWrite`, `todo_write`, `todo`).
- Inspect `outputs.messages` for any tool calls with a matching name.
- If no matching tool call is found, call `self.skipTest("Codex todo tool not available")`.
- If a matching tool call exists, assert:
  - The tool call arguments include a todo list payload (or whatever schema the tool exposes).
  - The tool result (if any) is recorded in `outputs.messages`.

Notes:
- The Codex app-server adapter currently only surfaces command/file/mcp tool items explicitly. Additional item types require adapter support before integration tests can assert their presence.

### 5) Codex approvals integration (optional follow-up)
Add a Codex app-server integration test that triggers a command/file change approval and uses `runner.respond_to_approval(...)`.

Test outline:
- Configure `approvalPolicy = "on-request"` and issue a prompt that requires a command execution.
- Wait for a pending approval, approve it, and assert the run completes with the expected tool output.

### 6) Claude structured output schema (dropped)
Removed: we only need tool coverage in integration tests, so structured output schema validation is out of scope.

### 7) MCP tool call integration (optional follow-up)
- Add a test for both adapters that triggers an MCP tool call (non-empty MCP config) and validates that tool calls + tool results show up in `outputs.messages`.

## Implementation details
- Claude tool inventory unit tests should live near existing parser tests in `tests/agentic/test_claude_sdk_adapter.py`.
- Claude TodoWrite test should live near other tool integration tests in `tests/agentic/test_claude_sdk_adapter_integration.py`.
- Codex item type parsing tests should live near existing parser tests in `tests/agentic/test_codex_app_server_adapter.py`.
- Codex integration tests should live near existing integration tests in `tests/agentic/test_codex_app_server_adapter_integration.py`.
- Keep tests deterministic by using unique tokens in todo text (e.g., `setta-todo-token-<hex>`) and asserting the token appears in tool call arguments/results.

## Open questions
- For Codex app-server: should we map `webSearch`/`imageView`/`collabToolCall`/review-mode items into tool-call events or treat them as system messages?
- Should `tool/requestUserInput` be surfaced similarly to AskUserQuestion in the UI and covered by tests?

## Suggested next steps
1) Implement the Claude tool inventory unit tests + TodoWrite integration test.
2) Extend Codex adapter + unit tests for missing item types, then add integration tests for triggerable ones.
3) Decide on optional follow-ups (approvals, structured output, MCP tool integration).

## Progress (2026-01-26)
- Added Claude schema-based parser coverage for tool_use/tool_result handling.
- Added TodoWrite integration test (not yet executed here).
- Extended Codex app-server adapter to emit generic tool events for collabToolCall/webSearch/imageView/enteredReviewMode/exitedReviewMode/compacted.
- Added Codex parser tests for the new item types.
- Ran unit tests: `tests/agentic/test_claude_sdk_adapter.py` and `tests/agentic/test_codex_app_server_adapter.py` (passed).
- Added Codex TodoWrite integration test (conditional) and approvals integration test.
- Added MCP tool call integration tests for Claude + Codex plus local MCP test server harness.
- Removed Claude structured output schema wiring/tests (not needed for tool coverage).
- Dropped Codex TodoWrite integration test (TodoWrite not documented in app-server docs).
- Added Claude sessionId persistence/reuse integration tests.
- Added Codex fileChange integration test.
- Updated Codex fileChange integration test to accept command_execution edits when fileChange tool events are not emitted (still enforces file content update).
