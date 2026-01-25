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
- Claude AskUserQuestion is covered end-to-end; Codex has no equivalent user-question tool coverage (app-server `tool/requestUserInput` is experimental and not yet surfaced by the adapter).
- Codex item types like `collabToolCall`, `webSearch`, `imageView`, `enteredReviewMode`, `exitedReviewMode`, and `compacted` are parsed in unit tests but lack deterministic integration triggers.
- Codex MCP tool integration cannot assert `mcpToolCall` items because app-server does not emit them for MCP tools today (tests treat successful tool execution as the signal).
- Codex reasoning items are unit-tested but not covered by integration (no reliable trigger yet).

## Proposed tests

### 1) Claude schema tool parsing (unit)
Status: done (see Progress).

### 2) Claude TodoWrite integration (checklist UI path)
Status: done (see Progress).

### 3) Codex item type parsing (unit)
Status: done (see Progress).

### 4) Codex generic item integration (conditional)
Add conditional integration tests to `tests/agentic/test_codex_app_server_adapter_integration.py` for item types we can reliably trigger from prompts or app-server APIs (e.g., review-mode items via `review/start`).

Test outline:
- Trigger an item type via a deterministic API (if available), or a prompt-backed tool that is known to exist.
- Inspect `outputs.messages` for tool calls with the matching item type.
- Assert tool call arguments/results are preserved.

Notes:
- The Codex app-server adapter now surfaces generic item types as tool events, but integration tests still need deterministic triggers.

### 5) Codex approvals integration (optional follow-up)
Status: done (see Progress).

### 6) Claude structured output schema (dropped)
Removed: we only need tool coverage in integration tests, so structured output schema validation is out of scope.

### 7) MCP tool call integration (optional follow-up)
Status: done for tool execution (Codex app-server still does not emit `mcpToolCall` items; we treat successful tool execution as the signal).

## Implementation details
- Claude tool inventory unit tests should live near existing parser tests in `tests/agentic/test_claude_sdk_adapter.py`.
- Claude TodoWrite test should live near other tool integration tests in `tests/agentic/test_claude_sdk_adapter_integration.py`.
- Codex item type parsing tests should live near existing parser tests in `tests/agentic/test_codex_app_server_adapter.py`.
- Codex integration tests should live near existing integration tests in `tests/agentic/test_codex_app_server_adapter_integration.py`.
- Keep tests deterministic by using unique tokens in todo text (e.g., `setta-todo-token-<hex>`) and asserting the token appears in tool call arguments/results.

## Open questions
- Should `tool/requestUserInput` be surfaced similarly to AskUserQuestion in the UI and covered by tests?

## Suggested next steps
1) Decide how (or if) to surface `tool/requestUserInput` for Codex and add tests if supported.
2) Identify deterministic triggers for Codex generic item types (review/start, web search, image view) and add conditional integration coverage.
3) Add Codex reasoning integration coverage if/when a reliable trigger is available.

## Progress (2026-01-26)
- Added Claude schema-based parser coverage for tool_use/tool_result handling.
- Added TodoWrite integration test (Claude SDK).
- Extended Codex app-server adapter to emit generic tool events for collabToolCall/webSearch/imageView/enteredReviewMode/exitedReviewMode/compacted.
- Added Codex parser tests for the new item types.
- Ran unit tests: `tests/agentic/test_claude_sdk_adapter.py` and `tests/agentic/test_codex_app_server_adapter.py` (passed).
- Added Codex approvals integration test.
- Added MCP tool call integration tests for Claude + Codex plus local MCP test server harness.
- Removed Claude structured output schema wiring/tests (not needed for tool coverage).
- Dropped Codex TodoWrite integration test (TodoWrite not documented in app-server docs).
- Added Claude sessionId persistence/reuse integration tests.
- Added Codex fileChange integration test and relaxed it to accept command_execution edits when fileChange tool events are not emitted.
- Added Codex config/read integration assertion to confirm the generated config is loaded and includes the Setta MCP server entry.
