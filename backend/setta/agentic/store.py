from typing import Any

from setta.database.db_objs import DBE
from setta.types.agentic import AgentProfile, AgentRun, AgentRunStatus
from setta.types.external_agents import ExternalAgentConfig
from setta.types.id import ID
from setta.types.prompt import PromptTemplate
from setta.utils.timestamps import get_now_timestamp


def load_agent_profiles(dbe: DBE) -> list[AgentProfile]:
    payload = dbe.read_agent_profiles()
    return [AgentProfile.model_validate(entry) for entry in payload]


def save_agent_profiles(dbe: DBE, profiles: list[AgentProfile]) -> None:
    payload = [profile.model_dump(mode="json") for profile in profiles]
    dbe.write_agent_profiles(payload)


def load_external_agent_configs(dbe: DBE) -> list[ExternalAgentConfig]:
    payload = dbe.read_external_agents()
    return [ExternalAgentConfig.model_validate(entry) for entry in payload]


def save_external_agent_configs(dbe: DBE, configs: list[ExternalAgentConfig]) -> None:
    payload = [config.model_dump(mode="json") for config in configs]
    dbe.write_external_agents(payload)


def get_external_agent_config_index(
    configs: list[ExternalAgentConfig],
    config_id: ID,
) -> int:
    for idx, config in enumerate(configs):
        if config.id == config_id:
            return idx
    raise KeyError(f"External agent config {config_id} not found")


def require_external_agent_config(dbe: DBE, config_id: ID) -> ExternalAgentConfig:
    configs = load_external_agent_configs(dbe)
    config_idx = get_external_agent_config_index(configs, config_id)
    return configs[config_idx]


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


def list_prompt_templates(dbe: DBE) -> list[PromptTemplate]:
    prompts: list[PromptTemplate] = []
    for path in dbe.list_prompt_paths():
        payload = dbe.read_json(path)
        if not payload:
            continue
        prompts.append(PromptTemplate.model_validate(payload))
    return prompts


def load_prompt_template(dbe: DBE, prompt_id: ID) -> PromptTemplate | None:
    payload = dbe.read_prompt(prompt_id)
    if payload is None:
        return None
    return PromptTemplate.model_validate(payload)


def save_prompt_template(dbe: DBE, prompt: PromptTemplate) -> None:
    dbe.write_prompt(prompt.id, prompt.model_dump(mode="json"))


def delete_prompt_template(dbe: DBE, prompt_id: ID) -> None:
    dbe.delete_prompt_file(prompt_id)
