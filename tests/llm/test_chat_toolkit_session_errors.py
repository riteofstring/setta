from typing import Any, AsyncIterator, Awaitable, Callable

import pytest

from setta.api.chat_toolkit import (
    ChatHistoryClient,
    ChatSectionSyncClient,
    ChatSession,
    ChatStreamEmitterClient,
    ChatToolRunnerClient,
)
from setta.api.listener_endpoint_client import RouterEndpointAPI
from setta.api.listener import ListenerCallbackContext, SettaListener
from setta.types.chat import Chat, ChatSectionState
from setta.llm.chat_toolkit.section_sync import (
    apply_stream_delta,
    build_chat_section_state,
)
from setta.types.chat_messages import (
    AssistantChatMessage,
    ChatFileAttachment,
    ChatRole,
    MessageTextContent,
    SystemChatMessage,
    UserChatMessage,
)
from setta.types.chat_stream_events import MessageFinalizedEvent
from setta.types.generated.go_shared_types import ChatSendEvent, LLMConfig
from setta.types.id import ID
from setta.types.listener import ListenerDependencyCatalog
from tests.helpers.listener_runtime_state import (
    build_listener_runtime_state_from_catalog,
)


def _build_listener_context(
    project_config_id: ID,
    router_caller: Callable[[str, object], Awaitable[object]],
) -> ListenerCallbackContext:
    listener = SettaListener(project_name=f"Project {project_config_id}")
    listener._runtime_state = build_listener_runtime_state_from_catalog(
        ListenerDependencyCatalog(entries=[])
    )
    listener._project_config_id = project_config_id
    listener._is_registered = True
    listener._router_endpoint_api = RouterEndpointAPI(router_caller)

    @listener.listen()
    def _noop(_state: Any, _ctx: ListenerCallbackContext) -> None:
        return None

    spec = next(iter(listener._callbacks.values()))
    return listener._build_callback_context(spec, {})


def _derive_chat_name(first_message: object) -> str:
    content = getattr(first_message, "content", [])
    for block in content:
        text = getattr(block, "text", None)
        if isinstance(text, str) and text:
            return text[:30]
    return "chat"


def _build_chat(
    *,
    chat_id: ID,
    llm_config: LLMConfig,
    first_message: object,
    project_config_id: ID | None = None,
) -> Chat:
    return Chat(
        id=chat_id,
        name=_derive_chat_name(first_message),
        llmConfig=llm_config,
        projectConfigId=project_config_id,
        messages=[first_message],
        systemPrompt=None,
    )


def _append_chat_messages(chat: Chat, messages: list[object]) -> Chat:
    existing_ids = {message.id for message in chat.messages}
    new_messages = [message for message in messages if message.id not in existing_ids]
    return chat.model_copy(update={"messages": [*chat.messages, *new_messages]})


class TestChatSessionErrors:
    pytestmark = pytest.mark.asyncio

    async def test_stream_exception_resets_waiting_state(self) -> None:
        llm_config = LLMConfig(id="test-llm", model="gpt-test")
        section_id = ID("section-1")
        first_message = UserChatMessage(
            content=[MessageTextContent(text="Hello")],
        )
        chat = _build_chat(
            chat_id=ID("chat-1"), llm_config=llm_config, first_message=first_message
        )
        chats: dict[ID, Chat] = {chat.id: chat}
        section_states: dict[ID, ChatSectionState] = {
            section_id: build_chat_section_state(messages=chat.messages),
        }

        async def router_caller(endpoint_name: str, payload: object) -> object:
            if not isinstance(payload, dict):
                raise TypeError("payload must be a dict")
            if endpoint_name == "route_get_chat":
                return chats[payload["chatId"]].model_dump(mode="json")
            if endpoint_name == "route_append_chat_messages":
                chat_entry = _append_chat_messages(
                    chats[payload["chatId"]], payload["messages"]
                )
                chats[chat_entry.id] = chat_entry
                return chat_entry.model_dump(mode="json")
            if endpoint_name == "route_emit_chat_stream_delta":
                target_section_id = payload["sectionId"]
                current = section_states.get(target_section_id)
                if current is None:
                    current = build_chat_section_state(messages=[])
                section_states[target_section_id] = apply_stream_delta(
                    state=current,
                    chunk=payload["chunk"],
                )
                return None
            if endpoint_name == "route_set_chat_section_state":
                target_section_id = payload["sectionId"]
                section_states[target_section_id] = ChatSectionState.model_validate(
                    payload["state"]
                )
                return None
            raise KeyError(f"Unknown endpoint {endpoint_name}")

        api = RouterEndpointAPI(router_caller)
        history_client = ChatHistoryClient(api)
        stream_client = ChatStreamEmitterClient(api)
        tools_client = ChatToolRunnerClient(api)
        sync_client = ChatSectionSyncClient(api, history_client)
        session = ChatSession(
            section_id=section_id,
            chat_id=chat.id,
            history=history_client,
            stream=stream_client,
            tools=tools_client,
            sync=sync_client,
        )

        async def provider_stream() -> AsyncIterator[str]:
            yield "Hello"
            raise RuntimeError("stream failure")

        with pytest.raises(RuntimeError):
            await session.stream_text(provider_stream())

        assert not section_states[section_id].waitingForResponse

    async def test_cancel_emits_message_finalized_when_partial_message(self) -> None:
        llm_config = LLMConfig(id="test-llm", model="gpt-test")
        section_id = ID("section-1")
        first_message = UserChatMessage(
            content=[MessageTextContent(text="Hello")],
        )
        chat = _build_chat(
            chat_id=ID("chat-1"), llm_config=llm_config, first_message=first_message
        )
        chats: dict[ID, Chat] = {chat.id: chat}
        section_states: dict[ID, ChatSectionState] = {
            section_id: build_chat_section_state(messages=chat.messages),
        }
        emitted_chunks: list[object] = []

        async def router_caller(endpoint_name: str, payload: object) -> object:
            if not isinstance(payload, dict):
                raise TypeError("payload must be a dict")
            if endpoint_name == "route_get_chat":
                return chats[payload["chatId"]].model_dump(mode="json")
            if endpoint_name == "route_append_chat_messages":
                chat_entry = _append_chat_messages(
                    chats[payload["chatId"]], payload["messages"]
                )
                chats[chat_entry.id] = chat_entry
                return chat_entry.model_dump(mode="json")
            if endpoint_name == "route_emit_chat_stream_delta":
                chunk = payload["chunk"]
                emitted_chunks.append(chunk)
                target_section_id = payload["sectionId"]
                current = section_states.get(target_section_id)
                if current is None:
                    current = build_chat_section_state(messages=[])
                section_states[target_section_id] = apply_stream_delta(
                    state=current,
                    chunk=chunk,
                )
                return None
            if endpoint_name == "route_set_chat_section_state":
                target_section_id = payload["sectionId"]
                section_states[target_section_id] = ChatSectionState.model_validate(
                    payload["state"]
                )
                return None
            raise KeyError(f"Unknown endpoint {endpoint_name}")

        api = RouterEndpointAPI(router_caller)
        history_client = ChatHistoryClient(api)
        stream_client = ChatStreamEmitterClient(api)
        tools_client = ChatToolRunnerClient(api)
        sync_client = ChatSectionSyncClient(api, history_client)
        session = ChatSession(
            section_id=section_id,
            chat_id=chat.id,
            history=history_client,
            stream=stream_client,
            tools=tools_client,
            sync=sync_client,
        )

        async def provider_stream() -> AsyncIterator[str]:
            yield "Hello"
            raise RuntimeError("stream failure")

        with pytest.raises(RuntimeError):
            await session.stream_text(provider_stream())

        finalized_chunks = [
            chunk
            for chunk in emitted_chunks
            if isinstance(chunk, MessageFinalizedEvent)
        ]
        assert finalized_chunks
        finalized = finalized_chunks[0].message
        assert isinstance(finalized, AssistantChatMessage)
        assert finalized.content
        assert finalized.content[0].text == "Hello"


class TestChatSessionOpenFromEvent:
    pytestmark = pytest.mark.asyncio

    async def test_open_from_event_uses_system_role(self) -> None:
        llm_config = LLMConfig(id="test-llm", model="gpt-test")
        engine_config_id = None
        section_id = ID("section-1")
        captured_messages: list[object] = []
        section_chat_ids: dict[ID, ID] = {}

        async def router_caller(endpoint_name: str, payload: object) -> object:
            if not isinstance(payload, dict):
                raise TypeError("payload must be a dict")
            if endpoint_name == "route_get_chat_section_chat_id":
                chat_id = section_chat_ids.get(payload["sectionId"])
                return str(chat_id) if chat_id else None
            if endpoint_name == "route_set_chat_section_chat_id":
                section_chat_ids[payload["sectionId"]] = payload["chatId"]
                return None
            if endpoint_name == "route_create_chat":
                first_message = payload["firstMessage"]
                captured_messages.append(first_message)
                chat_entry = _build_chat(
                    chat_id=ID(f"chat-{len(captured_messages)}"),
                    llm_config=llm_config,
                    first_message=first_message,
                )
                return chat_entry.model_dump(mode="json")
            raise KeyError(f"Unknown endpoint {endpoint_name}")

        project_config_id = ID("proj-chat-system")
        ctx = _build_listener_context(project_config_id, router_caller)

        event = ChatSendEvent(
            action="send",
            sectionId=section_id,
            messageId="msg-1",
            text="System note",
            attachments=[],
            role=ChatRole.system,
            timestampMs=123,
            managed=True,
        )
        await ChatSession.open_from_event(
            ctx=ctx,
            section_id=section_id,
            engine_config_id=engine_config_id,
            event=event,
        )

        assert len(captured_messages) == 1
        assert isinstance(captured_messages[0], SystemChatMessage)

    async def test_open_from_event_preserves_attachments(self) -> None:
        llm_config = LLMConfig(id="test-llm", model="gpt-test")
        engine_config_id = None
        section_id = ID("section-1")
        captured_messages: list[object] = []
        section_chat_ids: dict[ID, ID] = {}

        async def router_caller(endpoint_name: str, payload: object) -> object:
            if not isinstance(payload, dict):
                raise TypeError("payload must be a dict")
            if endpoint_name == "route_get_chat_section_chat_id":
                chat_id = section_chat_ids.get(payload["sectionId"])
                return str(chat_id) if chat_id else None
            if endpoint_name == "route_set_chat_section_chat_id":
                section_chat_ids[payload["sectionId"]] = payload["chatId"]
                return None
            if endpoint_name == "route_create_chat":
                first_message = payload["firstMessage"]
                captured_messages.append(first_message)
                chat_entry = _build_chat(
                    chat_id=ID(f"chat-{len(captured_messages)}"),
                    llm_config=llm_config,
                    first_message=first_message,
                )
                return chat_entry.model_dump(mode="json")
            raise KeyError(f"Unknown endpoint {endpoint_name}")

        project_config_id = ID("proj-chat-attachments")
        ctx = _build_listener_context(project_config_id, router_caller)

        attachment = ChatFileAttachment(
            id="artifacts/notes.txt",
            name="notes.txt",
            mimeType="text/plain",
            size=12,
        )
        event = ChatSendEvent(
            action="send",
            sectionId=section_id,
            messageId="msg-1",
            text="User note",
            attachments=[attachment],
            role=ChatRole.user,
            timestampMs=123,
            managed=True,
        )
        await ChatSession.open_from_event(
            ctx=ctx,
            section_id=section_id,
            engine_config_id=engine_config_id,
            event=event,
        )

        assert len(captured_messages) == 1
        message = captured_messages[0]
        assert isinstance(message, UserChatMessage)
        assert len(message.attachments) == 1
        assert message.attachments[0].id == "artifacts/notes.txt"

    async def test_open_from_event_uses_assistant_role(self) -> None:
        llm_config = LLMConfig(id="test-llm", model="gpt-test")
        engine_config_id = None
        section_id = ID("section-1")
        captured_messages: list[object] = []
        section_chat_ids: dict[ID, ID] = {}

        async def router_caller(endpoint_name: str, payload: object) -> object:
            if not isinstance(payload, dict):
                raise TypeError("payload must be a dict")
            if endpoint_name == "route_get_chat_section_chat_id":
                chat_id = section_chat_ids.get(payload["sectionId"])
                return str(chat_id) if chat_id else None
            if endpoint_name == "route_set_chat_section_chat_id":
                section_chat_ids[payload["sectionId"]] = payload["chatId"]
                return None
            if endpoint_name == "route_create_chat":
                first_message = payload["firstMessage"]
                captured_messages.append(first_message)
                chat_entry = _build_chat(
                    chat_id=ID(f"chat-{len(captured_messages)}"),
                    llm_config=llm_config,
                    first_message=first_message,
                )
                return chat_entry.model_dump(mode="json")
            raise KeyError(f"Unknown endpoint {endpoint_name}")

        project_config_id = ID("proj-chat-assistant")
        ctx = _build_listener_context(project_config_id, router_caller)

        event = ChatSendEvent(
            action="send",
            sectionId=section_id,
            messageId="msg-1",
            text="Assistant note",
            attachments=[],
            role=ChatRole.assistant,
            timestampMs=123,
            managed=True,
        )
        await ChatSession.open_from_event(
            ctx=ctx,
            section_id=section_id,
            engine_config_id=engine_config_id,
            event=event,
        )

        assert len(captured_messages) == 1
        assert isinstance(captured_messages[0], AssistantChatMessage)

    async def test_open_from_event_rejects_tool_role(self) -> None:
        engine_config_id = None
        section_id = ID("section-1")

        async def router_caller(endpoint_name: str, _payload: object) -> object:
            raise KeyError(f"Unknown endpoint {endpoint_name}")

        project_config_id = ID("proj-chat-tool")
        ctx = _build_listener_context(project_config_id, router_caller)

        event = ChatSendEvent(
            action="send",
            sectionId=section_id,
            messageId="msg-1",
            text="Tool note",
            attachments=[],
            role=ChatRole.tool,
            timestampMs=123,
            managed=True,
        )

        with pytest.raises(ValueError):
            await ChatSession.open_from_event(
                ctx=ctx,
                section_id=section_id,
                engine_config_id=engine_config_id,
                event=event,
            )
