import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

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


class AgenticStoreTests(unittest.TestCase):
    def _build_dbe(self, tmpdir: str) -> DBE:
        root = Path(tmpdir) / "setta_files"
        root.mkdir(parents=True, exist_ok=True)
        return DBE(root)

    def test_profiles_roundtrip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = self._build_dbe(tmpdir)
            self.assertEqual(load_agent_profiles(dbe), [])

            profiles = [
                AgentProfile(
                    name="Alpha",
                    description="Primary profile",
                    systemPrompt="You are alpha.",
                    llmConfigId="alpha-llm",
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
            self.assertEqual([p.id for p in profiles], [p.id for p in loaded])
            self.assertEqual(loaded[0].toolAllowlist, ["tool.a", "tool.b"])
            self.assertEqual(loaded[1].name, "Beta")

    def test_runs_roundtrip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = self._build_dbe(tmpdir)
            run = create_agent_run(profile_id=None, inputs={"prompt": "hello"})
            save_agent_run(dbe, run)

            loaded = load_agent_run(dbe, run.id)
            self.assertIsNotNone(loaded)
            if loaded is None:
                return
            self.assertEqual(loaded.id, run.id)
            self.assertEqual(loaded.status, AgentRunStatus.running)
            self.assertEqual(loaded.inputs, {"prompt": "hello"})
            self.assertIsNotNone(loaded.startedAt)

            runs = list_agent_runs(dbe)
            self.assertEqual(len(runs), 1)
            self.assertEqual(runs[0].id, run.id)

    def test_external_agent_configs_roundtrip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = self._build_dbe(tmpdir)
            self.assertEqual(load_external_agent_configs(dbe), [])

            configs = [
                ExternalAgentConfig(
                    name="Codex CLI",
                    description="Local Codex CLI config",
                    toolType=ExternalAgentToolType.codex,
                    runMode=ExternalAgentRunMode.cli,
                    commandPath="/usr/local/bin/codex",
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
            self.assertEqual([c.id for c in configs], [c.id for c in loaded])
            self.assertEqual(loaded[0].toolType, ExternalAgentToolType.codex)
            self.assertEqual(loaded[1].runMode, ExternalAgentRunMode.server)

            required = require_external_agent_config(dbe, configs[0].id)
            self.assertEqual(required.id, configs[0].id)
            with self.assertRaises(KeyError):
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
            self.assertIsNotNone(loaded)
            if loaded is None:
                return
            self.assertEqual(loaded.template, template.template)
            self.assertEqual(loaded.inputSchema, template.inputSchema)
            self.assertEqual(loaded.metadata, template.metadata)

            templates = list_prompt_templates(dbe)
            self.assertEqual([entry.id for entry in templates], [template.id])

            delete_prompt_template(dbe, template.id)
            self.assertEqual(list_prompt_templates(dbe), [])
