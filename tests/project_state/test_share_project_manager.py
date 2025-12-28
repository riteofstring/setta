import asyncio
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.project_state.share_project_manager import ShareProjectManager
from setta.types.artifact import ImageArtifact
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.listener import ListenerFrontendEmitKeyAndValue
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import TextBlockSectionImpl
from setta.types.share_deployment import ShareDeploymentManifest
from setta.types.websocket import WebsocketConnectionType
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def _write_project(
    root: Path,
    project_configs: list[ProjectConfig],
    default_id: str | None,
) -> DBE:
    dbe = DBE(root)
    project_state = ProjectStateBackend(
        projectConfigs={config.id: config for config in project_configs},
        defaultProjectConfigId=default_id,
    )
    dbe.write_project(project_state)
    return dbe


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


def _build_project_state(
    project_config_id: ID,
    section_id: ID,
) -> ProjectStateSingleConfig:
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
        id=section_id,
        name="Hero",
        variants=[variant.id],
        defaultVariant=variant.id,
    )
    project_config = ProjectConfig(
        id=project_config_id,
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


def _write_project_with_state(
    root: Path, project_state: ProjectStateSingleConfig
) -> DBE:
    backend = merge_single_config_into_backend(
        ProjectStateBackend(),
        project_state,
    )
    backend.defaultProjectConfigId = project_state.projectConfig.id
    dbe = DBE(root)
    dbe.write_project(backend)
    return dbe


class ShareProjectManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)

    def tearDown(self) -> None:
        asyncio.set_event_loop(None)
        self._loop.close()

    def test_manifest_project_config_selection(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config_a = ProjectConfig(name="alpha")
            config_b = ProjectConfig(name="beta")
            dbe = _write_project(root, [config_a, config_b], config_a.id)
            manifest = ShareDeploymentManifest(
                version=1,
                projectConfigId=config_b.id,
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())

            frontend_sender = WMHFrontendSender(WebsocketManager())
            manager = ShareProjectManager(dbe, root, frontend_sender)
            self.assertEqual(config_b.id, manager.project_config_id)

            session_state = manager.create_session_state("session-a")
            self.assertEqual(config_b.id, session_state.projectConfig.id)

    def test_manifest_missing_project_config_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config = ProjectConfig(name="alpha")
            dbe = _write_project(root, [config], config.id)
            manifest = ShareDeploymentManifest(
                version=1,
                projectConfigId=create_new_id(),
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())

            with self.assertRaises(KeyError):
                ShareProjectManager(dbe, root, WMHFrontendSender(WebsocketManager()))

    def test_missing_project_configs_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            dbe = DBE(root)
            dbe.write_project(ProjectStateBackend())

            with self.assertRaises(KeyError):
                ShareProjectManager(dbe, root, WMHFrontendSender(WebsocketManager()))

    def test_session_state_isolation(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config = ProjectConfig(name="alpha")
            dbe = _write_project(root, [config], config.id)
            manager = ShareProjectManager(
                dbe, root, WMHFrontendSender(WebsocketManager())
            )

            session_a = manager.create_session_state("session-a")
            session_b = manager.create_session_state("session-b")
            original_name = session_b.projectConfig.name

            session_a.projectConfig.name = "changed"

            self.assertEqual(original_name, session_b.projectConfig.name)
            self.assertNotEqual(session_a.projectConfig.name, session_b.projectConfig.name)

    def test_unknown_session_state_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config = ProjectConfig(name="alpha")
            dbe = _write_project(root, [config], config.id)
            manager = ShareProjectManager(
                dbe, root, WMHFrontendSender(WebsocketManager())
            )
            existing_state = manager.create_session_state("session-a")

            with self.assertRaises(KeyError):
                manager.get_session_state("missing")
            with self.assertRaises(KeyError):
                manager.update_session_state("missing", existing_state)
            with self.assertRaises(KeyError):
                manager.delete_session_state("missing")
            with self.assertRaises(KeyError):
                manager.create_session_state("session-a")

    def test_listener_emit_requires_updates(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            project_config_id = ID("listener-project")
            section_id = ID("section-a")
            state = _build_project_state(project_config_id, section_id)
            dbe = _write_project_with_state(root, state)
            frontend_sender = WMHFrontendSender(
                WebsocketManager(), share_mode=True
            )
            manager = ShareProjectManager(dbe, root, frontend_sender)

            with self.assertRaises(ValueError):
                self._loop.run_until_complete(
                    manager.apply_listener_emit_updates(
                        share_session_id="session-a",
                        dependency_updates=[],
                        artifact_updates=[],
                    )
                )

    def test_listener_emit_requires_active_sessions(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            project_config_id = ID("listener-project")
            section_id = ID("section-a")
            state = _build_project_state(project_config_id, section_id)
            dbe = _write_project_with_state(root, state)
            frontend_sender = WMHFrontendSender(
                WebsocketManager(), share_mode=True
            )
            manager = ShareProjectManager(dbe, root, frontend_sender)

            dependency_updates = [
                ListenerFrontendEmitKeyAndValue(
                    dependencyKey=create_dep_key(sectionId=section_id),
                    value=LiteralDependencyValue("Updated"),
                )
            ]

            with self.assertRaises(KeyError):
                self._loop.run_until_complete(
                    manager.apply_listener_emit_updates(
                        share_session_id=None,
                        dependency_updates=dependency_updates,
                        artifact_updates=[],
                    )
                )

    def test_listener_emit_broadcasts_dependency_updates(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            project_config_id = ID("listener-project")
            section_id = ID("section-a")
            state = _build_project_state(project_config_id, section_id)
            dbe = _write_project_with_state(root, state)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(
                websocket_manager, share_mode=True
            )
            manager = ShareProjectManager(dbe, root, frontend_sender)

            manager.create_session_state("session-a")
            manager.create_session_state("session-b")

            frontend_messages_a: list[Message] = []
            frontend_messages_b: list[Message] = []
            websocket_a = self._loop.run_until_complete(
                _build_websocket(frontend_messages_a)
            )
            websocket_b = self._loop.run_until_complete(
                _build_websocket(frontend_messages_b)
            )
            self._loop.run_until_complete(
                websocket_manager.on_connect(
                    websocket_a,
                    WebsocketConnectionType.FRONTEND,
                    id="frontend-a",
                    shareSessionId="session-a",
                )
            )
            self._loop.run_until_complete(
                websocket_manager.on_connect(
                    websocket_b,
                    WebsocketConnectionType.FRONTEND,
                    id="frontend-b",
                    shareSessionId="session-b",
                )
            )

            new_text = "Updated text"
            dependency_updates = [
                ListenerFrontendEmitKeyAndValue(
                    dependencyKey=create_dep_key(sectionId=section_id),
                    value=LiteralDependencyValue(new_text),
                )
            ]
            self._loop.run_until_complete(
                manager.apply_listener_emit_updates(
                    share_session_id="session-a",
                    dependency_updates=dependency_updates,
                    artifact_updates=[],
                )
            )

            session_state_a = manager.get_session_state("session-a")
            impl_a = get_curr_effective_section_impl_with_type_guard(
                session_state_a,
                section_id,
                TextBlockSectionImpl,
            )
            self.assertEqual(new_text, impl_a.text)

            session_state_b = manager.get_session_state("session-b")
            impl_b = get_curr_effective_section_impl_with_type_guard(
                session_state_b,
                section_id,
                TextBlockSectionImpl,
            )
            self.assertNotEqual(new_text, impl_b.text)

            types_a = [
                json.loads(text)["messageType"]
                for text in _sent_text_messages(frontend_messages_a)
            ]
            types_b = [
                json.loads(text)["messageType"]
                for text in _sent_text_messages(frontend_messages_b)
            ]

            self.assertIn("UpdateFrontendProjectState", types_a)
            self.assertNotIn("UpdateFrontendProjectState", types_b)

            self._loop.run_until_complete(websocket_a.close())
            self._loop.run_until_complete(websocket_b.close())

    def test_listener_emit_broadcasts_artifact_updates(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            project_config_id = ID("listener-project")
            section_id = ID("section-a")
            state = _build_project_state(project_config_id, section_id)
            dbe = _write_project_with_state(root, state)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(
                websocket_manager, share_mode=True
            )
            manager = ShareProjectManager(dbe, root, frontend_sender)

            manager.create_session_state("session-a")
            manager.create_session_state("session-b")

            frontend_messages_a: list[Message] = []
            frontend_messages_b: list[Message] = []
            websocket_a = self._loop.run_until_complete(
                _build_websocket(frontend_messages_a)
            )
            websocket_b = self._loop.run_until_complete(
                _build_websocket(frontend_messages_b)
            )
            self._loop.run_until_complete(
                websocket_manager.on_connect(
                    websocket_a,
                    WebsocketConnectionType.FRONTEND,
                    id="frontend-a",
                    shareSessionId="session-a",
                )
            )
            self._loop.run_until_complete(
                websocket_manager.on_connect(
                    websocket_b,
                    WebsocketConnectionType.FRONTEND,
                    id="frontend-b",
                    shareSessionId="session-b",
                )
            )

            artifact_updates = [
                ImageArtifact(
                    id="artifacts/share-image.png",
                    value="data:image/png;base64,AAA",
                )
            ]
            self._loop.run_until_complete(
                manager.apply_listener_emit_updates(
                    share_session_id="session-b",
                    dependency_updates=[],
                    artifact_updates=artifact_updates,
                )
            )

            types_a = [
                json.loads(text)["messageType"]
                for text in _sent_text_messages(frontend_messages_a)
            ]
            types_b = [
                json.loads(text)["messageType"]
                for text in _sent_text_messages(frontend_messages_b)
            ]

            self.assertNotIn("UpdateArtifacts", types_a)
            self.assertIn("UpdateArtifacts", types_b)

            self._loop.run_until_complete(websocket_a.close())
            self._loop.run_until_complete(websocket_b.close())


if __name__ == "__main__":
    unittest.main()
