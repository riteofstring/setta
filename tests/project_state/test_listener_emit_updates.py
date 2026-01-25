import asyncio
import types
import unittest
from contextlib import suppress
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import setta.file_watchers.lsp as lsp_file_watcher
import setta.file_watchers.specific_file_watcher as specific_file_watcher
from setta.code_gen.utils import sanitize_slug
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import LSPServers, LSPWriters
from setta.project_state.artifacts import Artifacts
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.listener_dependency_updates import (
    ListenerDependencyUpdateError,
)
from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
)
from setta.types.artifact import ImageArtifact
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.dependency_key import SectionDependencyKey
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
from setta.utils.constants import C
from setta.utils.utils import normalize_path
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager
from watchdog.observers.polling import PollingObserver

specific_file_watcher.Observer = PollingObserver
lsp_file_watcher.Observer = PollingObserver


class ListenerEmitTestManager(BaseProjectManager):
    def __init__(
        self,
        lsp_writers: LSPWriters,
        websocket_msg_handler: WMHFrontendSender,
        python_script_sender: WMHPythonScriptSender,
        settings_file: SettingsFile,
        specific_file_watcher: SpecificFileWatcher,
        dbe: DBE,
        artifacts: Artifacts,
        json_source: JSONSource,
        code_files: CodeFiles,
        initial_backend: ProjectStateBackend,
    ):
        self._initial_backend = initial_backend
        super().__init__(
            lsp_writers,
            websocket_msg_handler,
            python_script_sender,
            settings_file,
            specific_file_watcher,
            dbe,
            artifacts,
            json_source,
            code_files,
        )

    def load_initial_state(self) -> ProjectStateBackend:
        return self._initial_backend.model_copy(deep=True)

    def save(self):
        return None

    async def save_as_new_project_config(self, x):
        return None


class ApplyListenerEmitUpdatesTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._tmpdir = TemporaryDirectory()
        root = Path(self._tmpdir.name)
        self.setta_root = root / "setta_files"
        self.code_folder = self.setta_root / "code"
        self.artifacts_folder = self.setta_root / "artifacts"
        self.backup_folder = self.setta_root / "backups"
        for path in (self.code_folder, self.artifacts_folder, self.backup_folder):
            path.mkdir(parents=True, exist_ok=True)

        self._patchers = [
            patch.object(C, "SETTA_FILES_FOLDER", self.setta_root),
            patch.object(C, "CODE_FOLDER", self.code_folder),
            patch.object(C, "ARTIFACTS_FOLDER", self.artifacts_folder),
            patch.object(C, "DB_BACKUP_FOLDER", self.backup_folder),
        ]
        for patcher in self._patchers:
            patcher.start()

        self.websocket_manager = WebsocketManager()
        self.listener_registry = ListenerRegistry()
        self.frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.python_script_sender = WMHPythonScriptSender(
            self.websocket_manager, self.listener_registry
        )
        self.dbe = DBE(self.setta_root)
        self.settings_file = SettingsFile(self.dbe, self.frontend_sender)
        self.lsps = LSPServers(self.settings_file.settings.languageServer)
        self.lsp_writers = LSPWriters(self.lsps)
        self.specific_file_watcher = SpecificFileWatcher()
        self.artifacts = Artifacts(
            self.frontend_sender,
            self.specific_file_watcher,
            self.dbe,
        )
        self.code_files = CodeFiles(
            self.frontend_sender,
            self.specific_file_watcher,
            self.dbe,
        )
        self.json_source = JSONSource(
            self.frontend_sender,
            self.settings_file,
            self.specific_file_watcher,
            self.dbe,
        )

        self.project_state = self._build_project_state()
        backend = merge_single_config_into_backend(
            ProjectStateBackend(),
            self.project_state.model_copy(deep=True),
        )
        backend.validate_default_project_id()

        self.manager = ListenerEmitTestManager(
            self.lsp_writers,
            self.frontend_sender,
            self.python_script_sender,
            self.settings_file,
            self.specific_file_watcher,
            self.dbe,
            self.artifacts,
            self.json_source,
            self.code_files,
            backend,
        )
        await self.manager._process_queue_task_started.wait()
        await self.manager.update(self.project_state.model_copy(deep=True))

    async def asyncTearDown(self):
        self.manager.autosave_debouncer.cancel()
        self.manager.autosave_debouncer.cancel_pending()
        self.manager.queue_task.cancel()
        with suppress(asyncio.CancelledError):
            await self.manager.queue_task
        with suppress(RuntimeError):
            self.specific_file_watcher.stop()
        for patcher in self._patchers:
            patcher.stop()
        self._tmpdir.cleanup()

    def _build_project_state(self) -> ProjectStateSingleConfig:
        text_impl = TextBlockSectionImpl(
            id=ID("text-impl"),
            name="Headline",
            text="Initial headline",
        )
        variant = Variant(
            id=ID("text-variant"),
            impl=text_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(text_impl),
        )
        section = Core(
            id=ID("text-section"),
            name="Hero",
            variants=[variant.id],
            defaultVariant=variant.id,
        )
        project_config = ProjectConfig(
            id=ID("listener-project"),
            name="Listener Project",
            sectionVariantMap={section.id: variant.id},
            topLevelSections={section.id: TopLevelSectionLayout()},
            activeIds=[section.id],
        )

        slug = sanitize_slug(project_config.name)
        (self.code_folder / "sections" / slug).mkdir(parents=True, exist_ok=True)
        (self.artifacts_folder / slug).mkdir(parents=True, exist_ok=True)

        state = ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section.id: section},
            sectionImpls={text_impl.id: text_impl},
            sectionVariants={variant.id: variant},
        )
        self.project_config_id = project_config.id
        self.text_section_id = section.id
        self.initial_text = text_impl.text
        return state

    async def test_dependency_updates_apply_and_broadcast(self):
        new_text = f"{self.initial_text} (listener emit)"
        dependency_updates = [
            ListenerFrontendEmitKeyAndValue(
                dependencyKey=SectionDependencyKey(sectionId=self.text_section_id),
                value=LiteralDependencyValue(new_text),
            )
        ]

        captured_broadcasts: list[ProjectStateSingleConfigWithCompletedOpIds] = []

        async def capture_broadcast(self, projectState, completedOpIds, pendingOpIds):
            captured_broadcasts.append(
                ProjectStateSingleConfigWithCompletedOpIds(
                    projectState=projectState,
                    completedOpIds=list(completedOpIds),
                    pendingOpIds=list(pendingOpIds),
                )
            )

        sender = self.manager.websocket_msg_handler
        original_broadcast = sender.broadcast_project_state
        sender.broadcast_project_state = types.MethodType(capture_broadcast, sender)
        try:
            await self.manager.apply_listener_emit_updates(
                projectConfigId=self.project_config_id,
                dependency_updates=dependency_updates,
                artifact_updates=[],
            )
        finally:
            sender.broadcast_project_state = original_broadcast

        updated_state = self.manager.get_single_config_state(self.project_config_id)
        updated_impl = get_curr_effective_section_impl_with_type_guard(
            updated_state,
            self.text_section_id,
            TextBlockSectionImpl,
        )
        self.assertEqual(new_text, updated_impl.text)
        self.assertEqual(1, len(captured_broadcasts))
        self.assertEqual(
            self.project_config_id,
            captured_broadcasts[0].projectState.projectConfig.id,
        )

    async def test_missing_section_raises_listener_error(self):
        dependency_updates = [
            ListenerFrontendEmitKeyAndValue(
                dependencyKey=SectionDependencyKey(
                    sectionId=ID("listener-missing-section")
                ),
                value=LiteralDependencyValue("payload"),
            )
        ]

        sender = self.manager.websocket_msg_handler
        captured_broadcasts: list[ProjectStateSingleConfigWithCompletedOpIds] = []

        async def capture_broadcast(self, projectState, completedOpIds, pendingOpIds):
            captured_broadcasts.append(
                ProjectStateSingleConfigWithCompletedOpIds(
                    projectState=projectState,
                    completedOpIds=list(completedOpIds),
                    pendingOpIds=list(pendingOpIds),
                )
            )

        original_broadcast = sender.broadcast_project_state
        sender.broadcast_project_state = types.MethodType(capture_broadcast, sender)
        try:
            with self.assertRaises(ListenerDependencyUpdateError):
                await self.manager.apply_listener_emit_updates(
                    projectConfigId=self.project_config_id,
                    dependency_updates=dependency_updates,
                    artifact_updates=[],
                )
        finally:
            sender.broadcast_project_state = original_broadcast

        self.assertEqual([], captured_broadcasts)

    async def test_artifact_updates_trigger_artifact_broadcast(self):
        artifact_updates = [
            ImageArtifact(
                id=ID("listener/new-image.png"),
                value="data:image/png;base64,AAA",
            )
        ]
        captured_artifact_calls: list[tuple[list, str]] = []
        captured_project_calls: list[ProjectStateSingleConfigWithCompletedOpIds] = []

        async def capture_artifact_broadcast(self, artifacts, updateType):
            captured_artifact_calls.append((artifacts, updateType))

        async def capture_project_broadcast(
            self, projectState, completedOpIds, pendingOpIds
        ):
            captured_project_calls.append(
                ProjectStateSingleConfigWithCompletedOpIds(
                    projectState=projectState,
                    completedOpIds=list(completedOpIds),
                    pendingOpIds=list(pendingOpIds),
                )
            )

        sender = self.manager.websocket_msg_handler
        original_artifact_broadcast = sender.broadcast_artifacts_update
        original_project_broadcast = sender.broadcast_project_state
        sender.broadcast_artifacts_update = types.MethodType(
            capture_artifact_broadcast, sender
        )
        sender.broadcast_project_state = types.MethodType(
            capture_project_broadcast, sender
        )
        try:
            await self.manager.apply_listener_emit_updates(
                projectConfigId=self.project_config_id,
                dependency_updates=[],
                artifact_updates=artifact_updates,
            )
        finally:
            sender.broadcast_artifacts_update = original_artifact_broadcast
            sender.broadcast_project_state = original_project_broadcast

        self.assertEqual([], captured_project_calls)
        self.assertEqual(1, len(captured_artifact_calls))
        artifacts_payload, update_type = captured_artifact_calls[0]
        self.assertEqual("update", update_type)
        self.assertEqual(1, len(artifacts_payload))
        artifact = artifacts_payload[0]
        self.assertEqual(
            normalize_path("listener/new-image.png"),
            normalize_path(artifact.id),
        )
        self.assertEqual("data:image/png;base64,AAA", artifact.value)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
