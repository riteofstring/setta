from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from setta.database.db_objs import DBE
from setta.llm.chat_store import AgentRunChatStore
from setta.llm.chat_toolkit import assistant_message, message_text, user_message
from setta.llm.chat_toolkit.history import ChatHistory
from setta.llm.chat_toolkit.tool_calls import ToolCallBuilder
from setta.types.chat_messages import ToolChatMessage
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.api.chat_toolkit import ChatHistoryClient, ChatToolRunnerClient
from setta.api.generated_listener_endpoints import RouterEndpointAPI


class TestChatToolkitListenerClient:
    pytestmark = pytest.mark.asyncio

    async def test_history_client_coerces_chat_payloads(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            history = ChatHistory(AgentRunChatStore(dbe))
            llm_config = LLMConfig(id="test-llm", model="gpt-test")
            engine_config_id = None
            section_id = ID("section-1")
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
                    chat = history.create(
                        first_message=payload["firstMessage"],
                        llm_config=llm_config,
                    )
                    return chat.model_dump(mode="json")
                if endpoint_name == "route_get_chat":
                    chat = history.require(payload["chatId"])
                    return chat.model_dump(mode="json")
                if endpoint_name == "route_append_chat_messages":
                    chat = history.append(payload["chatId"], payload["messages"])
                    return chat.model_dump(mode="json")
                if endpoint_name == "route_set_chat_system_prompt":
                    chat = history.set_system_prompt(
                        payload["chatId"],
                        payload["systemPrompt"],
                    )
                    return chat.model_dump(mode="json")
                if endpoint_name == "route_get_all_chat_metadata":
                    metadata = history.list_metadata()
                    return [entry.model_dump(mode="json") for entry in metadata]
                if endpoint_name == "route_delete_chat":
                    history.delete(payload["chatId"])
                    return None
                raise KeyError(f"Unknown endpoint {endpoint_name}")

            api = RouterEndpointAPI(router_caller)
            client = ChatHistoryClient(api)

            chat_id, created = await client.ensure_section_chat_id(
                section_id=section_id,
                engine_config_id=engine_config_id,
                first_message=user_message([message_text("Hello listener")]),
            )
            assert created

            chat_id_repeat, created_repeat = await client.ensure_section_chat_id(
                section_id=section_id,
                engine_config_id=engine_config_id,
                first_message=user_message([message_text("Hello listener")]),
            )
            assert chat_id_repeat == chat_id
            assert not created_repeat
            chat = await client.get(chat_id=chat_id)
            assert chat.projectConfigId is None

            updated = await client.append(
                chat_id=chat_id,
                messages=[assistant_message([message_text("Reply")])],
            )
            assert len(updated.messages) == 2

            updated = await client.set_system_prompt(
                chat_id=chat_id,
                system_prompt="System prompt",
            )
            assert updated.systemPrompt == "System prompt"

            metadata = await client.get_all_metadata()
            assert metadata
            assert metadata[0].projectConfigId is None

    async def test_tool_runner_client_coerces_messages(self) -> None:
        chat_id = ID("chat-1")
        section_id = ID("section-1")

        async def router_caller(endpoint_name: str, payload: object) -> object:
            if endpoint_name != "route_run_mcp_tools":
                raise KeyError(f"Unknown endpoint {endpoint_name}")
            if not isinstance(payload, dict):
                raise TypeError("payload must be a dict")
            assert payload.get("sectionId") == section_id
            tool_calls = payload["toolCalls"]
            tool_call_id = tool_calls[0].id if tool_calls else "tool-call-1"
            message = ToolChatMessage(
                tool_call_id=tool_call_id,
                tool_name="setta__list_mcp_tools",
                arguments={},
                content=[],
                is_error=False,
                result={},
            )
            return [message.model_dump(mode="json")]

        api = RouterEndpointAPI(router_caller)
        client = ChatToolRunnerClient(api)
        tool_call = ToolCallBuilder.from_name_and_args(
            name="setta__list_mcp_tools",
            arguments={},
            tool_call_id="tool-call-1",
        )

        messages = await client.run(
            chat_id=chat_id,
            section_id=section_id,
            tool_calls=[tool_call],
        )

        assert messages
        assert isinstance(messages[0], ToolChatMessage)
