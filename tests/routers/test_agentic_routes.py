import unittest
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.routers.agentic import (
    CreateAgentProfileRequest,
    DeleteAgentProfileRequest,
    GetAgentProfileRequest,
    GetAgentRunRequest,
    StartAgentRunRequest,
    StopAgentRunRequest,
    UpdateAgentProfileRequest,
    route_create_agent_profile,
    route_delete_agent_profile,
    route_get_agent_profile,
    route_get_agent_profiles,
    route_get_agent_run,
    route_get_agent_runs,
    route_start_agent_run,
    route_stop_agent_run,
    route_update_agent_profile,
)
from setta.types.agentic import AgentRunStatus
from tests.utils.runtime_context import runtime_context


@dataclass(slots=True)
class _AgenticTestState:
    dbe: DBE
    share_mode: bool = False
    share_runtime_state: None = None
    wmh_frontend_sender: None = None
    chat_manager: None = None


class AgenticRoutesTests(unittest.IsolatedAsyncioTestCase):
    async def test_profile_crud_and_runs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            state = _AgenticTestState(dbe=dbe)

            with runtime_context(state) as ctx:
                profile = await route_create_agent_profile(
                    CreateAgentProfileRequest(
                        name="Planner",
                        description="Planner profile",
                        systemPrompt="Plan tasks",
                        llmConfigId="planner-llm",
                        toolAllowlist=["tool.a"],
                        memoryScope="workspace",
                    ),
                    ctx,
                )

                profiles = await route_get_agent_profiles(ctx)
                self.assertEqual(len(profiles), 1)
                self.assertEqual(profiles[0].id, profile.id)

                updated = profile.model_copy(update={"name": "Planner v2"})
                updated_profile = await route_update_agent_profile(
                    UpdateAgentProfileRequest(profile=updated),
                    ctx,
                )
                self.assertEqual(updated_profile.name, "Planner v2")

                fetched = await route_get_agent_profile(
                    GetAgentProfileRequest(profileId=profile.id),
                    ctx,
                )
                self.assertEqual(fetched.name, "Planner v2")

                run = await route_start_agent_run(
                    StartAgentRunRequest(
                        profileId=profile.id,
                        inputs={"prompt": "hello"},
                    ),
                    ctx,
                )
                self.assertEqual(run.status, AgentRunStatus.running)

                fetched_run = await route_get_agent_run(
                    GetAgentRunRequest(runId=run.id),
                    ctx,
                )
                self.assertEqual(fetched_run.id, run.id)

                stopped = await route_stop_agent_run(
                    StopAgentRunRequest(runId=run.id),
                    ctx,
                )
                self.assertEqual(stopped.status, AgentRunStatus.cancelled)
                self.assertIsNotNone(stopped.finishedAt)

                runs = await route_get_agent_runs(ctx)
                self.assertEqual(len(runs), 1)

                await route_delete_agent_profile(
                    DeleteAgentProfileRequest(profileId=profile.id),
                    ctx,
                )
                profiles = await route_get_agent_profiles(ctx)
                self.assertEqual(profiles, [])
