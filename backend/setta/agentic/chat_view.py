from datetime import datetime, timezone
from typing import Any

from setta.agentic.chat_names import create_new_chat_name
from setta.llm.chat_toolkit.section_sync import build_chat_section_state
from setta.types.agentic import AgentRun, AgentRunStatus
from setta.types.chat_messages import AssistantChatMessage
from setta.types.generated.chat_messages import (
    BaseChatMessageTypeAdapter,
    BaseChatMessageUnion,
)
from setta.types.id import ID
from setta.types.section_impls import ChatSectionState
from setta.utils.generate_memorable_string import generate_memorable_string

LLM_CHAT_RUN_TYPE = "llm_chat"
SCRIPTABLE_CHAT_RUN_TYPE = "scriptable_chat"
EXTERNAL_AGENT_RUN_TYPE = "external_agent"


def get_run_type(run: AgentRun) -> str | None:
    if not run.inputs:
        return None
    raw_type = run.inputs.get("runType")
    if isinstance(raw_type, str) and raw_type:
        return raw_type
    return None


def is_llm_chat_run(run: AgentRun) -> bool:
    run_type = get_run_type(run)
    if not run_type:
        return False
    return run_type == LLM_CHAT_RUN_TYPE


def is_scriptable_chat_run(run: AgentRun) -> bool:
    run_type = get_run_type(run)
    if not run_type:
        return False
    return run_type == SCRIPTABLE_CHAT_RUN_TYPE


def is_external_agent_run(run: AgentRun) -> bool:
    run_type = get_run_type(run)
    if not run_type:
        return False
    return run_type == EXTERNAL_AGENT_RUN_TYPE


def is_chat_run(run: AgentRun) -> bool:
    run_type = get_run_type(run)
    if not run_type:
        return False
    return run_type in {
        LLM_CHAT_RUN_TYPE,
        SCRIPTABLE_CHAT_RUN_TYPE,
        EXTERNAL_AGENT_RUN_TYPE,
    }


def get_run_chat_id(run: AgentRun) -> ID | None:
    return _get_input_id(run, "chatId")


def get_run_project_config_id(run: AgentRun) -> ID | None:
    return _get_input_id(run, "projectConfigId")


def get_run_engine_config_id(run: AgentRun) -> ID | None:
    return _get_input_id(run, "engineConfigId")


def get_run_sort_key(run: AgentRun) -> datetime:
    return get_run_last_updated(run)


def get_run_last_updated(run: AgentRun) -> datetime:
    timestamps = [event.timestamp for event in run.events if event.timestamp]
    if timestamps:
        return max(timestamps)
    if run.finishedAt:
        return run.finishedAt
    if run.startedAt:
        return run.startedAt
    return datetime.min.replace(tzinfo=timezone.utc)


def build_chat_state_from_run(run: AgentRun) -> ChatSectionState:
    input_messages = _parse_input_messages(run)
    output_messages = _parse_output_messages(run)
    messages = _merge_input_and_output_messages(input_messages, output_messages)
    messages = _filter_response_placeholder_messages(messages)
    return build_chat_section_state(
        messages=messages,
        waiting_for_response=run.status == AgentRunStatus.running,
    )


def derive_chat_name(messages: list[BaseChatMessageUnion]) -> str:
    if not messages:
        return generate_memorable_string()
    return create_new_chat_name(messages[0])


def _parse_input_messages(run: AgentRun) -> list[BaseChatMessageUnion]:
    if not run.inputs:
        return []
    raw_messages = run.inputs.get("messages")
    if not isinstance(raw_messages, list):
        return []
    return _parse_raw_messages(raw_messages)


def _parse_output_messages(run: AgentRun) -> list[BaseChatMessageUnion] | None:
    if not run.outputs:
        return None
    raw_messages = run.outputs.get("messages")
    if not isinstance(raw_messages, list):
        return None
    return _parse_raw_messages(raw_messages)


def _merge_input_and_output_messages(
    input_messages: list[BaseChatMessageUnion],
    output_messages: list[BaseChatMessageUnion] | None,
) -> list[BaseChatMessageUnion]:
    if output_messages is None:
        return input_messages
    outputs_by_id = {message.id: message for message in output_messages}
    input_ids = {message.id for message in input_messages}
    merged = [outputs_by_id.get(message.id, message) for message in input_messages]
    for message in output_messages:
        if message.id not in input_ids:
            merged.append(message)
    return merged


def _parse_raw_messages(raw_messages: list[Any]) -> list[BaseChatMessageUnion]:
    return [BaseChatMessageTypeAdapter.validate_python(raw) for raw in raw_messages]


def _filter_response_placeholder_messages(
    messages: list[BaseChatMessageUnion],
) -> list[BaseChatMessageUnion]:
    filtered: list[BaseChatMessageUnion] = []
    for message in messages:
        if isinstance(message, AssistantChatMessage):
            if _is_response_message_id(message.id):
                if not message.content and not message.tool_calls:
                    continue
        filtered.append(message)
    return filtered


def _is_response_message_id(message_id: str) -> bool:
    return message_id.startswith("rs_") or message_id.startswith("resp_")


def _get_input_id(run: AgentRun, key: str) -> ID | None:
    if not run.inputs:
        return None
    raw_value = run.inputs.get(key)
    if isinstance(raw_value, str) and raw_value:
        return ID(raw_value)
    return None
