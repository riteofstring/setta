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
from setta.agentic.chat_view import EXTERNAL_AGENT_RUN_TYPE
from setta.agentic.store import save_agent_run
from setta.llm.chat_store import AgentRunChatStore
from setta.project_state.artifacts import Artifacts
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.project_manager_types import (
    GetChatSectionChatIdRequest,
    SetChatSectionChatIdRequest,
)
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.types.project_config import (
    ProjectConfig,
    SectionRepresentationMode,
    TopLevelSectionLayout,
)
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.agentic import AgentRun, AgentRunStatus, RunEvent
from setta.types.section_impls import ChatSectionImpl, SectionType
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager

from tests.utils.setta_paths import temporary_setta_paths

class ChatSectionChatIdManager(BaseProjectManager):
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

    async def save_as_new_project_config(self, x):  # pragma: no cover
        return None


@pytest.mark.asyncio
class TestChatSectionChatId:
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

        self.manager = ChatSectionChatIdManager(
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
        chat_impl = ChatSectionImpl(id=ID("chat-impl"))
        variant = Variant(
            id=ID("variant-chat"),
            impl=chat_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(chat_impl),
        )
        section = Core(
            id=ID("section-chat"),
            name="Chat Section",
            variants=[variant.id],
            defaultVariant=variant.id,
        )
        project_config = ProjectConfig(
            id=ID("project-config"),
            name="Chat Project",
            sectionVariantMap={section.id: variant.id},
            topLevelSections={section.id: TopLevelSectionLayout()},
        )
        python_target = project_config.codegenTargets[0]
        python_target.sectionPolicy.typePolicies[
            SectionType.Chat
        ].representation = SectionRepresentationMode.expression

        self.project_config_id = project_config.id
        self.section_id = section.id

        return ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section.id: section},
            sectionImpls={chat_impl.id: chat_impl},
            sectionVariants={variant.id: variant},
        )

    def _create_message(self, text: str) -> UserChatMessage:
        return UserChatMessage(content=[MessageTextContent(text=text)])

    async def test_get_chat_section_chat_id_returns_existing(self) -> None:
        store = AgentRunChatStore(self.dbe)
        chat = store.create_new_chat(
            self._create_message("Hello"),
            LLMConfig(id="test-llm", model="gpt-test"),
            project_config_id=self.project_config_id,
        )
        await self.manager.set_chat_section_chat_id(
            SetChatSectionChatIdRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.section_id,
                chatId=chat.id,
            )
        )

        chat_id = await self.manager.get_chat_section_chat_id(
            GetChatSectionChatIdRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.section_id,
            )
        )

        assert chat_id == chat.id
        state_after = self.manager.get_single_config_state(self.project_config_id)
        impl_after = get_curr_effective_section_impl_with_type_guard(
            state_after,
            self.section_id,
            ChatSectionImpl,
        )
        assert impl_after.chatId == chat.id

    async def test_get_chat_section_chat_id_returns_external_run(self) -> None:
        chat_id = ID("external-chat")
        run = AgentRun(
            status=AgentRunStatus.completed,
            inputs={
                "runType": EXTERNAL_AGENT_RUN_TYPE,
                "chatId": str(chat_id),
                "projectConfigId": str(self.project_config_id),
            },
            events=[
                RunEvent(
                    type="run_started",
                    payload={
                        "chatId": str(chat_id),
                        "projectConfigId": str(self.project_config_id),
                    },
                )
            ],
        )
        save_agent_run(self.dbe, run)
        await self.manager.set_chat_section_chat_id(
            SetChatSectionChatIdRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.section_id,
                chatId=chat_id,
            )
        )

        resolved = await self.manager.get_chat_section_chat_id(
            GetChatSectionChatIdRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.section_id,
            )
        )

        assert resolved == chat_id

    async def test_get_chat_section_chat_id_clears_missing(self) -> None:
        missing_chat_id = ID("missing-chat")
        await self.manager.set_chat_section_chat_id(
            SetChatSectionChatIdRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.section_id,
                chatId=missing_chat_id,
            )
        )

        chat_id = await self.manager.get_chat_section_chat_id(
            GetChatSectionChatIdRequest(
                projectConfigId=self.project_config_id,
                sectionId=self.section_id,
            )
        )

        assert chat_id is None
        state_after = self.manager.get_single_config_state(self.project_config_id)
        impl_after = get_curr_effective_section_impl_with_type_guard(
            state_after,
            self.section_id,
            ChatSectionImpl,
        )
        assert impl_after.chatId is None
