from datetime import datetime, timezone

from setta.agentic.chat_names import create_new_chat_name
from setta.types.agentic import AgentRun
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.utils.generate_memorable_string import generate_memorable_string

LLM_CHAT_RUN_TYPE = "llm_chat"
SCRIPTABLE_CHAT_RUN_TYPE = "scriptable_chat"
EXTERNAL_AGENT_RUN_TYPE = "external_agent"


def is_scriptable_chat_run(run: AgentRun) -> bool:
    if not run.inputs:
        return False
    raw_type = run.inputs.get("runType")
    if not isinstance(raw_type, str) or not raw_type:
        return False
    return raw_type == SCRIPTABLE_CHAT_RUN_TYPE


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
