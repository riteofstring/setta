import asyncio
import copy
import shutil
from pathlib import Path
from typing import Coroutine, Union

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.database.db.jsonSource.load import load_json_sources_into_data_structures
from setta.database.db.projects.load import load_project_state
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.lsp.managers import LSPWriters
from setta.project_state.code import Code
from setta.project_state.history import History
from setta.project_state.project_code import (
    ProjectBashCode,
    ProjectGenPythonCode,
    ProjectPythonCode,
)
from setta.project_state.project_manager_types import (
    ChangeParamImplRequest,
    ClearTextFieldCompletionRequest,
    CodeAreaCompletionRequest,
    CreateChildSectionsRequest,
    CreateChildSectionsViaIncrementerRequest,
    CreateNewSectionVersionRequest,
    CreateTopLevelSectionRequest,
    DeleteChildSectionsViaDecrementerRequest,
    DeleteSectionsRequest,
    GenCodePrefixCompletionRequest,
    GenCodeSuffixCompletionRequest,
    GetLatestProjectStateRequest,
    RedoRequest,
    SetCallableRequest,
    TextFieldCompletionRequest,
    UndoRequest,
    UpdateFromFrontendRequest,
    UpdateFromFrontendTopLevelSectionLayout,
    UpdateParamImplConfigRequest,
)
from setta.project_state.save_load import save
from setta.project_state.utils import create_timestamped_folder
from setta.types.helpers import (
    change_param_impl,
    convert_backend_to_single_config,
    create_child_sections,
    create_child_sections_via_incrementer,
    create_new_section_variant,
    create_top_level_section,
    delete_child_sections_via_decrementer,
    delete_sections,
    # create_sections,
    get_curr_effective_section_impl,
    merge_single_config_into_backend,
    set_param_entered_value,
    set_project_config_name,
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
from setta.utils.async_debouncer import AsyncDebouncer
from setta.utils.constants import CODE_FOLDER
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class ProjectManager:
    def __init__(
        self,
        lsp_writers: LSPWriters,
        websocket_msg_handler: WMHFrontendSender,
        settings_file: SettingsFile,
        dbe: DBE,
    ):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.settings_file = settings_file
        self.dbe = dbe
        self.temp_folder = CODE_FOLDER / "temp_folder"
        self.temp_folder.mkdir(parents=True, exist_ok=True)
        with self.dbe.session as db:
            self.history: History[ProjectStateBackend] = History(
                load_project_state(db),
            )
        self.gen_code: dict[str, ProjectGenPythonCode] = {}
        self.code_dict: dict[
            str, dict[str, Union[ProjectPythonCode, ProjectBashCode]]
        ] = {}
        self.used_files: set[Path] = set()
        self.message_queue: asyncio.Queue[tuple[Coroutine, asyncio.Future]] = (
            asyncio.Queue()
        )
        print("[DEBUG] Creating queue task in ProjectStateUpdater.__init__", flush=True)
        self._process_queue_task_started = asyncio.Event()
        self.queue_task = asyncio.create_task(self._process_queue())
        print(f"[DEBUG] Queue task created with id: {id(self.queue_task)}", flush=True)
        self.autosave_debouncer = AsyncDebouncer(self.autosave, wait=2.0)

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
        if projectState.projectConfig.id in self.gen_code:
            return
        await self.update(projectState)

    @enqueue_method
    async def update_from_frontend(
        self, x: UpdateFromFrontendRequest, trigger_autosave=True
    ):
        self.add_new_history_entry(trigger_autosave)
        success = await self.update(
            x.projectState, x.requestRenameRefactor, x.messageId
        )
        await self.websocket_msg_handler.broadcast_project_state(x.projectState)
        return success

    @enqueue_method
    async def update_from_frontend_top_level_section_layout(
        self, x: UpdateFromFrontendTopLevelSectionLayout
    ):
        self.project_state_backend.projectConfigs[
            x.projectConfigId
        ].topLevelSections = x.topLevelSections

    @enqueue_method
    async def load_json_sources(
        self,
        section_variant_ids: list[str] | None = None,
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
            await self.update_and_broadcast_project_state(singleConfig)

    async def update(
        self,
        projectState: ProjectStateSingleConfig,
        requestRenameRefactor: bool = False,
        messageId: str | None = None,
    ):
        if self.project_state_backend.modCount != projectState.modCount:
            print(
                "\n\n\nmodCount mismatch!",
                self.project_state_backend.modCount,
                projectState.modCount,
            )
            return False
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
        self.gen_code[projectConfigId] = ProjectGenPythonCode(
            project_temp_folder,
            self.lsp_writers,
            self.websocket_msg_handler,
            projectConfigId,
            dep_graph,
            code_generator,
        )
        await self.gen_code[projectConfigId].update_file()
        self.add_to_used_files(self.gen_code[projectConfigId])

        if self.code_dict.get(projectConfigId):
            for c in self.code_dict[projectConfigId].values():
                if isinstance(c, ProjectPythonCode):
                    c.callback_cleanup()
        self.code_dict[projectConfigId] = {}

        for sectionId in projectState.sections.keys():
            section_impl = get_curr_effective_section_impl(projectState, sectionId)
            if isinstance(section_impl, CodeSectionImpl):
                section_code = self.create_code_obj(
                    project_temp_folder, projectState, sectionId, section_impl
                )

                if not section_code:
                    continue

                await section_code.update_file()
                self.add_to_used_files(section_code)
                self.code_dict[projectConfigId][sectionId] = section_code

        self.delete_unused_files(project_temp_folder)
        projectState.modCount += 1
        self.project_state_backend = self.get_new_project_state_backend(projectState)
        return True

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
            return self.gen_code[projectConfigId].get_gen_python_code()
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
            self.settings_file.settings, project_state, x.implType, x.position
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
    async def create_new_section_version(self, x: CreateNewSectionVersionRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        create_new_section_variant(project_state, x.sectionId)
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

    def create_code_obj(
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
        self.project_state_backend.ensure_default_project_id()
        return new_project_config.name

    @enqueue_method
    async def delete_project_configs(self, project_config_ids: list[str]):
        for id in project_config_ids:
            del self.project_state_backend.projectConfigs[id]
        self.project_state_backend.ensure_default_project_id()

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
        self, project_state: ProjectStateSingleConfig
    ):
        await self.update(project_state)
        await self.websocket_msg_handler.broadcast_project_state(project_state)

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
        return convert_backend_to_single_config(
            self.project_state_backend, x.projectConfigId
        )

    @enqueue_method
    async def autosave(self):
        try:
            save(self.settings_file.settings, self.dbe, self.project_state_backend)
            notification = SettaNotification(
                message="Autosaved!", type=SettaNotificationType.save, temporary=True
            )
        except:
            notification = SettaNotification(
                message="Failed to autosave",
                type=SettaNotificationType.error,
                temporary=True,
            )
        await self.websocket_msg_handler.broadcast_notification(notification)
