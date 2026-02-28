from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.database.db_objs import DBE
from setta.project_state.share_runtime_state import ShareRuntimeState
from setta.types.project_config import ProjectConfig
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.websocket_unions import PythonScriptWebsocketMsgTypeAdapter
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyMode,
    ListenerRegisterCallback,
    RealtimeUIChangeContent,
)
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgListenerRealtimeEvent,
    WebsocketMsgRealtimeUIChange,
)
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import DeploymentManifest, DeploymentType, SharePolicy
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_receiver import WMHFrontendReceiver
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.realtime_event_hub import RealtimeEventHub
from setta.websockets.websocket_manager import WebsocketManager


async def _build_websocket(messages: list[Message]) -> WebSocket:
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
    }
    return WebSocket(scope=scope, receive=receive, send=send)


def _sent_text_messages(messages: list[Message]) -> list[str]:
    return [
        message["text"]
        for message in messages
        if message.get("type") == "websocket.send" and "text" in message
    ]


def _build_share_runtime_state(
    tmpdir: str,
    websocket_manager: WebsocketManager,
    project_config_id: ID,
    project_config_name: str,
) -> ShareRuntimeState:
    root = Path(tmpdir) / "deployments" / project_config_name / "v1"
    root.mkdir(parents=True, exist_ok=True)
    dbe = DBE(root)
    project_config = ProjectConfig(
        id=project_config_id,
        name=project_config_name,
    )
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion="v1",
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    dbe.write_json(root / "policy.json", SharePolicy().model_dump())
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=True)
    return ShareRuntimeState(dbe, root, frontend_sender)


@pytest.mark.asyncio
async def test_share_receiver_requires_session_id() -> None:
    with TemporaryDirectory() as tmpdir:
        websocket_manager = WebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(websocket_manager, listener_registry)
        event_hub = RealtimeEventHub(sender)
        share_runtime_state = _build_share_runtime_state(
            tmpdir,
            websocket_manager,
            ID("share-project"),
            "Share Project",
        )
        receiver = WMHFrontendReceiver(
            websocket_manager,
            project_manager=None,
            realtime_event_hub=event_hub,
            share_mode=True,
            share_runtime_state=share_runtime_state,
        )

        messages: list[Message] = []
        websocket = await _build_websocket(messages)
        websocket_id = await websocket_manager.on_connect(
            websocket,
            WebsocketConnectionType.FRONTEND,
            id="frontend-missing",
            shareSessionId=None,
        )

        with pytest.raises(KeyError):
            await receiver.on_connect(websocket_id)

        await websocket.close()


@pytest.mark.asyncio
async def test_share_receiver_emits_realtime_delta() -> None:
    with TemporaryDirectory() as tmpdir:
        websocket_manager = WebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(websocket_manager, listener_registry)
        event_hub = RealtimeEventHub(sender)
        project_config_id = ID("share-project")
        share_runtime_state = _build_share_runtime_state(
            tmpdir,
            websocket_manager,
            project_config_id,
            "Share Project",
        )
        share_runtime_state.create_session_backend("session-a")
        receiver = WMHFrontendReceiver(
            websocket_manager,
            project_manager=None,
            realtime_event_hub=event_hub,
            share_mode=True,
            share_runtime_state=share_runtime_state,
        )

        listener_messages: list[Message] = []
        listener_socket = await _build_websocket(listener_messages)
        listener_id = await websocket_manager.on_connect(
            listener_socket,
            WebsocketConnectionType.PYTHON_SCRIPT,
            id="python-listener",
            shareSessionId="session-a",
        )

        dependency = create_dep_key(
            sectionId=ID("section-a"),
            codeObjId=ID("param-a"),
        )
        listener_registry.upsert_registration(
            websocket_id=listener_id,
            project_config_id=project_config_id,
            callbacks={
                "cb": ListenerRegisterCallback(
                    dependencies=[dependency],
                    dependencyMode=ListenerDependencyMode.ALWAYS,
                )
            },
            share_session_id="session-a",
        )

        frontend_messages: list[Message] = []
        frontend_socket = await _build_websocket(frontend_messages)
        frontend_id = await websocket_manager.on_connect(
            frontend_socket,
            WebsocketConnectionType.FRONTEND,
            id="frontend-share",
            shareSessionId="session-a",
        )
        try:
            await receiver.on_connect(frontend_id)

            content = RealtimeUIChangeContent(
                projectConfigId=project_config_id,
                dependencyKey=dependency,
                value=LiteralDependencyValue("hello"),
            )
            message = WebsocketMsgRealtimeUIChange(content=content)

            await receiver.process_json_str(
                message.model_dump_json(),
                frontend_id,
            )

            sent = _sent_text_messages(listener_messages)
            assert len(sent) == 1
            parsed = PythonScriptWebsocketMsgTypeAdapter.validate_json(sent[0])
            assert isinstance(parsed, WebsocketMsgListenerRealtimeEvent)
            assert parsed.content.sequence == 1
            assert parsed.content.deltas[0].dependency == dependency
        finally:
            await frontend_socket.close()
            await listener_socket.close()
