from typing import Any

from setta.database.db_objs import DBE
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    EngineConfig,
)
from setta.types.external_agents import ExternalAgentConfig
from setta.types.id import ID
from setta.types.prompt import PromptTemplate


def require_external_agent_config(dbe: DBE, config_id: ID) -> ExternalAgentConfig:
    for raw_config in dbe.read_external_agents():
        config = ExternalAgentConfig.model_validate(raw_config)
        if config.id == config_id:
            return config
    raise KeyError(f"External agent config {config_id} not found")


def require_engine_config(dbe: DBE, config_id: ID) -> EngineConfig:
    for raw_config in dbe.read_engine_configs():
        config = EngineConfig.model_validate(raw_config)
        if config.id == config_id:
            return config
    raise KeyError(f"Engine config {config_id} not found")


def require_agent_profile(dbe: DBE, profile_id: ID) -> AgentProfile:
    for raw_profile in dbe.read_agent_profiles():
        profile = AgentProfile.model_validate(raw_profile)
        if profile.id == profile_id:
            return profile
    raise KeyError(f"Agent profile {profile_id} not found")


def load_agent_run(dbe: DBE, run_id: ID) -> AgentRun | None:
    payload = dbe.read_agent_run(run_id)
    if payload is None:
        return None
    return AgentRun.model_validate(payload)


def save_agent_run(dbe: DBE, run: AgentRun) -> None:
    dbe.write_agent_run(run.id, run.model_dump(mode="json"))
    _update_agent_run_index(dbe, run)


def delete_agent_run(dbe: DBE, run_id: ID) -> None:
    dbe.delete_agent_run_file(run_id)
    _remove_agent_run_index_entry(dbe, run_id)


def list_agent_runs_by_metadata(
    dbe: DBE,
    *,
    run_type: str | None = None,
    chat_id: ID | None = None,
    project_config_id: ID | None = None,
) -> list[AgentRun]:
    run_ids = list_agent_run_ids_by_metadata(
        dbe,
        run_type=run_type,
        chat_id=chat_id,
        project_config_id=project_config_id,
    )
    runs: list[AgentRun] = []
    missing_ids: list[ID] = []
    for run_id in run_ids:
        run = load_agent_run(dbe, run_id)
        if run is None:
            missing_ids.append(run_id)
            continue
        runs.append(run)
    if missing_ids:
        _remove_agent_run_index_entries(dbe, missing_ids)
    return runs


def list_agent_run_ids_by_metadata(
    dbe: DBE,
    *,
    run_type: str | None = None,
    chat_id: ID | None = None,
    project_config_id: ID | None = None,
) -> list[ID]:
    index = _load_agent_run_index(dbe)
    run_ids: list[ID] = []
    chat_value = str(chat_id) if chat_id is not None else None
    project_value = str(project_config_id) if project_config_id is not None else None
    for raw_run_id, entry in index.items():
        if not isinstance(entry, dict):
            continue
        if run_type is not None and entry.get("runType") != run_type:
            continue
        if chat_value is not None and entry.get("chatId") != chat_value:
            continue
        if project_value is not None and entry.get("projectConfigId") != project_value:
            continue
        run_ids.append(ID(raw_run_id))
    return sorted(run_ids, key=lambda run_id: str(run_id))


def _update_agent_run_index(dbe: DBE, run: AgentRun) -> None:
    index = _load_agent_run_index(dbe)
    entry = _build_agent_run_index_entry(run)
    raw_run_id = str(run.id)
    if index.get(raw_run_id) == entry:
        return
    index[raw_run_id] = entry
    _write_agent_run_index(dbe, index)


def _remove_agent_run_index_entry(dbe: DBE, run_id: ID) -> None:
    payload = dbe.read_agent_run_index()
    runs = payload.get("runs")
    if not isinstance(runs, dict):
        return
    raw_run_id = str(run_id)
    if raw_run_id not in runs:
        return
    del runs[raw_run_id]
    _write_agent_run_index(dbe, runs)


def _remove_agent_run_index_entries(dbe: DBE, run_ids: list[ID]) -> None:
    if not run_ids:
        return
    payload = dbe.read_agent_run_index()
    runs = payload.get("runs")
    if not isinstance(runs, dict):
        return
    updated = False
    for run_id in run_ids:
        raw_run_id = str(run_id)
        if raw_run_id in runs:
            del runs[raw_run_id]
            updated = True
    if updated:
        _write_agent_run_index(dbe, runs)


def _load_agent_run_index(dbe: DBE) -> dict[str, dict[str, Any]]:
    payload = dbe.read_agent_run_index()
    runs = payload.get("runs")
    if isinstance(runs, dict) and runs:
        return runs
    if dbe.list_agent_run_paths():
        return _rebuild_agent_run_index(dbe)
    return {}


def _write_agent_run_index(dbe: DBE, runs: dict[str, dict[str, Any]]) -> None:
    dbe.write_agent_run_index({"version": 1, "runs": runs})


def _rebuild_agent_run_index(dbe: DBE) -> dict[str, dict[str, Any]]:
    runs: dict[str, dict[str, Any]] = {}
    for path in dbe.list_agent_run_paths():
        payload = dbe.read_json(path)
        if not payload or not isinstance(payload, dict):
            continue
        raw_run_id = payload.get("id")
        if not isinstance(raw_run_id, str) or not raw_run_id:
            continue
        inputs = payload.get("inputs")
        if not isinstance(inputs, dict):
            inputs = {}
        run_type = inputs.get("runType")
        if not isinstance(run_type, str):
            run_type = None
        chat_id = inputs.get("chatId")
        if not isinstance(chat_id, str):
            chat_id = None
        project_config_id = inputs.get("projectConfigId")
        if not isinstance(project_config_id, str):
            project_config_id = None
        runs[raw_run_id] = {
            "runType": run_type,
            "chatId": chat_id,
            "projectConfigId": project_config_id,
        }
    _write_agent_run_index(dbe, runs)
    return runs


def _build_agent_run_index_entry(run: AgentRun) -> dict[str, Any]:
    inputs = run.inputs if isinstance(run.inputs, dict) else {}
    run_type = inputs.get("runType")
    if not isinstance(run_type, str):
        run_type = None
    chat_id = inputs.get("chatId")
    if not isinstance(chat_id, str):
        chat_id = None
    project_config_id = inputs.get("projectConfigId")
    if not isinstance(project_config_id, str):
        project_config_id = None
    return {
        "runType": run_type,
        "chatId": chat_id,
        "projectConfigId": project_config_id,
    }


def load_prompt_template(dbe: DBE, prompt_id: ID) -> PromptTemplate | None:
    payload = dbe.read_prompt(prompt_id)
    if payload is None:
        return None
    return PromptTemplate.model_validate(payload)
