import asyncio
from contextlib import ExitStack, suppress
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
import pytest_asyncio
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
from setta.types.binary_content import BinaryContentRef
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
from setta.utils.paths import normalize_state_path
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager
from watchdog.observers.polling import PollingObserver

from tests.utils.setta_paths import temporary_setta_paths

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

    async def save_as_new_project_config(self, _x):
        return None


@pytest.mark.asyncio
class TestApplyListenerEmitUpdates:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self._tmpdir = TemporaryDirectory()
        root = Path(self._tmpdir.name)
        self.workspace_root = root
        self.setta_root = root / "setta_files"
        self.code_folder = self.setta_root / "code"
        self.artifacts_folder = self.setta_root / "artifacts"
        self.backup_folder = self.setta_root / "backups"
        for path in (self.code_folder, self.artifacts_folder, self.backup_folder):
            path.mkdir(parents=True, exist_ok=True)

        self._stack = ExitStack()
        self._stack.enter_context(
            temporary_setta_paths(
                workspace_root=self.workspace_root,
                setta_files_location="local",
            )
        )

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

        yield

        self.manager.autosave_debouncer.cancel()
        self.manager.autosave_debouncer.cancel_pending()
        self.manager.queue_task.cancel()
        with suppress(asyncio.CancelledError):
            await self.manager.queue_task
        with suppress(RuntimeError):
            self.specific_file_watcher.stop()
        self._stack.close()
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

        snapshot_broadcast_calls = 0
        section_patch_calls: list[tuple[ID, ID]] = []
        project_config_patch_calls = 0
        code_obj_patch_calls = 0
        structural_patch_calls = 0

        async def capture_snapshot(
            projectState, completedOpIds, pendingOpIds, projectStateRevision=None
        ):
            nonlocal snapshot_broadcast_calls
            snapshot_broadcast_calls += 1
            await original_snapshot_broadcast(
                projectState,
                completedOpIds,
                pendingOpIds,
                projectStateRevision,
            )

        sender = self.manager.websocket_msg_handler
        original_snapshot_broadcast = sender.broadcast_project_state
        original_section_patch_broadcast = sender.broadcast_project_state_section_impl_patch
        original_project_config_patch_broadcast = (
            sender.broadcast_project_state_project_config_patch
        )
        original_code_obj_patch_broadcast = sender.broadcast_project_state_code_objs_patch
        original_structural_patch_broadcast = (
            sender.broadcast_project_state_structural_patch
        )

        async def capture_section_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            section_patch_calls.append((project_config_id_for_patch, section_id_for_patch))
            await original_section_patch_broadcast(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        async def capture_project_config_patch(
            project_config_id_for_patch,
            project_config_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal project_config_patch_calls
            project_config_patch_calls += 1
            await original_project_config_patch_broadcast(
                project_config_id_for_patch,
                project_config_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        async def capture_code_obj_patch(
            project_config_id_for_patch,
            code_objs_for_patch,
            code_obj_variants_for_patch,
            code_obj_impls_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal code_obj_patch_calls
            code_obj_patch_calls += 1
            await original_code_obj_patch_broadcast(
                project_config_id_for_patch,
                code_objs_for_patch,
                code_obj_variants_for_patch,
                code_obj_impls_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        async def capture_structural_patch(
            project_config_id_for_patch,
            project_config_for_patch,
            sections_for_patch,
            section_variants_for_patch,
            section_impls_for_patch,
            parent_section_map_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal structural_patch_calls
            structural_patch_calls += 1
            await original_structural_patch_broadcast(
                project_config_id_for_patch,
                project_config_for_patch,
                sections_for_patch,
                section_variants_for_patch,
                section_impls_for_patch,
                parent_section_map_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state = capture_snapshot  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = (  # type: ignore[method-assign]
            capture_section_patch
        )
        sender.broadcast_project_state_project_config_patch = (  # type: ignore[method-assign]
            capture_project_config_patch
        )
        sender.broadcast_project_state_code_objs_patch = capture_code_obj_patch  # type: ignore[method-assign]
        sender.broadcast_project_state_structural_patch = capture_structural_patch  # type: ignore[method-assign]
        try:
            await self.manager.apply_listener_emit_updates(
                projectConfigId=self.project_config_id,
                dependency_updates=dependency_updates,
                artifact_updates=[],
            )
        finally:
            sender.broadcast_project_state = original_snapshot_broadcast
            sender.broadcast_project_state_section_impl_patch = (
                original_section_patch_broadcast
            )
            sender.broadcast_project_state_project_config_patch = (
                original_project_config_patch_broadcast
            )
            sender.broadcast_project_state_code_objs_patch = (
                original_code_obj_patch_broadcast
            )
            sender.broadcast_project_state_structural_patch = (
                original_structural_patch_broadcast
            )

        updated_state = self.manager.get_single_config_state(self.project_config_id)
        updated_impl = get_curr_effective_section_impl_with_type_guard(
            updated_state,
            self.text_section_id,
            TextBlockSectionImpl,
        )
        assert new_text == updated_impl.text
        assert 0 == snapshot_broadcast_calls
        assert [(self.project_config_id, self.text_section_id)] == section_patch_calls
        assert 0 == project_config_patch_calls
        assert 0 == code_obj_patch_calls
        assert 0 == structural_patch_calls

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

        async def capture_broadcast(
            projectState,
            completedOpIds,
            pendingOpIds,
            projectStateRevision=None,
        ):
            captured_broadcasts.append(
                ProjectStateSingleConfigWithCompletedOpIds(
                    projectState=projectState,
                    completedOpIds=list(completedOpIds),
                    pendingOpIds=list(pendingOpIds),
                    projectStateRevision=projectStateRevision,
                )
            )
            await original_broadcast(
                projectState,
                completedOpIds,
                pendingOpIds,
                projectStateRevision,
            )

        original_broadcast = sender.broadcast_project_state
        sender.broadcast_project_state = capture_broadcast  # type: ignore[method-assign]
        try:
            with pytest.raises(ListenerDependencyUpdateError):
                await self.manager.apply_listener_emit_updates(
                    projectConfigId=self.project_config_id,
                    dependency_updates=dependency_updates,
                    artifact_updates=[],
                )
        finally:
            sender.broadcast_project_state = original_broadcast

        assert [] == captured_broadcasts

    async def test_artifact_updates_trigger_artifact_broadcast(self):
        artifact_updates = [
            ImageArtifact(
                id=ID("listener/new-image.png"),
                value=BinaryContentRef(
                    contentId="listener-image",
                    byteLength=3,
                    mimeType="image/png",
                ),
            )
        ]
        captured_artifact_calls: list[tuple[list, str]] = []
        snapshot_broadcast_calls = 0
        section_patch_calls = 0

        async def capture_artifact_broadcast(artifacts, updateType):
            captured_artifact_calls.append((artifacts, updateType))
            await original_artifact_broadcast(artifacts, updateType)

        async def capture_snapshot(
            projectState,
            completedOpIds,
            pendingOpIds,
            projectStateRevision=None,
        ) -> None:
            nonlocal snapshot_broadcast_calls
            snapshot_broadcast_calls += 1
            await original_snapshot_broadcast(
                projectState,
                completedOpIds,
                pendingOpIds,
                projectStateRevision,
            )

        async def capture_section_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal section_patch_calls
            section_patch_calls += 1
            await original_section_patch_broadcast(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender = self.manager.websocket_msg_handler
        original_artifact_broadcast = sender.broadcast_artifacts_update
        original_snapshot_broadcast = sender.broadcast_project_state
        original_section_patch_broadcast = sender.broadcast_project_state_section_impl_patch
        sender.broadcast_artifacts_update = capture_artifact_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state = capture_snapshot  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = (  # type: ignore[method-assign]
            capture_section_patch
        )
        try:
            await self.manager.apply_listener_emit_updates(
                projectConfigId=self.project_config_id,
                dependency_updates=[],
                artifact_updates=artifact_updates,
            )
        finally:
            sender.broadcast_artifacts_update = original_artifact_broadcast
            sender.broadcast_project_state = original_snapshot_broadcast
            sender.broadcast_project_state_section_impl_patch = (
                original_section_patch_broadcast
            )

        assert 0 == snapshot_broadcast_calls
        assert 0 == section_patch_calls
        assert 1 == len(captured_artifact_calls)
        artifacts_payload, update_type = captured_artifact_calls[0]
        assert "update" == update_type
        assert 1 == len(artifacts_payload)
        artifact = artifacts_payload[0]
        assert normalize_state_path("listener/new-image.png") == normalize_state_path(
            artifact.id
        )
        assert (
            BinaryContentRef(
                contentId="listener-image",
                byteLength=3,
                mimeType="image/png",
            )
            == artifact.value
        )
