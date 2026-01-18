from datetime import datetime, timezone
from typing import Any

from pydantic import TypeAdapter

from setta.agentic.chat_names import create_new_chat_name
from setta.llm.chat_toolkit.section_sync import (
    apply_stream_delta,
    build_chat_section_state,
)
from setta.types.agentic import AgentRun, AgentRunStatus
from setta.types.chat_stream_events import LLMStreamingResponseChunk
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

_STREAM_CHUNK_ADAPTER = TypeAdapter(LLMStreamingResponseChunk)


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
    chat_id = _get_input_id(run, "chatId")
    if chat_id is not None:
        return chat_id
    for event in run.events:
        if event.type != "run_started":
            continue
        raw_chat_id = event.payload.get("chatId")
        if isinstance(raw_chat_id, str) and raw_chat_id:
            return ID(raw_chat_id)
    return None


def get_run_project_config_id(run: AgentRun) -> ID | None:
    project_config_id = _get_input_id(run, "projectConfigId")
    if project_config_id is not None:
        return project_config_id
    for event in run.events:
        if event.type != "run_started":
            continue
        raw_project_id = event.payload.get("projectConfigId")
        if isinstance(raw_project_id, str) and raw_project_id:
            return ID(raw_project_id)
    return None


def get_run_llm_config_id(run: AgentRun) -> str | None:
    if run.inputs:
        raw_llm_config_id = run.inputs.get("llmConfigId")
        if isinstance(raw_llm_config_id, str) and raw_llm_config_id:
            return raw_llm_config_id
    for event in run.events:
        if event.type != "run_started":
            continue
        raw_llm_config_id = event.payload.get("llmConfigId")
        if isinstance(raw_llm_config_id, str) and raw_llm_config_id:
            return raw_llm_config_id
    return None


def get_run_sort_key(run: AgentRun) -> datetime:
    if run.startedAt:
        return run.startedAt
    if run.finishedAt:
        return run.finishedAt
    timestamps = [event.timestamp for event in run.events if event.timestamp]
    if timestamps:
        return max(timestamps)
    return datetime.min.replace(tzinfo=timezone.utc)


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
    output_messages = _parse_output_messages(run)
    if output_messages is not None:
        return build_chat_section_state(messages=output_messages)

    base_messages = _parse_input_messages(run)
    state = build_chat_section_state(
        messages=base_messages,
        waiting_for_response=run.status == AgentRunStatus.running,
    )
    for event in run.events:
        if event.type != "stream_chunk":
            continue
        chunk_payload = event.payload.get("chunk")
        if not isinstance(chunk_payload, dict):
            raise TypeError("Agent run stream_chunk payload must be a dict")
        chunk = _STREAM_CHUNK_ADAPTER.validate_python(chunk_payload)
        state = apply_stream_delta(state=state, chunk=chunk)
    return state


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


def _parse_raw_messages(raw_messages: list[Any]) -> list[BaseChatMessageUnion]:
    return [BaseChatMessageTypeAdapter.validate_python(raw) for raw in raw_messages]


def _get_input_id(run: AgentRun, key: str) -> ID | None:
    if not run.inputs:
        return None
    raw_value = run.inputs.get(key)
    if isinstance(raw_value, str) and raw_value:
        return ID(raw_value)
    return None
