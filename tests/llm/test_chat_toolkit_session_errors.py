import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import AsyncIterator

from setta.api.chat_toolkit import (
    ChatHistoryClient,
    ChatSectionSyncClient,
    ChatSession,
    ChatStreamEmitterClient,
    ChatToolRunnerClient,
)
from setta.api.generated_listener_endpoints import RouterEndpointAPI
from setta.database.db_objs import DBE
from setta.llm.chat_store import DBEChatStore
from setta.llm.chat_toolkit.history import ChatHistory
from setta.llm.chat_toolkit.section_sync import apply_stream_delta, build_chat_section_state
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.types.section_impls import ChatSectionState


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


if __name__ == "__main__":
    unittest.main()
