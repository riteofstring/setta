import asyncio
import os
import shutil
import subprocess
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.external_adapters.codex_sdk import CodexSdkAdapter
from setta.agentic.external_adapters.registry import ExternalAgentAdapterRegistry
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.database.db_objs import DBE
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
)
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


class CodexSdkAdapterIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_codex_sdk_streams_message(self) -> None:
        node_path = shutil.which("node")
        if node_path is None:
            self.skipTest("node is not installed")
        module_check = subprocess.run(
            [node_path, "-e", "require('@openai/codex-sdk')"],
            capture_output=True,
            check=False,
            text=True,
        )
        if module_check.returncode != 0:
            self.skipTest("@openai/codex-sdk is not available to node")
        if not os.environ.get("OPENAI_API_KEY"):
            self.skipTest("OPENAI_API_KEY not set")

        with TemporaryDirectory() as tmpdir:
            dbe = DBE(Path(tmpdir) / "setta_files")
            project_config = ProjectConfig()
            dbe.write_project(
                ProjectStateBackend(
                    projectConfigs={project_config.id: project_config},
                    defaultProjectConfigId=project_config.id,
                )
            )
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            registry = ExternalAgentAdapterRegistry(adapters=[CodexSdkAdapter()])
            runner = ExternalAgentRunner(
                dbe,
                frontend_sender,
                adapter_registry=registry,
            )

            config = ExternalAgentConfig(
                name="Codex SDK",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.sdk,
                commandPath=node_path,
            )

            run = runner.start_run(config, None, {"prompt": "Say hello."})
            # Let the runner task work; poll until run completes or timeout.
            for _ in range(120):
                await asyncio.sleep(0.5)
                stored = dbe.read_agent_run(run.id)
                if stored and stored.get("status") in {
                    "completed",
                    "failed",
                    "cancelled",
                }:
                    break

            stored = dbe.read_agent_run(run.id)
            self.assertIsNotNone(stored)
            if stored is None:
                return
            self.assertEqual(stored.get("status"), "completed")
