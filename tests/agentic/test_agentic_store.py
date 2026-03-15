from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from setta.agentic.store import (
    create_agent_run,
    delete_prompt_template,
    list_agent_runs,
    list_prompt_templates,
    load_agent_profiles,
    load_external_agent_configs,
    load_agent_run,
    load_prompt_template,
    require_external_agent_config,
    save_agent_profiles,
    save_external_agent_configs,
    save_agent_run,
    save_prompt_template,
)
from setta.database.db_objs import DBE
from setta.types.agentic import AgentProfile, AgentRunStatus
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.types.id import ID
from setta.types.prompt import PromptTemplate


class TestAgenticStore:
    def _build_dbe(self, tmpdir: str) -> DBE:
        root = Path(tmpdir) / "setta_files"
        root.mkdir(parents=True, exist_ok=True)
        return DBE(root)

    def test_profiles_roundtrip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = self._build_dbe(tmpdir)
            assert load_agent_profiles(dbe) == []

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
            save_agent_profiles(dbe, profiles)

            loaded = load_agent_profiles(dbe)
            assert [p.id for p in profiles] == [p.id for p in loaded]
            assert loaded[0].toolAllowlist == ["tool.a", "tool.b"]
            assert loaded[1].name == "Beta"

    def test_runs_roundtrip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = self._build_dbe(tmpdir)
            run = create_agent_run(profile_id=None, inputs={"prompt": "hello"})
            save_agent_run(dbe, run)

            loaded = load_agent_run(dbe, run.id)
            assert loaded is not None
            if loaded is None:
                return
            assert loaded.id == run.id
            assert loaded.status == AgentRunStatus.running
            assert loaded.inputs == {"prompt": "hello"}
            assert loaded.startedAt is not None

            runs = list_agent_runs(dbe)
            assert len(runs) == 1
            assert runs[0].id == run.id

    def test_external_agent_configs_roundtrip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = self._build_dbe(tmpdir)
            assert load_external_agent_configs(dbe) == []

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
            save_external_agent_configs(dbe, configs)

            loaded = load_external_agent_configs(dbe)
            assert [c.id for c in configs] == [c.id for c in loaded]
            assert loaded[0].toolType == ExternalAgentToolType.codex
            assert loaded[1].runMode == ExternalAgentRunMode.server

            required = require_external_agent_config(dbe, configs[0].id)
            assert required.id == configs[0].id
            with pytest.raises(KeyError):
                require_external_agent_config(dbe, ID("missing-config"))

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

            save_prompt_template(dbe, template)

            loaded = load_prompt_template(dbe, template.id)
            assert loaded is not None
            if loaded is None:
                return
            assert loaded.template == template.template
            assert loaded.inputSchema == template.inputSchema
            assert loaded.metadata == template.metadata

            templates = list_prompt_templates(dbe)
            assert [entry.id for entry in templates] == [template.id]

            delete_prompt_template(dbe, template.id)
            assert list_prompt_templates(dbe) == []
