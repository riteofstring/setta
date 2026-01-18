from dataclasses import dataclass

from setta.agentic.store import require_engine_config, require_external_agent_config
from setta.database.db_objs import DBE
from setta.types.agentic import EngineConfig, EngineType
from setta.types.external_agents import ExternalAgentConfig
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig


@dataclass(frozen=True)
class ResolvedEngineConfig:
    engine_config: EngineConfig
    llm_config: LLMConfig | None
    external_agent_config: ExternalAgentConfig | None


def resolve_engine_config(
    dbe: DBE,
    llm_configs: AllLLMConfigs,
    engine_config_id: ID,
) -> ResolvedEngineConfig:
    engine_config = require_engine_config(dbe, engine_config_id)
    if engine_config.engineType == EngineType.setta_llm:
        llm_config_id = engine_config.settaLlmConfigId
        if not llm_config_id:
            if llm_configs.default_config_id:
                llm_config_id = llm_configs.default_config_id
            elif llm_configs.configs:
                llm_config_id = next(iter(llm_configs.configs.keys()))
            else:
                raise ValueError("No LLM config available for engine")
        llm_config = llm_configs.resolve_config(llm_config_id)
        return ResolvedEngineConfig(
            engine_config=engine_config,
            llm_config=llm_config,
            external_agent_config=None,
        )
    if engine_config.engineType == EngineType.external_agent:
        external_config_id = engine_config.externalAgentConfigId
        if external_config_id is None:
            raise KeyError("Engine config missing external agent config id")
        external_config = require_external_agent_config(dbe, external_config_id)
        return ResolvedEngineConfig(
            engine_config=engine_config,
            llm_config=None,
            external_agent_config=external_config,
        )
    raise ValueError(f"Unsupported engine type: {engine_config.engineType}")
