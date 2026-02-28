import json
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
    UISettingRevealContent,
    UISettingRevealTarget,
    WebsocketConnectionType,
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgFrontendIdentity,
    WebsocketMsgListenerRealtimeEvent,
    WebsocketMsgRealtimeUIChange,
)
from setta.ui_settings.reveal_result_hub import (
    RevealResultTransportDisconnectedError,
    UISettingRevealResultHub,
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
            ui_setting_reveal_result_hub=UISettingRevealResultHub(),
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
async def test_frontend_receiver_on_connect_sends_frontend_identity_message() -> None:
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
            ui_setting_reveal_result_hub=UISettingRevealResultHub(),
            share_mode=True,
            share_runtime_state=share_runtime_state,
        )
        frontend_messages: list[Message] = []
        frontend_socket = await _build_websocket(frontend_messages)
        frontend_id = await websocket_manager.on_connect(
            frontend_socket,
            WebsocketConnectionType.FRONTEND,
            id="frontend-share-identity",
            shareSessionId="session-a",
            broadcast_connections=False,
        )
        try:
            await receiver.on_connect(frontend_id)
            sent_messages = _sent_text_messages(frontend_messages)
            assert len(sent_messages) == 1
            payload = json.loads(sent_messages[0])
            typed_payload = WebsocketMsgFrontendIdentity.model_validate(payload)
            assert typed_payload.messageType == "FrontendIdentity"
            assert typed_payload.content.frontendAffinityToken != frontend_id
            resolved_websocket_id = (
                websocket_manager.resolve_frontend_websocket_id_from_affinity_token(
                    affinity_token=typed_payload.content.frontendAffinityToken,
                    share_session_id="session-a",
                )
            )
            assert resolved_websocket_id == frontend_id
        finally:
            await frontend_socket.close()


@pytest.mark.asyncio
async def test_frontend_receiver_rebroadcasts_connections_after_current_address_update(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    websocket_manager = WebsocketManager()
    listener_registry = ListenerRegistry()
    sender = WMHPythonScriptSender(websocket_manager, listener_registry)
    event_hub = RealtimeEventHub(sender)
    receiver = WMHFrontendReceiver(
        websocket_manager,
        project_manager=None,
        realtime_event_hub=event_hub,
        ui_setting_reveal_result_hub=UISettingRevealResultHub(),
        share_mode=False,
    )
    frontend_messages: list[Message] = []
    frontend_socket = await _build_websocket(frontend_messages)
    frontend_id = await websocket_manager.on_connect(
        frontend_socket,
        WebsocketConnectionType.FRONTEND,
        id="frontend-ide-address",
        shareSessionId=None,
        broadcast_connections=False,
    )
    broadcast_calls = 0

    async def _fake_broadcast_connections() -> None:
        nonlocal broadcast_calls
        broadcast_calls += 1

    monkeypatch.setattr(
        websocket_manager,
        "broadcast_connections",
        _fake_broadcast_connections,
    )
    try:
        message = WebsocketMsgCurrentAddressUpdate(content="/updated-path")
        await receiver.process_json_str(message.model_dump_json(), frontend_id)
        assert websocket_manager.sockets[frontend_id].currentAddress == "/updated-path"
        assert broadcast_calls == 1
    finally:
        await frontend_socket.close()


@pytest.mark.asyncio
async def test_frontend_receiver_reuses_tab_affinity_token_after_reconnect() -> None:
    websocket_manager = WebsocketManager()
    listener_registry = ListenerRegistry()
    sender = WMHPythonScriptSender(websocket_manager, listener_registry)
    event_hub = RealtimeEventHub(sender)
    receiver = WMHFrontendReceiver(
        websocket_manager,
        project_manager=None,
        realtime_event_hub=event_hub,
        ui_setting_reveal_result_hub=UISettingRevealResultHub(),
        share_mode=False,
    )
    first_messages: list[Message] = []
    second_messages: list[Message] = []
    first_socket = await _build_websocket(first_messages)
    second_socket = await _build_websocket(second_messages)
    first_frontend_id = await websocket_manager.on_connect(
        first_socket,
        WebsocketConnectionType.FRONTEND,
        id="frontend-identity-first",
        shareSessionId=None,
        broadcast_connections=False,
    )

    try:
        await receiver.on_connect(first_frontend_id)
        await receiver.process_json_str(
            WebsocketMsgCurrentAddressUpdate(
                content="/project#setta-ws-affinity=tab-stable"
            ).model_dump_json(),
            first_frontend_id,
        )
        first_identity_messages = [
            WebsocketMsgFrontendIdentity.model_validate_json(message)
            for message in _sent_text_messages(first_messages)
            if json.loads(message).get("messageType") == "FrontendIdentity"
        ]
        assert len(first_identity_messages) >= 1
        stable_affinity_token = first_identity_messages[-1].content.frontendAffinityToken

        await websocket_manager.on_disconnect(
            first_frontend_id,
            broadcast_connections=False,
        )
        await receiver.on_disconnect(first_frontend_id)
        await first_socket.close()

        second_frontend_id = await websocket_manager.on_connect(
            second_socket,
            WebsocketConnectionType.FRONTEND,
            id="frontend-identity-second",
            shareSessionId=None,
            broadcast_connections=False,
        )
        try:
            await receiver.on_connect(second_frontend_id)
            await receiver.process_json_str(
                WebsocketMsgCurrentAddressUpdate(
                    content="/project#setta-ws-affinity=tab-stable"
                ).model_dump_json(),
                second_frontend_id,
            )
            second_identity_messages = [
                WebsocketMsgFrontendIdentity.model_validate_json(message)
                for message in _sent_text_messages(second_messages)
                if json.loads(message).get("messageType") == "FrontendIdentity"
            ]
            assert len(second_identity_messages) >= 2
            assert (
                second_identity_messages[-1].content.frontendAffinityToken
                == stable_affinity_token
            )
            assert (
                websocket_manager.resolve_frontend_websocket_id_from_affinity_token(
                    affinity_token=stable_affinity_token,
                    share_session_id=None,
                )
                == second_frontend_id
            )
        finally:
            await websocket_manager.on_disconnect(
                second_frontend_id,
                broadcast_connections=False,
            )
            await receiver.on_disconnect(second_frontend_id)
            await second_socket.close()
    finally:
        if first_frontend_id in websocket_manager.sockets:
            await websocket_manager.on_disconnect(
                first_frontend_id,
                broadcast_connections=False,
            )


@pytest.mark.asyncio
async def test_websocket_manager_affinity_token_resolution_is_share_session_bound() -> (
    None
):
    websocket_manager = WebsocketManager()
    frontend_messages: list[Message] = []
    frontend_socket = await _build_websocket(frontend_messages)
    frontend_id = await websocket_manager.on_connect(
        frontend_socket,
        WebsocketConnectionType.FRONTEND,
        id="frontend-share-boundary",
        shareSessionId="session-a",
        broadcast_connections=False,
    )
    try:
        affinity_token = websocket_manager.get_frontend_affinity_token(frontend_id)
        assert isinstance(affinity_token, str)
        assert affinity_token.strip() != ""
        # Token resolution must stay bound to the originating share session.
        assert (
            websocket_manager.resolve_frontend_websocket_id_from_affinity_token(
                affinity_token=affinity_token,
                share_session_id="session-a",
            )
            == frontend_id
        )
        assert (
            websocket_manager.resolve_frontend_websocket_id_from_affinity_token(
                affinity_token=affinity_token,
                share_session_id="session-b",
            )
            is None
        )
    finally:
        await frontend_socket.close()


@pytest.mark.asyncio
async def test_share_sender_routes_ui_setting_reveal_to_single_frontend() -> None:
    websocket_manager = WebsocketManager()
    sender = WMHFrontendSender(websocket_manager, share_mode=True)

    messages_a: list[Message] = []
    messages_b: list[Message] = []
    websocket_a = await _build_websocket(messages_a)
    websocket_b = await _build_websocket(messages_b)
    await websocket_manager.on_connect(
        websocket_b,
        WebsocketConnectionType.FRONTEND,
        id="frontend-z",
        shareSessionId="session-a",
        broadcast_connections=False,
    )
    websocket_id_a = await websocket_manager.on_connect(
        websocket_a,
        WebsocketConnectionType.FRONTEND,
        id="frontend-a",
        shareSessionId="session-a",
        broadcast_connections=False,
    )
    try:
        # Reveal dispatch is intentionally single-target and deterministic.
        selected_websocket_id = await sender.broadcast_ui_setting_reveal(
            UISettingRevealContent(
                projectConfigId=ID("share-project"),
                chatId=None,
                requestId="request-1",
                durationMs=800,
                reveals=[
                    UISettingRevealTarget(
                        settingId="core.watch_code.enabled",
                        side="left",
                        overviewTabKey="WatchCode",
                        uiEditorTabName=None,
                        pluginId=None,
                        paneId=None,
                        strategy="dom_anchor",
                        anchorId="core.watch_code.enabled",
                        pluginRevealKey=None,
                    )
                ],
            ),
            share_session_id="session-a",
        )
        assert selected_websocket_id == websocket_id_a
        assert len(_sent_text_messages(messages_a)) == 1
        assert _sent_text_messages(messages_b) == []
    finally:
        await websocket_a.close()
        await websocket_b.close()


@pytest.mark.asyncio
async def test_share_sender_returns_none_when_reveal_target_disconnects_before_delivery() -> (
    None
):
    websocket_manager = WebsocketManager()
    sender = WMHFrontendSender(websocket_manager, share_mode=True)

    messages: list[Message] = []
    websocket = await _build_websocket(messages)
    websocket_id = await websocket_manager.on_connect(
        websocket,
        WebsocketConnectionType.FRONTEND,
        id="frontend-a",
        shareSessionId="session-a",
        broadcast_connections=False,
    )
    await websocket.close()

    selected_websocket_id = await sender.broadcast_ui_setting_reveal(
        UISettingRevealContent(
            projectConfigId=ID("share-project"),
            chatId=None,
            requestId="request-disconnected",
            durationMs=800,
            reveals=[
                UISettingRevealTarget(
                    settingId="core.watch_code.enabled",
                    side="left",
                    overviewTabKey="WatchCode",
                    uiEditorTabName=None,
                    pluginId=None,
                    paneId=None,
                    strategy="dom_anchor",
                    anchorId="core.watch_code.enabled",
                    pluginRevealKey=None,
                )
            ],
        ),
        share_session_id="session-a",
        target_websocket_id=websocket_id,
    )

    assert selected_websocket_id is None
    assert websocket_id not in websocket_manager.sockets
    assert _sent_text_messages(messages) == []


@pytest.mark.asyncio
async def test_share_sender_prefers_requested_frontend_websocket_for_reveal() -> None:
    websocket_manager = WebsocketManager()
    sender = WMHFrontendSender(websocket_manager, share_mode=True)

    messages_a: list[Message] = []
    messages_b: list[Message] = []
    websocket_a = await _build_websocket(messages_a)
    websocket_b = await _build_websocket(messages_b)
    websocket_id_a = await websocket_manager.on_connect(
        websocket_a,
        WebsocketConnectionType.FRONTEND,
        id="frontend-a",
        shareSessionId="session-a",
        broadcast_connections=False,
    )
    websocket_id_b = await websocket_manager.on_connect(
        websocket_b,
        WebsocketConnectionType.FRONTEND,
        id="frontend-b",
        shareSessionId="session-a",
        broadcast_connections=False,
    )
    try:
        selected_websocket_id = sender.select_frontend_websocket_for_ui_setting_reveal(
            share_session_id="session-a",
            preferred_websocket_id=websocket_id_b,
        )
        assert selected_websocket_id == websocket_id_b

        missing_target = sender.select_frontend_websocket_for_ui_setting_reveal(
            share_session_id="session-a",
            preferred_websocket_id="frontend-missing",
        )
        assert missing_target is None
        assert websocket_id_a != websocket_id_b
    finally:
        await websocket_a.close()
        await websocket_b.close()


@pytest.mark.asyncio
async def test_ui_setting_reveal_socket_selection_ignores_disconnected_frontends() -> (
    None
):
    websocket_manager = WebsocketManager()
    sender = WMHFrontendSender(websocket_manager, share_mode=False)

    messages_a: list[Message] = []
    messages_b: list[Message] = []
    websocket_a = await _build_websocket(messages_a)
    websocket_b = await _build_websocket(messages_b)
    websocket_id_a = await websocket_manager.on_connect(
        websocket_a,
        WebsocketConnectionType.FRONTEND,
        id="frontend-a",
        shareSessionId=None,
        broadcast_connections=False,
    )
    websocket_id_b = await websocket_manager.on_connect(
        websocket_b,
        WebsocketConnectionType.FRONTEND,
        id="frontend-b",
        shareSessionId=None,
        broadcast_connections=False,
    )
    await websocket_b.close()
    try:
        listed_ids = sender.list_frontend_websocket_ids_for_ui_setting_reveal()
        assert listed_ids == [websocket_id_a]

        selected_websocket_id = sender.select_frontend_websocket_for_ui_setting_reveal(
            preferred_websocket_id=websocket_id_b
        )
        assert selected_websocket_id is None
    finally:
        await websocket_a.close()


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
            ui_setting_reveal_result_hub=UISettingRevealResultHub(),
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


@pytest.mark.asyncio
async def test_share_receiver_resolves_ui_setting_reveal_result() -> None:
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
        reveal_result_hub = UISettingRevealResultHub()
        receiver = WMHFrontendReceiver(
            websocket_manager,
            project_manager=None,
            realtime_event_hub=event_hub,
            ui_setting_reveal_result_hub=reveal_result_hub,
            share_mode=True,
            share_runtime_state=share_runtime_state,
        )
        frontend_messages: list[Message] = []
        frontend_socket = await _build_websocket(frontend_messages)
        frontend_id = await websocket_manager.on_connect(
            frontend_socket,
            WebsocketConnectionType.FRONTEND,
            id="frontend-share-reveal",
            shareSessionId="session-a",
        )
        try:
            await receiver.on_connect(frontend_id)
            reveal_result_hub.register_request("reveal-request-1")

            await receiver.process_json_str(
                json.dumps(
                    {
                        "messageType": "UISettingRevealResult",
                        "content": {
                            "projectConfigId": str(project_config_id),
                            "requestId": "reveal-request-1",
                            "statuses": [
                                {
                                    "settingId": "core.watch_code.enabled",
                                    "status": "revealed",
                                    "errorCode": None,
                                    "errorMessage": None,
                                }
                            ],
                        },
                    }
                ),
                frontend_id,
            )
            resolved = await reveal_result_hub.wait_for_result(
                request_id="reveal-request-1",
                timeout_seconds=0.2,
            )
            assert resolved is not None
            assert resolved.requestId == "reveal-request-1"
            assert resolved.statuses[0].settingId == "core.watch_code.enabled"
            assert resolved.statuses[0].status == "revealed"
        finally:
            await frontend_socket.close()


@pytest.mark.asyncio
async def test_share_receiver_ignores_reveal_result_from_unexpected_frontend() -> None:
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
        reveal_result_hub = UISettingRevealResultHub()
        receiver = WMHFrontendReceiver(
            websocket_manager,
            project_manager=None,
            realtime_event_hub=event_hub,
            ui_setting_reveal_result_hub=reveal_result_hub,
            share_mode=True,
            share_runtime_state=share_runtime_state,
        )
        frontend_messages_a: list[Message] = []
        frontend_messages_b: list[Message] = []
        frontend_socket_a = await _build_websocket(frontend_messages_a)
        frontend_socket_b = await _build_websocket(frontend_messages_b)
        frontend_id_a = await websocket_manager.on_connect(
            frontend_socket_a,
            WebsocketConnectionType.FRONTEND,
            id="frontend-share-reveal-a",
            shareSessionId="session-a",
        )
        frontend_id_b = await websocket_manager.on_connect(
            frontend_socket_b,
            WebsocketConnectionType.FRONTEND,
            id="frontend-share-reveal-b",
            shareSessionId="session-a",
        )
        try:
            await receiver.on_connect(frontend_id_a)
            await receiver.on_connect(frontend_id_b)

            # Only acknowledgements from frontend A should resolve this request.
            reveal_result_hub.register_request(
                "reveal-request-2",
                expected_websocket_id=frontend_id_a,
            )

            await receiver.process_json_str(
                json.dumps(
                    {
                        "messageType": "UISettingRevealResult",
                        "content": {
                            "projectConfigId": str(project_config_id),
                            "requestId": "reveal-request-2",
                            "statuses": [
                                {
                                    "settingId": "core.watch_code.enabled",
                                    "status": "failed",
                                    "errorCode": "mutation_failed",
                                    "errorMessage": "wrong client",
                                }
                            ],
                        },
                    }
                ),
                frontend_id_b,
            )
            await receiver.process_json_str(
                json.dumps(
                    {
                        "messageType": "UISettingRevealResult",
                        "content": {
                            "projectConfigId": str(project_config_id),
                            "requestId": "reveal-request-2",
                            "statuses": [
                                {
                                    "settingId": "core.watch_code.enabled",
                                    "status": "revealed",
                                    "errorCode": None,
                                    "errorMessage": None,
                                }
                            ],
                        },
                    }
                ),
                frontend_id_a,
            )
            resolved = await reveal_result_hub.wait_for_result(
                request_id="reveal-request-2",
                timeout_seconds=0.2,
            )
            assert resolved is not None
            assert resolved.requestId == "reveal-request-2"
            assert resolved.statuses[0].status == "revealed"
        finally:
            await frontend_socket_a.close()
            await frontend_socket_b.close()


@pytest.mark.asyncio
async def test_share_receiver_disconnect_cancels_pending_reveal_waiters() -> None:
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
        reveal_result_hub = UISettingRevealResultHub()
        receiver = WMHFrontendReceiver(
            websocket_manager,
            project_manager=None,
            realtime_event_hub=event_hub,
            ui_setting_reveal_result_hub=reveal_result_hub,
            share_mode=True,
            share_runtime_state=share_runtime_state,
        )
        frontend_messages: list[Message] = []
        frontend_socket = await _build_websocket(frontend_messages)
        frontend_id = await websocket_manager.on_connect(
            frontend_socket,
            WebsocketConnectionType.FRONTEND,
            id="frontend-share-disconnect",
            shareSessionId="session-a",
        )
        try:
            await receiver.on_connect(frontend_id)
            reveal_result_hub.register_request(
                "reveal-request-disconnect",
                expected_websocket_id=frontend_id,
            )

            await receiver.on_disconnect(frontend_id)

            with pytest.raises(
                RevealResultTransportDisconnectedError,
                match=frontend_id,
            ):
                await reveal_result_hub.wait_for_result(
                    request_id="reveal-request-disconnect",
                    timeout_seconds=0.2,
                )
        finally:
            await frontend_socket.close()
