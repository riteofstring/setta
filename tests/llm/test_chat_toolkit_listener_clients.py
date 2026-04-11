import pytest
from setta.api.chat_toolkit import ChatHistoryClient, ChatToolRunnerClient
from setta.api.listener_endpoint_client import (
    ROUTER_ENDPOINT_APPEND_CHAT_MESSAGES,
    ROUTER_ENDPOINT_CREATE_CHAT,
    ROUTER_ENDPOINT_DELETE_CHAT,
    ROUTER_ENDPOINT_GET_ALL_CHAT_METADATA,
    ROUTER_ENDPOINT_GET_CHAT,
    ROUTER_ENDPOINT_GET_CHAT_SECTION_CHAT_ID,
    ROUTER_ENDPOINT_RUN_MCP_TOOLS,
    ROUTER_ENDPOINT_SET_CHAT_SECTION_CHAT_ID,
    ROUTER_ENDPOINT_SET_CHAT_SECTION_STATE,
    ROUTER_ENDPOINT_SET_CHAT_SYSTEM_PROMPT,
    RouterEndpointAPI,
)
from setta.llm.chat_toolkit import assistant_message, message_text, user_message
from setta.llm.chat_toolkit.tool_calls import ToolCallBuilder
from setta.types.generated.go_shared_types import Chat, ChatMetadata, LLMConfig, ToolChatMessage
from setta.types.id import ID


def _build_llm_config() -> LLMConfig:
    return LLMConfig(
        id="test-llm",
        model="gpt-test",
        provider="openai",
        base_url="https://example.invalid/v1",
        api_key_env="SETTA_TEST_API_KEY",
        other_params={},
    )


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


def _append_messages(chat: Chat, messages: list[object]) -> Chat:
    existing_ids = {message.id for message in chat.messages}
    new_messages = [message for message in messages if message.id not in existing_ids]
    return chat.model_copy(update={"messages": [*chat.messages, *new_messages]})


class TestChatToolkitListenerClient:
    pytestmark = pytest.mark.asyncio

    async def test_history_client_coerces_chat_payloads(self) -> None:
        llm_config = _build_llm_config()
        engine_config_id = None
        section_id = ID("section-1")
        section_chat_ids: dict[ID, ID] = {}
        chats: dict[ID, Chat] = {}

        async def router_caller(endpoint_name: str, payload: object) -> object:
            if not isinstance(payload, dict):
                raise TypeError("payload must be a dict")
            if endpoint_name == ROUTER_ENDPOINT_GET_CHAT_SECTION_CHAT_ID:
                chat_id = section_chat_ids.get(payload["sectionId"])
                return str(chat_id) if chat_id else None
            if endpoint_name == ROUTER_ENDPOINT_SET_CHAT_SECTION_CHAT_ID:
                section_chat_ids[payload["sectionId"]] = payload["chatId"]
                return None
            if endpoint_name == ROUTER_ENDPOINT_CREATE_CHAT:
                chat_id = ID(f"chat-{len(chats) + 1}")
                chat = _build_chat(
                    chat_id=chat_id,
                    llm_config=llm_config,
                    first_message=payload["firstMessage"],
                )
                chats[chat.id] = chat
                return chat.model_dump(mode="json")
            if endpoint_name == ROUTER_ENDPOINT_GET_CHAT:
                return chats[payload["chatId"]].model_dump(mode="json")
            if endpoint_name == ROUTER_ENDPOINT_APPEND_CHAT_MESSAGES:
                chat = _append_messages(chats[payload["chatId"]], payload["messages"])
                chats[chat.id] = chat
                return chat.model_dump(mode="json")
            if endpoint_name == ROUTER_ENDPOINT_SET_CHAT_SYSTEM_PROMPT:
                chat = chats[payload["chatId"]].model_copy(
                    update={"systemPrompt": payload["systemPrompt"]}
                )
                chats[chat.id] = chat
                return chat.model_dump(mode="json")
            if endpoint_name == ROUTER_ENDPOINT_GET_ALL_CHAT_METADATA:
                metadata = [
                    ChatMetadata(
                        id=chat.id,
                        name=chat.name,
                        lastUpdated=chat.lastUpdated,
                        llmConfig=chat.llmConfig,
                        projectConfigId=chat.projectConfigId,
                    ).model_dump(mode="json")
                    for chat in chats.values()
                ]
                return metadata
            if endpoint_name == "route_delete_chat":
                del chats[payload["chatId"]]
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
            if endpoint_name != ROUTER_ENDPOINT_RUN_MCP_TOOLS:
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

    async def test_tool_runner_client_forwards_frontend_affinity_token(self) -> None:
        chat_id = ID("chat-1")
        section_id = ID("section-1")
        captured_payload: dict[str, object] = {}

        async def router_caller(endpoint_name: str, payload: object) -> object:
            if endpoint_name != ROUTER_ENDPOINT_RUN_MCP_TOOLS:
                raise KeyError(f"Unknown endpoint {endpoint_name}")
            if not isinstance(payload, dict):
                raise TypeError("payload must be a dict")
            captured_payload.update(payload)
            return []

        api = RouterEndpointAPI(router_caller)
        client = ChatToolRunnerClient(
            api,
            frontend_affinity_token="frontend-from-context",
        )
        tool_call = ToolCallBuilder.from_name_and_args(
            name="setta__list_mcp_tools",
            arguments={},
            tool_call_id="tool-call-1",
        )

        await client.run(
            chat_id=chat_id,
            section_id=section_id,
            tool_calls=[tool_call],
        )

        assert captured_payload.get("frontendAffinityToken") == "frontend-from-context"

    async def test_router_endpoint_api_uses_generated_route_constants(self) -> None:
        captured_call: tuple[str, object] | None = None

        async def router_caller(endpoint_name: str, payload: object) -> object:
            nonlocal captured_call
            captured_call = (endpoint_name, payload)
            return None

        api = RouterEndpointAPI(router_caller)
        payload = {"sectionId": ID("section-1"), "state": {}}

        await api.set_chat_section_state(payload)

        assert captured_call == (ROUTER_ENDPOINT_SET_CHAT_SECTION_STATE, payload)
