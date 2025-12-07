from __future__ import annotations

import unittest
from typing import TYPE_CHECKING, Iterable

from setta.code_gen.dependency_graph import DependencyGraph
from setta.project_state.listener_artifact_updates import ListenerArtifactUpdateError
from setta.types.artifact import ArtifactType, ImageArtifact
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
    WebsocketMsgListenerError,
    WebsocketMsgListenerForceRefresh,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerInit,
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
)
from setta.utils.utils import normalize_path
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_receiver import (
    WMHPythonScriptReceiver,
)
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender

if TYPE_CHECKING:
    from setta.types.generated.unions import BaseArtifactUnionWithDiscriminator


def _build_project_state(project_config_id: ID) -> ProjectStateSingleConfig:
    section_impl = TextBlockSectionImpl(
        id=f"{project_config_id}-section-impl",
        name="Section",
        text="Initial value",
    )
    section_variant = Variant(
        id=f"{project_config_id}-section-variant",
        name="Variant",
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    section_core = Core(
        id=f"{project_config_id}-section",
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


class _StubPythonScriptSender:
    def __init__(self) -> None:
        self.force_refresh_calls: list[dict[str, object | None]] = []

    async def send_force_refresh(
        self,
        *,
        projectState: ProjectStateSingleConfig | None = None,
        projectConfigId: ID | None = None,
        targetWebsocketIds: Iterable[str] | None = None,
    ) -> None:
        self.force_refresh_calls.append(
            {
                "projectState": projectState,
                "projectConfigId": projectConfigId,
                "targetWebsocketIds": tuple(targetWebsocketIds)
                if targetWebsocketIds is not None
                else None,
            }
        )


class _StubGenCode:
    def __init__(self, dep_graph: DependencyGraph) -> None:
        self.dep_graph = dep_graph


class _StubArtifacts:
    def __init__(self) -> None:
        self.cached_types: dict[str, ArtifactType | None] = {}
        self.raise_value_error: bool = False

    def get_cached_artifact_type(self, path):
        if self.raise_value_error:
            raise ValueError("conflict")
        normalized = str(normalize_path(path))
        return self.cached_types.get(normalized)


class _StubProjectManager:
    def __init__(self, states: dict[str, ProjectStateSingleConfig]) -> None:
        self._states = states
        self.listener_updates: list[
            tuple[str, list[ListenerFrontendEmitKeyAndValue]]
        ] = []
        self.listener_artifact_updates: list[
            tuple[str, list[BaseArtifactUnionWithDiscriminator]]
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
        artifact_updates: list[BaseArtifactUnionWithDiscriminator],
    ) -> None:
        self.listener_updates.append((projectConfigId, dependency_updates))
        self.listener_artifact_updates.append((projectConfigId, artifact_updates))
        if self.artifact_error is not None:
            raise self.artifact_error


class _StubProjectManagerSwitcher:
    def __init__(self, states: dict[str, ProjectStateSingleConfig]) -> None:
        self._manager = _StubProjectManager(states)

    def get(self, project_config_id: ID) -> _StubProjectManager:
        return self._manager

    def get_config_id_by_name(self, project_name: str) -> str:
        for state in self._manager._states.values():
            if state.projectConfig.name == project_name:
                return state.projectConfig.id
        raise ProjectNotFound


class _StubWebsocketManager:
    def __init__(self) -> None:
        self.sent_messages: list[tuple[object, str]] = []
        self.broadcasts: list[tuple[object, object | None, object | None]] = []

    async def send_message(self, message, toWebsocketId: str):
        self.sent_messages.append((message, toWebsocketId))

    async def broadcast(
        self,
        message,
        connectionType=None,
        currentAddress=None,
    ):
        self.broadcasts.append((message, connectionType, currentAddress))


class WMHPythonScriptReceiverTest(unittest.IsolatedAsyncioTestCase):
    async def test_listener_register_stores_registration_and_sends_ack(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_state = _build_project_state("proj-123")
        project_manager_switcher = _StubProjectManagerSwitcher(
            {"proj-123": project_state}
        )
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        callback = ListenerRegisterCallback(
            dependencies=[
                create_dep_key(sectionId="Homepage__hero__title", codeObjId=None)
            ],
            dependencyMode=ListenerDependencyMode.SPECIFIC,
        )
        content = ListenerRegisterContent(
            projectConfigId="proj-123",
            callbacks={"cb-1": callback},
        )
        message = WebsocketMsgListenerRegister(content=content)

        await receiver.process_json_str(
            message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        registration = listener_registry.get_registration("socket-1")
        self.assertIsNotNone(registration)
        assert registration is not None  # help type checkers
        self.assertEqual("proj-123", registration.project_config_id)
        self.assertIn("cb-1", registration.callbacks)

        self.assertEqual(1, len(websocket_manager.sent_messages))
        ack_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-1", websocket_id)
        self.assertIsInstance(ack_message, WebsocketMsgListenerRegisterAck)
        self.assertEqual("proj-123", ack_message.content.projectConfigId)
        self.assertEqual(1, len(ack_message.content.callbacks))
        self.assertIn("cb-1", ack_message.content.callbacks)
        self.assertEqual("accepted", ack_message.content.callbacks["cb-1"].status)

        await receiver.on_disconnect("socket-1")
        self.assertIsNone(listener_registry.get_registration("socket-1"))

    async def test_listener_init_sends_bootstrap_snapshot(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        project_state = _build_project_state("proj-init")
        python_script_sender = _StubPythonScriptSender()
        project_manager_switcher = _StubProjectManagerSwitcher(
            {"proj-init": project_state}
        )
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        init_message = WebsocketMsgListenerInit(
            content=ListenerInitContent(
                projectName=project_state.projectConfig.name,
            )
        )

        await receiver.process_json_str(
            init_message.model_dump_json(),
            fromWebsocketId="socket-init",
        )

        self.assertEqual(
            "proj-init",
            listener_registry.get_bootstrap_project_config("socket-init"),
        )
        self.assertEqual(1, len(python_script_sender.force_refresh_calls))
        call = python_script_sender.force_refresh_calls[0]
        self.assertIs(call["projectState"], project_state)
        self.assertIsNone(call["projectConfigId"])
        self.assertEqual(("socket-init",), call["targetWebsocketIds"])

    async def test_listener_init_sends_error_when_project_missing(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_manager_switcher = _StubProjectManagerSwitcher({})
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        init_message = WebsocketMsgListenerInit(
            content=ListenerInitContent(
                projectConfigId="missing-project",
            )
        )

        await receiver.process_json_str(
            init_message.model_dump_json(),
            fromWebsocketId="socket-missing",
        )

        self.assertEqual([], python_script_sender.force_refresh_calls)
        self.assertEqual(1, len(websocket_manager.sent_messages))
        error_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-missing", websocket_id)
        self.assertIsInstance(error_message, WebsocketMsgListenerError)
        self.assertEqual("project_state_unavailable", error_message.content.error)
        self.assertEqual(
            {"projectConfigId": "missing-project"},
            error_message.content.details,
        )

    async def test_listener_init_sends_error_when_project_name_missing(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_manager_switcher = _StubProjectManagerSwitcher({})
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        init_message = WebsocketMsgListenerInit(
            content=ListenerInitContent(
                projectName="Nonexistent Project",
            )
        )

        await receiver.process_json_str(
            init_message.model_dump_json(),
            fromWebsocketId="socket-missing-name",
        )

        self.assertEqual([], python_script_sender.force_refresh_calls)
        self.assertEqual(1, len(websocket_manager.sent_messages))
        error_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-missing-name", websocket_id)
        self.assertIsInstance(error_message, WebsocketMsgListenerError)
        self.assertEqual("project_state_unavailable", error_message.content.error)
        self.assertEqual(
            {"projectName": "Nonexistent Project"},
            error_message.content.details,
        )

    async def test_listener_frontend_emit_forwards_to_frontend_without_ack(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_state = _build_project_state("proj-123")
        project_manager_switcher = _StubProjectManagerSwitcher(
            {"proj-123": project_state}
        )
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId="proj-123",
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()
        websocket_manager.broadcasts.clear()

        dependency_name, dependency_key = _get_primary_section_dependency_info(
            project_state
        )
        dependency_values = {dependency_name: "hello"}
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId="proj-123",
                dependencyValues=dependency_values,
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        self.assertEqual([], websocket_manager.broadcasts)
        self.assertEqual([], websocket_manager.sent_messages)
        self.assertEqual(
            [
                (
                    "proj-123",
                    [
                        ListenerFrontendEmitKeyAndValue(
                            dependencyKey=dependency_key,
                            value=LiteralDependencyValue("hello"),
                        )
                    ],
                )
            ],
            project_manager_switcher._manager.listener_updates,
        )

    async def test_listener_frontend_emit_rejects_unregistered_socket(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_state = _build_project_state("proj-123")
        project_manager_switcher = _StubProjectManagerSwitcher(
            {"proj-123": project_state}
        )
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        dependency_name, _ = _get_primary_section_dependency_info(project_state)
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId="proj-123",
                dependencyValues={dependency_name: "hello"},
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-unknown",
        )

        self.assertEqual(1, len(websocket_manager.sent_messages))
        error_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-unknown", websocket_id)
        self.assertIsInstance(error_message, WebsocketMsgListenerError)
        self.assertEqual("listener_not_registered", error_message.content.error)
        self.assertEqual(
            {"websocketId": "socket-unknown"},
            error_message.content.details,
        )
        self.assertEqual([], websocket_manager.broadcasts)

    async def test_listener_frontend_emit_handles_missing_dependency_graph(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_state = _build_project_state("proj-123")
        project_manager_switcher = _StubProjectManagerSwitcher(
            {"proj-123": project_state}
        )
        del project_manager_switcher._manager.gen_code["proj-123"]
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId="proj-123",
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
                projectConfigId="proj-123",
                dependencyValues={dependency_name: "hello"},
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        self.assertEqual(1, len(websocket_manager.sent_messages))
        error_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-1", websocket_id)
        self.assertIsInstance(error_message, WebsocketMsgListenerError)
        self.assertEqual("project_state_unavailable", error_message.content.error)
        self.assertEqual({"projectConfigId": "proj-123"}, error_message.content.details)
        self.assertEqual([], websocket_manager.broadcasts)

    async def test_listener_frontend_emit_rejects_project_config_mismatch(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_state = _build_project_state("proj-123")
        project_manager_switcher = _StubProjectManagerSwitcher(
            {"proj-123": project_state}
        )
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId="proj-123",
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
                projectConfigId="proj-unknown",
                dependencyValues={dependency_name: "hello"},
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        self.assertEqual(1, len(websocket_manager.sent_messages))
        error_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-1", websocket_id)
        self.assertIsInstance(error_message, WebsocketMsgListenerError)
        self.assertEqual("project_config_mismatch", error_message.content.error)
        self.assertEqual(
            {
                "expectedProjectConfigId": "proj-123",
                "receivedProjectConfigId": "proj-unknown",
            },
            error_message.content.details,
        )
        self.assertEqual([], websocket_manager.broadcasts)

    async def test_listener_frontend_emit_rejects_unknown_dependency(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_state = _build_project_state("proj-123")
        project_manager_switcher = _StubProjectManagerSwitcher(
            {"proj-123": project_state}
        )
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId="proj-123",
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
                projectConfigId="proj-123",
                dependencyValues={"MissingDependency": "value"},
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        self.assertEqual(1, len(websocket_manager.sent_messages))
        error_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-1", websocket_id)
        self.assertIsInstance(error_message, WebsocketMsgListenerError)
        self.assertEqual(
            "listener_emit_unknown_dependency", error_message.content.error
        )
        self.assertEqual(
            {"dependencyName": "MissingDependency"},
            error_message.content.details,
        )
        self.assertEqual([], websocket_manager.broadcasts)

    async def test_listener_frontend_emit_rejects_invalid_value(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_state = _build_project_state("proj-123")
        project_manager_switcher = _StubProjectManagerSwitcher(
            {"proj-123": project_state}
        )
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId="proj-123",
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
                projectConfigId="proj-123",
                dependencyValues={dependency_name: 42},
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        self.assertEqual(1, len(websocket_manager.sent_messages))
        error_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-1", websocket_id)
        self.assertIsInstance(error_message, WebsocketMsgListenerError)
        self.assertEqual("listener_emit_invalid_value", error_message.content.error)
        self.assertEqual(
            {
                "dependencyName": dependency_name,
                "expectedType": "Literal",
            },
            error_message.content.details,
        )
        self.assertEqual([], websocket_manager.broadcasts)

    async def test_listener_frontend_emit_rejects_empty_payload(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_state = _build_project_state("proj-123")
        project_manager_switcher = _StubProjectManagerSwitcher(
            {"proj-123": project_state}
        )
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId="proj-123",
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
                projectConfigId="proj-123",
                dependencyValues={},
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        self.assertEqual(1, len(websocket_manager.sent_messages))
        error_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-1", websocket_id)
        self.assertIsInstance(error_message, WebsocketMsgListenerError)
        self.assertEqual("listener_emit_invalid_payload", error_message.content.error)
        self.assertEqual(
            {"message": "listener emits require dependencyValues or artifactUpdates"},
            error_message.content.details,
        )
        self.assertEqual([], websocket_manager.broadcasts)

    async def test_listener_frontend_emit_forwards_artifact_updates_to_manager(
        self,
    ):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_state = _build_project_state("proj-123")
        project_manager_switcher = _StubProjectManagerSwitcher(
            {"proj-123": project_state}
        )
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId="proj-123",
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        artifact = ImageArtifact(id="/tmp/image.png", value="data:image/png;base64,AAA")
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId="proj-123",
                dependencyValues={},
                artifactUpdates=[artifact],
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        self.assertEqual([], websocket_manager.sent_messages)
        self.assertEqual([], websocket_manager.broadcasts)

        manager = project_manager_switcher._manager
        self.assertEqual([("proj-123", [])], manager.listener_updates)
        self.assertEqual(1, len(manager.listener_artifact_updates))
        project_id, artifact_updates = manager.listener_artifact_updates[0]
        self.assertEqual("proj-123", project_id)
        self.assertEqual(1, len(artifact_updates))
        artifact_update = artifact_updates[0]
        self.assertEqual(str(normalize_path("/tmp/image.png")), artifact_update.id)
        self.assertEqual(ArtifactType.Image, artifact_update.type)
        self.assertEqual("data:image/png;base64,AAA", artifact_update.value)

    async def test_listener_frontend_emit_reports_artifact_errors_from_manager(
        self,
    ):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_state = _build_project_state("proj-123")
        project_manager_switcher = _StubProjectManagerSwitcher(
            {"proj-123": project_state}
        )
        project_manager_switcher._manager.artifact_error = ListenerArtifactUpdateError(
            "artifacts not ready"
        )
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId="proj-123",
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        artifact = ImageArtifact(id="/tmp/image.png", value="data:image/png;base64,AAA")
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId="proj-123",
                dependencyValues={},
                artifactUpdates=[artifact],
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        self.assertEqual(1, len(websocket_manager.sent_messages))
        error_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-1", websocket_id)
        self.assertIsInstance(error_message, WebsocketMsgListenerError)
        self.assertEqual(
            "listener_emit_artifact_update_failed",
            error_message.content.error,
        )
        self.assertEqual(
            {"message": "artifacts not ready"},
            error_message.content.details,
        )
        self.assertEqual([], websocket_manager.broadcasts)

    async def test_listener_frontend_emit_rejects_blank_artifact_paths(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_state = _build_project_state("proj-123")
        project_manager_switcher = _StubProjectManagerSwitcher(
            {"proj-123": project_state}
        )
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId="proj-123",
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        artifact = ImageArtifact(id="   ", value="data:image/png;base64,AAA")
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId="proj-123",
                dependencyValues={},
                artifactUpdates=[artifact],
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        self.assertEqual(1, len(websocket_manager.sent_messages))
        error_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-1", websocket_id)
        self.assertIsInstance(error_message, WebsocketMsgListenerError)
        self.assertEqual(
            "listener_emit_invalid_artifact_update",
            error_message.content.error,
        )
        self.assertEqual(
            {
                "path": "   ",
                "message": "artifact path must be a non-empty string",
            },
            error_message.content.details,
        )
        self.assertEqual([], websocket_manager.broadcasts)

    async def test_listener_frontend_emit_rejects_type_mismatches(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        python_script_sender = _StubPythonScriptSender()
        project_state = _build_project_state("proj-123")
        project_manager_switcher = _StubProjectManagerSwitcher(
            {"proj-123": project_state}
        )
        manager = project_manager_switcher._manager
        normalized_path = str(normalize_path("/tmp/image.png"))
        manager.artifacts.cached_types[normalized_path] = ArtifactType.ChartData
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
            python_script_sender,
            project_manager_switcher,
        )
        callback = ListenerRegisterCallback(
            dependencies=[],
            dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId="proj-123",
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()
        websocket_manager.broadcasts.clear()

        artifact = ImageArtifact(id="/tmp/image.png", value="data:image/png;base64,AAA")
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitRawContent(
                projectConfigId="proj-123",
                dependencyValues={},
                artifactUpdates=[artifact],
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        self.assertEqual(1, len(websocket_manager.sent_messages))
        error_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-1", websocket_id)
        self.assertIsInstance(error_message, WebsocketMsgListenerError)
        self.assertEqual(
            "listener_emit_unsupported_artifact_update",
            error_message.content.error,
        )
        self.assertEqual(
            {
                "path": normalized_path,
                "reason": "expected type ChartData but received Image",
            },
            error_message.content.details,
        )
        self.assertEqual([], websocket_manager.broadcasts)


class WMHPythonScriptSenderTest(unittest.IsolatedAsyncioTestCase):
    async def test_send_force_refresh_targets_bootstrapped_sockets(self):
        websocket_manager = _StubWebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(websocket_manager, listener_registry)
        listener_registry.record_bootstrap(
            websocket_id="socket-a",
            project_config_id="proj-a",
        )
        listener_registry.record_bootstrap(
            websocket_id="socket-b",
            project_config_id="proj-b",
        )

        project_state_a = _build_project_state("proj-a")
        await sender.send_force_refresh(projectState=project_state_a)

        self.assertEqual(1, len(websocket_manager.sent_messages))
        message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-a", websocket_id)
        self.assertIsInstance(message, WebsocketMsgListenerForceRefresh)
        self.assertIs(project_state_a, message.content.projectState)
        self.assertEqual([], websocket_manager.broadcasts)

    async def test_send_force_refresh_skips_when_no_bootstrap(self):
        websocket_manager = _StubWebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(websocket_manager, listener_registry)
        project_state = _build_project_state("proj-empty")

        await sender.send_force_refresh(projectState=project_state)

        self.assertEqual([], websocket_manager.sent_messages)
