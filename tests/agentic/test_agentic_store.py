import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.store import (
    create_agent_run,
    list_agent_runs,
    load_agent_profiles,
    load_agent_run,
    save_agent_profiles,
    save_agent_run,
)
from setta.database.db_objs import DBE
from setta.types.agentic import AgentProfile, AgentRunStatus


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
