from datetime import datetime, timezone

from setta.agentic.chat_names import create_new_chat_name
from setta.types.agentic import AgentRun
from setta.types.generated.chat_messages import BaseChatMessageUnion
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


def is_scriptable_chat_run(run: AgentRun) -> bool:
    run_type = get_run_type(run)
    if not run_type:
        return False
    return run_type == SCRIPTABLE_CHAT_RUN_TYPE


def get_run_last_updated(run: AgentRun) -> datetime:
    timestamps = [event.timestamp for event in run.events if event.timestamp]
    if timestamps:
        return max(timestamps)
    if run.finishedAt:
        return run.finishedAt
    if run.startedAt:
        return run.startedAt
    return datetime.min.replace(tzinfo=timezone.utc)


def derive_chat_name(messages: list[BaseChatMessageUnion]) -> str:
    if not messages:
        return generate_memorable_string()
    return create_new_chat_name(messages[0])
