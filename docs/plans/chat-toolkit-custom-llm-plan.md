# Chat Toolkit for Custom LLM Providers

## Goals
- Give listener authors reusable utilities for chat history, message building, streaming deltas, and tool calls.
- Allow partial adoption: use only the pieces you want, keep the rest custom.
- Support custom LLM provider libraries while keeping Chat section UX consistent.
- Preserve existing managed mode and the current LLMChatManager behavior.

## Non-goals
- Replace LLMChatManager or remove LiteLLM support.
- Add backward compatibility shims for old listener patterns.
- Redesign chat UI or introduce new section types.

## Current state
- Core toolkit modules exist under `backend/setta/llm/chat_toolkit/` (history, messages, stream assembler, tool calls, tool runner, section sync).
- Listener router endpoints expose chat toolkit routes in `backend/setta/routers/listener.py`.
- Listener helpers live in `backend/setta/api/chat_toolkit.py` and are exported from `backend/setta/api/__init__.py`.
- Docs/examples exist in `docs/chat-toolkit.md`.
- Core chat persistence utilities remain in `backend/setta/project_state/chats/` and `backend/setta/llm/chat_store.py`.

## Proposal
Introduce a modular chat toolkit with provider-agnostic helpers plus a listener-facing client layer.
The toolkit is composable, so developers can opt into history, streaming, tool calls, or section syncing independently.

### Core toolkit modules (backend, provider-agnostic)
Location suggestion: `backend/setta/llm/chat_toolkit/`
- `history.py`: wrappers around `ChatStore` for create/load/append/delete/set_system_prompt.
- `messages.py`: message and content builders using `setta.types.chat_messages`.
- `stream_assembler.py`: assemble assistant messages from text/tool deltas and emit `LLMStreamingResponseChunk` when desired.
- `tool_calls.py`: accumulate tool call deltas into `ToolCall` objects and finalize arguments.
- `tool_runner.py`: execute MCP tool calls via `MultiMCPClient` and return `ToolChatMessage` results.
- `section_sync.py`: translate chat history + in-flight state into `ChatSectionState` payloads.

### Listener-facing toolkit (client helpers)
Location suggestion: `backend/setta/api/chat_toolkit.py`
- `ChatHistoryClient`: uses router endpoints to create/get/append/delete chats.
- `ChatStreamAssembler`: pure utility for building assistant content while streaming.
- `ChatToolRunnerClient`: calls backend to execute MCP tools and returns ToolChatMessage results.
- `ChatSectionSyncClient`: updates `ChatSectionState` via `route_set_chat_section_state`.
- Optional `ChatSession` orchestrator that composes the above, but each class remains usable alone.

### DX helpers (recommended)
Add small utilities to reduce listener boilerplate while keeping the low-level toolkit available.
- `on_chat_send_event(ctx, section_id) -> ChatSendEvent | None`:
  Parse the chat action event payload, validate, and return a typed event.
- `ChatSession.open_from_event(...)`:
  Resolve or create the chatId mapping, append the user message, and return a session helper.
- `ChatSession.stream(...)`:
  Accept an async provider stream and a `normalize_chunk` callback that maps provider output
  into `text_delta` / `tool_call_delta` calls (Option A normalization).
- `ChatSession.stream_text(...)`:
  Convenience for text-only streaming.
- `ChatSession.complete(text=...)`:
  Write a full assistant message and sync section state.

### Example usage (direct toolkit)

#### Streaming + tools with chunk emission
```python
from setta.api.chat_toolkit import (
    ChatHistoryClient,
    ChatStreamAssembler,
    ChatStreamEmitterClient,
    ChatToolRunnerClient,
    ChatSectionSyncClient,
    ToolCallBuilder,
    message_text,
    user_message,
)

history = ChatHistoryClient(ctx.project_manager)
stream = ChatStreamEmitterClient(ctx.project_manager)
tools = ChatToolRunnerClient(ctx.project_manager)
sync = ChatSectionSyncClient(ctx.project_manager)

event = on_chat_send_event(ctx, section_id=section_id)
if not event:
    return

chat_id = await history.ensure_section_chat_id(
    project_config_id=ctx.project_config_id,
    section_id=section_id,
    llm_config_id="my-llm",
    first_message=user_message([message_text(event.text)]),
)

assembler = ChatStreamAssembler()
assistant = assembler.start_assistant_message()
await stream.emit_message_start(chat_id, assistant.preview())

for chunk in provider.stream(event.text):
    if chunk.text:
        assistant.append_text(chunk.text)
        await stream.emit_text_delta(chat_id, assistant.id, chunk.text)
    if chunk.tool_call:
        call = ToolCallBuilder.from_name_and_args(
            name=chunk.tool_call.name,
            arguments=chunk.tool_call.arguments,
        )
        assistant.append_tool_call(call)
        await stream.emit_tool_call_delta(
            chat_id,
            assistant.id,
            call.id,
            chunk.tool_call.arguments_delta,
            call.function.name,
        )

assistant_msg = assistant.finalize()
await history.append(chat_id, [assistant_msg])
await stream.emit_message_finalized(chat_id, assistant_msg)

if assistant_msg.tool_calls:
    tool_results = await tools.run(
        project_config_id=ctx.project_config_id,
        chat_id=chat_id,
        tool_calls=assistant_msg.tool_calls,
    )
    await history.append(chat_id, tool_results)

await sync.update_from_chat(section_id=section_id, chat_id=chat_id)
```

#### History-only (no streaming, no tools)
```python
from setta.api.chat_toolkit import (
    ChatHistoryClient,
    ChatSectionSyncClient,
    message_text,
    user_message,
    assistant_message,
)

history = ChatHistoryClient(ctx.project_manager)
sync = ChatSectionSyncClient(ctx.project_manager)

event = on_chat_send_event(ctx, section_id=section_id)
if not event:
    return

chat_id = await history.ensure_section_chat_id(
    project_config_id=ctx.project_config_id,
    section_id=section_id,
    llm_config_id="my-llm",
    first_message=user_message([message_text(event.text)]),
)

reply = provider.complete(event.text)
assistant_msg = assistant_message([message_text(reply)])
await history.append(chat_id, [assistant_msg])
await sync.update_from_chat(section_id=section_id, chat_id=chat_id)
```

### Example usage (DX helpers)

#### Streaming + tools
```python
from setta.api.chat_toolkit import (
    on_chat_send_event,
    ChatSession,
    ToolCallBuilder,
)

event = on_chat_send_event(ctx, section_id=section_id)
if not event:
    return

session = await ChatSession.open_from_event(
    ctx=ctx,
    section_id=section_id,
    llm_config_id="my-llm",
)

async def normalize(chunk):
    if chunk.text:
        session.text_delta(chunk.text)
    if chunk.tool_call:
        session.tool_call_delta(
            ToolCallBuilder.from_name_and_args(
                name=chunk.tool_call.name,
                arguments=chunk.tool_call.arguments,
            )
        )

await session.stream(
    provider_stream=provider.stream(event.text),
    normalize_chunk=normalize,
    run_tools=True,
)
```

#### Text-only streaming
```python
from setta.api.chat_toolkit import on_chat_send_event, ChatSession

event = on_chat_send_event(ctx, section_id=section_id)
if not event:
    return

session = await ChatSession.open_from_event(
    ctx=ctx,
    section_id=section_id,
    llm_config_id="my-llm",
)
await session.stream_text(provider.stream(event.text))
```

### New listener router endpoints
Place under `setta.routers.listener` so they are callable from listeners:
- `route_create_chat`: create a new chat with first message + llmConfigId.
- `route_get_chat`: load a chat by id.
- `route_append_chat_messages`: append messages to an existing chat.
- `route_delete_chat`: delete a chat.
- `route_set_chat_system_prompt`: update system prompt.
- `route_get_all_chat_metadata`: list chat metadata for history.
- `route_run_mcp_tools`: execute tool calls and return ToolChatMessage results.
- `route_emit_chat_stream_delta`: broadcast `LLMStreamingResponseChunk` to frontend.

All request models must include `projectConfigId` to satisfy listener endpoint registry constraints.

## Data flow examples

### Custom provider + history + tools (recommended baseline)
1) Listener builds a user message and uses `ChatHistoryClient.append(...)`.
2) Provider streams tokens; `ChatStreamAssembler` updates assistant message text and tool call deltas.
3) Listener uses `ChatSectionSyncClient` to update UI state as text arrives.
4) When tool calls finish, listener uses `ChatToolRunnerClient.run(...)` and appends ToolChatMessage results.
5) Final assistant message is persisted and `waitingForResponse` is cleared.

### History-only (no streaming, no tools)
1) Listener creates or loads a chat with `ChatHistoryClient`.
2) Listener writes full assistant messages after completion.
3) UI renders from `ChatSectionState` updates or fetched history.

### Custom streaming but no tool execution
1) Listener uses stream assembler to build assistant text deltas.
2) Tool call deltas are ignored or handled by custom tool logic.

## Implementation plan
1) Extract reusable utilities from `LLMChatManager` into `backend/setta/llm/chat_toolkit/` - DONE
2) Add new request/response types for toolkit endpoints in a non-generated types module - DONE
3) Implement listener router endpoints in `backend/setta/routers/listener.py` - DONE
4) Update `backend/setta/api/generated_listener_endpoints.py` via the existing codegen flow if needed - DONE
5) Build listener toolkit classes in `backend/setta/api/chat_toolkit.py` and export from `backend/setta/api/__init__.py` - DONE
6) Add docs/examples showing custom-provider usage and partial adoption patterns - DONE
7) Add backend tests for - DONE
   - Chat history operations (use `MemoryChatStore` or DBE-backed fixtures).
   - Stream assembler delta handling (text + tool call).
   - Tool call accumulator and tool runner integration.
   - Section state sync (`apply_stream_delta`) coverage.
8) Manual validation - TODO:
   - Scriptable Chat section with custom provider streaming and tool calls.
   - History persistence across reloads.
   - Multiple Chat sections with isolated histories.

## Decisions
- Use streaming chunk emission as the primary custom-provider UX; keep section state sync for final and throttled updates.
- Persist chats globally with section -> chatId mapping (no per-section chat storage by default).
- Listener code normalizes provider output into Setta chat/tool shapes; toolkit stays provider-agnostic.
- `route_emit_chat_stream_delta` is fire-and-forget and applies deltas directly to `ChatSectionState`.
  - Required fields: `projectConfigId`, `sectionId`, `chatId`, `chunk`.
  - `message_start` creates/updates the assistant message; `delta` and `tool_call_delta` will
    create a placeholder assistant message if missing (using `message_id`).
  - `tool_call_delta` appends to `toolCallArguments[tool_call_id]` by string concatenation.
  - `tool_result` appends the tool message to `messages`.
  - `message_stop` / `message_finalized` clear `waitingForResponse`.
  - The route does not require an existing persisted chat; it only updates section state.
- `route_run_mcp_tools` resolves MCP servers from the persisted chat’s `llmConfig`.
  - Required fields: `projectConfigId`, `chatId`, `toolCalls`.
  - Returns a list of `ToolChatMessage` results; raises if `chatId` is unknown.
- `ChatHistoryClient` exposes `ensure_section_chat_id(...)` as a direct-toolkit convenience.
  `ChatSession.open_from_event(...)` uses it internally.
- Stop behavior is explicit:
  - Add a stop action payload on Chat sections so listeners can react.
  - `ChatSession.cancel()` emits `message_stop`, clears `waitingForResponse`, and persists
    partial assistant content if any is present.

## Relationship to chat-section-ai-plan
This plan complements `docs/plans/chat-section-ai-plan.md` by giving scriptable Chat sections a reusable toolkit so custom LLM providers do not require reimplementing history, streaming, or tool calls.
