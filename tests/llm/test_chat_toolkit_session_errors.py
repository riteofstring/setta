import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, AsyncIterator, Awaitable, Callable

from setta.api.chat_toolkit import (
    ChatHistoryClient,
    ChatSectionSyncClient,
    ChatSession,
    ChatStreamEmitterClient,
    ChatToolRunnerClient,
)
from setta.api.generated_listener_endpoints import RouterEndpointAPI
from setta.api.listener import ListenerCallbackContext, SettaListener
from setta.database.db_objs import DBE
from setta.llm.chat_store import DBEChatStore
from setta.llm.chat_toolkit.history import ChatHistory
from setta.llm.chat_toolkit.section_sync import apply_stream_delta, build_chat_section_state
from setta.types.chat_messages import (
    AssistantChatMessage,
    ChatRole,
    MessageTextContent,
    SystemChatMessage,
    UserChatMessage,
)
from setta.types.chat_stream_events import MessageFinalizedEvent
from setta.types.chat_toolkit import ChatSendEvent
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import ChatSectionImpl, ChatSectionState


def _build_chat_project_state(project_config_id: ID) -> ProjectStateSingleConfig:
    section_impl = ChatSectionImpl(
        id=ID(f"{project_config_id}-chat-impl"),
        name="Chat Section",
        chatId=ID(f"{project_config_id}-chat-id"),
    )
    section_variant = Variant(
        id=ID(f"{project_config_id}-chat-variant"),
        name="Chat Variant",
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    section_core = Core(
        id=ID(f"{project_config_id}-chat"),
        name="Chat Section",
        variants=[section_variant.id],
        defaultVariant=section_variant.id,
    )
    project_config = ProjectConfig(
        id=project_config_id,
        name=f"Project {project_config_id}",
        sectionVariantMap={section_core.id: section_variant.id},
        topLevelSections={section_core.id: TopLevelSectionLayout()},
    )
    return ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section_core.id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
    )


def _build_listener_context(
    project_state: ProjectStateSingleConfig,
    router_caller: Callable[[str, object], Awaitable[object]],
) -> ListenerCallbackContext:
    listener = SettaListener(project_name=project_state.projectConfig.name)
    listener._runtime_state = listener._build_runtime_state(project_state)
    listener._project_config_id = project_state.projectConfig.id
    listener._is_registered = True
    listener._router_endpoint_api = RouterEndpointAPI(router_caller)

    @listener.listen()
    def _noop(state: Any, ctx: ListenerCallbackContext) -> None:
        return None

    spec = next(iter(listener._callbacks.values()))
    return listener._build_callback_context(spec, {})


class ChatSessionErrorTests(unittest.IsolatedAsyncioTestCase):
    async def test_stream_exception_resets_waiting_state(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            history = ChatHistory(DBEChatStore(dbe))
            llm_config = LLMConfig(id="test-llm", model="gpt-test")
            section_id = ID("section-1")
            first_message = UserChatMessage(
                content=[MessageTextContent(text="Hello")],
            )
            chat = history.create(
                first_message=first_message,
                llm_config=llm_config,
            )
            section_states: dict[ID, ChatSectionState] = {
                section_id: build_chat_section_state(messages=chat.messages),
            }

            async def router_caller(endpoint_name: str, payload: object) -> object:
                if not isinstance(payload, dict):
                    raise TypeError("payload must be a dict")
                if endpoint_name == "route_get_chat":
                    chat_entry = history.require(payload["chatId"])
                    return chat_entry.model_dump(mode="json")
                if endpoint_name == "route_append_chat_messages":
                    chat_entry = history.append(payload["chatId"], payload["messages"])
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

            with self.assertRaises(RuntimeError):
                await session.stream_text(provider_stream())

            self.assertFalse(section_states[section_id].waitingForResponse)

    async def test_cancel_emits_message_finalized_when_partial_message(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            history = ChatHistory(DBEChatStore(dbe))
            llm_config = LLMConfig(id="test-llm", model="gpt-test")
            section_id = ID("section-1")
            first_message = UserChatMessage(
                content=[MessageTextContent(text="Hello")],
            )
            chat = history.create(
                first_message=first_message,
                llm_config=llm_config,
            )
            section_states: dict[ID, ChatSectionState] = {
                section_id: build_chat_section_state(messages=chat.messages),
            }
            emitted_chunks: list[object] = []

            async def router_caller(endpoint_name: str, payload: object) -> object:
                if not isinstance(payload, dict):
                    raise TypeError("payload must be a dict")
                if endpoint_name == "route_get_chat":
                    chat_entry = history.require(payload["chatId"])
                    return chat_entry.model_dump(mode="json")
                if endpoint_name == "route_append_chat_messages":
                    chat_entry = history.append(payload["chatId"], payload["messages"])
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

            with self.assertRaises(RuntimeError):
                await session.stream_text(provider_stream())

            finalized_chunks = [
                chunk
                for chunk in emitted_chunks
                if isinstance(chunk, MessageFinalizedEvent)
            ]
            self.assertTrue(finalized_chunks)
            finalized = finalized_chunks[0].message
            self.assertIsInstance(finalized, AssistantChatMessage)
            self.assertTrue(finalized.content)
            self.assertEqual(
                finalized.content[0].text,
                "Hello",
            )


class ChatSessionOpenFromEventTests(unittest.IsolatedAsyncioTestCase):
    async def test_open_from_event_uses_system_role(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            history = ChatHistory(DBEChatStore(dbe))
            llm_config = LLMConfig(id="test-llm", model="gpt-test")
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
                    chat_entry = history.create(
                        first_message=first_message,
                        llm_config=llm_config,
                    )
                    return chat_entry.model_dump(mode="json")
                raise KeyError(f"Unknown endpoint {endpoint_name}")

            project_state = _build_chat_project_state(ID("proj-chat-system"))
            ctx = _build_listener_context(project_state, router_caller)

            event = ChatSendEvent(
                sectionId=section_id,
                messageId="msg-1",
                text="System note",
                role=ChatRole.system,
                timestampMs=123,
                managed=True,
            )
            await ChatSession.open_from_event(
                ctx=ctx,
                section_id=section_id,
                llm_config_id=llm_config.id,
                event=event,
            )

            self.assertEqual(len(captured_messages), 1)
            self.assertIsInstance(captured_messages[0], SystemChatMessage)

    async def test_open_from_event_uses_assistant_role(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            history = ChatHistory(DBEChatStore(dbe))
            llm_config = LLMConfig(id="test-llm", model="gpt-test")
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
                    chat_entry = history.create(
                        first_message=first_message,
                        llm_config=llm_config,
                    )
                    return chat_entry.model_dump(mode="json")
                raise KeyError(f"Unknown endpoint {endpoint_name}")

            project_state = _build_chat_project_state(ID("proj-chat-assistant"))
            ctx = _build_listener_context(project_state, router_caller)

            event = ChatSendEvent(
                sectionId=section_id,
                messageId="msg-1",
                text="Assistant note",
                role=ChatRole.assistant,
                timestampMs=123,
                managed=True,
            )
            await ChatSession.open_from_event(
                ctx=ctx,
                section_id=section_id,
                llm_config_id=llm_config.id,
                event=event,
            )

            self.assertEqual(len(captured_messages), 1)
            self.assertIsInstance(captured_messages[0], AssistantChatMessage)

    async def test_open_from_event_rejects_tool_role(self) -> None:
        with TemporaryDirectory() as temp_dir:
            llm_config = LLMConfig(id="test-llm", model="gpt-test")
            section_id = ID("section-1")

            async def router_caller(endpoint_name: str, payload: object) -> object:
                raise KeyError(f"Unknown endpoint {endpoint_name}")

            project_state = _build_chat_project_state(ID("proj-chat-tool"))
            ctx = _build_listener_context(project_state, router_caller)

            event = ChatSendEvent(
                sectionId=section_id,
                messageId="msg-1",
                text="Tool note",
                role=ChatRole.tool,
                timestampMs=123,
                managed=True,
            )

            with self.assertRaises(ValueError):
                await ChatSession.open_from_event(
                    ctx=ctx,
                    section_id=section_id,
                    llm_config_id=llm_config.id,
                    event=event,
                )


if __name__ == "__main__":
    unittest.main()
