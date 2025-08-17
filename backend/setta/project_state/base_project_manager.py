import asyncio
import copy
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Coroutine, Iterable

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.database.db.jsonSource.load import load_json_sources_into_data_structures
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import (
    FileWatcherCallback,
    SpecificFileWatcher,
)
from setta.lsp.managers import LSPWriters
from setta.project_state.code import Code
from setta.project_state.history import History
from setta.project_state.project_code import (
    ProjectBashCode,
    ProjectGenPythonCode,
    ProjectPythonCode,
)
from setta.project_state.project_manager_types import (
    AddKwargRequest,
    ChangeParamImplRequest,
    ClearTextFieldCompletionRequest,
    CodeAreaCompletionRequest,
    CreateChildSectionsRequest,
    CreateChildSectionsViaIncrementerRequest,
    CreateNewSectionVariantRequest,
    CreateTopLevelSectionRequest,
    DeleteChildSectionsViaDecrementerRequest,
    DeleteJSONSourceFileAndVariantRequest,
    DeleteKwargRequest,
    DeleteSectionsRequest,
    DeleteSectionVariantRequestOrAsk,
    GenCodePrefixCompletionRequest,
    GenCodeSuffixCompletionRequest,
    GetLatestProjectStateRequest,
    ProjectStateSingleConfigWithModCount,
    RedoRequest,
    SetCallableRequest,
    SetTextBlockTextRequest,
    TextFieldCompletionRequest,
    ToggleVariantJSONSourceRequest,
    UndoRequest,
    UpdateFromFrontendRequest,
    UpdateFromFrontendTopLevelSectionLayout,
    UpdateParamImplConfigRequest,
)
from setta.project_state.utils import create_timestamped_folder
from setta.types.helpers import (
    add_kwarg,
    change_param_impl,
    convert_backend_to_single_config,
    create_child_sections,
    create_child_sections_via_incrementer,
    create_new_section_variant,
    create_top_level_section,
    delete_child_sections_via_decrementer,
    delete_kwarg,
    delete_section_variant,
    delete_section_variant_or_ask,
    delete_sections,
    get_json_source_files_to_watch,
    get_variants_for_json_source_update,
    maybe_update_gen_python_code_section,
    # create_sections,
    merge_single_config_into_backend,
    set_param_entered_value,
    set_project_config_name,
    set_text_block_text,
    toggle_variant_json_source,
    update_param_impl_config,
)
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.project_state import (
    ProjectConfig,
    ProjectMetadata,
    ProjectStateBackend,
    ProjectStateSingleConfig,
)
from setta.types.section_impls import CodeLanguage, CodeSectionImpl, SectionType
from setta.types.settings_state import RenameRefactorMode
from setta.types.simplified_states import Position, SimplifiedSectionCreation
from setta.types.specific_file_watcher import FileWatcherCoreUpdate
from setta.utils.async_debouncer import AsyncDebouncer
from setta.utils.constants import CODE_FOLDER
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class BaseProjectManager(ABC):
    def __init__(
        self,
        lsp_writers: LSPWriters,
        websocket_msg_handler: WMHFrontendSender,
        settings_file: SettingsFile,
        specific_file_watcher: SpecificFileWatcher,
    ):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.settings_file = settings_file
        self.specific_file_watcher = specific_file_watcher
        self.temp_folder = CODE_FOLDER / "temp_folder"
        self.temp_folder.mkdir(parents=True, exist_ok=True)
        self.history = History(self.load_initial_state())
        self.gen_code: dict[str, ProjectGenPythonCode] = {}
        self.code_dict: dict[str, dict[str, ProjectPythonCode | ProjectBashCode]] = {}
        self.used_files: set[Path] = set()
        self.message_queue: asyncio.Queue[tuple[Coroutine, asyncio.Future]] = (
            asyncio.Queue()
        )
        print("[DEBUG] Creating queue task in ProjectStateUpdater.__init__", flush=True)
        self._process_queue_task_started = asyncio.Event()
        self.queue_task = asyncio.create_task(self._process_queue())
        print(f"[DEBUG] Queue task created with id: {id(self.queue_task)}", flush=True)
        self.autosave_debouncer = AsyncDebouncer(self.autosave, wait=2.0)
        self.modCount = 0

    @abstractmethod
    def load_initial_state(self) -> ProjectStateBackend:
        pass

    async def _process_queue(self):
        """Background task that processes messages one at a time"""
        print("[DEBUG] Starting _process_queue background task", flush=True)
        self._process_queue_task_started.set()
        while True:
            print(
                f"[DEBUG] Queue size before get: {self.message_queue.qsize()}",
                flush=True,
            )
            # Get the next message handler and its arguments
            print("[DEBUG] Waiting for next message in queue...", flush=True)
            coroutine, future = await self.message_queue.get()
            try:
                # Execute the actual implementation
                print(f"[DEBUG] Starting handler {coroutine.__name__}", flush=True)
                result = await coroutine
                print(f"[DEBUG] Completed handler {coroutine.__name__}", flush=True)
                # Set the result for the waiting call
                print(
                    f"[DEBUG] Setting result on future (cancelled={future.cancelled()})",
                    flush=True,
                )
                future.set_result(result)
            except Exception as e:
                # Propagate any exceptions back to the caller
                print(f"[DEBUG] Error in handler {coroutine.__name__}: {e}", flush=True)
                future.set_exception(e)
            finally:
                # Mark the task as done
                print("[DEBUG] Marking queue task as done", flush=True)
                self.message_queue.task_done()

    async def _enqueue(self, coroutine: Coroutine):
        """Enqueue a message for processing and wait for its completion"""
        await self._process_queue_task_started.wait()

        # print(f"[DEBUG] Enqueueing {handler.__name__} with args {args}", flush=True)
        print(
            f"[DEBUG] Queue task status: cancelled={self.queue_task.cancelled()}, done={self.queue_task.done()}, exception={self.queue_task.exception() if self.queue_task.done() else None}",
            flush=True,
        )

        # Create a future to hold the result
        future = asyncio.Future()
        print(f"[DEBUG] Created future {id(future)}", flush=True)

        # Put the message in the queue
        print("[DEBUG] Putting message in queue", flush=True)
        await self.message_queue.put((coroutine, future))
        print("[DEBUG] Message in queue, waiting for result", flush=True)

        # Wait for the message to be processed and return the result
        print(f"[DEBUG] Awaiting future {id(future)}", flush=True)
        start_time = asyncio.get_event_loop().time()
        try:
            result = await future
            end_time = asyncio.get_event_loop().time()
            print(
                f"[DEBUG] Future completed after {end_time - start_time:.2f}s with result",
                flush=True,
            )
            return result
        except Exception as e:
            end_time = asyncio.get_event_loop().time()
            print(
                f"[DEBUG] Future raised exception after {end_time - start_time:.2f}s: {e}",
                flush=True,
            )
            raise

    @staticmethod
    def enqueue_method(func):
        async def wrapper(self, *args, **kwargs):
            return await self._enqueue(func(self, *args, **kwargs))

        return wrapper

    @enqueue_method
    async def create_run_command(
        self,
        projectConfigId: str,
        sectionId: str | None,
    ):
        target_folder = create_timestamped_folder(CODE_FOLDER)
        gen_code = self.gen_code[projectConfigId]
        gen_code_path = gen_code.write_to_folder(target_folder)

        code_dict = self.code_dict[projectConfigId]
        code_paths = {}
        for sid, c in code_dict.items():
            code_paths[sid] = c.write_to_folder(target_folder)

        if not sectionId:
            sectionId = self.project_state_backend.projectConfigs[
                projectConfigId
            ].entryCodeBlockId

        if sectionId:
            return code_dict[sectionId].get_run_command(code_paths[sectionId])
        return gen_code.get_run_command(gen_code_path)

    @enqueue_method
    async def maybe_init_project_config(self, projectState: ProjectStateSingleConfig):
        if projectState.projectConfig.id not in self.gen_code:
            await self.update(projectState)
        return ProjectStateSingleConfigWithModCount(
            projectState=projectState, modCount=self.modCount
        )

    @enqueue_method
    async def update_from_frontend(
        self,
        x: UpdateFromFrontendRequest,
        trigger_autosave=True,
        updateFileWatcher=True,
    ):
        matching = self.modCount == x.modCount
        if matching:
            self.add_new_history_entry(trigger_autosave)
            await self.update(
                x.projectState, x.requestRenameRefactor, x.messageId, updateFileWatcher
            )
        await self.websocket_msg_handler.broadcast_project_state(
            x.projectState, self.modCount
        )
        return matching

    @enqueue_method
    async def update_from_frontend_top_level_section_layout(
        self, x: UpdateFromFrontendTopLevelSectionLayout
    ):
        if x.modCount != self.modCount:
            return
        self.project_state_backend.projectConfigs[
            x.projectConfigId
        ].topLevelSections = x.topLevelSections

    @enqueue_method
    async def load_json_sources(
        self,
        section_variant_ids: Iterable[str] | None = None,
    ):
        load_json_sources_into_data_structures(
            self.settings_file.settings,
            self.project_state_backend,
            section_variant_ids,
        )
        for configId in self.project_state_backend.projectConfigs.keys():
            singleConfig = convert_backend_to_single_config(
                self.project_state_backend, configId
            )
            # Don't update file watcher here because otherwise it'll be an infinite loop
            await self.update_and_broadcast_project_state(
                singleConfig, updateFileWatcher=False
            )

    async def update(
        self,
        projectState: ProjectStateSingleConfig,
        requestRenameRefactor: bool = False,
        messageId: str | None = None,
        updateFileWatcher: bool = True,
    ):
        projectState.validate_singleton_sections()
        self.used_files = set()
        dep_graph = DependencyGraph(projectState)
        projectConfig = projectState.projectConfig
        projectConfigId = projectConfig.id
        if self.gen_code.get(projectConfigId):
            await self.maybe_do_rename_refactor(
                messageId, requestRenameRefactor, projectConfigId, dep_graph
            )
            self.gen_code[projectConfigId].callback_cleanup()

        code_generator = PythonCodeGenerator(
            dep_graph, projectConfig.genCodePrefix, projectConfig.genCodeSuffix
        )
        code_generator.generate_code()

        projectConfigName = projectConfig.name
        project_temp_folder = self.temp_folder / projectConfigName
        new_gen_code = ProjectGenPythonCode(
            project_temp_folder,
            self.lsp_writers,
            self.websocket_msg_handler,
            projectConfigId,
            dep_graph,
            code_generator,
        )
        await new_gen_code.update_file()
        maybe_update_gen_python_code_section(projectState, new_gen_code.code)
        self.add_to_used_files(new_gen_code)
        self.gen_code[projectConfigId] = new_gen_code

        if self.code_dict.get(projectConfigId):
            for c in self.code_dict[projectConfigId].values():
                if isinstance(c, ProjectPythonCode):
                    c.callback_cleanup()
        self.code_dict[projectConfigId] = {}

        for sectionId in projectState.sections.keys():
            section_impl = projectState.get_curr_effective_section_impl(sectionId)
            if isinstance(section_impl, CodeSectionImpl):
                section_code = self.create_project_code(
                    project_temp_folder, projectState, sectionId, section_impl
                )

                if not section_code:
                    continue

                await section_code.update_file()
                self.add_to_used_files(section_code)
                self.code_dict[projectConfigId][sectionId] = section_code

        self.delete_unused_files(project_temp_folder)
        self.modCount += 1
        self.project_state_backend = self.get_new_project_state_backend(projectState)
        if updateFileWatcher:
            self.maybe_watch_json_source_files(projectState)

    @enqueue_method
    async def type_check(self, projectConfigId: str):
        await self.gen_code[projectConfigId].type_check()

    @enqueue_method
    async def text_field_completion(self, x: TextFieldCompletionRequest):
        return await self.gen_code[x.projectConfigId].text_field_completion(
            x.sectionId, x.paramInfoId, x.fullText, x.position
        )

    @enqueue_method
    async def clear_text_field_completion(self, x: ClearTextFieldCompletionRequest):
        await self.gen_code[x.projectConfigId].clear_text_field_completion(
            x.sectionId, x.paramInfoId
        )

    @enqueue_method
    async def set_callable(self, x: SetCallableRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)

        await self.gen_code[x.projectConfigId].set_callable(
            self.settings_file.settings,
            project_state,
            x.sectionId,
            x.callableName,
            x.refetchParams,
        )
        await self.update_and_broadcast_project_state(project_state)
        return project_state

    @enqueue_method
    async def code_area_completion(self, x: CodeAreaCompletionRequest):
        print("*************code_area_autocomplete\n\n\n", flush=True)
        code = self.code_dict[x.projectConfigId][x.sectionId]
        if isinstance(code, ProjectPythonCode):
            return await code.code_area_completion(x.fullText, x.position)
        return []

    @enqueue_method
    async def gen_code_prefix_completion(self, x: GenCodePrefixCompletionRequest):
        print("*************gen_code_prefix_autocomplete\n\n\n", flush=True)
        return await self.gen_code[x.projectConfigId].gen_code_prefix_completion(
            x.fullText, x.position
        )

    @enqueue_method
    async def gen_code_suffix_completion(self, x: GenCodeSuffixCompletionRequest):
        print("*************gen_code_suffix_autocomplete\n\n\n", flush=True)
        return await self.gen_code[x.projectConfigId].gen_code_suffix_completion(
            x.fullText, x.position
        )

    @enqueue_method
    async def set_gen_code_prefix(self, projectConfigId: str, value: str):
        print("*************set_gen_code_prefix\n\n\n", flush=True)
        self.add_new_history_entry()
        project_state = self.get_single_config_state(projectConfigId)
        project_state.projectConfig.genCodePrefix = value
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_param_values(
        self, projectConfigId: str, sectionId: str, paramIdsToValues: dict[str, str]
    ):
        print("*************set_param_values\n\n\n", flush=True)
        self.add_new_history_entry()
        project_state = self.get_single_config_state(projectConfigId)
        for paramInfoId, value in paramIdsToValues.items():
            set_param_entered_value(
                project_state,
                sectionId,
                paramInfoId,
                value,
            )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def get_gen_python_code_path(self, projectConfigId: str):
        if self.gen_code.get(projectConfigId):
            return self.gen_code[projectConfigId].get_gen_python_code_path()
        return None

    @enqueue_method
    async def get_gen_python_code(self, projectConfigId: str):
        if self.gen_code.get(projectConfigId):
            return self.gen_code[projectConfigId].code
        return ""

    @enqueue_method
    async def change_param_impl(self, x: ChangeParamImplRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        change_param_impl(
            self.settings_file.settings,
            project_state,
            x.sectionId,
            x.paramInfoId,
            x.selectedId,
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def create_top_level_section(self, x: CreateTopLevelSectionRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        sectionId = create_top_level_section(
            self.settings_file.settings,
            project_state,
            x.implType,
            x.position,
            x.implOverrides,
        )
        await self.update_and_broadcast_project_state(project_state)
        return sectionId

    @enqueue_method
    async def create_child_sections(self, x: CreateChildSectionsRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        create_child_sections(
            self.settings_file.settings,
            project_state,
            x.parentId,
            x.implType,
            x.numChildren,
            x.startIdx,
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def create_child_sections_via_incrementer(
        self, x: CreateChildSectionsViaIncrementerRequest
    ):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        create_child_sections_via_incrementer(
            self.settings_file.settings,
            project_state,
            x.calledBy,
            x.implType,
            x.numChildren,
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def create_temporary_terminal(self, projectConfigId: str, terminalId: str):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(projectConfigId)
        create_top_level_section(
            self.settings_file.settings,
            project_state,
            SectionType.Terminal,
            Position(),
            core_overrides={"id": terminalId},
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def delete_sections(self, x: DeleteSectionsRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        delete_sections(project_state, x.sectionIds)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def delete_child_sections_via_decrementer(
        self, x: DeleteChildSectionsViaDecrementerRequest
    ):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        delete_child_sections_via_decrementer(project_state, x.calledBy, x.numChildren)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def update_param_impl_config(self, x: UpdateParamImplConfigRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        update_param_impl_config(project_state, x.sectionId, x.paramInfoId, x.newConfig)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def create_new_section_variant(self, x: CreateNewSectionVariantRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        create_new_section_variant(project_state, x.sectionId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def add_kwarg(self, x: AddKwargRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        add_kwarg(self.settings_file.settings, project_state, x.sectionId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def delete_kwarg(self, x: DeleteKwargRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        delete_kwarg(project_state, x.sectionId)
        await self.update_and_broadcast_project_state(project_state)

    def add_to_used_files(self, code_obj: Code):
        if code_obj.temp_file:
            self.used_files.add(code_obj.temp_file.resolve())

    def delete_unused_files(self, project_temp_folder: Path):
        # Get all files in the project temp folder and delete unused ones
        if project_temp_folder.exists():
            for file_path in project_temp_folder.glob("**/*"):
                if file_path.is_file() and file_path.resolve() not in self.used_files:
                    try:
                        file_path.unlink()
                        print(f"Deleted unused file: {file_path}")
                    except Exception as e:
                        print(f"Error deleting file {file_path}: {e}")

    def create_project_code(
        self,
        project_temp_folder: Path,
        project_state: ProjectStateSingleConfig,
        sectionId: str,
        section_impl: CodeSectionImpl,
    ):
        codeLanguage = section_impl.codeLanguage
        if codeLanguage == CodeLanguage.python:
            return ProjectPythonCode(
                project_temp_folder,
                self.lsp_writers,
                self.websocket_msg_handler,
                project_state,
                sectionId,
            )
        elif codeLanguage == CodeLanguage.bash:
            return ProjectBashCode(project_temp_folder, project_state, sectionId)
        return None

    async def maybe_do_rename_refactor(
        self,
        messageId: str | None,
        requestRenameRefactor: bool,
        projectConfigId: str,
        new_dep_graph: DependencyGraph,
    ):
        if not requestRenameRefactor or not self.gen_code:
            return

        renameRefactorMode = self.settings_file.settings.backend.renameRefactorMode
        if renameRefactorMode == RenameRefactorMode.NEVER_RENAME:
            return

        old_dep_graph = self.gen_code[projectConfigId].dep_graph
        if renameRefactorMode == RenameRefactorMode.ALWAYS_ASK:
            # we operate on a copy in this case, because we don't want to
            # immediately apply any of the renaming operations
            new_dep_graph = copy.deepcopy(new_dep_graph)

        changed_node_values = new_dep_graph.rename_references(old_dep_graph)

        # messageId can be None when update() is called from backend
        if len(changed_node_values) > 0 and messageId:
            # convert to a list of dicts, where each dict has keys "sectionId", "paramInfoId", "value"
            changed_node_values = [
                {**new_dep_graph.extract_ids_from_graph_key(k), "value": v}
                for k, v in changed_node_values.items()
            ]

            await self.websocket_msg_handler.return_rename_refactor_results(
                changed_node_values,
                messageId,
            )

    def delete_temp_folder(self):
        shutil.rmtree(self.temp_folder)

    def get_project_metadata(self):
        defaultProjectConfigId = self.project_state_backend.defaultProjectConfigId
        projectMetadata = list(self.project_state_backend.projectConfigs.values())
        return ProjectMetadata(
            defaultProjectConfigId=defaultProjectConfigId,
            projectMetadata=projectMetadata,
        )

    @enqueue_method
    async def create_project_config(self, previewImgColor: str):
        new_project_config = ProjectConfig(previewImgColor=previewImgColor)
        project_config_id = new_project_config.id
        self.project_state_backend.projectConfigs[project_config_id] = (
            new_project_config
        )
        self.project_state_backend.validate_default_project_id()
        return new_project_config.name

    @enqueue_method
    async def delete_project_configs(self, project_config_ids: list[str]):
        for id in project_config_ids:
            del self.project_state_backend.projectConfigs[id]
        self.project_state_backend.validate_default_project_id()

    @enqueue_method
    async def set_as_default_project(self, projectConfigId: str):
        self.project_state_backend.defaultProjectConfigId = projectConfigId

    @enqueue_method
    async def set_project_config_name(self, projectConfigId: str, newName: str):
        set_project_config_name(self.project_state_backend, projectConfigId, newName)

    @enqueue_method
    async def create_sections(
        self, projectConfigId: str, sections: list[SimplifiedSectionCreation]
    ):
        project_state = self.get_single_config_state(projectConfigId)
        create_sections(project_state, sections)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def delete_section_variant_or_ask(self, x: DeleteSectionVariantRequestOrAsk):
        project_state = self.get_single_config_state(x.projectConfigId)
        filepath_to_delete = delete_section_variant_or_ask(
            project_state, x.sectionId, x.variantId
        )
        if filepath_to_delete:
            return str(filepath_to_delete)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def toggle_variant_json_source(self, x: ToggleVariantJSONSourceRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        toggle_variant_json_source(project_state, x.sectionId, x.variantId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def delete_json_source_file_and_variant(
        self, x: DeleteJSONSourceFileAndVariantRequest
    ):
        project_state = self.get_single_config_state(x.projectConfigId)
        success = False
        notification = None
        try:
            Path(x.filepath).unlink()
            success = True
        except FileNotFoundError:
            notification = SettaNotification(
                message=f"File '{x.filepath}' not found",
                type=SettaNotificationType.error,
            )
        except OSError as e:
            notification = SettaNotification(
                message=f"Failed to delete file: {str(e)}",
                type=SettaNotificationType.error,
            )
        if success:
            delete_section_variant(project_state, x.sectionId, x.variantId)
            await self.update_and_broadcast_project_state(project_state)
            notification = SettaNotification(
                message="Variant and file deleted",
                type=SettaNotificationType.info,
            )
        if notification:
            await self.websocket_msg_handler.broadcast_notification(notification)

    @enqueue_method
    async def set_text_block_text(self, x: SetTextBlockTextRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_text_block_text(project_state, x.sectionId, x.text)
        await self.update_and_broadcast_project_state(project_state)

    def get_default_project_config_name(self):
        if self.project_state_backend.defaultProjectConfigId:
            defaultId = self.project_state_backend.defaultProjectConfigId
            return self.project_state_backend.projectConfigs[defaultId].name
        return None

    def get_single_config_state(self, projectConfigId: str):
        return convert_backend_to_single_config(
            self.project_state_backend, projectConfigId
        )

    def get_new_project_state_backend(self, x: ProjectStateSingleConfig):
        return merge_single_config_into_backend(self.project_state_backend, x)

    async def update_and_broadcast_project_state(
        self, project_state: ProjectStateSingleConfig, updateFileWatcher: bool = True
    ):
        await self.update(project_state, updateFileWatcher=updateFileWatcher)
        await self.websocket_msg_handler.broadcast_project_state(
            project_state, self.modCount
        )

    @property
    def project_state_backend(self):
        return self.history.get_current()

    @project_state_backend.setter
    def project_state_backend(self, x: ProjectStateBackend):
        self.history.set_current(x)

    def add_new_history_entry(self, trigger_autosave=True):
        self.history.add_current_copy()
        if trigger_autosave:
            self.autosave_debouncer.trigger()

    @enqueue_method
    async def undo(self, x: UndoRequest):
        self.history.undo(x.steps)
        await self.update_and_broadcast_all_project_state()

    @enqueue_method
    async def redo(self, x: RedoRequest):
        self.history.redo(x.steps)
        await self.update_and_broadcast_all_project_state()

    async def update_and_broadcast_all_project_state(self):
        for projectConfigId in self.project_state_backend.projectConfigs.keys():
            await self.update_and_broadcast_project_state(
                convert_backend_to_single_config(
                    self.project_state_backend, projectConfigId
                )
            )

    @enqueue_method
    async def get_latest_project_state(self, x: GetLatestProjectStateRequest):
        projectState = convert_backend_to_single_config(
            self.project_state_backend, x.projectConfigId
        )
        return ProjectStateSingleConfigWithModCount(
            projectState=projectState, modCount=self.modCount
        )

    @enqueue_method
    async def autosave(self):
        try:
            self.save()
            notification = SettaNotification(
                message="Autosaved!", type=SettaNotificationType.save
            )
        except:
            notification = SettaNotification(
                message="Failed to autosave",
                type=SettaNotificationType.error,
            )
        await self.websocket_msg_handler.broadcast_notification(notification)

    @abstractmethod
    def save(self):
        pass

    def maybe_watch_json_source_files(self, projectState: ProjectStateSingleConfig):
        filename_set = get_json_source_files_to_watch(projectState)
        callbacks = {
            Path(k).resolve(): [self.get_json_source_file_watcher_callback()]
            for k in filename_set
        }
        self.specific_file_watcher.update_callbacks(callbacks, fire_immediately=False)

    def get_json_source_file_watcher_callback(self) -> FileWatcherCallback:
        async def fn(coreUpdate: FileWatcherCoreUpdate):
            variantsToLoad = get_variants_for_json_source_update(
                self.project_state_backend, coreUpdate
            )
            if len(variantsToLoad) > 0:
                await self.load_json_sources(variantsToLoad)
                notification = SettaNotification(
                    message=f"{coreUpdate.relPath} {coreUpdate.eventType.value}",
                )
                await self.websocket_msg_handler.broadcast_notification(notification)

        return fn


# function apiKeysFilepathSubscriptionFn(state: ZustandAIStore) {
#   return [state.apiKeysFilepath];
# }

#   useAIStore.subscribe(
#     apiKeysFilepathSubscriptionFn,
#     (filepaths) =>
#       route_file_watch_list({
#         filepaths,
#         fileWatchGroupName: FileWatchGroupNameEnum.apiKeys,
#       }),
#     {
#       equalityFn: _.isEqual,
#       fireImmediately: true,
#     },
#   );


# async function apiKeyUpdateHandler(updatedFileInfo: FileWatcherUpdateAPIKeys) {
#   const { fileContent } = updatedFileInfo;
#   useAIStore.setState({
#     apiKeys: fileContent,
#     apiKeysInitialLoadComplete: true,
#   });
# }
