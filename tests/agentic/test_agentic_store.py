from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from setta.agentic.store import (
    load_agent_run,
    load_prompt_template,
    require_agent_profile,
    require_engine_config,
    require_external_agent_config,
    save_agent_run,
)
from setta.database.db_objs import DBE
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    AgentRunStatus,
    EngineConfig,
    EngineType,
)
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.types.id import ID
from setta.types.prompt import PromptTemplate
from setta.utils.timestamps import get_now_timestamp


class TestAgenticStore:
    def _build_dbe(self, tmpdir: str) -> DBE:
        root = Path(tmpdir) / "setta_files"
        root.mkdir(parents=True, exist_ok=True)
        return DBE(root)

    def test_require_agent_profile_reads_seeded_profile(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = self._build_dbe(tmpdir)
            profiles = [
                AgentProfile(
                    name="Alpha",
                    description="Primary profile",
                    systemPrompt="You are alpha.",
                    engineConfigId=ID("engine-alpha"),
                    toolAllowlist=["tool.a", "tool.b"],
                    memoryScope="project",
                ),
                AgentProfile(
                    name="Beta",
                    systemPrompt="You are beta.",
                ),
            ]
            dbe.write_agent_profiles(
                [profile.model_dump(mode="json") for profile in profiles]
            )

            loaded = require_agent_profile(dbe, profiles[0].id)
            assert loaded.id == profiles[0].id
            assert loaded.toolAllowlist == ["tool.a", "tool.b"]

            with pytest.raises(KeyError):
                require_agent_profile(dbe, ID("missing-profile"))

    def test_agent_runs_roundtrip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = self._build_dbe(tmpdir)
            run = AgentRun(
                profileId=None,
                status=AgentRunStatus.running,
                startedAt=get_now_timestamp(),
                inputs={"prompt": "hello"},
            )
            save_agent_run(dbe, run)

            loaded = load_agent_run(dbe, run.id)
            assert loaded is not None
            if loaded is None:
                return
            assert loaded.id == run.id
            assert loaded.status == AgentRunStatus.running
            assert loaded.inputs == {"prompt": "hello"}
            assert loaded.startedAt is not None

    def test_require_external_agent_config_reads_seeded_config(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = self._build_dbe(tmpdir)
            configs = [
                ExternalAgentConfig(
                    name="Codex app-server",
                    description="Local Codex app-server config",
                    toolType=ExternalAgentToolType.codex,
                    runMode=ExternalAgentRunMode.app_server,
                    commandPath="/usr/local/bin/node",
                    defaultModel="o1",
                    sandboxPolicy="read-only",
                    approvalPolicy="on-failure",
                    envVarWhitelist=["OPENAI_API_KEY"],
                    workingDirStrategy=ExternalAgentWorkingDirStrategy.project_root,
                ),
                ExternalAgentConfig(
                    name="OpenCode Server",
                    description="Local OpenCode server",
                    toolType=ExternalAgentToolType.opencode,
                    runMode=ExternalAgentRunMode.server,
                    baseUrl="http://localhost:18181",
                    workingDirStrategy=ExternalAgentWorkingDirStrategy.custom,
                    workingDir="/tmp",
                ),
            ]
            dbe.write_external_agents(
                [config.model_dump(mode="json") for config in configs]
            )

            required = require_external_agent_config(dbe, configs[0].id)
            assert required.id == configs[0].id
            assert required.toolType == ExternalAgentToolType.codex
            with pytest.raises(KeyError):
                require_external_agent_config(dbe, ID("missing-config"))

    def test_require_engine_config_reads_seeded_config(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = self._build_dbe(tmpdir)
            config = EngineConfig(
                id=ID("engine-alpha"),
                name="Managed",
                engineType=EngineType.setta_llm,
                settaLlmConfigId="primary",
            )
            dbe.write_engine_configs([config.model_dump(mode="json")])

            loaded = require_engine_config(dbe, config.id)
            assert loaded.id == config.id
            assert loaded.settaLlmConfigId == "primary"

            with pytest.raises(KeyError):
                require_engine_config(dbe, ID("missing-engine"))

    def test_prompt_templates_roundtrip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = self._build_dbe(tmpdir)
            template = PromptTemplate(
                name="Greeting",
                description="Greeting template",
                template="Hello {{ name }}",
                inputSchema={"name": {"type": "string"}},
                metadata={"category": "greeting"},
            )

            dbe.write_prompt(template.id, template.model_dump(mode="json"))

            loaded = load_prompt_template(dbe, template.id)
            assert loaded is not None
            if loaded is None:
                return
            assert loaded.template == template.template
            assert loaded.inputSchema == template.inputSchema
            assert loaded.metadata == template.metadata
