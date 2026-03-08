from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from typing import Any

import pytest
from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.share_runtime_state import ShareRuntimeState
from setta.types.app_definition import AppDefinition
from setta.types.listener import (
    ListenerDependencyMode,
    ListenerRegisterCallback,
    ListenerRegisterContent,
)
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import DeploymentManifest, DeploymentType, SharePolicy
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgListenerRegister,
)
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_receiver import WMHPythonScriptReceiver
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager


pytestmark = pytest.mark.asyncio


async def _noop_wait_until_ready() -> None:
    return None


def _build_app_state() -> SimpleNamespace:
    return SimpleNamespace(
        share_mode=False,
        app_mode=True,
        deployment_mode=True,
        wait_until_ready=_noop_wait_until_ready,
    )


def _write_app_project(
    deployment_root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> DBE:
    deployment_root.mkdir(parents=True, exist_ok=True)
    dbe = DBE(deployment_root)
    project_config = ProjectConfig(name=project_config_name)
    app_spec_path = "app_specs/app.json"
    dbe.write_json(deployment_root / app_spec_path, {"root": {"key": "root", "type": "Stack"}})
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
        appDefinition=AppDefinition(appSpecPath=app_spec_path),
    )
    dbe.write_project(project_state)
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_root.parent.name,
        deploymentType=DeploymentType.app,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(deployment_root / "manifest.json", manifest.model_dump())
    dbe.write_json(deployment_root / "policy.json", SharePolicy().model_dump())
    return dbe


async def _build_websocket(
    messages: list[Message], *, state: SimpleNamespace
) -> WebSocket:
    receive_queue: list[Message] = [{"type": "websocket.connect"}]

    async def receive() -> Message:
        if receive_queue:
            return receive_queue.pop(0)
        return {"type": "websocket.receive"}

    async def send(message: Message) -> None:
        messages.append(message)

    scope: Scope = {
        "type": "websocket",
        "asgi": {"version": "3.0"},
        "scheme": "ws",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 0),
        "server": ("testserver", 80),
        "subprotocols": [],
        "app": SimpleNamespace(state=SimpleNamespace(setta=state)),
    }
    return WebSocket(scope=scope, receive=receive, send=send)


async def test_listener_register_in_app_mode_stores_share_session_id() -> None:
    with TemporaryDirectory() as tmpdir:
        deployment_root = Path(tmpdir) / "deployments" / "App Project" / "v1"
        dbe = _write_app_project(
            deployment_root,
            project_config_name="App Project",
            deployment_version=deployment_root.name,
        )

        websocket_manager = WebsocketManager()
        listener_registry = ListenerRegistry()
        frontend_sender = WMHFrontendSender(websocket_manager, share_mode=True)
        python_sender = WMHPythonScriptSender(websocket_manager, listener_registry)
        share_manager = ShareRuntimeState(dbe, deployment_root, frontend_sender)
        settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
        share_manager.initialize_share_state(settings_file)
        switcher = ProjectManagerSwitcher(
            share_runtime_state=share_manager,
            settings_file=settings_file,
            python_script_sender=python_sender,
            lsp_writers=None,
            frontend_sender=frontend_sender,
            specific_file_watcher=SpecificFileWatcher(),
        )
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_sender,
            switcher,
            dbe,
        )

        messages: list[Message] = []
        websocket = await _build_websocket(messages, state=_build_app_state())
        websocket_id = await websocket_manager.on_connect(
            websocket,
            WebsocketConnectionType.PYTHON_SCRIPT,
            id="listener-app",
            shareSessionId="session-a",
        )

        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.ALWAYS,
        )
        content = ListenerRegisterContent(
            projectConfigId=share_manager.default_project_config_id,
            callbacks={"cb": callback},
        )
        message = WebsocketMsgListenerRegister(content=content)
        await receiver.process_json_str(message.model_dump_json(), websocket_id)

        registration = listener_registry.get_registration(websocket_id)
        assert registration is not None
        assert registration.share_session_id == "session-a"

        await websocket.close()

