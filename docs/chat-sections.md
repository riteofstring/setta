# Chat Sections

Chat sections render a chat UI inside the canvas. They can run in managed mode (Setta LLM pipeline) or scriptable mode (listener-driven). Both modes emit realtime action events so listeners can observe send/stop activity.

## Core state fields
Chat sections store the following fields on the section impl:
- `managed`: toggles managed vs scriptable mode.
- `engineConfigId`: selected engine config (managed mode only).
- `chatId`: chat store id for managed mode (null means "new chat").
- `thinking`: toggles thinking behavior for managed mode.
- `messages`: list of chat messages (scriptable mode state; managed mode uses chat store).
- `inputText`: current input text for scriptable mode.
- `waitingForResponse`: whether the UI shows an inflight response.
- `toolCallArguments`: map of tool call ids to argument JSON text (streaming UI support).

## Managed mode
Managed mode uses the central LLM chat manager:
- The UI blocks sends until `engineConfigId` is selected and at least one engine config is available.
- `submitMessage` calls `route_get_llm_response` with `chatId`, `engineConfigId`, and `thinking`.
- Streaming updates arrive as `LLMStreamingResponse` events with `sectionId` set, and the frontend applies them to the chat section state.
- "New Chat" sets `chatId` to `null`; the next send creates a new chat and updates `chatId` after the response returns.
- Stop requests call `route_stop_llm_chat` with the active `chatId`.

## Scriptable mode
Scriptable mode keeps chat state inside the section:
- The UI updates `messages`, `inputText`, `waitingForResponse`, and `toolCallArguments` via `route_set_chat_section_state` (optimistic).
- Use listener code plus the chat toolkit to stream assistant content, append tool results, and sync the section state.
- `ChatSectionSyncClient.update_from_chat` can rebuild the section state from chat history when you want a full refresh.
- Listener chat history accepts an `engineConfigId` for internal engines, or `None` for scriptable-only chats.

## Realtime action events
Both modes emit `RealtimeDependencyEvent` for the chat section when the user sends or stops:

Send payload (JSON string):
```json
{
  "action": "send",
  "sectionId": "section-id",
  "messageId": "message-id",
  "text": "hello",
  "role": "user",
  "timestampMs": 1710000000000,
  "managed": true
}
```

Stop payload (JSON string):
```json
{
  "action": "stop",
  "sectionId": "section-id",
  "timestampMs": 1710000000000,
  "managed": false
}
```

Listener tips:
- Register with the chat section dependency and `dependency_mode=ListenerDependencyMode.REALTIME_ONLY` to handle send/stop events.
- Use `on_chat_send_event`, `on_chat_stop_event`, or `on_chat_action_event` from `setta.api.chat_toolkit` to parse `ctx.events`.

## Listener example (ChatSession)
```python
from setta.api import SettaListener
from setta.api.chat_toolkit import ChatSession, ToolCallBuilder, on_chat_send_event
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

## Related docs
- `docs/chat-toolkit.md`
- `docs/mcp-system-overview.md`
