import asyncio
from contextlib import ExitStack, suppress
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
import pytest_asyncio
from fastapi import HTTPException, status
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.lsp.managers import LSPServers, LSPWriters
from setta.project_state.artifacts import Artifacts
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.project_manager_types import (
    FormatCodeRequest,
    SetCodeRequest,
    SetGenCodePrefixRequest,
    SetGenCodeSuffixRequest,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.project_config import (
    ProjectConfig,
    TopLevelSectionLayout,
    get_python_codegen_target_with_type_guard,
)
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import (
    CodeLanguage,
    CodeSectionImpl,
    GenPythonCodeSectionImpl,
    TextBlockSectionImpl,
)
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.setta_paths import temporary_setta_paths

class FormatCodeTestManager(BaseProjectManager):
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
class TestFormatCode:
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

        self.manager = FormatCodeTestManager(
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
        code_impl = CodeSectionImpl(
            id=ID("code-impl"),
            codeLanguage=CodeLanguage.python,
        )
        self.initial_code = "x=1\n"
        code_impl.code = self.initial_code

        variant = Variant(
            id=ID("variant-main"),
            impl=code_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
        )
        section = Core(
            id=ID("section-main"),
            name="Main Section",
            variants=[variant.id],
            defaultVariant=variant.id,
        )
        gen_impl = GenPythonCodeSectionImpl(id=ID("gen-impl"))
        gen_variant = Variant(
            id=ID("variant-gen"),
            impl=gen_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(gen_impl),
        )
        gen_section = Core(
            id=ID("section-gen"),
            name="Generated Section",
            variants=[gen_variant.id],
            defaultVariant=gen_variant.id,
        )
        bash_impl = CodeSectionImpl(
            id=ID("bash-impl"),
            codeLanguage=CodeLanguage.bash,
        )
        bash_variant = Variant(
            id=ID("variant-bash"),
            impl=bash_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(bash_impl),
        )
        bash_section = Core(
            id=ID("section-bash"),
            name="Bash Section",
            variants=[bash_variant.id],
            defaultVariant=bash_variant.id,
        )
        text_impl = TextBlockSectionImpl(id=ID("text-impl"))
        text_variant = Variant(
            id=ID("variant-text"),
            impl=text_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(text_impl),
        )
        text_section = Core(
            id=ID("section-text"),
            name="Text Section",
            variants=[text_variant.id],
            defaultVariant=text_variant.id,
        )
        project_config = ProjectConfig(
            id=ID("project-config"),
            name="Demo Project",
            sectionVariantMap={
                section.id: variant.id,
                gen_section.id: gen_variant.id,
                bash_section.id: bash_variant.id,
                text_section.id: text_variant.id,
            },
            topLevelSections={
                section.id: TopLevelSectionLayout(),
                gen_section.id: TopLevelSectionLayout(),
                bash_section.id: TopLevelSectionLayout(),
                text_section.id: TopLevelSectionLayout(),
            },
        )
        python_target = get_python_codegen_target_with_type_guard(project_config)
        self.initial_prefix = "x=1\n"
        self.initial_suffix = "y=2\n"
        python_target.genCodePrefix = self.initial_prefix
        python_target.genCodeSuffix = self.initial_suffix

        self.project_config_id = project_config.id
        self.section_id = section.id
        self.gen_section_id = gen_section.id
        self.bash_section_id = bash_section.id
        self.text_section_id = text_section.id
        return ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={
                section.id: section,
                gen_section.id: gen_section,
                bash_section.id: bash_section,
                text_section.id: text_section,
            },
            sectionImpls={
                code_impl.id: code_impl,
                gen_impl.id: gen_impl,
                bash_impl.id: bash_impl,
                text_impl.id: text_impl,
            },
            sectionVariants={
                variant.id: variant,
                gen_variant.id: gen_variant,
                bash_variant.id: bash_variant,
                text_variant.id: text_variant,
            },
        )

    async def test_format_code_updates_python_code(self):
        request = FormatCodeRequest(
            projectConfigId=self.project_config_id,
            sectionId=self.section_id,
        )

        await self.manager.format_code(request)

        state_after = self.manager.get_single_config_state(self.project_config_id)
        impl_after = get_curr_effective_section_impl_with_type_guard(
            state_after,
            self.section_id,
            CodeSectionImpl,
        )
        assert impl_after.code != self.initial_code
        assert impl_after.code.strip() == "x = 1"

    async def test_format_code_updates_gen_python_prefix_suffix(self):
        request = FormatCodeRequest(
            projectConfigId=self.project_config_id,
            sectionId=self.gen_section_id,
        )

        await self.manager.format_code(request)

        state_after = self.manager.get_single_config_state(self.project_config_id)
        python_target = get_python_codegen_target_with_type_guard(
            state_after.projectConfig
        )
        assert python_target.genCodePrefix != self.initial_prefix
        assert python_target.genCodeSuffix != self.initial_suffix
        assert python_target.genCodePrefix.strip() == "x = 1"
        assert python_target.genCodeSuffix.strip() == "y = 2"

    async def test_format_code_rejects_non_python_code_section(self):
        with pytest.raises(HTTPException) as exc:
            await self.manager.format_code(
                FormatCodeRequest(
                    projectConfigId=self.project_config_id,
                    sectionId=self.bash_section_id,
                )
            )

        assert exc.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "Python code sections" in str(exc.value.detail)

    async def test_format_code_rejects_non_code_section(self):
        with pytest.raises(HTTPException) as exc:
            await self.manager.format_code(
                FormatCodeRequest(
                    projectConfigId=self.project_config_id,
                    sectionId=self.text_section_id,
                )
            )

        assert exc.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "Python code sections" in str(exc.value.detail)

    async def test_format_code_allows_unused_args(self):
        await self.manager.set_code(
            SetCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.section_id,
                code="def foo(a):\n    return 1\n",
            )
        )

        await self.manager.format_code(
            FormatCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.section_id,
            )
        )

        state_after = self.manager.get_single_config_state(self.project_config_id)
        impl_after = get_curr_effective_section_impl_with_type_guard(
            state_after,
            self.section_id,
            CodeSectionImpl,
        )
        assert "def foo(a)" in impl_after.code

    async def test_format_code_rejects_invalid_python_code(self):
        await self.manager.set_code(
            SetCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.section_id,
                code="def broken(",
            )
        )

        with pytest.raises(HTTPException) as exc:
            await self.manager.format_code(
                FormatCodeRequest(
                    projectConfigId=self.project_config_id,
                    sectionId=self.section_id,
                )
            )

        assert exc.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert isinstance(exc.value.detail, str)
        assert exc.value.detail
        assert "\x1b" not in exc.value.detail

    async def test_format_code_rejects_invalid_gen_prefix(self):
        await self.manager.set_gen_code_prefix(
            SetGenCodePrefixRequest(
                projectConfigId=self.project_config_id,
                genCodePrefix="def broken(",
            )
        )

        with pytest.raises(HTTPException) as exc:
            await self.manager.format_code(
                FormatCodeRequest(
                    projectConfigId=self.project_config_id,
                    sectionId=self.gen_section_id,
                )
            )

        assert exc.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert isinstance(exc.value.detail, str)
        assert "Gen code prefix:" in exc.value.detail
        assert "\x1b" not in exc.value.detail

    async def test_format_code_rejects_invalid_gen_suffix(self):
        await self.manager.set_gen_code_prefix(
            SetGenCodePrefixRequest(
                projectConfigId=self.project_config_id,
                genCodePrefix="x = 1\n",
            )
        )
        await self.manager.set_gen_code_suffix(
            SetGenCodeSuffixRequest(
                projectConfigId=self.project_config_id,
                genCodeSuffix="def broken(",
            )
        )

        with pytest.raises(HTTPException) as exc:
            await self.manager.format_code(
                FormatCodeRequest(
                    projectConfigId=self.project_config_id,
                    sectionId=self.gen_section_id,
                )
            )

        assert exc.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert isinstance(exc.value.detail, str)
        assert "Gen code suffix:" in exc.value.detail
        assert "\x1b" not in exc.value.detail

    async def test_format_code_allows_undefined_symbols_in_gen_prefix(self):
        await self.manager.set_gen_code_prefix(
            SetGenCodePrefixRequest(
                projectConfigId=self.project_config_id,
                genCodePrefix="state = SettaState()\n",
            )
        )
        await self.manager.set_gen_code_suffix(
            SetGenCodeSuffixRequest(
                projectConfigId=self.project_config_id,
                genCodeSuffix="state = SettaState()\n",
            )
        )

        await self.manager.format_code(
            FormatCodeRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.gen_section_id,
            )
        )

        state_after = self.manager.get_single_config_state(self.project_config_id)
        python_target = get_python_codegen_target_with_type_guard(
            state_after.projectConfig
        )
        assert "SettaState" in python_target.genCodePrefix
        assert "SettaState" in python_target.genCodeSuffix
