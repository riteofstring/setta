import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

import pytest
from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.share_runtime_state import ShareRuntimeState
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.dependency_key import create_dep_key
from setta.types.generated.websocket_unions import PythonScriptWebsocketMsgTypeAdapter
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyMode,
    ListenerFrontendEmitRawContent,
    ListenerRegisterCallback,
)
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import TextBlockSectionImpl
from setta.types.share_deployment import DeploymentManifest, DeploymentType
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgListenerError,
    WebsocketMsgListenerFrontendEmit,
)
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_receiver import (
    WMHPythonScriptReceiver,
)
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager


pytestmark = pytest.mark.asyncio


PROJECT_CONFIG_ID = ID("share-project")
SECTION_ID = ID("section-a")


async def _noop_wait_until_ready() -> None:
    return None


def _build_share_state() -> SimpleNamespace:
    return SimpleNamespace(
        share_mode=True,
        wait_until_ready=_noop_wait_until_ready,
    )


async def _build_websocket(
    messages: list[Message], *, state: SimpleNamespace | None = None
) -> WebSocket:
    receive_queue: list[Message] = [{"type": "websocket.connect"}]

    async def receive() -> Message:
        if receive_queue:
            return receive_queue.pop(0)
        return {"type": "websocket.receive"}

    async def send(message: Message) -> None:
        messages.append(message)

    if state is None:
        state = _build_share_state()
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


def _sent_text_messages(messages: list[Message]) -> list[str]:
    return [
        message["text"]
        for message in messages
        if message.get("type") == "websocket.send" and "text" in message
    ]


def _build_project_state() -> ProjectStateSingleConfig:
    text_impl = TextBlockSectionImpl(
        id=ID("text-impl"),
        name="Headline",
        text="Initial text",
    )
    variant = Variant(
        id=ID("text-variant"),
        name="Variant",
        impl=text_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(text_impl),
    )
    section = Core(
        id=SECTION_ID,
        name="Hero",
        variants=[variant.id],
        defaultVariant=variant.id,
    )
    project_config = ProjectConfig(
        id=PROJECT_CONFIG_ID,
        name="Share Project",
        sectionVariantMap={section.id: variant.id},
        topLevelSections={section.id: TopLevelSectionLayout()},
    )
    return ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section.id: section},
        sectionImpls={text_impl.id: text_impl},
        sectionVariants={variant.id: variant},
    )


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = (
        Path(tmpdir)
        / "deployments"
        / project_config_name
        / deployment_version
    )
    root.mkdir(parents=True, exist_ok=True)
    return root


def _write_project(root: Path) -> DBE:
    state = _build_project_state()
    backend = merge_single_config_into_backend(ProjectStateBackend(), state)
    backend.defaultProjectConfigId = state.projectConfig.id
    dbe = DBE(root)
    dbe.write_project(backend)
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=state.projectConfig.id,
        deploymentVersion=root.name,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return dbe


async def test_frontend_emit_without_share_session_reports_error() -> None:
    with TemporaryDirectory() as tmpdir:
        root = _build_share_deployment_root(tmpdir, "Share Project")
        dbe = _write_project(root)
        websocket_manager = WebsocketManager()
        listener_registry = ListenerRegistry()
        frontend_sender = WMHFrontendSender(
            websocket_manager,
            share_mode=True,
        )
        python_sender = WMHPythonScriptSender(websocket_manager, listener_registry)
        share_manager = ShareRuntimeState(dbe, root, frontend_sender)
        settings_file = SettingsFile(
            dbe,
            frontend_sender,
            allow_write=False,
        )
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
        share_state = _build_share_state()
        websocket = await _build_websocket(messages, state=share_state)
        websocket_id = await websocket_manager.on_connect(
            websocket,
            WebsocketConnectionType.PYTHON_SCRIPT,
            id="listener-missing-session",
            shareSessionId=None,
        )

        listener_registry.upsert_registration(
            websocket_id=websocket_id,
            project_config_id=share_manager.default_project_config_id,
            callbacks={
                "cb": ListenerRegisterCallback(
                    dependencies=[],
                    dependencyMode=ListenerDependencyMode.ALWAYS,
                )
            },
            share_session_id=None,
        )

        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId=share_manager.default_project_config_id,
                dependencyValues={},
                artifactUpdates=[],
            )
        )
        await receiver.process_json_str(
            emit_message.model_dump_json(),
            websocket_id,
        )

        sent = _sent_text_messages(messages)
        assert len(sent) == 1
        parsed = PythonScriptWebsocketMsgTypeAdapter.validate_json(sent[0])
        assert isinstance(parsed, WebsocketMsgListenerError)
        assert parsed.content.error == "share_session_missing"

        await websocket.close()


async def test_listener_coverage_broadcasts_to_session() -> None:
    with TemporaryDirectory() as tmpdir:
        root = _build_share_deployment_root(tmpdir, "Share Project")
        dbe = _write_project(root)
        websocket_manager = WebsocketManager()
        listener_registry = ListenerRegistry()
        frontend_sender = WMHFrontendSender(
            websocket_manager,
            share_mode=True,
        )
        python_sender = WMHPythonScriptSender(websocket_manager, listener_registry)
        share_manager = ShareRuntimeState(dbe, root, frontend_sender)
        settings_file = SettingsFile(
            dbe,
            frontend_sender,
            allow_write=False,
        )
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

        frontend_messages_a: list[Message] = []
        frontend_messages_b: list[Message] = []
        share_state = _build_share_state()
        websocket_a = await _build_websocket(
            frontend_messages_a,
            state=share_state,
        )
        websocket_b = await _build_websocket(
            frontend_messages_b,
            state=share_state,
        )
        await websocket_manager.on_connect(
            websocket_a,
            WebsocketConnectionType.FRONTEND,
            id="frontend-a",
            shareSessionId="session-a",
        )
        await websocket_manager.on_connect(
            websocket_b,
            WebsocketConnectionType.FRONTEND,
            id="frontend-b",
            shareSessionId="session-b",
        )

        share_manager.create_session_backend("session-a")
        share_manager.create_session_backend("session-b")

        listener_messages: list[Message] = []
        listener_socket = await _build_websocket(
            listener_messages,
            state=share_state,
        )
        listener_id = await websocket_manager.on_connect(
            listener_socket,
            WebsocketConnectionType.PYTHON_SCRIPT,
            id="listener-shared",
            shareSessionId="session-a",
        )
        listener_registry.upsert_registration(
            websocket_id=listener_id,
            project_config_id=share_manager.default_project_config_id,
            callbacks={
                "cb": ListenerRegisterCallback(
                    dependencies=[create_dep_key(sectionId=SECTION_ID)],
                    dependencyMode=ListenerDependencyMode.ALWAYS,
                )
            },
            share_session_id="session-a",
        )

        await receiver._sync_listener_coverage(
            share_manager.default_project_config_id,
            share_session_id="session-a",
        )

        types_a = [
            json.loads(text)["messageType"]
            for text in _sent_text_messages(frontend_messages_a)
        ]
        types_b = [
            json.loads(text)["messageType"]
            for text in _sent_text_messages(frontend_messages_b)
        ]

        assert "ListenerCoverageSnapshot" in types_a
        assert "ListenerCoverageSnapshot" not in types_b

        await websocket_a.close()
        await websocket_b.close()
        await listener_socket.close()
