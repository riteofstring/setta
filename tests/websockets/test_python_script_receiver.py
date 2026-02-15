import tempfile
import weakref
from pathlib import Path
from types import SimpleNamespace
from typing import TYPE_CHECKING, Iterable, TypeVar, cast

import pytest

from setta.code_gen.dependency_graph import DependencyGraph
from setta.database.db_objs import DBE
from setta.project_state.listener_artifact_updates import ListenerArtifactUpdateError
from setta.types.artifact import ArtifactType, ImageArtifact
from setta.types.binary_content import BinaryContentRef
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.helpers_lvl2 import ProjectNotFound
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyMode,
    ListenerFrontendEmitKeyAndValue,
    ListenerFrontendEmitRawContent,
    ListenerInitContent,
    ListenerRegisterCallback,
    ListenerRegisterContent,
)
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import TextBlockSectionImpl
from setta.types.websocket import (
    WebsocketMsg,
    WebsocketMsgBackendLogEvent,
    WebsocketMsgListenerError,
    WebsocketMsgListenerForceRefresh,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerInit,
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
    WebsocketMsgListenerRouterEndpointCall,
    WebsocketMsgListenerRouterEndpointResult,
    WebsocketConnectionType,
)
from setta.utils.paths import normalize_state_path
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_receiver import (
    WMHPythonScriptReceiver,
)
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender

if TYPE_CHECKING:
    from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
    from setta.types.generated.unions import BaseArtifactUnionWithDiscriminator
    from setta.websockets.websocket_manager import WebsocketManager


pytestmark = pytest.mark.asyncio


PROJECT_ID = ID("proj-123")
PROJECT_INIT_ID = ID("proj-init")
PROJECT_UNKNOWN_ID = ID("proj-unknown")
PROJECT_A_ID = ID("proj-a")
PROJECT_B_ID = ID("proj-b")
PROJECT_EMPTY_ID = ID("proj-empty")

_DEFAULT_SOCKET_IDS = (
    "socket-1",
    "socket-temp",
    "socket-init",
    "socket-missing",
    "socket-missing-name",
    "socket-unknown",
    "socket-a",
    "socket-b",
)


async def _noop_wait_until_ready() -> None:
    return None


def _build_project_state(project_config_id: ID) -> ProjectStateSingleConfig:
    section_impl_id = ID(f"{project_config_id}-section-impl")
    section_impl = TextBlockSectionImpl(
        id=section_impl_id,
        name="Section",
        text="Initial value",
    )
    section_variant_id = ID(f"{project_config_id}-section-variant")
    section_variant = Variant(
        id=section_variant_id,
        name="Variant",
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    section_core_id = ID(f"{project_config_id}-section")
    section_core = Core(
        id=section_core_id,
        name="Section",
        variants=[section_variant.id],
        defaultVariant=section_variant.id,
    )
    project_config = ProjectConfig(
        id=project_config_id,
        name=f"Project {project_config_id}",
        sectionVariantMap={section_core.id: section_variant.id},
        topLevelSections={section_core.id: TopLevelSectionLayout()},
    )
    return ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section_core.id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
    )


def _get_primary_section_dependency_info(project_state: ProjectStateSingleConfig):
    section_id = next(iter(project_state.sections.keys()))
    dep_key = create_dep_key(sectionId=section_id)
    graph = DependencyGraph(project_state)
    dependency_name = graph.graph[dep_key].full_path_name
    return dependency_name, dep_key


def _build_receiver_fixture(
    states: dict[ID, ProjectStateSingleConfig],
    temporary_to_canonical: dict[ID, ID] | None = None,
) -> tuple[
    WMHPythonScriptReceiver,
    "_StubWebsocketManager",
    "_StubPythonScriptSender",
    "_StubProjectManagerSwitcher",
    ListenerRegistry,
]:
    websocket_manager = _StubWebsocketManager()
    listener_registry = ListenerRegistry()
    frontend_sender = WMHFrontendSender(cast("WebsocketManager", websocket_manager))
    python_script_sender = _StubPythonScriptSender()
    project_manager_switcher = _StubProjectManagerSwitcher(states)
    temp_dir = tempfile.TemporaryDirectory()
    dbe = DBE(Path(temp_dir.name))
    if temporary_to_canonical:
        canonical_to_temporary = {
            canonical: temporary
            for temporary, canonical in temporary_to_canonical.items()
        }
        dbe.write_temporary_id_map(canonical_to_temporary)
    receiver = WMHPythonScriptReceiver(
        cast("WebsocketManager", websocket_manager),
        listener_registry,
        frontend_sender,
        cast("WMHPythonScriptSender", python_script_sender),
        cast("ProjectManagerSwitcher", project_manager_switcher),
        dbe,
    )
    weakref.finalize(receiver, temp_dir.cleanup)
    return (
        receiver,
        websocket_manager,
        python_script_sender,
        project_manager_switcher,
        listener_registry,
    )


MsgT = TypeVar("MsgT", bound=WebsocketMsg)


class _StubPythonScriptSender:
    def __init__(self) -> None:
        self.force_refresh_calls: list[dict[str, object | None]] = []

    async def send_force_refresh(
        self,
        *,
        projectState: ProjectStateSingleConfig | None = None,
        projectConfigId: ID | None = None,
        targetWebsocketIds: Iterable[str] | None = None,
        share_session_id: str | None = None,
    ) -> None:
        self.force_refresh_calls.append(
            {
                "projectState": projectState,
                "projectConfigId": projectConfigId,
                "targetWebsocketIds": tuple(targetWebsocketIds)
                if targetWebsocketIds is not None
                else None,
                "shareSessionId": share_session_id,
            }
        )


class _StubGenCode:
    def __init__(self, dep_graph: DependencyGraph) -> None:
        self.dep_graph = dep_graph


class _StubArtifacts:
    def __init__(self) -> None:
        self.cached_types: dict[str, ArtifactType | None] = {}
        self.raise_value_error: bool = False

    def normalize_artifact_id(self, path) -> str:
        return str(normalize_state_path(path))

    def get_cached_artifact_type(self, path):
        if self.raise_value_error:
            raise ValueError("conflict")
        normalized = str(normalize_state_path(path))
        return self.cached_types.get(normalized)


class _StubProjectManager:
    def __init__(self, states: dict[ID, ProjectStateSingleConfig]) -> None:
        self._states = states
        self.listener_updates: list[
            tuple[ID, list[ListenerFrontendEmitKeyAndValue]]
        ] = []
        self.listener_artifact_updates: list[
            tuple[ID, list["BaseArtifactUnionWithDiscriminator"]]
        ] = []
        self.artifact_error: ListenerArtifactUpdateError | None = None
        self.gen_code = {
            project_config_id: _StubGenCode(DependencyGraph(state))
            for project_config_id, state in states.items()
        }
        self.artifacts = _StubArtifacts()

    def get_single_config_state(
        self, project_config_id: ID
    ) -> ProjectStateSingleConfig:
        try:
            return self._states[project_config_id]
        except KeyError as error:
            raise KeyError(project_config_id) from error

    async def apply_listener_emit_updates(
        self,
        *,
        projectConfigId: ID,
        dependency_updates: list[ListenerFrontendEmitKeyAndValue],
        artifact_updates: list["BaseArtifactUnionWithDiscriminator"],
    ) -> None:
        self.listener_updates.append((projectConfigId, dependency_updates))
        self.listener_artifact_updates.append((projectConfigId, artifact_updates))
        if self.artifact_error is not None:
            raise self.artifact_error


class _StubProjectManagerSwitcher:
    def __init__(self, states: dict[ID, ProjectStateSingleConfig]) -> None:
        self._manager = _StubProjectManager(states)

    def get(self, _project_config_id: ID) -> _StubProjectManager:
        return self._manager

    def get_config_id_by_name(
        self,
        project_name: str,
        *,
        _share_session_id: str | None = None,
    ) -> ID:
        for state in self._manager._states.values():
            if state.projectConfig.name == project_name:
                return state.projectConfig.id
        raise ProjectNotFound


class _StubWebsocketManager:
    def __init__(self) -> None:
        self.sent_messages: list[tuple[object, str]] = []
        self.broadcasts: list[tuple[object, object | None, object | None]] = []
        self.sockets: dict[str, SimpleNamespace] = {}
        self._state = SimpleNamespace(
            share_mode=False,
            deployment_mode=False,
            app_mode=False,
            wait_until_ready=_noop_wait_until_ready,
        )
        for websocket_id in _DEFAULT_SOCKET_IDS:
            self.register_socket(websocket_id)

    def register_socket(self, websocket_id: str) -> None:
        if websocket_id in self.sockets:
            return
        app_state = SimpleNamespace(setta=self._state)
        websocket = SimpleNamespace(app=SimpleNamespace(state=app_state))
        self.sockets[websocket_id] = SimpleNamespace(websocket=websocket)

    async def send_message(self, message, toWebsocketId: str):
        self.sent_messages.append((message, toWebsocketId))

    async def broadcast(
        self,
        message,
        connectionType=None,
        currentAddress=None,
    ):
        self.broadcasts.append((message, connectionType, currentAddress))


class TestPythonScriptReceiver:
    def _sent_message_as(
        self,
        manager: _StubWebsocketManager,
        index: int,
        msg_type: type[MsgT],
    ) -> tuple[MsgT, str]:
        message, websocket_id = manager.sent_messages[index]
        assert isinstance(message, msg_type)
        return cast("MsgT", message), websocket_id

    def _assert_backend_log_broadcast(
        self,
        manager: _StubWebsocketManager,
        project_config_id: ID | None,
    ) -> WebsocketMsgBackendLogEvent:
        assert len(manager.broadcasts) == 1
        message, connection_type, current_address = manager.broadcasts[0]
        assert isinstance(message, WebsocketMsgBackendLogEvent)
        assert WebsocketConnectionType.FRONTEND == connection_type
        assert current_address is None
        assert project_config_id == message.content.projectConfigId
        return message

    async def test_listener_register_stores_registration_and_sends_ack(self):
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            project_manager_switcher,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})
        callback = ListenerRegisterCallback(
            dependencies=[
                create_dep_key(sectionId=ID("Homepage__hero__title"), codeObjId=None)
            ],
            dependencyMode=ListenerDependencyMode.ALWAYS,
        )
        content = ListenerRegisterContent(
            projectConfigId=PROJECT_ID,
            callbacks={"cb-1": callback},
        )
        message = WebsocketMsgListenerRegister(content=content)

        await receiver.process_json_str(
            message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        registration = listener_registry.get_registration("socket-1")
        assert registration is not None
        assert PROJECT_ID == registration.project_config_id
        assert "cb-1" in registration.callbacks

        assert len(websocket_manager.sent_messages) == 1
        ack_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerRegisterAck
        )
        assert websocket_id == "socket-1"
        assert PROJECT_ID == ack_message.content.projectConfigId
        assert len(ack_message.content.callbacks) == 1
        assert "cb-1" in ack_message.content.callbacks
        assert ack_message.content.callbacks["cb-1"].status == "accepted"

        await receiver.on_disconnect("socket-1")
        assert listener_registry.get_registration("socket-1") is None

    async def test_listener_register_ack_uses_temporary_project_id(self):
        project_state = _build_project_state(PROJECT_ID)
        section_id = next(iter(project_state.sections.keys()))
        temporary_project_id = ID("201")
        temporary_section_id = ID("202")
        (
            receiver,
            websocket_manager,
            _,
            _,
            listener_registry,
        ) = _build_receiver_fixture(
            {PROJECT_ID: project_state},
            temporary_to_canonical={
                temporary_project_id: PROJECT_ID,
                temporary_section_id: section_id,
            },
        )
        init_message = WebsocketMsgListenerInit(
            content=ListenerInitContent(
                projectConfigId=temporary_project_id,
                useTemporaryIds=True,
            )
        )
        await receiver.process_json_str(
            init_message.model_dump_json(),
            fromWebsocketId="socket-temp",
        )

        callback = ListenerRegisterCallback(
            dependencies=[create_dep_key(sectionId=temporary_section_id)],
            dependencyMode=ListenerDependencyMode.ALWAYS,
        )
        content = ListenerRegisterContent(
            projectConfigId=temporary_project_id,
            callbacks={"cb-temp": callback},
        )
        message = WebsocketMsgListenerRegister(content=content)

        await receiver.process_json_str(
            message.model_dump_json(),
            fromWebsocketId="socket-temp",
        )

        registration = listener_registry.get_registration("socket-temp")
        assert registration is not None
        assert PROJECT_ID == registration.project_config_id

        ack_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerRegisterAck
        )
        assert websocket_id == "socket-temp"
        assert temporary_project_id == ack_message.content.projectConfigId

    async def test_listener_init_sends_bootstrap_snapshot(self):
        project_state = _build_project_state(PROJECT_INIT_ID)
        (
            receiver,
            websocket_manager,
            python_script_sender,
            _,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_INIT_ID: project_state})
        init_message = WebsocketMsgListenerInit(
            content=ListenerInitContent(
                projectName=project_state.projectConfig.name,
            )
        )

        await receiver.process_json_str(
            init_message.model_dump_json(),
            fromWebsocketId="socket-init",
        )

        assert (
            PROJECT_INIT_ID
            == listener_registry.get_bootstrap_project_config("socket-init")
        )
        assert len(python_script_sender.force_refresh_calls) == 1
        call = python_script_sender.force_refresh_calls[0]
        assert call["projectState"] is project_state
        assert call["projectConfigId"] is None
        assert call["targetWebsocketIds"] == ("socket-init",)

    async def test_listener_init_maps_temporary_project_id(self):
        project_state = _build_project_state(PROJECT_INIT_ID)
        temporary_project_id = ID("101")
        (
            receiver,
            _,
            python_script_sender,
            _,
            listener_registry,
        ) = _build_receiver_fixture(
            {PROJECT_INIT_ID: project_state},
            temporary_to_canonical={temporary_project_id: PROJECT_INIT_ID},
        )
        init_message = WebsocketMsgListenerInit(
            content=ListenerInitContent(
                projectConfigId=temporary_project_id,
                useTemporaryIds=True,
            )
        )

        await receiver.process_json_str(
            init_message.model_dump_json(),
            fromWebsocketId="socket-temp",
        )

        assert (
            PROJECT_INIT_ID
            == listener_registry.get_bootstrap_project_config("socket-temp")
        )
        assert listener_registry.use_temporary_ids_for_socket("socket-temp")
        assert len(python_script_sender.force_refresh_calls) == 1
        call = python_script_sender.force_refresh_calls[0]
        assert call["projectState"] is project_state

    async def test_listener_init_sends_error_when_project_missing(self):
        (
            receiver,
            websocket_manager,
            python_script_sender,
            _,
            listener_registry,
        ) = _build_receiver_fixture({})
        init_message = WebsocketMsgListenerInit(
            content=ListenerInitContent(
                projectConfigId=ID("missing-project"),
            )
        )

        await receiver.process_json_str(
            init_message.model_dump_json(),
            fromWebsocketId="socket-missing",
        )

        assert python_script_sender.force_refresh_calls == []
        assert len(websocket_manager.sent_messages) == 1
        error_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerError
        )
        assert websocket_id == "socket-missing"
        assert error_message.content.error == "project_state_unavailable"
        assert error_message.content.details == {"projectConfigId": "missing-project"}

    async def test_listener_init_sends_error_when_project_name_missing(self):
        (
            receiver,
            websocket_manager,
            python_script_sender,
            _,
            _,
        ) = _build_receiver_fixture({})
        init_message = WebsocketMsgListenerInit(
            content=ListenerInitContent(
                projectName="Nonexistent Project",
            )
        )

        await receiver.process_json_str(
            init_message.model_dump_json(),
            fromWebsocketId="socket-missing-name",
        )

        assert python_script_sender.force_refresh_calls == []
        assert len(websocket_manager.sent_messages) == 1
        error_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerError
        )
        assert websocket_id == "socket-missing-name"
        assert error_message.content.error == "project_state_unavailable"
        assert error_message.content.details == {
            "projectName": "Nonexistent Project"
        }

    async def test_listener_frontend_emit_forwards_to_frontend_without_ack(self):
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            project_manager_switcher,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId=PROJECT_ID,
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        dependency_name, dependency_key = _get_primary_section_dependency_info(
            project_state
        )
        dependency_values = {dependency_name: "hello"}
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId=PROJECT_ID,
                dependencyValues=dependency_values,
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        assert websocket_manager.broadcasts == []
        assert websocket_manager.sent_messages == []
        assert project_manager_switcher._manager.listener_updates == [
            (
                PROJECT_ID,
                [
                    ListenerFrontendEmitKeyAndValue(
                        dependencyKey=dependency_key,
                        value=LiteralDependencyValue("hello"),
                    )
                ],
            )
        ]

    async def test_listener_frontend_emit_rejects_unregistered_socket(self):
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            _,
            _,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})
        dependency_name, _ = _get_primary_section_dependency_info(project_state)
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId=PROJECT_ID,
                dependencyValues={dependency_name: "hello"},
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-unknown",
        )

        assert len(websocket_manager.sent_messages) == 1
        error_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerError
        )
        assert websocket_id == "socket-unknown"
        assert error_message.content.error == "listener_not_registered"
        assert error_message.content.details == {"websocketId": "socket-unknown"}
        self._assert_backend_log_broadcast(websocket_manager, None)

    async def test_listener_frontend_emit_handles_missing_dependency_graph(self):
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            project_manager_switcher,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})
        dependency_name, _ = _get_primary_section_dependency_info(project_state)
        del project_manager_switcher._manager._states[PROJECT_ID]
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId=PROJECT_ID,
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId=PROJECT_ID,
                dependencyValues={dependency_name: "hello"},
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        assert len(websocket_manager.sent_messages) == 1
        error_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerError
        )
        assert websocket_id == "socket-1"
        assert error_message.content.error == "project_state_unavailable"
        assert error_message.content.details == {"message": f"'{PROJECT_ID}'"}
        self._assert_backend_log_broadcast(websocket_manager, PROJECT_ID)

    async def test_listener_frontend_emit_rejects_project_config_mismatch(self):
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            _,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId=PROJECT_ID,
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        dependency_name, _ = _get_primary_section_dependency_info(project_state)
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId=PROJECT_UNKNOWN_ID,
                dependencyValues={dependency_name: "hello"},
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        assert len(websocket_manager.sent_messages) == 1
        error_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerError
        )
        assert websocket_id == "socket-1"
        assert error_message.content.error == "project_config_mismatch"
        assert error_message.content.details == {
            "expectedProjectConfigId": PROJECT_ID,
            "receivedProjectConfigId": PROJECT_UNKNOWN_ID,
        }
        self._assert_backend_log_broadcast(websocket_manager, PROJECT_ID)

    async def test_listener_frontend_emit_rejects_unknown_dependency(self):
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            _,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId=PROJECT_ID,
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId=PROJECT_ID,
                dependencyValues={"MissingDependency": "value"},
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        assert len(websocket_manager.sent_messages) == 1
        error_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerError
        )
        assert websocket_id == "socket-1"
        assert error_message.content.error == "listener_emit_unknown_dependency"
        assert error_message.content.details == {"dependencyName": "MissingDependency"}
        self._assert_backend_log_broadcast(websocket_manager, PROJECT_ID)

    async def test_listener_frontend_emit_rejects_invalid_value(self):
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            _,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId=PROJECT_ID,
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        dependency_name, _ = _get_primary_section_dependency_info(project_state)
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId=PROJECT_ID,
                dependencyValues={dependency_name: 42},
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        assert len(websocket_manager.sent_messages) == 1
        error_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerError
        )
        assert websocket_id == "socket-1"
        assert error_message.content.error == "listener_emit_invalid_value"
        assert error_message.content.details == {
            "dependencyName": dependency_name,
            "expectedType": "Literal",
        }
        self._assert_backend_log_broadcast(websocket_manager, PROJECT_ID)

    async def test_listener_frontend_emit_rejects_empty_payload(self):
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            _,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId=PROJECT_ID,
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId=PROJECT_ID,
                dependencyValues={},
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        assert len(websocket_manager.sent_messages) == 1
        error_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerError
        )
        assert websocket_id == "socket-1"
        assert error_message.content.error == "listener_emit_invalid_payload"
        assert error_message.content.details == {
            "message": "listener emits require dependencyValues or artifactUpdates"
        }
        self._assert_backend_log_broadcast(websocket_manager, PROJECT_ID)

    async def test_listener_frontend_emit_forwards_artifact_updates_to_manager(
        self,
    ):
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            project_manager_switcher,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId=PROJECT_ID,
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        artifact = ImageArtifact(
            id=ID("/tmp/image.png"),
            value=BinaryContentRef(
                contentId="listener-image",
                byteLength=3,
                mimeType="image/png",
            ),
        )
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId=PROJECT_ID,
                dependencyValues={},
                artifactUpdates=[artifact],
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        assert websocket_manager.sent_messages == []
        assert websocket_manager.broadcasts == []

        manager = project_manager_switcher._manager
        assert manager.listener_updates == [(PROJECT_ID, [])]
        assert len(manager.listener_artifact_updates) == 1
        project_config_id, artifact_updates = manager.listener_artifact_updates[0]
        assert project_config_id == PROJECT_ID
        assert len(artifact_updates) == 1
        artifact_update = artifact_updates[0]
        assert artifact_update.id == str(normalize_state_path("/tmp/image.png"))
        assert artifact_update.type == ArtifactType.Image
        assert (
            artifact_update.value
            == BinaryContentRef(
                contentId="listener-image",
                byteLength=3,
                mimeType="image/png",
            )
        )

    async def test_listener_frontend_emit_reports_artifact_errors_from_manager(
        self,
    ):
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            project_manager_switcher,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})
        project_manager_switcher._manager.artifact_error = ListenerArtifactUpdateError(
            "artifacts not ready"
        )
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId=PROJECT_ID,
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        artifact = ImageArtifact(
            id=ID("/tmp/image.png"),
            value=BinaryContentRef(
                contentId="listener-image",
                byteLength=3,
                mimeType="image/png",
            ),
        )
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId=PROJECT_ID,
                dependencyValues={},
                artifactUpdates=[artifact],
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        assert len(websocket_manager.sent_messages) == 1
        error_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerError
        )
        assert websocket_id == "socket-1"
        assert (
            error_message.content.error == "listener_emit_artifact_update_failed"
        )
        assert error_message.content.details == {"message": "artifacts not ready"}
        self._assert_backend_log_broadcast(websocket_manager, PROJECT_ID)

    async def test_listener_frontend_emit_rejects_blank_artifact_paths(self):
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            project_manager_switcher,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId=PROJECT_ID,
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        artifact = ImageArtifact(
            id=ID("   "),
            value=BinaryContentRef(
                contentId="listener-image",
                byteLength=3,
                mimeType="image/png",
            ),
        )
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId=PROJECT_ID,
                dependencyValues={},
                artifactUpdates=[artifact],
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        assert len(websocket_manager.sent_messages) == 1
        error_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerError
        )
        assert websocket_id == "socket-1"
        assert (
            error_message.content.error == "listener_emit_invalid_artifact_update"
        )
        assert error_message.content.details == {
            "path": "   ",
            "message": "artifact path must be a non-empty string",
        }
        self._assert_backend_log_broadcast(websocket_manager, PROJECT_ID)

    async def test_listener_frontend_emit_rejects_type_mismatches(self):
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            project_manager_switcher,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})
        manager = project_manager_switcher._manager
        normalized_path = str(normalize_state_path("/tmp/image.png"))
        manager.artifacts.cached_types[normalized_path] = ArtifactType.ChartData
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId=PROJECT_ID,
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        artifact = ImageArtifact(
            id=ID("/tmp/image.png"),
            value=BinaryContentRef(
                contentId="listener-image",
                byteLength=3,
                mimeType="image/png",
            ),
        )
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId=PROJECT_ID,
                dependencyValues={},
                artifactUpdates=[artifact],
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        assert len(websocket_manager.sent_messages) == 1
        error_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerError
        )
        assert websocket_id == "socket-1"
        assert (
            error_message.content.error
            == "listener_emit_unsupported_artifact_update"
        )
        assert error_message.content.details == {
            "path": normalized_path,
            "reason": "expected type ChartData but received Image",
        }
        self._assert_backend_log_broadcast(websocket_manager, PROJECT_ID)

    async def test_listener_router_endpoint_call_dispatches_plugin_endpoint(self):
        # Listener router calls should dispatch to plugin_manager.invoke_listener_endpoint for plugin-owned endpoints.
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            _,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})

        captured_calls: list[tuple[str, dict[str, object]]] = []

        class _StubPluginManager:
            def invoke_listener_endpoint(
                self, *, endpoint_name: str, payload: dict[str, object]
            ) -> object:
                captured_calls.append((endpoint_name, dict(payload)))
                return {
                    "handledByPlugin": endpoint_name,
                    "projectConfigId": payload["projectConfigId"],
                }

        websocket_manager._state.plugin_manager = _StubPluginManager()
        listener_registry.upsert_registration(
            websocket_id="socket-1",
            project_config_id=PROJECT_ID,
            callbacks={},
        )
        message = WebsocketMsgListenerRouterEndpointCall(
            content={
                "projectConfigId": PROJECT_ID,
                "callId": "call-1",
                "endpointName": "fixture_listener_endpoint",
                "payload": {"value": "ok"},
            }
        )

        await receiver.process_json_str(
            message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        assert captured_calls == [
            (
                "fixture_listener_endpoint",
                {"projectConfigId": PROJECT_ID, "value": "ok"},
            )
        ]
        assert len(websocket_manager.sent_messages) == 1
        result_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerRouterEndpointResult
        )
        assert websocket_id == "socket-1"
        assert result_message.content.projectConfigId == PROJECT_ID
        assert result_message.content.callId == "call-1"
        assert result_message.content.ok is True
        assert result_message.content.result == {
            "handledByPlugin": "fixture_listener_endpoint",
            "projectConfigId": PROJECT_ID,
        }

    async def test_listener_router_endpoint_call_maps_temporary_project_id_for_plugin_endpoint(
        self,
    ):
        # Temporary listener IDs should be canonicalized once for dispatch and remapped for socket response.
        project_state = _build_project_state(PROJECT_ID)
        temporary_project_id = ID("301")
        (
            receiver,
            websocket_manager,
            _,
            _,
            listener_registry,
        ) = _build_receiver_fixture(
            {PROJECT_ID: project_state},
            temporary_to_canonical={temporary_project_id: PROJECT_ID},
        )

        captured_calls: list[tuple[str, dict[str, object]]] = []

        class _StubPluginManager:
            def invoke_listener_endpoint(
                self, *, endpoint_name: str, payload: dict[str, object]
            ) -> object:
                captured_calls.append((endpoint_name, dict(payload)))
                return {
                    "handledByPlugin": endpoint_name,
                    "projectConfigId": payload["projectConfigId"],
                }

        websocket_manager._state.plugin_manager = _StubPluginManager()
        listener_registry.record_bootstrap(
            websocket_id="socket-temp",
            project_config_id=PROJECT_ID,
            use_temporary_ids=True,
        )
        listener_registry.upsert_registration(
            websocket_id="socket-temp",
            project_config_id=PROJECT_ID,
            callbacks={},
            use_temporary_ids=True,
        )
        message = WebsocketMsgListenerRouterEndpointCall(
            content={
                "projectConfigId": temporary_project_id,
                "callId": "call-temp",
                "endpointName": "fixture_listener_endpoint",
                "payload": {"value": "ok"},
            }
        )

        await receiver.process_json_str(
            message.model_dump_json(),
            fromWebsocketId="socket-temp",
        )

        assert captured_calls == [
            (
                "fixture_listener_endpoint",
                {"projectConfigId": PROJECT_ID, "value": "ok"},
            )
        ]
        assert len(websocket_manager.sent_messages) == 1
        result_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerRouterEndpointResult
        )
        assert websocket_id == "socket-temp"
        assert result_message.content.projectConfigId == temporary_project_id
        assert result_message.content.callId == "call-temp"
        assert result_message.content.ok is True
        assert result_message.content.result == {
            "handledByPlugin": "fixture_listener_endpoint",
            "projectConfigId": temporary_project_id,
        }

    async def test_listener_router_endpoint_call_returns_error_for_unknown_plugin_endpoint(
        self,
    ):
        # Missing plugin listener endpoints should return listener_call_failed with endpoint details.
        project_state = _build_project_state(PROJECT_ID)
        (
            receiver,
            websocket_manager,
            _,
            _,
            listener_registry,
        ) = _build_receiver_fixture({PROJECT_ID: project_state})

        class _MissingPluginEndpointManager:
            def invoke_listener_endpoint(
                self, *, endpoint_name: str, payload: dict[str, object]
            ) -> object:
                _ = payload
                raise KeyError(endpoint_name)

        websocket_manager._state.plugin_manager = _MissingPluginEndpointManager()
        listener_registry.upsert_registration(
            websocket_id="socket-1",
            project_config_id=PROJECT_ID,
            callbacks={},
        )
        message = WebsocketMsgListenerRouterEndpointCall(
            content={
                "projectConfigId": PROJECT_ID,
                "callId": "call-2",
                "endpointName": "missing_plugin_endpoint",
                "payload": {},
            }
        )

        await receiver.process_json_str(
            message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        assert len(websocket_manager.sent_messages) == 1
        result_message, websocket_id = self._sent_message_as(
            websocket_manager, 0, WebsocketMsgListenerRouterEndpointResult
        )
        assert websocket_id == "socket-1"
        assert result_message.content.projectConfigId == PROJECT_ID
        assert result_message.content.callId == "call-2"
        assert result_message.content.ok is False
        assert result_message.content.error == "listener_call_failed"
        assert result_message.content.details == {
            "message": "unknown listener endpoint: missing_plugin_endpoint"
        }


class TestPythonScriptSender:
    async def test_send_force_refresh_targets_bootstrapped_sockets(self):
        websocket_manager = _StubWebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(
            cast("WebsocketManager", websocket_manager), listener_registry
        )
        listener_registry.record_bootstrap(
            websocket_id="socket-a",
            project_config_id=PROJECT_A_ID,
        )
        listener_registry.record_bootstrap(
            websocket_id="socket-b",
            project_config_id=PROJECT_B_ID,
        )

        project_state_a = _build_project_state(PROJECT_A_ID)
        await sender.send_force_refresh(projectState=project_state_a)

        assert len(websocket_manager.sent_messages) == 1
        message_obj, websocket_id = websocket_manager.sent_messages[0]
        message = cast("WebsocketMsgListenerForceRefresh", message_obj)
        assert websocket_id == "socket-a"
        assert message.content.projectState is project_state_a
        assert websocket_manager.broadcasts == []

    async def test_send_force_refresh_skips_when_no_bootstrap(self):
        websocket_manager = _StubWebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(
            cast("WebsocketManager", websocket_manager), listener_registry
        )
        project_state = _build_project_state(PROJECT_EMPTY_ID)

        await sender.send_force_refresh(projectState=project_state)

        assert websocket_manager.sent_messages == []
