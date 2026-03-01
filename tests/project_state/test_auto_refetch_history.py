import asyncio
from contextlib import ExitStack, suppress
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
import pytest_asyncio
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import LSPServers, LSPWriters
from setta.project_state.artifacts import Artifacts
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.types.code_obj_impls import CodeCallableCodeObjImpl, CodeParamCodeObjImpl
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.project_config import (
    ProjectCodegenPythonTarget,
    ProjectConfig,
    SectionCodegenMode,
    SectionCodegenPolicy,
    SectionTypeCodegenPolicy,
    TopLevelSectionLayout,
)
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import CallableSectionImpl, SectionType
from setta.utils.constants import C
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.setta_paths import temporary_setta_paths


class AutoRefetchHistoryManager(BaseProjectManager):
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

    def save(self):  # pragma: no cover - not exercised in tests
        return None

    async def save_as_new_project_config(self, _x):  # pragma: no cover
        return None


def build_project_state() -> tuple[ProjectStateSingleConfig, ID]:
    section_id = ID("section-1")
    section_impl_id = ID("section-impl-1")
    section_variant_id = ID("section-variant-1")

    callable_id = ID("callable-1")
    callable_impl_id = ID("callable-impl-1")
    callable_variant_id = ID("callable-variant-1")

    param_id = ID("param-1")
    param_impl_id = ID("param-impl-1")
    param_variant_id = ID("param-variant-1")

    callable_impl = CodeCallableCodeObjImpl(
        id=callable_impl_id,
        children=[param_id],
    )
    callable_variant = Variant(
        id=callable_variant_id,
        impl=callable_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(callable_impl),
    )
    callable_core = Core(
        id=callable_id,
        name="MissingFunc",
        variants=[callable_variant.id],
        defaultVariant=callable_variant.id,
    )

    param_impl = CodeParamCodeObjImpl(
        id=param_impl_id,
        value="value",
    )
    param_variant = Variant(
        id=param_variant_id,
        impl=param_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(param_impl),
    )
    param_core = Core(
        id=param_id,
        name="param",
        variants=[param_variant.id],
        defaultVariant=param_variant.id,
    )

    section_impl = CallableSectionImpl(
        id=section_impl_id,
        callable=callable_id,
        codeObjVariantMap={
            callable_id: callable_variant.id,
            param_id: param_variant.id,
        },
    )
    section_variant = Variant(
        id=section_variant_id,
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    section_core = Core(
        id=section_id,
        name="Section",
        variants=[section_variant.id],
        defaultVariant=section_variant.id,
    )

    section_policy = SectionCodegenPolicy(
        typePolicies={
            SectionType.Callable: SectionTypeCodegenPolicy(
                mode=SectionCodegenMode.exclude,
            )
        }
    )
    project_config = ProjectConfig(
        id=ID("project-1"),
        name="HistoryProject",
        sectionVariantMap={section_id: section_variant.id},
        topLevelSections={section_id: TopLevelSectionLayout()},
        codegenTargets=[
            ProjectCodegenPythonTarget(sectionPolicy=section_policy),
        ],
    )
    project_state = ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section_id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
        codeObjs={callable_id: callable_core, param_id: param_core},
        codeObjImpls={callable_impl.id: callable_impl, param_impl.id: param_impl},
        codeObjVariants={
            callable_variant.id: callable_variant,
            param_variant.id: param_variant,
        },
    )
    return project_state, section_id


def _install_transport_capture(sender):
    capture = {
        "project_state_broadcast_calls": 0,
        "project_config_patch_calls": 0,
        "code_obj_patch_calls": 0,
        "section_impl_patch_calls": [],
        "name_validation_broadcast_calls": 0,
    }
    original_project_state_broadcast = sender.broadcast_project_state
    original_project_config_patch_broadcast = (
        sender.broadcast_project_state_project_config_patch
    )
    original_code_obj_patch_broadcast = sender.broadcast_project_state_code_objs_patch
    original_section_impl_patch_broadcast = (
        sender.broadcast_project_state_section_impl_patch
    )
    original_name_validation_broadcast = sender.broadcast_name_validation_errors

    async def record_project_state_broadcast(
        project_state,
        completed_op_ids,
        pending_op_ids,
        project_state_revision=None,
    ) -> None:
        capture["project_state_broadcast_calls"] += 1
        await original_project_state_broadcast(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision,
        )

    async def record_project_config_patch(
        project_config_id_for_patch,
        project_config_for_patch,
        previous_project_state_revision,
        project_state_revision,
        completed_op_ids,
        pending_op_ids,
    ) -> None:
        capture["project_config_patch_calls"] += 1
        await original_project_config_patch_broadcast(
            project_config_id_for_patch,
            project_config_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        )

    async def record_code_obj_patch(
        project_config_id_for_patch,
        code_objs_for_patch,
        code_obj_variants_for_patch,
        code_obj_impls_for_patch,
        previous_project_state_revision,
        project_state_revision,
        completed_op_ids,
        pending_op_ids,
    ) -> None:
        capture["code_obj_patch_calls"] += 1
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

    async def record_section_impl_patch(
        project_config_id_for_patch,
        section_id_for_patch,
        section_impl_for_patch,
        previous_project_state_revision,
        project_state_revision,
        completed_op_ids,
        pending_op_ids,
    ) -> None:
        capture["section_impl_patch_calls"].append(
            {
                "projectConfigId": project_config_id_for_patch,
                "sectionId": section_id_for_patch,
                "previousProjectStateRevision": previous_project_state_revision,
                "projectStateRevision": project_state_revision,
            }
        )
        await original_section_impl_patch_broadcast(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        )

    async def record_name_validation_broadcast(content) -> None:
        capture["name_validation_broadcast_calls"] += 1
        await original_name_validation_broadcast(content)

    sender.broadcast_project_state = record_project_state_broadcast  # type: ignore[method-assign]
    sender.broadcast_project_state_project_config_patch = (  # type: ignore[method-assign]
        record_project_config_patch
    )
    sender.broadcast_project_state_code_objs_patch = record_code_obj_patch  # type: ignore[method-assign]
    sender.broadcast_project_state_section_impl_patch = record_section_impl_patch  # type: ignore[method-assign]
    sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]

    def restore() -> None:
        sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_project_config_patch = (  # type: ignore[method-assign]
            original_project_config_patch_broadcast
        )
        sender.broadcast_project_state_code_objs_patch = original_code_obj_patch_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = original_section_impl_patch_broadcast  # type: ignore[method-assign]
        sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

    return capture, restore


@pytest.mark.asyncio
class TestAutoRefetchHistory:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self._tmpdir = TemporaryDirectory()
        root = Path(self._tmpdir.name)
        self._stack = ExitStack()
        self._stack.enter_context(
            temporary_setta_paths(
                workspace_root=root,
                setta_files_location="local",
            )
        )

        self.setta_root = C.SETTA_FILES_FOLDER
        self.code_folder = C.CODE_FOLDER
        self.artifacts_folder = C.ARTIFACTS_FOLDER
        self.backup_folder = C.DB_BACKUP_FOLDER

        for path in (self.code_folder, self.artifacts_folder, self.backup_folder):
            path.mkdir(parents=True, exist_ok=True)

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

        self.project_state, self.section_id = build_project_state()
        backend = merge_single_config_into_backend(
            ProjectStateBackend(),
            self.project_state.model_copy(deep=True),
        )
        backend.validate_default_project_id()

        self.manager = AutoRefetchHistoryManager(
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

    async def test_auto_refetch_skipped_does_not_add_history(self):
        history_len = len(self.manager.history._history)
        await self.manager.auto_refetch_callable_params(
            self.project_state.projectConfig.id,
            {self.section_id},
        )
        assert len(self.manager.history._history) == history_len

    async def test_auto_refetch_missing_section_is_ignored(self):
        history_len = len(self.manager.history._history)
        await self.manager.auto_refetch_callable_params(
            self.project_state.projectConfig.id,
            {ID("missing-section")},
        )
        assert len(self.manager.history._history) == history_len

    async def test_auto_refetch_updates_on_empty_callable_name(self):
        project_state = self.project_state.model_copy(deep=True)
        section_impl = get_curr_effective_section_impl(project_state, self.section_id)
        callable_id = section_impl.callable
        assert callable_id is not None
        project_state.codeObjs[callable_id].name = ""
        await self.manager.update(project_state)

        await self.manager.auto_refetch_callable_params(
            project_state.projectConfig.id,
            {self.section_id},
        )

        updated_state = self.manager.get_single_config_state(
            project_state.projectConfig.id
        )
        updated_impl = get_curr_effective_section_impl(updated_state, self.section_id)
        assert updated_impl.callable is None

    async def test_codegen_refresh_preserves_callable_mismatch_sections(self):
        project_config_id = self.project_state.projectConfig.id
        gen_code = self.manager.gen_code[project_config_id]
        gen_code.latest_callable_mismatch_sections = {self.section_id}

        await self.manager.update(self.project_state.model_copy(deep=True))

        updated_gen_code = self.manager.gen_code[project_config_id]
        assert (
            updated_gen_code.latest_callable_mismatch_sections
            == {self.section_id}
        )

    async def test_auto_refetch_mutation_does_not_add_history_entries(self):
        project_state = self.project_state.model_copy(deep=True)
        project_state.projectConfig.codegenTargets = [ProjectCodegenPythonTarget()]
        section_impl = get_curr_effective_section_impl(project_state, self.section_id)
        assert isinstance(section_impl, CallableSectionImpl)
        callable_id = section_impl.callable
        assert callable_id is not None
        project_state.codeObjs[callable_id].name = ""
        await self.manager.update(project_state)

        history_calls: list[dict[str, object]] = []
        original_add_history_entry = self.manager.add_new_history_entry

        def record_add_new_history_entry(*args, **kwargs):
            history_calls.append(dict(kwargs))
            return original_add_history_entry(*args, **kwargs)

        self.manager.add_new_history_entry = (  # type: ignore[method-assign]
            record_add_new_history_entry
        )

        history_len_before = len(self.manager.history._history)
        try:
            await self.manager.auto_refetch_callable_params(
                project_state.projectConfig.id,
                {self.section_id},
            )
        finally:
            self.manager.add_new_history_entry = original_add_history_entry  # type: ignore[method-assign]

        assert len(self.manager.history._history) == history_len_before
        assert history_calls == []

    async def test_auto_refetch_mutation_uses_patch_transport(self):
        project_state = self.project_state.model_copy(deep=True)
        section_impl = get_curr_effective_section_impl(project_state, self.section_id)
        assert isinstance(section_impl, CallableSectionImpl)
        callable_id = section_impl.callable
        assert callable_id is not None
        project_state.codeObjs[callable_id].name = ""
        await self.manager.update(project_state)

        sender = self.manager.websocket_msg_handler
        capture, restore = _install_transport_capture(sender)
        try:
            await self.manager.auto_refetch_callable_params(
                self.project_state.projectConfig.id,
                {self.section_id},
            )
        finally:
            restore()

        assert 0 == capture["project_state_broadcast_calls"]
        assert 0 == capture["project_config_patch_calls"]
        assert 0 == capture["code_obj_patch_calls"]
        assert len(capture["section_impl_patch_calls"]) >= 1
        assert any(
            patch["sectionId"] == self.section_id
            for patch in capture["section_impl_patch_calls"]
        )
        assert 1 == capture["name_validation_broadcast_calls"]
        updated_state = self.manager.get_single_config_state(
            self.project_state.projectConfig.id
        )
        updated_impl = get_curr_effective_section_impl(updated_state, self.section_id)
        assert isinstance(updated_impl, CallableSectionImpl)
        assert updated_impl.callable is None

    async def test_auto_refetch_mutation_defers_codegen_refresh(self):
        project_state = self.project_state.model_copy(deep=True)
        section_impl = get_curr_effective_section_impl(project_state, self.section_id)
        assert isinstance(section_impl, CallableSectionImpl)
        callable_id = section_impl.callable
        assert callable_id is not None
        project_state.codeObjs[callable_id].name = ""
        await self.manager.update(project_state)

        refresh_calls = 0
        scheduled_deferred_refreshes: list[ID] = []
        original_refresh = self.manager._refresh_codegen_state
        original_schedule_deferred_refresh = (
            self.manager._schedule_deferred_codegen_refresh
        )

        async def record_refresh(next_state) -> None:
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh(next_state)

        def record_schedule_deferred_refresh(project_config_id_for_refresh: ID) -> None:
            scheduled_deferred_refreshes.append(project_config_id_for_refresh)

        self.manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        self.manager._schedule_deferred_codegen_refresh = (  # type: ignore[method-assign]
            record_schedule_deferred_refresh
        )
        try:
            await self.manager.finish_pending_operations(timeout=5.0)
            before_refresh_calls = refresh_calls
            before_scheduled_count = len(scheduled_deferred_refreshes)
            await self.manager.auto_refetch_callable_params(
                self.project_state.projectConfig.id,
                {self.section_id},
            )
            await self.manager.finish_pending_operations(timeout=5.0)
        finally:
            self.manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            self.manager._schedule_deferred_codegen_refresh = (  # type: ignore[method-assign]
                original_schedule_deferred_refresh
            )

        assert refresh_calls == before_refresh_calls
        assert len(scheduled_deferred_refreshes) == before_scheduled_count + 1
        assert (
            scheduled_deferred_refreshes[-1] == self.project_state.projectConfig.id
        )
