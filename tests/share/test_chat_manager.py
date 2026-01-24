import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.project_state.share_runtime_state import ShareRuntimeState
from setta.share.chat_manager import ShareChatManager
from setta.share.session_store import MemorySessionStore
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = (
        Path(tmpdir)
        / "share_deployments"
        / project_config_name
        / deployment_version
    )
    root.mkdir(parents=True, exist_ok=True)
    return root


def _write_share_project(
    root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> ProjectConfig:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    deployment_name = root.parent.name
    manifest = ShareDeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config


def _build_manager(root: Path) -> tuple[ShareChatManager, MemorySessionStore]:
    dbe = DBE(root)
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=True)
    settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
    share_runtime_state = ShareRuntimeState(dbe, root, frontend_sender)
    share_runtime_state.initialize_share_state(settings_file)
    share_session_store = MemorySessionStore()
    llm_config = AllLLMConfigs(
        configs={"primary": LLMConfig(id="primary", model="test-model")}
    )
    manager = ShareChatManager(
        dbe,
        frontend_sender,
        share_runtime_state,
        share_session_store,
        llm_config=llm_config,
    )
    return manager, share_session_store


class ShareChatManagerTests(unittest.TestCase):
    def test_missing_session_id_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-chat-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            manager, _ = _build_manager(root)

            with self.assertRaises(KeyError):
                manager.get_all_chat_metadata()

    def test_session_isolation(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-chat-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            manager, session_store = _build_manager(root)
            session_one = session_store.create_session()
            session_two = session_store.create_session()
            message = UserChatMessage(
                content=[MessageTextContent(text="Hello share chat")]
            )

            chat = manager.get_or_create_chat(
                None,
                message,
                "primary",
                share_session_id=session_one.id,
            )

            metadata_one = manager.get_all_chat_metadata(
                share_session_id=session_one.id
            )
            self.assertEqual([chat.id], [entry.id for entry in metadata_one])

            metadata_two = manager.get_all_chat_metadata(
                share_session_id=session_two.id
            )
            self.assertEqual([], metadata_two)
            self.assertIsNone(
                manager.get_chat(chat.id, share_session_id=session_two.id)
            )


if __name__ == "__main__":
    unittest.main()
