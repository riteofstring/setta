from typing import Any

from setta.agentic.chat_view import (
    EXTERNAL_AGENT_RUN_TYPE,
    LLM_CHAT_RUN_TYPE,
    build_chat_state_from_run,
    get_run_engine_config_id,
    get_run_project_config_id,
    get_run_sort_key,
)
from setta.agentic.store import list_agent_runs_by_metadata
from setta.types.agentic import AgentRun, EngineType
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.types.id import ID

CHAT_ENGINE_MISMATCH_MESSAGE = "Chat engine mismatch; start a new chat."
CHAT_PROJECT_CONFIG_MISMATCH_MESSAGE = "Chat project config mismatch; start a new chat."


def list_compatible_chat_runs(
    *,
    dbe: Any,
    engine_type: EngineType,
    chat_id: ID,
    project_config_id: ID | None,
    engine_config_id: ID,
) -> list[AgentRun]:
    if engine_type == EngineType.external_agent:
        conflicting_runs = list_agent_runs_by_metadata(
            dbe,
            run_type=LLM_CHAT_RUN_TYPE,
            chat_id=chat_id,
        )
        compatible_runs = list_agent_runs_by_metadata(
            dbe,
            run_type=EXTERNAL_AGENT_RUN_TYPE,
            chat_id=chat_id,
        )
    else:
        conflicting_runs = list_agent_runs_by_metadata(
            dbe,
            run_type=EXTERNAL_AGENT_RUN_TYPE,
            chat_id=chat_id,
        )
        compatible_runs = list_agent_runs_by_metadata(
            dbe,
            run_type=LLM_CHAT_RUN_TYPE,
            chat_id=chat_id,
        )

    if conflicting_runs:
        raise ValueError(CHAT_ENGINE_MISMATCH_MESSAGE)

    for run in compatible_runs:
        existing_engine = get_run_engine_config_id(run)
        if existing_engine != engine_config_id:
            raise ValueError(CHAT_ENGINE_MISMATCH_MESSAGE)
        existing_project = get_run_project_config_id(run)
        if existing_project != project_config_id:
            raise ValueError(CHAT_PROJECT_CONFIG_MISMATCH_MESSAGE)

    return compatible_runs


def get_prior_messages_for_chat_engine(
    *,
    dbe: Any,
    engine_type: EngineType,
    chat_id: ID,
    project_config_id: ID | None,
    engine_config_id: ID,
) -> list[BaseChatMessageUnion]:
    runs = list_compatible_chat_runs(
        dbe=dbe,
        engine_type=engine_type,
        chat_id=chat_id,
        project_config_id=project_config_id,
        engine_config_id=engine_config_id,
    )
    if not runs:
        return []
    latest_run = max(runs, key=get_run_sort_key)
    return build_chat_state_from_run(latest_run).messages
