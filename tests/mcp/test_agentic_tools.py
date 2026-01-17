import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from mcp.server.fastmcp.server import Context

from setta.database.db_objs import DBE
from setta.mcp.tools.agentic_tools import (
    get_agent_profile,
    list_agent_profiles,
    run_agent_profile,
)
from setta.types.agentic import AgentProfile, AgentRunStatus
from setta.types.id import ID


class AgenticToolsTests(unittest.TestCase):
    def test_agent_profile_tools(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir))
            profile = AgentProfile(
                id=ID("profile-1"),
                name="Runner",
                llmConfigId="llm-default",
            )
            dbe.write_agent_profiles([profile])
            agent_runner = SimpleNamespace(start_run=lambda **_kwargs: None)
            ctx = Context(
                fastmcp=SimpleNamespace(
                    state=SimpleNamespace(dbe=dbe, agent_runner=agent_runner)
                )
            )

            response = list_agent_profiles(ctx=ctx)
            self.assertEqual([profile], response.profiles)

            loaded = get_agent_profile(agentProfileId=profile.id, ctx=ctx)
            self.assertEqual(profile, loaded)

    def test_run_agent_profile_persists_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir))
            profile = AgentProfile(
                id=ID("profile-2"),
                name="Runner",
                llmConfigId="llm-default",
            )
            dbe.write_agent_profiles([profile])
            agent_runner = SimpleNamespace(start_run=lambda **_kwargs: None)
            ctx = Context(
                fastmcp=SimpleNamespace(
                    state=SimpleNamespace(dbe=dbe, agent_runner=agent_runner)
                )
            )

            run = run_agent_profile(
                agentProfileId=profile.id,
                inputs={"task": "demo"},
                ctx=ctx,
            )
            self.assertEqual(AgentRunStatus.queued, run.status)
            self.assertEqual(profile.id, run.agentProfileId)

            stored = dbe.read_agent_run(run.id)
            self.assertIsNotNone(stored)
            self.assertEqual(run.id, stored.id)
