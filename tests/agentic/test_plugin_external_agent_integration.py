import shutil
import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from fastapi import FastAPI

from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.database.db_objs import DBE
from setta.plugins.manager import PluginManager
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
)
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager

FIXTURE_ROOT = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "plugins"
    / "backend-external-agent"
)


@pytest.mark.asyncio
async def test_plugin_registered_external_agent_runs_through_runner() -> None:
    # Plugin manager registrations should be directly consumable by ExternalAgentRunner.
    with TemporaryDirectory() as tmpdir:
        tmp_root = Path(tmpdir)
        workspace_root = tmp_root / "workspace"
        setta_files_root = tmp_root / "setta_files"
        setta_home = tmp_root / "setta_home"
        plugin_root = workspace_root / ".setta_plugins" / "setta-fixture-backend-external-agent"
        plugin_root.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(FIXTURE_ROOT, plugin_root)

        manager = PluginManager(
            workspace_root=workspace_root,
            setta_files_root=setta_files_root,
            setta_home=setta_home,
            server_mode="ide",
            setta_version="0.1.0",
        )
        manager.rescan()
        manager.load_backend_plugins(app=FastAPI())
        plugin_adapters = manager.get_backend_external_agent_adapters()

        assert len(plugin_adapters) == 1
        registration = plugin_adapters[0]
        assert (
            registration.adapterId
            == "setta-fixture-backend-external-agent:fixture-agent"
        )

        dbe = DBE(setta_files_root)
        project_config = ProjectConfig()
        dbe.write_project(
            ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                defaultProjectConfigId=project_config.id,
            )
        )
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
        runner = ExternalAgentRunner(
            dbe,
            frontend_sender,
            plugin_external_agent_adapters=plugin_adapters,
        )

        config = ExternalAgentConfig(
            name="Fixture plugin adapter",
            toolType=ExternalAgentToolType.plugin,
            pluginAdapterId=registration.adapterId,
            runMode=ExternalAgentRunMode.sdk,
        )
        run = runner.start_run(
            ID("engine-plugin"),
            config,
            profile=None,
            inputs={"prompt": "integration hello", "allowUnscoped": True},
        )
        completed = await runner.wait_for_run(run.id, timeout=10.0)

        assert completed.status.value == "completed"
        assert completed.outputs is not None
        final_text = completed.outputs.get("finalText")
        assert isinstance(final_text, str)
        assert "fixture external adapter reply: integration hello" in final_text
        assert completed.outputs.get("sessionId") == "fixture-session"
        manager.shutdown_backend_plugins()


@pytest.mark.asyncio
async def test_plugin_external_agent_approval_roundtrip_through_runner() -> None:
    # Plugin process adapters should receive runner approval responses over stdin.
    with TemporaryDirectory() as tmpdir:
        tmp_root = Path(tmpdir)
        workspace_root = tmp_root / "workspace"
        setta_files_root = tmp_root / "setta_files"
        setta_home = tmp_root / "setta_home"
        plugin_root = workspace_root / ".setta_plugins" / "setta-fixture-backend-external-agent"
        plugin_root.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(FIXTURE_ROOT, plugin_root)
        (plugin_root / "backend" / "mini_external_agent.py").write_text(
            "import json\n"
            "import sys\n\n"
            "def _emit(payload):\n"
            "    sys.stdout.write(json.dumps(payload) + '\\n')\n"
            "    sys.stdout.flush()\n\n"
            "_ = sys.stdin.readline()\n"
            "_emit({\n"
            "    'type': 'approval_request',\n"
            "    'approvalId': 'approval-1',\n"
            "    'tool': {'name': 'shell'},\n"
            "    'input': {'command': 'echo integration approval'},\n"
            "})\n"
            "approval_line = sys.stdin.readline()\n"
            "approved = False\n"
            "if approval_line:\n"
            "    try:\n"
            "        approval_payload = json.loads(approval_line)\n"
            "    except json.JSONDecodeError:\n"
            "        approval_payload = None\n"
            "    if isinstance(approval_payload, dict):\n"
            "        approved = (\n"
            "            approval_payload.get('type') == 'approval_response'\n"
            "            and approval_payload.get('approvalId') == 'approval-1'\n"
            "            and approval_payload.get('approved') is True\n"
            "        )\n"
            "if approved:\n"
            "    _emit({'type': 'message', 'text': 'approval accepted'})\n"
            "else:\n"
            "    _emit({'type': 'message', 'text': 'approval denied'})\n"
            "_emit({'type': 'done', 'returnCode': 0})\n",
            encoding="utf-8",
        )

        manager = PluginManager(
            workspace_root=workspace_root,
            setta_files_root=setta_files_root,
            setta_home=setta_home,
            server_mode="ide",
            setta_version="0.1.0",
        )
        manager.rescan()
        manager.load_backend_plugins(app=FastAPI())
        plugin_adapters = manager.get_backend_external_agent_adapters()
        assert len(plugin_adapters) == 1
        registration = plugin_adapters[0]

        dbe = DBE(setta_files_root)
        project_config = ProjectConfig()
        dbe.write_project(
            ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                defaultProjectConfigId=project_config.id,
            )
        )
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
        runner = ExternalAgentRunner(
            dbe,
            frontend_sender,
            plugin_external_agent_adapters=plugin_adapters,
        )

        config = ExternalAgentConfig(
            name="Fixture plugin adapter approval",
            toolType=ExternalAgentToolType.plugin,
            pluginAdapterId=registration.adapterId,
            runMode=ExternalAgentRunMode.sdk,
        )
        run = runner.start_run(
            ID("engine-plugin-approval"),
            config,
            profile=None,
            inputs={"prompt": "approval request fixture", "allowUnscoped": True},
        )

        for _ in range(100):
            if "approval-1" in runner._pending_approvals:
                break
            await asyncio.sleep(0.05)
        assert "approval-1" in runner._pending_approvals

        await runner.respond_to_approval("approval-1", True)
        completed = await runner.wait_for_run(run.id, timeout=10.0)

        assert completed.status.value == "completed"
        assert completed.outputs is not None
        final_text = completed.outputs.get("finalText")
        assert isinstance(final_text, str)
        assert "approval accepted" in final_text
        manager.shutdown_backend_plugins()
