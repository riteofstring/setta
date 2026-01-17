# LLMChatManager Toolkit Refactor Plan (Managed Extensions)

## Goals
- Rebase `LLMChatManager` on toolkit modules while preserving current managed behavior.
- Keep the existing core toolkit provider-agnostic for listener usage.
- Extract managed-only behavior into modular, opt-in toolkit components.
- Reduce duplicated logic without forcing managed semantics on every toolkit user.
- Allow developers to opt into managed behavior piecemeal while keeping legacy
  compatibility out of scope.

## Non-goals
- Do not redesign the chat UI or introduce new section types.
- Do not reintroduce LiteLLM-specific behavior into the core toolkit.
- Do not require listeners to adopt managed behavior by default.
- Do not add backward compatibility shims or preserve legacy behavior outside managed mode.

## Key distinction
- Preserve current `LLMChatManager` managed behavior when it uses the toolkit so the
  managed UX stays stable.
- Do not preserve or shim legacy behavior for non-managed flows; core toolkit
  behavior can remain simpler and provider-agnostic.

## Current state
- `LLMChatManager` owns chat store access, stream assembly, tool-call buffering, tool execution, AI-follow updates, and UI streaming events.
- Core toolkit modules exist under `backend/setta/llm/chat_toolkit/` (history, messages, stream assembler, tool calls, tool runner, section sync).
- Listener endpoints already use the core toolkit, so managed and scriptable flows diverge.

## Target architecture

### Core toolkit (unchanged)
Location: `backend/setta/llm/chat_toolkit/`
- `history.py`: chat create/get/append/delete/system prompt.
- `messages.py`: message/content builders.
- `stream_assembler.py`: provider-agnostic assistant message builder.
- `tool_calls.py`: tool-call accumulation keyed by tool call id.
- `tool_runner.py`: basic MCP tool execution with allowed server gating.
- `section_sync.py`: apply stream deltas to `ChatSectionState`.

### Managed toolkit extensions (new)
Location: `backend/setta/llm/chat_toolkit/managed/` (or similar).
These modules preserve current managed behavior while remaining optional. They should
be side-effect free and return `ManagedAction` objects so `LLMChatManager` remains the
single emitter. Managed modules must not perform MCP calls, websocket emission, or
chat persistence.

Managed helpers should take required objects as explicit arguments (DBE, MCP client,
share_session_id, logger, etc.) rather than pulling from global state.
Side effects (MCP calls, websocket emission, persistence) live in a dedicated
managed action executor.

- `managed/stream_assembler.py`
  - Managed version of `AssistantMessageBuilder` that matches `LLMChatManager` indexing rules.
  - Keeps "extend last block of same type, otherwise append" semantics for text/thinking.
  - Produces MessageDeltaEvent payloads compatible with existing UI behavior.

- `managed/tool_calls.py`
  - Index-based accumulator to match provider deltas that include `index`.
  - Supports partial ids/names, buffers arguments by index, and updates tool calls by index.
  - Finalization uses lenient JSON parsing (invalid JSON -> {}), matching current behavior.

- `managed/tool_runner.py`
  - Builds tool execution actions with managed features:
    - Search tool handling and tool-reference output.
    - Missing-tool fallback (error ToolChatMessage instead of raising).
    - Argument sanitization (canonical -> temporary ids).
    - Share session metadata for Setta tools.
  - Returns tool-execution request actions; MCP calls are handled by the executor.

- `managed/tool_search.py`
  - Local search tool execution (ToolSearchIndex) and tool reference content output.

- `managed/tool_argument_preview.py`
  - Tool-argument preview extraction and delta events.
  - Uses MCP annotations to emit preview value updates while streaming.

- `managed/ai_follow.py`
  - Extracts ids from tool arguments/results and broadcasts AI-follow updates.
  - Matches current project state update behavior.

- `managed/sanitization.py`
  - Canonical <-> temporary id conversion helpers for tool arguments/results.

- `managed/action_executor.py`
  - Applies managed actions in order and performs side effects (MCP calls, websocket
    emission, persistence).
  - Converts tool execution requests into `ToolChatMessage` results and new actions.

### LLMChatManager integration
`LLMChatManager` becomes a thin, provider-specific orchestrator that:
- Normalizes provider output into managed toolkit deltas.
- Delegates assembly to `managed/stream_assembler`.
- Delegates tool buffering to `managed/tool_calls`.
- Delegates tool execution requests to `managed/tool_runner`.
- Delegates AI-follow and tool-argument preview to `managed/ai_follow` and
  `managed/tool_argument_preview`.
- Delegates persistence to core `ChatHistory`.
- Applies managed actions through `managed/action_executor`.
- Emits `LLMStreamingResponseChunk` events from executor output.

## Managed action interface
Managed modules return actions that `LLMChatManager` applies in order. The actions
are side-effect free and do not perform MCP calls, websocket emission, or persistence.

Suggested module: `backend/setta/llm/chat_toolkit/managed/actions.py`.

Draft action shapes:
```python
from dataclasses import dataclass

from setta.types.chat_stream_events import LLMStreamingResponseChunk
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.types.id import ID
from setta.mcp.tool_metadata import FollowIdType
from setta.types.chat_messages import ToolCall


@dataclass(frozen=True)
class EmitChunkAction:
    chat_id: ID
    chunk: LLMStreamingResponseChunk


@dataclass(frozen=True)
class AppendMessagesAction:
    chat_id: ID
    messages: list[BaseChatMessageUnion]


@dataclass(frozen=True)
class SetSystemPromptAction:
    chat_id: ID
    system_prompt: str


@dataclass(frozen=True)
class UpdateAIFollowAction:
    project_config_id: ID
    chat_id: ID
    ids_by_type: dict[FollowIdType, list[ID]]


@dataclass(frozen=True)
class ExecuteToolCallsAction:
    project_config_id: ID
    chat_id: ID
    tool_calls: list[ToolCall]
    allowed_server_ids: set[str]
    share_session_id: str | None


ManagedAction = (
    EmitChunkAction
    | AppendMessagesAction
    | SetSystemPromptAction
    | UpdateAIFollowAction
    | ExecuteToolCallsAction
)
```

Notes:
- Actions are order-sensitive; `LLMChatManager` should apply them sequentially.
- Tool execution requests are represented as `ExecuteToolCallsAction` and must be
  processed by `managed/action_executor`.
- Executor should surface tool results via `EmitChunkAction` (ToolResultEvent) and
  `AppendMessagesAction`.
- AI-follow updates should be represented as `UpdateAIFollowAction` so the
  broadcaster remains centralized in `LLMChatManager`.

## Managed behavior parity checklist
These behaviors must remain unchanged:
- Search tool handling and tool-reference content for results.
- Missing-tool fallback (error ToolChatMessage + warning).
- Share-session metadata for Setta tools.
- Argument sanitization in ToolChatMessage (canonical -> temporary ids).
- Lenient tool argument parsing on finalize (invalid JSON -> {}).
- Index-based tool call accumulation.
- Tool argument preview delta events.
- AI-follow updates for tool arguments and tool results.
- Stream content indexing rules for alternating text/thinking blocks.
- Stop/cancel persistence semantics and event ordering:
  - MessageStart -> deltas -> MessageStop -> MessageFinalized.
  - Partial assistant message is persisted if it has content/tool_calls.
  - waitingForResponse and toolCallArguments state matches current behavior.

## Implementation plan
1) **Introduce managed toolkit modules**
   - Create the modules under `backend/setta/llm/chat_toolkit/managed/`.
   - Move the relevant logic from `LLMChatManager` into these modules with minimal changes.

2) **Add managed module unit tests**
   - Stream assembler block index behavior for mixed text/thinking.
   - Tool call accumulator with index-based deltas and lenient finalize parsing.
   - Tool runner behavior for search tool, missing tool, and sanitization.
   - Tool argument preview extraction and AI-follow id extraction.
   - Tests should use real types and production logic (no mocks).

3) **Wire managed modules into LLMChatManager**
   - Replace internal stream assembly and tool-call buffering.
   - Replace `_run_tool_calls` and `_dispatch_tool_call` with `managed/tool_runner`
     plus `managed/action_executor` for execution.
   - Replace AI-follow and preview logic with managed modules.
   - Replace chat_store access with `ChatHistory`.

4) **Delete obsolete LLMChatManager helpers**
   - Remove legacy stream parsing/assembly helpers now covered by managed modules.
   - Remove tool-call delta parsing and sanitization utilities that are duplicated.

5) **Manual verification**
   - Managed chat: streaming text, tool calls, and tool results show correctly.
   - Stop streaming: partial message persisted and state cleaned up.
   - Search tool: tool references appear and tool definitions are usable in follow-up calls.

## Tests
- Unit tests for managed modules and core toolkit interop.
- Integration tests for `LLMChatManager` streaming and tool execution paths.
- Validate with real MCP client wiring; avoid mocks.

## Risks
- Managed modules introduce additional dependencies (DBE, MCP annotations, websocket sender).
  Mitigation: keep these dependencies isolated to the managed package.
- Behavior drift during extraction.
  Mitigation: parity checklist + tests for each behavior.

## Decisions
- Managed modules return `ManagedAction` objects; `LLMChatManager` emits them.
- Managed tool runner returns `ExecuteToolCallsAction` and `managed/action_executor`
  performs MCP calls and side effects.
- Partial-message persistence and stop/cancel ordering stay in `LLMChatManager` to
  avoid drift during orchestration.

## Open questions
- Should the managed package be exported in `chat_toolkit/__init__.py` or kept separate?
- Should listener code be allowed to opt into managed modules, or stay core-only by default?
