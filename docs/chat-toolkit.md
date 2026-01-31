# Chat Toolkit for Custom LLM Providers

This toolkit gives listener authors composable helpers for chat history, message building, streaming deltas, tool calls, and Chat section state sync. The pieces are independent, so you can adopt only what you need.

## Key pieces
- Core utilities live under `setta.llm.chat_toolkit` (history, message builders, stream assembler, tool calls, tool runner, and section sync).
- Listener-friendly helpers live under `setta.api.chat_toolkit` (history client, stream emitter, tool runner client, section sync client, and session helper).

## Listener wiring
Chat send/stop clicks emit realtime dependency events for the chat section. Register a callback with the chat section dependency and a realtime dependency mode, then use the helpers to parse `ctx.events`:
```python
from setta.api import SettaListener
from setta.api.chat_toolkit import on_chat_send_event
from setta.types.listener import ListenerDependencyMode

listener = SettaListener(project_name="Demo Project")


@listener.listen(
    deps=["Chat"],
    dependency_mode=ListenerDependencyMode.REALTIME_ONLY,
)
async def on_chat(state, ctx) -> None:
    section_id = ctx.ids.section_id("Chat")
    event = on_chat_send_event(ctx, section_id=section_id)
    if not event:
        return
    ...
```
Use `ListenerDependencyMode.ALWAYS` if you also need snapshots.

## Event contract (send/stop)
Chat actions arrive as JSON strings in `event.payload`:

Send:
```json
{
  "action": "send",
  "sectionId": "section-id",
  "messageId": "message-id",
  "text": "hello",
  "attachments": [
    {
      "id": "artifacts/01J4.../notes.txt",
      "name": "notes.txt",
      "mimeType": "text/plain",
      "size": 1203
    }
  ],
  "role": "user",
  "timestampMs": 1710000000000,
  "managed": true
}
```

Stop:
```json
{
  "action": "stop",
  "sectionId": "section-id",
  "timestampMs": 1710000000000,
  "managed": false
}
```

Use the `managed` flag if you need to branch between managed and scriptable behavior.
`attachments` is always present (empty when none) and carries artifact metadata for any files attached to the message.

## Engine config ids (or none)
Listener chat history accepts an `engineConfigId` for internal (Setta LLM) engines. If you omit it (`None`/`null`), the chat runs in scriptable-only mode with a built-in "scriptable" LLM config (no provider, no MCP tools). External engines are not supported for listener chat history.

## Choosing a response pattern
Pick one of these patterns and stick to its API surface:
- One-shot reply: use `ChatSession.complete(...)` after `open_from_event(...)`.
- Streaming reply: use `ChatSession.stream_text(...)` or `ChatSession.stream(...)`; inside the stream callback, call `text_delta(...)` and `tool_call_delta(...)`.
- `text_delta(...)` and `tool_call_delta(...)` require an active assistant message started by `stream(...)`; calling them without a stream raises "no active assistant message".

## Example: streaming + tools (session helper)
```python
from setta.api.chat_toolkit import ChatSession, ToolCallBuilder, on_chat_send_event

event = on_chat_send_event(ctx, section_id=section_id)
if not event:
    return

session = await ChatSession.open_from_event(
    ctx=ctx,
    section_id=section_id,
    engine_config_id="engine-llm",
    event=event,
)

async def normalize(chunk):
    if chunk.text:
        await session.text_delta(chunk.text)
    if chunk.tool_call:
        await session.tool_call_delta(
            ToolCallBuilder.from_name_and_args(
                name=chunk.tool_call.name,
                arguments=chunk.tool_call.arguments,
            ),
            arguments_delta=chunk.tool_call.arguments_delta,
        )

await session.stream(
    provider_stream=provider.stream(event.text),
    normalize_chunk=normalize,
    run_tools=True,
)
```

## Example: direct toolkit (history + streaming)
```python
from setta.api.chat_toolkit import (
    ChatHistoryClient,
    ChatSectionSyncClient,
    ChatStreamAssembler,
    ChatStreamEmitterClient,
    ChatToolRunnerClient,
    ToolCallBuilder,
    message_text,
    on_chat_send_event,
)
from setta.types.chat_messages import UserChatMessage

history = ChatHistoryClient(ctx.project_manager)
stream = ChatStreamEmitterClient(ctx.project_manager, section_id=section_id)
tools = ChatToolRunnerClient(ctx.project_manager)
sync = ChatSectionSyncClient(ctx.project_manager)

event = on_chat_send_event(ctx, section_id=section_id)
if not event:
    return

first_message = UserChatMessage(
    id=event.messageId,
    content=[message_text(event.text)],
)
chat_id, created = await history.ensure_section_chat_id(
    section_id=section_id,
    engine_config_id="engine-llm",
    first_message=first_message,
)
if not created:
    await history.append(chat_id=chat_id, messages=[first_message])

assembler = ChatStreamAssembler()
assistant = assembler.start_assistant_message()
await stream.emit_message_start(chat_id=chat_id, message=assistant.preview())

async for chunk in provider.stream(event.text):
    if chunk.text:
        assistant.append_text(chunk.text)
        await stream.emit_text_delta(
            chat_id=chat_id,
            message_id=assistant.id,
            text=chunk.text,
        )
    if chunk.tool_call:
        call = ToolCallBuilder.from_name_and_args(
            name=chunk.tool_call.name,
            arguments=chunk.tool_call.arguments,
        )
        assistant.append_tool_call(call)
        await stream.emit_tool_call_delta(
            chat_id=chat_id,
            message_id=assistant.id,
            tool_call_id=call.id,
            arguments_delta=chunk.tool_call.arguments_delta,
            tool_name=call.function.name,
        )

assistant_message = assistant.finalize()
await history.append(chat_id=chat_id, messages=[assistant_message])
await stream.emit_message_finalized(chat_id=chat_id, message=assistant_message)

if assistant_message.tool_calls:
    tool_results = await tools.run(
        chat_id=chat_id,
        tool_calls=assistant_message.tool_calls,
    )
    await history.append(chat_id=chat_id, messages=tool_results)

await sync.update_from_chat(section_id=section_id, chat_id=chat_id)
```

## History-only (no streaming, no tools)
```python
from setta.api.chat_toolkit import (
    ChatHistoryClient,
    ChatSectionSyncClient,
    assistant_message,
    message_text,
    on_chat_send_event,
)
from setta.types.chat_messages import UserChatMessage

history = ChatHistoryClient(ctx.project_manager)
sync = ChatSectionSyncClient(ctx.project_manager)

event = on_chat_send_event(ctx, section_id=section_id)
if not event:
    return

first_message = UserChatMessage(
    id=event.messageId,
    content=[message_text(event.text)],
)
chat_id, created = await history.ensure_section_chat_id(
    section_id=section_id,
    engine_config_id=None,
    first_message=first_message,
)
if not created:
    await history.append(chat_id=chat_id, messages=[first_message])

reply = event.text
assistant_msg = assistant_message([message_text(reply)])
await history.append(chat_id=chat_id, messages=[assistant_msg])
await sync.update_from_chat(section_id=section_id, chat_id=chat_id)
```

## Stop actions
Chat sections emit a stop action when the user clicks the stop button. Use `on_chat_stop_event` or `on_chat_action_event` to read it from `ctx.events`, then call `ChatSession.cancel()` to persist partial assistant content and clear `waitingForResponse`.
