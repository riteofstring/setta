"""Seed data for dev-mode agentic config files."""

from setta.database.db_objs import DBE
from setta.types.agentic import (
    AgentProfile,
    EngineConfig,
    EngineConfigDefaults,
    EngineType,
)
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)

_DEFAULT_ENGINE_CONFIGS: list[EngineConfig] = [
    EngineConfig(
        id="engine-setta-claude-sonnet",
        name="Setta LLM (Claude Sonnet 4.5)",
        engineType=EngineType.setta_llm,
        settaLlmConfigId="claude-sonnet",
        defaults=EngineConfigDefaults(thinking=True),
    ),
    EngineConfig(
        id="engine-claude-code",
        name="Claude Code (SDK)",
        engineType=EngineType.external_agent,
        settaLlmConfigId=None,
        externalAgentConfigId="external-claude-code",
    ),
    EngineConfig(
        id="engine-codex",
        name="Codex (SDK)",
        engineType=EngineType.external_agent,
        settaLlmConfigId=None,
        externalAgentConfigId="external-codex",
    ),
]

_DEFAULT_EXTERNAL_AGENT_CONFIGS: list[ExternalAgentConfig] = [
    ExternalAgentConfig(
        id="external-claude-code",
        name="Claude Code (SDK)",
        description="Claude Code via Python SDK",
        toolType=ExternalAgentToolType.claude_code,
        runMode=ExternalAgentRunMode.sdk,
        commandPath=None,
        baseUrl=None,
        defaultModel="claude-sonnet-4-5-20250929",
        sandboxPolicy=None,
        approvalPolicy=None,
        envVarWhitelist=["ANTHROPIC_API_KEY"],
        workingDirStrategy=ExternalAgentWorkingDirStrategy.project_root,
        workingDir=None,
    ),
    ExternalAgentConfig(
        id="external-codex",
        name="Codex (SDK)",
        description="Codex via SDK sidecar",
        toolType=ExternalAgentToolType.codex,
        runMode=ExternalAgentRunMode.sdk,
        commandPath=None,
        baseUrl=None,
        defaultModel=None,
        sandboxPolicy=None,
        approvalPolicy=None,
        envVarWhitelist=["OPENAI_API_KEY"],
        workingDirStrategy=ExternalAgentWorkingDirStrategy.project_root,
        workingDir=None,
    ),
]

_DEFAULT_AGENT_PROFILES: list[AgentProfile] = [
    AgentProfile(
        id="agent-default",
        name="Default (Setta LLM)",
        description="Internal Setta LLM using Claude Sonnet 4.5",
        systemPrompt="",
        engineConfigId="engine-setta-claude-sonnet",
        toolAllowlist=[],
        memoryScope=None,
    ),
    AgentProfile(
        id="agent-claude-code",
        name="Claude Code",
        description="External agent via Claude Code SDK",
        systemPrompt="",
        engineConfigId="engine-claude-code",
        toolAllowlist=[],
        memoryScope=None,
    ),
    AgentProfile(
        id="agent-codex",
        name="Codex",
        description="External agent via Codex SDK",
        systemPrompt="",
        engineConfigId="engine-codex",
        toolAllowlist=[],
        memoryScope=None,
    ),
]


def seed_agentic_config_files(dbe: DBE) -> None:
    """Create baseline agentic config files for dev resets if missing."""
    if not dbe.engine_configs.exists():
        payload = [config.model_dump(mode="json") for config in _DEFAULT_ENGINE_CONFIGS]
        dbe.write_engine_configs(payload)
    if not dbe.external_agents.exists():
        payload = [
            config.model_dump(mode="json") for config in _DEFAULT_EXTERNAL_AGENT_CONFIGS
        ]
        dbe.write_external_agents(payload)
    if not dbe.agent_profiles.exists():
        payload = [
            profile.model_dump(mode="json") for profile in _DEFAULT_AGENT_PROFILES
        ]
        dbe.write_agent_profiles(payload)
