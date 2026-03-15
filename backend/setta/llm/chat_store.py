from abc import ABC, abstractmethod
from datetime import datetime
from typing import TYPE_CHECKING, Any

from setta.agentic.chat_names import create_new_chat_name
from setta.agentic.chat_view import (
    SCRIPTABLE_CHAT_RUN_TYPE,
    derive_chat_name,
    get_run_last_updated,
    is_scriptable_chat_run,
)
from setta.agentic.store import (
    delete_agent_run,
    list_agent_runs_by_metadata,
    load_agent_run,
    save_agent_run,
)
from setta.types.agentic import AgentRun, AgentRunStatus
from setta.types.chat import Chat, ChatMetadata
from setta.types.generated.chat_messages import (
    BaseChatMessageTypeAdapter,
    BaseChatMessageUnion,
)
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str

if TYPE_CHECKING:
    from setta.database.db_objs import DBE


class ChatStore(ABC):
    @abstractmethod
    def get_chat(self, chat_id: ID) -> Chat | None:
        raise NotImplementedError

    @abstractmethod
    def get_all_chat_metadata(self) -> list[ChatMetadata]:
        raise NotImplementedError

    @abstractmethod
    def create_new_chat(
        self,
        first_message: BaseChatMessageUnion,
        llm_config: LLMConfig,
        project_config_id: ID | None = None,
    ) -> Chat:
        raise NotImplementedError

    @abstractmethod
    def save_messages(
        self, chat_id: ID, messages: list[BaseChatMessageUnion]
    ) -> Chat | None:
        raise NotImplementedError

    @abstractmethod
    def set_system_prompt(self, chat_id: ID, system_prompt: str) -> Chat | None:
        raise NotImplementedError

    @abstractmethod
    def delete_chat(self, chat_id: ID) -> None:
        raise NotImplementedError


class AgentRunChatStore(ChatStore):
    def __init__(self, dbe: "DBE") -> None:
        self.dbe = dbe

    def get_chat(self, chat_id: ID) -> Chat | None:
        run = load_agent_run(self.dbe, chat_id)
        if run is None or not is_scriptable_chat_run(run):
            return None
        return _build_chat_from_run(run)

    def get_all_chat_metadata(self) -> list[ChatMetadata]:
        runs = list_agent_runs_by_metadata(self.dbe, run_type=SCRIPTABLE_CHAT_RUN_TYPE)
        output: list[ChatMetadata] = []
        for run in runs:
            metadata = _build_chat_metadata_from_run(run)
            if metadata is None:
                continue
            output.append(metadata)
        output.sort(key=lambda entry: entry.lastUpdated)
        return output

    def create_new_chat(
        self,
        first_message: BaseChatMessageUnion,
        llm_config: LLMConfig,
        project_config_id: ID | None = None,
    ) -> Chat:
        now = get_now_timestamp()
        copied_message = _copy_chat_message(first_message)
        chat_name = create_new_chat_name(copied_message)
        run = AgentRun(
            profileId=None,
            status=AgentRunStatus.completed,
            startedAt=now,
            finishedAt=now,
            inputs={
                "runType": SCRIPTABLE_CHAT_RUN_TYPE,
                "llmConfig": llm_config.model_dump(mode="json"),
                **(
                    {"projectConfigId": str(project_config_id)}
                    if project_config_id is not None
                    else {}
                ),
            },
            outputs={
                "messages": [copied_message.model_dump(mode="json")],
                "systemPrompt": None,
                "lastUpdated": now.isoformat(),
                "name": chat_name,
            },
        )
        run.inputs["chatId"] = str(run.id)
        save_agent_run(self.dbe, run)
        return Chat(
            id=run.id,
            name=chat_name,
            lastUpdated=now,
            llmConfig=llm_config.model_copy(deep=True),
            projectConfigId=project_config_id,
            messages=[copied_message],
            systemPrompt=None,
        )

    def save_messages(
        self, chat_id: ID, messages: list[BaseChatMessageUnion]
    ) -> Chat | None:
        if not messages:
            return self.get_chat(chat_id)
        run = load_agent_run(self.dbe, chat_id)
        if run is None or not is_scriptable_chat_run(run):
            return None
        existing = _parse_run_messages(run)
        if not _append_messages(existing, messages):
            return _build_chat_from_run(run)
        now = get_now_timestamp()
        outputs = run.outputs or {}
        outputs["messages"] = [msg.model_dump(mode="json") for msg in existing]
        outputs["lastUpdated"] = now.isoformat()
        if "name" not in outputs:
            outputs["name"] = derive_chat_name(existing)
        run.outputs = outputs
        run.finishedAt = now
        save_agent_run(self.dbe, run)
        return _build_chat_from_run(run)

    def set_system_prompt(self, chat_id: ID, system_prompt: str) -> Chat | None:
        run = load_agent_run(self.dbe, chat_id)
        if run is None or not is_scriptable_chat_run(run):
            return None
        outputs = run.outputs or {}
        if outputs.get("systemPrompt") == system_prompt:
            return _build_chat_from_run(run)
        outputs["systemPrompt"] = system_prompt
        run.outputs = outputs
        save_agent_run(self.dbe, run)
        return _build_chat_from_run(run)

    def delete_chat(self, chat_id: ID) -> None:
        delete_agent_run(self.dbe, chat_id)


def _build_chat_from_run(run: AgentRun) -> Chat | None:
    llm_config = _parse_llm_config(run)
    if llm_config is None:
        return None
    messages = _parse_run_messages(run)
    name = _parse_output_text(run, "name") or derive_chat_name(messages)
    last_updated = _parse_last_updated(run)
    project_config_id = _parse_project_config_id(run)
    system_prompt = _parse_output_text(run, "systemPrompt")
    return Chat(
        id=run.id,
        name=name,
        lastUpdated=last_updated,
        llmConfig=llm_config,
        projectConfigId=project_config_id,
        messages=messages,
        systemPrompt=system_prompt,
    )


def _build_chat_metadata_from_run(run: AgentRun) -> ChatMetadata | None:
    llm_config = _parse_llm_config(run)
    if llm_config is None:
        return None
    name = _parse_output_text(run, "name")
    if name is None:
        messages = _parse_run_messages(run)
        name = derive_chat_name(messages)
    last_updated = _parse_last_updated(run)
    project_config_id = _parse_project_config_id(run)
    return ChatMetadata(
        id=run.id,
        name=name,
        lastUpdated=last_updated,
        llmConfig=llm_config.model_copy(deep=True),
        projectConfigId=project_config_id,
    )


def _parse_last_updated(run: AgentRun) -> datetime:
    if run.outputs:
        raw = run.outputs.get("lastUpdated")
        if isinstance(raw, datetime):
            return raw
        if isinstance(raw, str):
            return parse_timestamp_str(raw)
    return get_run_last_updated(run)


def _parse_project_config_id(run: AgentRun) -> ID | None:
    if not run.inputs:
        return None
    raw_value = run.inputs.get("projectConfigId")
    if isinstance(raw_value, str) and raw_value:
        return ID(raw_value)
    return None


def _parse_llm_config(run: AgentRun) -> LLMConfig | None:
    if not run.inputs:
        return None
    raw_value = run.inputs.get("llmConfig")
    if isinstance(raw_value, dict):
        return LLMConfig.model_validate(raw_value)
    return None


def _parse_output_text(run: AgentRun, key: str) -> str | None:
    if not run.outputs:
        return None
    raw_value = run.outputs.get(key)
    if isinstance(raw_value, str):
        return raw_value
    return None


def _parse_run_messages(run: AgentRun) -> list[BaseChatMessageUnion]:
    raw_messages: list[Any] | None = None
    if run.outputs and isinstance(run.outputs.get("messages"), list):
        raw_messages = run.outputs.get("messages")
    elif run.inputs and isinstance(run.inputs.get("messages"), list):
        raw_messages = run.inputs.get("messages")
    if not raw_messages:
        return []
    return [BaseChatMessageTypeAdapter.validate_python(raw) for raw in raw_messages]


def _copy_chat_message(message: BaseChatMessageUnion) -> BaseChatMessageUnion:
    payload = message.model_dump(mode="json")
    return BaseChatMessageTypeAdapter.validate_python(payload)


def _append_messages(
    messages: list[BaseChatMessageUnion],
    additions: list[BaseChatMessageUnion],
) -> bool:
    if not additions:
        return False
    existing_ids = {message.id for message in messages}
    new_messages = [message for message in additions if message.id not in existing_ids]
    if not new_messages:
        return False
    messages.extend(_copy_chat_message(message) for message in new_messages)
    return True
