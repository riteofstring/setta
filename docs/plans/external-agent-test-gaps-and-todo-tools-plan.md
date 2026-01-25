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
- The settings docs list does not include TodoWrite; the SDK todo-tracking docs still use TodoWrite (see below).
- Task is a sub-agent helper; TaskCreate/TaskGet/TaskList/TaskUpdate are task-list tools.

### Claude Code Todo tracking (Claude Code SDK todo-tracking docs)
- Todo tracking uses `tool_use` events with tool name `TodoWrite`.
- Payload includes a `todos` array where each item has `content`, `status` (`pending`, `in_progress`, `completed`), and optional fields such as `activeForm`.

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

### 1) Claude tool inventory parsing (unit)
Add unit tests in `tests/agentic/test_claude_sdk_adapter.py` that assert any `tool_use` block for each documented tool name is captured as a tool call and that a matching `tool_result` block is emitted as a `ToolResultEvent`.

This ensures all documented Claude Code tools are recognized as generic tool uses (even if we do not run them end-to-end in integration).

### 2) Claude TodoWrite integration (special UI path)
Add an integration test to `tests/agentic/test_claude_sdk_adapter_integration.py`.

Test outline:
- Require `claude-agent-sdk` and `ANTHROPIC_API_KEY` (reuse `_require_claude_sdk`).
- Start a run with `allowedTools = ["TodoWrite"]` and a prompt that explicitly instructs TodoWrite usage with a small todo list payload.
- Assert:
  - At least one assistant message contains a tool call with name `TodoWrite`.
  - A tool result for `TodoWrite` is present (if emitted by the SDK), or the tool call arguments contain the todo list shape expected by the SDK.
  - No tool error messages appear in `outputs.messages`.

Notes:
- The TodoWrite payload shape is documented in `docs/plans/claude-special-features-frontend-plan.md` (todos array with content/status). Use a minimal list with 2 items.

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

### 6) Claude structured output schema (optional follow-up)
If the Claude SDK supports output schemas, mirror the Codex structured output test with a small JSON schema and assert the response matches.

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
