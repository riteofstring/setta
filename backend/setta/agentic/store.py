from typing import Any

from setta.database.db_objs import DBE
from setta.types.agentic import AgentProfile, AgentRun, AgentRunStatus
from setta.types.id import ID
from setta.utils.timestamps import get_now_timestamp


def load_agent_profiles(dbe: DBE) -> list[AgentProfile]:
    payload = dbe.read_agent_profiles()
    return [AgentProfile.model_validate(entry) for entry in payload]


def save_agent_profiles(dbe: DBE, profiles: list[AgentProfile]) -> None:
    payload = [profile.model_dump(mode="json") for profile in profiles]
    dbe.write_agent_profiles(payload)


def get_agent_profile_index(profiles: list[AgentProfile], profile_id: ID) -> int:
    for idx, profile in enumerate(profiles):
        if profile.id == profile_id:
            return idx
    raise KeyError(f"Agent profile {profile_id} not found")


def require_agent_profile(dbe: DBE, profile_id: ID) -> AgentProfile:
    profiles = load_agent_profiles(dbe)
    profile_idx = get_agent_profile_index(profiles, profile_id)
    return profiles[profile_idx]


def create_agent_run(
    *,
    profile_id: ID | None,
    inputs: dict[str, Any] | None,
) -> AgentRun:
    return AgentRun(
        profileId=profile_id,
        status=AgentRunStatus.running,
        startedAt=get_now_timestamp(),
        inputs=inputs,
    )


def load_agent_run(dbe: DBE, run_id: ID) -> AgentRun | None:
    payload = dbe.read_agent_run(run_id)
    if payload is None:
        return None
    return AgentRun.model_validate(payload)


def save_agent_run(dbe: DBE, run: AgentRun) -> None:
    dbe.write_agent_run(run.id, run.model_dump(mode="json"))


def list_agent_runs(dbe: DBE) -> list[AgentRun]:
    runs: list[AgentRun] = []
    for path in dbe.list_agent_run_paths():
        payload = dbe.read_json(path)
        if not payload:
            continue
        runs.append(AgentRun.model_validate(payload))
    return runs
