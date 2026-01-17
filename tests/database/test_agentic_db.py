import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    AgentRunStatus,
    PromptTemplate,
    RunEvent,
    RunEventType,
)
from setta.types.id import ID


class AgenticDBTests(unittest.TestCase):
    def test_agent_profiles_round_trip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir))
            profile = AgentProfile(
                id=ID("profile-1"),
                name="Navigator",
                description="Guides agent runs",
                llmConfigId="llm-default",
            )
            dbe.write_agent_profiles([profile])

            loaded = dbe.read_agent_profiles()
            self.assertEqual(1, len(loaded))
            self.assertEqual(profile, loaded[0])

    def test_agent_profiles_reject_non_list_payload(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir))
            dbe.write_json(dbe.agent_profiles, {"bad": "data"})

            with self.assertRaises(ValueError):
                dbe.read_agent_profiles()

    def test_prompt_assets_round_trip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir))
            prompt = PromptTemplate(
                id=ID("prompt-1"),
                name="Greeting",
                description="Says hello",
                template="Hello {{ name }}",
            )
            dbe.write_prompt(prompt)

            loaded = dbe.read_prompt(prompt.id)
            self.assertEqual(prompt, loaded)
            self.assertEqual([prompt], dbe.read_prompts())

            dbe.delete_prompt(prompt.id)
            self.assertIsNone(dbe.read_prompt(prompt.id))
            self.assertEqual([], dbe.read_prompts())

    def test_agent_runs_round_trip(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir))
            run = AgentRun(
                id=ID("run-1"),
                agentProfileId=ID("profile-1"),
                llmConfigId="llm-default",
                status=AgentRunStatus.queued,
                events=[
                    RunEvent(
                        type=RunEventType.status,
                        status=AgentRunStatus.queued,
                    )
                ],
            )
            dbe.write_agent_run(run)

            loaded = dbe.read_agent_run(run.id)
            self.assertEqual(run, loaded)
            self.assertEqual([run], dbe.read_agent_runs())
            self.assertIsNone(dbe.read_agent_run(ID("missing-run")))
