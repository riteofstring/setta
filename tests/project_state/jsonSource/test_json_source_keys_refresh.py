import asyncio
from contextlib import suppress
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
from setta.project_state.project_manager_types import SetVariantJsonSourceKeysRequest
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import BaseDictSectionImpl, ConfigLanguage, DictSectionImpl
from setta.utils.structured_data import write_json_source_payload
from setta.utils.paths import normalize_workspace_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


class JsonSourceKeysManager(BaseProjectManager):
    def __init__(
        self,
        lsp_writers: LSPWriters,
        websocket_msg_handler: WMHFrontendSender,
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

    async def save_as_new_project_config(self, x):  # pragma: no cover
        return None


@pytest.mark.asyncio
class TestJsonSourceKeysRefresh:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self._tmpdir = TemporaryDirectory()
        root = Path(self._tmpdir.name)
        self.setta_root = root / "setta_files"
        self.websocket_manager = WebsocketManager()
        self.frontend_sender = WMHFrontendSender(self.websocket_manager)
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

        self.json_path = self.setta_root / "sample.json"
        self.project_state = self._build_project_state(self.json_path)
        backend = merge_single_config_into_backend(
            ProjectStateBackend(),
            self.project_state.model_copy(deep=True),
        )
        backend.validate_default_project_id()

        self.manager = JsonSourceKeysManager(
            self.lsp_writers,
            self.frontend_sender,
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

        self.project_config_id = self.project_state.projectConfig.id
        self.section_id = next(iter(self.project_state.sections.keys()))
        self.variant_id = next(iter(self.project_state.sectionVariants.keys()))

        yield

        self.manager.autosave_debouncer.cancel()
        self.manager.autosave_debouncer.cancel_pending()
        self.manager.queue_task.cancel()
        with suppress(asyncio.CancelledError):
            await self.manager.queue_task
        with suppress(RuntimeError):
            self.specific_file_watcher.stop()
        self._tmpdir.cleanup()

    def _build_project_state(self, json_path: Path) -> ProjectStateSingleConfig:
        impl = DictSectionImpl(
            id=ID("dict-impl"),
            isJsonSource=True,
            jsonSourceKeys=["alpha"],
            configLanguage=ConfigLanguage.json,
        )
        variant = Variant(
            id=ID("variant-json"),
            name=str(json_path),
            impl=impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(impl),
        )
        section = Core(
            id=ID("section-json"),
            name="JSON Section",
            variants=[variant.id],
            defaultVariant=variant.id,
        )
        project_config = ProjectConfig(
            id=ID("project-config"),
            name="JSON Project",
            sectionVariantMap={section.id: variant.id},
            topLevelSections={section.id: TopLevelSectionLayout()},
        )

        return ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section.id: section},
            sectionImpls={impl.id: impl},
            sectionVariants={variant.id: variant},
        )

    async def test_set_variant_json_source_keys_refreshes_cache(self) -> None:
        write_json_source_payload(self.json_path, {"alpha": {"one": 1}}, self.dbe)
        processed = self.json_source.process_json_source_files([self.json_path])
        self.json_source.json_sources.update(processed)

        write_json_source_payload(self.json_path, {"beta": {"two": 2}}, self.dbe)

        await self.manager.set_variant_json_source_keys(
            SetVariantJsonSourceKeysRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.section_id,
                variantId=self.variant_id,
                jsonSourceKeys=["beta"],
            )
        )

        project_state = self.manager.get_single_config_state(self.project_config_id)
        impl = get_curr_effective_section_impl_with_type_guard(
            project_state, self.section_id, BaseDictSectionImpl
        )
        assert impl.jsonSourceKeys == ["beta"]

        normalized_path = normalize_workspace_path(self.json_path)
        processed = self.json_source.json_sources[normalized_path]
        assert ("beta",) in processed.hierarchy.name_path_to_id
        assert ("alpha",) not in processed.hierarchy.name_path_to_id
