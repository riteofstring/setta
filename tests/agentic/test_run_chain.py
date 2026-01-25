import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.agentic.run_chain import RunChainRunner
from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.mcp.client import MultiMCPClient
from setta.types.agentic import RunChainSpec, RunChainStep
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


class RunChainRunnerTests(unittest.IsolatedAsyncioTestCase):
    async def test_empty_chain_completes(self) -> None:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            project_config = ProjectConfig()
            project_state = ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                defaultProjectConfigId=project_config.id,
            )
            dbe.write_project(project_state)

            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            mcp_client = MultiMCPClient({}, disabled=True)
            agent_runner = AgentRunner(dbe, mcp_client, frontend_sender)
            agent_runner.update_config(AllLLMConfigs(configs={}, mcpServers={}))
            external_agent_runner = ExternalAgentRunner(
                dbe,
                frontend_sender,
                mcp_client=mcp_client,
            )
            chain_runner = RunChainRunner(
                dbe,
                agent_runner,
                external_agent_runner,
                frontend_sender,
            )

            spec = RunChainSpec(name="Empty chain", steps=[])
            run = chain_runner.start_run(spec, inputs=None)
            completed = await chain_runner.wait_for_run(run.id, timeout=2)

            self.assertEqual(completed.status.value, "completed")
            self.assertIsNotNone(completed.finishedAt)
            self.assertEqual(completed.outputs.get("chainId"), str(spec.id))
            self.assertEqual(completed.outputs.get("chainName"), spec.name)
            self.assertEqual(completed.outputs.get("steps"), [])
            event_types = [event.type for event in completed.events]
            self.assertIn("chain_started", event_types)
            self.assertIn("chain_completed", event_types)
            self.assertIn("snapshot", event_types)

    async def test_step_inputs_reject_mismatched_engine_config_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            project_config = ProjectConfig()
            project_state = ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                defaultProjectConfigId=project_config.id,
            )
            dbe.write_project(project_state)

            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            mcp_client = MultiMCPClient({}, disabled=True)
            agent_runner = AgentRunner(dbe, mcp_client, frontend_sender)
            agent_runner.update_config(AllLLMConfigs(configs={}, mcpServers={}))
            external_agent_runner = ExternalAgentRunner(
                dbe,
                frontend_sender,
                mcp_client=mcp_client,
            )
            chain_runner = RunChainRunner(
                dbe,
                agent_runner,
                external_agent_runner,
                frontend_sender,
            )

            step = RunChainStep(
                name="Mismatch step",
                engineConfigId=ID("engine-1"),
                inputs={"engineConfigId": "engine-2"},
            )

            with self.assertRaises(KeyError):
                chain_runner._build_step_inputs(
                    step=step,
                    step_index=0,
                    chain_run_id=ID("chain-1"),
                    chain_inputs={},
                    previous_outputs=[],
                )
