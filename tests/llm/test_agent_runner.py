import asyncio
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.mcp.client import MultiMCPClient
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    AgentRunStatus,
    RunEventType,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


class AgentRunnerTests(unittest.IsolatedAsyncioTestCase):
    async def _wait_for_status(
        self,
        dbe: DBE,
        run_id: ID,
        status: AgentRunStatus,
        *,
        timeout_seconds: float = 1.0,
    ) -> AgentRun:
        start = time.monotonic()
        while time.monotonic() - start < timeout_seconds:
            run = dbe.read_agent_run(run_id)
            if run and run.status == status:
                return run
            await asyncio.sleep(0.01)
        raise AssertionError(f"Run {run_id} never reached status {status}")

    def _write_project(self, dbe: DBE) -> ID:
        project_config = ProjectConfig(name="Agent Runner Test")
        project_state = ProjectStateBackend(
            projectConfigs={project_config.id: project_config},
            defaultProjectConfigId=project_config.id,
        )
        dbe.write_project(project_state)
        return project_config.id

    def _build_runner(self, dbe: DBE) -> AgentRunner:
        mcp_client = MultiMCPClient({}, disabled=True)
        sender = WMHFrontendSender(WebsocketManager())
        return AgentRunner(dbe, mcp_client, sender)

    async def test_missing_llm_config_marks_run_failed(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir))
            self._write_project(dbe)
            runner = self._build_runner(dbe)
            runner.update_config(AllLLMConfigs())
            profile = AgentProfile(
                id=ID("profile-missing"),
                name="MissingConfig",
                llmConfigId="missing",
            )
            run = AgentRun(
                id=ID("run-missing"),
                agentProfileId=profile.id,
                llmConfigId=profile.llmConfigId,
            )
            dbe.write_agent_run(run)
            runner.start_run(
                run=run,
                profile=profile,
                inputs=None,
                llm_config_id=profile.llmConfigId,
                share_session_id=None,
            )
            try:
                stored = await self._wait_for_status(
                    dbe, run.id, AgentRunStatus.failed
                )
                self.assertTrue(
                    any(event.type == RunEventType.error for event in stored.events)
                )
            finally:
                await runner.shutdown()

    async def test_tool_allowlist_requires_namespaced_tools(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir))
            self._write_project(dbe)
            runner = self._build_runner(dbe)
            runner.update_config(
                AllLLMConfigs(
                    configs={
                        "llm-default": LLMConfig(id="llm-default", model="gpt-4o-mini")
                    }
                )
            )
            profile = AgentProfile(
                id=ID("profile-allowlist"),
                name="BadAllowlist",
                llmConfigId="llm-default",
                toolAllowlist=["create_section"],
            )
            run = AgentRun(
                id=ID("run-allowlist"),
                agentProfileId=profile.id,
                llmConfigId=profile.llmConfigId,
            )
            dbe.write_agent_run(run)
            runner.start_run(
                run=run,
                profile=profile,
                inputs=None,
                llm_config_id=profile.llmConfigId,
                share_session_id=None,
            )
            try:
                stored = await self._wait_for_status(
                    dbe, run.id, AgentRunStatus.failed
                )
                error_events = [
                    event
                    for event in stored.events
                    if event.type == RunEventType.error
                ]
                self.assertTrue(error_events)
                self.assertIn(
                    "Tool allowlist entry must be namespaced",
                    error_events[-1].outputs.get("error", ""),
                )
            finally:
                await runner.shutdown()

    async def test_system_prompt_includes_profile_and_project(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir))
            project_config_id = self._write_project(dbe)
            runner = self._build_runner(dbe)
            profile = AgentProfile(
                id=ID("profile-prompt"),
                name="PromptRunner",
                description="Checks prompt wiring",
                systemPrompt="Use concise bullets.",
                llmConfigId="llm-default",
            )

            prompt = runner._build_system_prompt(
                profile=profile,
                active_project_config_id=project_config_id,
            )
            _, canonical_to_temporary = dbe.read_temporary_id_map()
            temporary_id = canonical_to_temporary[project_config_id]

            self.assertIn("## Active project config", prompt)
            self.assertIn(f"- id: {temporary_id}", prompt)
            self.assertIn("## Agent profile", prompt)
            self.assertIn(f"- name: {profile.name}", prompt)
            self.assertIn(f"- description: {profile.description}", prompt)
            self.assertIn("## Agent system prompt", prompt)
            self.assertIn(profile.systemPrompt, prompt)
