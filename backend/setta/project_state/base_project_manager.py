import asyncio
import contextvars
import copy
import shutil
import logging
import traceback
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Coroutine, Iterable

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import (
    SpecificFileWatcher,
)
from setta.lsp.managers import LSPWriters
from setta.project_state.artifacts import Artifacts
from setta.project_state.code import Code
from setta.project_state.history import History
from setta.project_state.jsonSource.jsonSource import (
    JSONSource,
    ProcessedJSONInfo,
)
from setta.project_state.jsonSource.load import load_json_sources_into_data_structures
from setta.project_state.project_code import (
    ProjectBashCode,
    ProjectGenPythonCode,
    ProjectPythonCode,
)
from setta.project_state.project_manager_types import (
    AddKwargRequest,
    AppendDrawAreaLayerItemRequest,
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
    DeleteSectionVariantOrAskRequest,
    GenCodePrefixCompletionRequest,
    GenCodeSuffixCompletionRequest,
    GetLatestProjectStateRequest,
    GroupSectionsRequest,
    PasteSectionsRequest,
    PrepareSectionsForCopyRequest,
    RedoRequest,
    SaveAsExistingProjectConfigRequest,
    SaveAsNewProjectConfigRequest,
    SetActiveIdsRequest,
    SetBrowserAreaViewModeRequest,
    SetBrowserHideColumnRequest,
    SetCallableHideParamsRequest,
    SetCallableRequest,
    SetChartAreaDataPathRequest,
    SetChartSettingsRequest,
    SetChartTypeRequest,
    SetCodeObjNameRequest,
    SetCodeRequest,
    SetDefaultSectionVariantRequest,
    SetGenCodePrefixRequest,
    SetGenCodeSuffixRequest,
    SetImageAreaImagePathRequest,
    SetParamEnteredValueRequest,
    SetSectionHideUnpinnedParamsRequest,
    SetSectionNameRequest,
    SetSectionParamFilterRequest,
    SetSectionSizesRequest,
    SetSectionVariantNameRequest,
    SetSectionVariantRequest,
    SetSectionWithParamsDisplayModeRequest,
    SetSocialUrlRequest,
    SetTextBlockDisplayModeRequest,
    SetTextBlockFormatRequest,
    SetTextBlockTextRequest,
    SetTopLevelSectionLayoutRequest,
    SetViewportRequest,
    TextFieldCompletionRequest,
    ToggleMinimizedRequest,
    ToggleParamSelectedRequest,
    TogglePositionLockRequest,
    ToggleVariantFrozenRequest,
    ToggleVariantJSONSourceRequest,
    UndoRequest,
    UngroupGroupsRequest,
    UnselectAllParamsRequest,
    UpdateParamImplConfigRequest,
)
from setta.project_state.utils import create_timestamped_folder
from setta.types.clipboard import (
    ProjectStateCoreWithSectionVariantMap,
    SectionsClipboardData,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.helpers_lvl2 import (
    add_kwarg,
    append_draw_area_layer_item,
    change_param_impl,
    create_child_sections,
    create_child_sections_via_incrementer,
    create_new_section_variant,
    create_top_level_section,
    delete_child_sections_via_decrementer,
    delete_kwarg,
    delete_section_variant,
    delete_section_variant_or_ask,
    delete_sections,
    group_sections,
    maybe_update_gen_python_code_section,
    set_browser_area_view_mode,
    set_browser_hide_column,
    set_callable_hide_params,
    set_chart_area_data_path,
    set_chart_settings,
    set_chart_type,
    set_code,
    set_default_section_variant,
    set_image_area_image_path,
    set_param_entered_value,
    set_project_config_name,
    set_section_hide_unpinned_params,
    set_section_name,
    set_section_param_filter,
    set_section_sizes,
    set_section_variant,
    set_section_variant_name,
    set_section_with_params_display_mode,
    set_social_url,
    set_text_block_display_mode,
    set_text_block_format,
    set_text_block_text,
    toggle_minimized,
    toggle_param_selected,
    toggle_position_lock,
    toggle_variant_frozen,
    toggle_variant_json_source,
    ungroup_groups,
    unselect_all_params,
    update_param_impl_config,
)
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
    paste_sections,
    prepare_sections_for_copy,
)
from setta.types.generated.effective_impls import get_effective_impl
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.project_config import ProjectConfig
from setta.types.project_state import (
    ProjectStateBackend,
    ProjectStateSingleConfig,
)
from setta.types.section_impls import BaseDictSectionImpl, CodeLanguage, CodeSectionImpl, SectionType
from setta.types.settings_state import RenameRefactorMode
from setta.types.simplified_states import Position
from setta.utils.async_debouncer import AsyncDebouncer
from setta.utils.constants import C
from setta.utils.utils import normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)


class BaseProjectManager(ABC):
    def __init__(
        self,
        lsp_writers: LSPWriters,
        websocket_msg_handler: WMHFrontendSender,
        settings_file: SettingsFile,
        specific_file_watcher: SpecificFileWatcher,
        dbe: DBE,
        artifacts: Artifacts,
        json_source: JSONSource,
    ):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.settings_file = settings_file
        self.specific_file_watcher = specific_file_watcher
        self.dbe = dbe
        self.artifacts = artifacts
        self.json_source = json_source
        self.temp_folder = normalize_path(C.CODE_FOLDER) / "temp_folder"
        self.temp_folder.mkdir(parents=True, exist_ok=True)
        self.history = History(self.load_initial_state())
        updated_paths = self.json_source.sync_from_backend(
            self.project_state_backend, treat_new_entries_as_clean=True
        )
        section_variants = self.json_source.get_section_variants_for_paths(
            self.project_state_backend, updated_paths
        )
        self._apply_json_sources_to_backend(section_variants)
        self._pending_json_source_section_variants: set[tuple[str, str]] = set()
        self.gen_code: dict[str, ProjectGenPythonCode] = {}
        self.code_dict: dict[str, dict[str, ProjectPythonCode | ProjectBashCode]] = {}
        self.used_files: set[Path] = set()
        self.message_queue: asyncio.Queue[
            tuple[Coroutine, asyncio.Future, str | None]
        ] = asyncio.Queue()
        # Dict doubles as ordered set so pending op ids keep enqueue order when broadcast
        self.pending_frontend_ops: dict[str, None] = {}
        self._current_frontend_op_id: contextvars.ContextVar[str | None] = (
            contextvars.ContextVar("current_frontend_op_id", default=None)
        )
        print("[DEBUG] Creating queue task in ProjectStateUpdater.__init__", flush=True)
        self._process_queue_task_started = asyncio.Event()
        self.queue_task = asyncio.create_task(self._process_queue())
        print(f"[DEBUG] Queue task created with id: {id(self.queue_task)}", flush=True)
        self.autosave_debouncer = AsyncDebouncer(self.autosave, wait=2.0)
        self.completed_op_ids_since_last_broadcast: list[str] = []
        self.watch_json_source_files()
        self.watch_artifact_files()

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
            coroutine, future, frontend_op_id = await self.message_queue.get()
            token = self._current_frontend_op_id.set(frontend_op_id)
            try:
                # Execute the actual implementation
                print(f"[DEBUG] Starting handler {coroutine.__name__}", flush=True)
                result = await coroutine
                print(f"[DEBUG] Completed handler {coroutine.__name__}", flush=True)
                self._finalize_frontend_op(frontend_op_id, success=True)
                # Set the result for the waiting call
                print(
                    f"[DEBUG] Setting result on future (cancelled={future.cancelled()})",
                    flush=True,
                )
                future.set_result(result)
            except Exception as e:
                # Propagate any exceptions back to the caller
                print(f"[DEBUG] Error in handler {coroutine.__name__}: {e}", flush=True)
                self._finalize_frontend_op(frontend_op_id, success=False)
                future.set_exception(e)
            finally:
                # Mark the task as done
                print("[DEBUG] Marking queue task as done", flush=True)
                self.message_queue.task_done()
                self._current_frontend_op_id.reset(token)

    async def _enqueue(self, coroutine: Coroutine, frontend_op_id: str | None = None):
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
        if frontend_op_id:
            self.pending_frontend_ops[frontend_op_id] = None
        await self.message_queue.put((coroutine, future, frontend_op_id))
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
            frontend_op_id = self._extract_frontend_op_id(args, kwargs)
            return await self._enqueue(
                func(self, *args, **kwargs), frontend_op_id=frontend_op_id
            )

        return wrapper

    @staticmethod
    def _extract_frontend_op_id(args, kwargs) -> str | None:
        for arg in args:
            frontend_op_id = getattr(arg, "frontendOpId", None)
            if frontend_op_id:
                return frontend_op_id
        for value in kwargs.values():
            frontend_op_id = getattr(value, "frontendOpId", None)
            if frontend_op_id:
                return frontend_op_id
        return None

    def _finalize_frontend_op(self, frontend_op_id: str | None, success: bool):
        # Runs after handler finishes; drop from pending and mark completed only on success
        if not frontend_op_id:
            return
        if frontend_op_id in self.pending_frontend_ops:
            self.pending_frontend_ops.pop(frontend_op_id, None)
            if success:
                self.completed_op_ids_since_last_broadcast.append(frontend_op_id)

    def _mark_current_frontend_op_completed_before_broadcast(self):
        # Mid-handler hook so the broadcast payload includes the already-completed op id
        frontend_op_id = self._current_frontend_op_id.get()
        if frontend_op_id and frontend_op_id in self.pending_frontend_ops:
            self.pending_frontend_ops.pop(frontend_op_id, None)
            self.completed_op_ids_since_last_broadcast.append(frontend_op_id)

    @enqueue_method
    async def create_run_command(
        self,
        projectConfigId: str,
        sectionId: str | None,
    ):
        target_folder = create_timestamped_folder(C.CODE_FOLDER)
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
    async def load_project_config(self, projectConfigId: str):
        projectState = convert_backend_to_single_config(
            self.project_state_backend, projectConfigId
        )
        return await self.maybe_init_project_config(projectState)

    async def maybe_init_project_config(self, projectState: ProjectStateSingleConfig):
        if projectState.projectConfig.id not in self.gen_code:
            await self.update(projectState)
        return projectState

    @enqueue_method
    async def set_top_level_section_layout(self, x: SetTopLevelSectionLayoutRequest):
        self.project_state_backend.projectConfigs[
            x.projectConfigId
        ].topLevelSections = x.topLevelSections

    @enqueue_method
    async def set_section_sizes(self, x: SetSectionSizesRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_sizes(project_state, x.sectionSizes)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def load_json_sources(
        self,
        json_sources: dict[Path, ProcessedJSONInfo],
        section_variants_to_load: Iterable[tuple[str, str]],
    ):
        p = self.project_state_backend
        load_json_sources_into_data_structures(
            p,
            json_sources,
            section_variants_to_load,
        )

        for configId in p.projectConfigs.keys():
            singleConfig = convert_backend_to_single_config(p, configId)
            # Don't update file watcher here because otherwise it'll be an infinite loop
            await self.update_and_broadcast_project_state(
                singleConfig, updateFileWatcher=False
            )

    async def update(
        self,
        projectState: ProjectStateSingleConfig,
        messageId: str | None = None,
        updateFileWatcher=True,
    ):
        projectState.validate_singleton_sections()
        projectState.validate_parent_section_map()
        projectState.validate_shown_param_ids()
        projectState.validate_yaml_values()
        projectState.validate_required_decoded_images()
        self.used_files = set()
        dep_graph = DependencyGraph(projectState)
        projectConfig = projectState.projectConfig
        projectConfigId = projectConfig.id
        if self.gen_code.get(projectConfigId):
            await self.maybe_do_rename_refactor(messageId, projectConfigId, dep_graph)
            self.gen_code[projectConfigId].callback_cleanup()

        code_generator = PythonCodeGenerator(
            dep_graph, projectConfig.genCodePrefix, projectConfig.genCodeSuffix
        )
        code_generator.generate_code()

        projectConfigName = projectConfig.name
        project_temp_folder = self.temp_folder / projectConfigName
        new_gen_code = ProjectGenPythonCode(
            self.dbe,
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
            section_impl = get_curr_effective_section_impl(projectState, sectionId)
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
        self.project_state_backend = self.get_new_project_state_backend(projectState)
        if self._pending_json_source_section_variants:
            section_variants = set(self._pending_json_source_section_variants)
            self._pending_json_source_section_variants.clear()
            self._apply_json_sources_to_backend(
                None if not section_variants else section_variants
            )
        else:
            updated_paths = self.json_source.sync_from_backend(self.project_state_backend)
            section_variants = self.json_source.get_section_variants_for_paths(
                self.project_state_backend, updated_paths
            )
            self._apply_json_sources_to_backend(section_variants)
        if updateFileWatcher:
            self.watch_json_source_files()
            self.watch_artifact_files()

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
    async def set_gen_code_prefix(self, x: SetGenCodePrefixRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        project_state.projectConfig.genCodePrefix = x.genCodePrefix
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_gen_code_suffix(self, x: SetGenCodeSuffixRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        project_state.projectConfig.genCodeSuffix = x.genCodeSuffix
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_param_entered_value(self, x: SetParamEnteredValueRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        set_param_entered_value(
            project_state,
            x.sectionId,
            x.paramInfoId,
            x.value,
        )
        self._record_json_source_updates(project_state, [x.sectionId])
        logger.critical(
            "BaseProjectManager.set_param_entered_value manager=%s project_config_id=%s "
            "section_id=%s param_info_id=%s value=%s grid_pattern=%s pending_ops=%s",
            self.__class__.__name__,
            x.projectConfigId,
            x.sectionId,
            x.paramInfoId,
            x.value,
            self._extract_grid_pattern_value(project_state),
            list(self.pending_frontend_ops.keys()),
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_code_obj_name(self, x: SetCodeObjNameRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        project_state.codeObjs[x.codeObjId].name = x.name
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def toggle_position_lock(self, x: TogglePositionLockRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        toggle_position_lock(project_state, x.sectionId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def toggle_minimized(self, x: ToggleMinimizedRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        toggle_minimized(project_state, x.sectionId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_code(self, x: SetCodeRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_code(project_state, x.sectionId, x.code)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_section_param_filter(self, x: SetSectionParamFilterRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_param_filter(project_state, x.sectionId, x.value)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_section_variant(self, x: SetSectionVariantRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_variant(project_state, x.sectionId, x.variantId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_default_section_variant(self, x: SetDefaultSectionVariantRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_default_section_variant(project_state, x.sectionId, x.variantId)
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
        self._record_json_source_updates(project_state, [sectionId])
        await self.update_and_broadcast_project_state(project_state)

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
            self.used_files.add(normalize_path(code_obj.temp_file))

    def delete_unused_files(self, project_temp_folder: Path):
        # Get all files in the project temp folder and delete unused ones
        if project_temp_folder.exists():
            for file_path in project_temp_folder.glob("**/*"):
                if (
                    file_path.is_file()
                    and normalize_path(file_path) not in self.used_files
                ):
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
                self.dbe,
                project_temp_folder,
                self.lsp_writers,
                self.websocket_msg_handler,
                project_state,
                sectionId,
            )
        elif codeLanguage == CodeLanguage.bash:
            return ProjectBashCode(
                self.dbe, project_temp_folder, project_state, sectionId
            )
        return None

    async def maybe_do_rename_refactor(
        self,
        messageId: str | None,
        projectConfigId: str,
        new_dep_graph: DependencyGraph,
    ):
        if not self.gen_code:
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

    @enqueue_method
    async def create_project_config(self, previewImgColor: str):
        new_project_config = ProjectConfig(previewImgColor=previewImgColor)
        project_config_id = new_project_config.id
        self.project_state_backend.projectConfigs[project_config_id] = (
            new_project_config
        )
        self.project_state_backend.validate_default_project_id()
        await self.broadcast_all_project_metadata()
        return new_project_config.name

    @enqueue_method
    async def delete_project_configs(self, project_config_ids: list[str]):
        for id in project_config_ids:
            del self.project_state_backend.projectConfigs[id]
        self.project_state_backend.validate_default_project_id()
        await self.broadcast_all_project_metadata()

    @enqueue_method
    async def set_as_default_project(self, projectConfigId: str):
        self.project_state_backend.defaultProjectConfigId = projectConfigId
        await self.broadcast_all_project_metadata()

    @enqueue_method
    async def set_project_config_name(self, projectConfigId: str, newName: str):
        set_project_config_name(self.project_state_backend, projectConfigId, newName)

    @enqueue_method
    async def delete_section_variant_or_ask(self, x: DeleteSectionVariantOrAskRequest):
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
    async def toggle_variant_frozen(self, x: ToggleVariantFrozenRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        toggle_variant_frozen(project_state, x.variantId)
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

    @enqueue_method
    async def set_section_variant_name(self, x: SetSectionVariantNameRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_variant_name(project_state, x.variantId, x.name)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_active_ids(self, x: SetActiveIdsRequest):
        self.project_state_backend.projectConfigs[
            x.projectConfigId
        ].activeIds = x.activeIds

    @enqueue_method
    async def set_viewport(self, x: SetViewportRequest):
        self.project_state_backend.projectConfigs[
            x.projectConfigId
        ].viewport = x.viewport

    @enqueue_method
    async def set_section_name(self, x: SetSectionNameRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_name(project_state, x.sectionId, x.name)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_text_block_display_mode(self, x: SetTextBlockDisplayModeRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_text_block_display_mode(project_state, x.sectionId, x.displayMode)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_section_with_params_display_mode(
        self, x: SetSectionWithParamsDisplayModeRequest
    ):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_with_params_display_mode(project_state, x.sectionId, x.displayMode)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_callable_hide_params(self, x: SetCallableHideParamsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_callable_hide_params(project_state, x.sectionId, x.hideParams)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_section_hide_unpinned_params(
        self, x: SetSectionHideUnpinnedParamsRequest
    ):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_hide_unpinned_params(
            project_state, x.sectionId, x.hideUnpinnedParams
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_browser_area_view_mode(self, x: SetBrowserAreaViewModeRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_browser_area_view_mode(project_state, x.sectionId, x.viewMode)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_browser_hide_column(self, x: SetBrowserHideColumnRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_browser_hide_column(project_state, x.sectionId, x.hideColumn)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_text_block_format(self, x: SetTextBlockFormatRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_text_block_format(project_state, x.sectionId, x.format)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_social_url(self, x: SetSocialUrlRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_social_url(project_state, x.sectionId, x.url)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def append_draw_area_layer_item(self, x: AppendDrawAreaLayerItemRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        append_draw_area_layer_item(project_state, x.sectionId, x.layerIdx, x.element)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_image_area_image_path(self, x: SetImageAreaImagePathRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_image_area_image_path(project_state, x.sectionId, x.imagePath)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_chart_area_data_path(self, x: SetChartAreaDataPathRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_chart_area_data_path(project_state, x.sectionId, x.dataPath)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_chart_type(self, x: SetChartTypeRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_chart_type(project_state, x.sectionId, x.chartType)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_chart_settings(self, x: SetChartSettingsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_chart_settings(
            project_state, x.sectionId, x.chartSettings, x.changedSettings
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def group_sections(self, x: GroupSectionsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        success = group_sections(
            self.settings_file.settings, project_state, x.sectionIds
        )
        if not success:
            notification = SettaNotification(
                projectConfigId=x.projectConfigId,
                message="Cannot group sections from different parents",
                type=SettaNotificationType.error,
            )
            await self.websocket_msg_handler.broadcast_notification(notification)
        else:
            await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def ungroup_groups(self, x: UngroupGroupsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        ungroup_groups(project_state, x.groupIds)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def toggle_param_selected(self, x: ToggleParamSelectedRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        toggle_param_selected(project_state, x.sectionId, x.paramInfoId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def unselect_all_params(self, x: UnselectAllParamsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        unselect_all_params(project_state)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def prepare_sections_for_copy(self, x: PrepareSectionsForCopyRequest):
        p = self.get_single_config_state(x.projectConfigId)
        sectionIds = set(x.sectionIds)
        core = prepare_sections_for_copy(p, sectionIds)
        sectionVariantMap = {
            k: v
            for k, v in p.projectConfig.sectionVariantMap.items()
            if k in sectionIds
        }
        return SectionsClipboardData(
            data=ProjectStateCoreWithSectionVariantMap(
                core=core, sectionVariantMap=sectionVariantMap
            )
        )

    @enqueue_method
    async def paste_sections(self, x: PasteSectionsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        print("\n\n\npaste_sections")
        paste_sections(project_state, x.data, x.position, x.asRef)
        await self.update_and_broadcast_project_state(project_state)

    def _extract_grid_pattern_value(
        self, project_state: ProjectStateSingleConfig
    ) -> str | None:
        for core in project_state.codeObjs.values():
            if core.name != "gridPattern":
                continue
            variant_id = core.defaultVariant or (
                core.variants[0] if core.variants else None
            )
            if not variant_id:
                return None
            variant = project_state.codeObjVariants.get(variant_id)
            if not variant:
                return None
            impl = project_state.codeObjImpls.get(variant.impl)
            if not impl:
                return None
            effective = get_effective_impl(impl, core, variant)
            return getattr(effective, "value", None)
        return None

    def _get_active_section_variant_id(
        self, project_state: ProjectStateSingleConfig, section_id: str
    ) -> str | None:
        variant_id = project_state.projectConfig.sectionVariantMap.get(section_id)
        if variant_id:
            return variant_id

        section = project_state.sections.get(section_id)
        if not section:
            return None
        if section.defaultVariant:
            return section.defaultVariant
        return section.variants[0] if section.variants else None

    def _record_json_source_updates(
        self, project_state: ProjectStateSingleConfig, section_ids: Iterable[str]
    ) -> None:
        dirty_variants: set[tuple[str, str]] = set()
        for section_id in section_ids:
            impl = get_curr_effective_section_impl(project_state, section_id)
            if not isinstance(impl, BaseDictSectionImpl) or not impl.isJsonSource:
                continue
            variant_id = self._get_active_section_variant_id(project_state, section_id)
            if not variant_id:
                continue
            dirty_variants.add((section_id, variant_id))

        if not dirty_variants:
            return

        self.json_source.update_from_project_state(project_state, dirty_variants)
        self._pending_json_source_section_variants.update(dirty_variants)

    def _apply_json_sources_to_backend(
        self,
        section_variant_ids: Iterable[tuple[str, str]] | None,
    ) -> None:
        if section_variant_ids is None:
            target_variants = {
                (section_id, variant_id)
                for config in self.project_state_backend.projectConfigs.values()
                for section_id, variant_id in config.sectionVariantMap.items()
                if variant_id
            }
            logger.critical(
                "BaseProjectManager._apply_json_sources_to_backend computed target_variants from backend count=%d",
                len(target_variants),
            )
        else:
            target_variants = set(section_variant_ids)
            logger.critical(
                "BaseProjectManager._apply_json_sources_to_backend using provided section_variant_ids count=%d",
                len(target_variants),
            )

        if not target_variants:
            logger.critical(
                "BaseProjectManager._apply_json_sources_to_backend no target variants; skipping update"
            )
            return

        load_json_sources_into_data_structures(
            self.project_state_backend,
            self.json_source.get_processed_json_sources(),
            target_variants,
        )
        default_id = self.project_state_backend.defaultProjectConfigId
        grid_pattern = None
        if default_id:
            try:
                single_config = convert_backend_to_single_config(
                    self.project_state_backend, default_id
                )
                grid_pattern = self._extract_grid_pattern_value(single_config)
            except Exception as exc:  # pragma: no cover - diagnostic path
                grid_pattern = f"<error extracting grid pattern: {exc}>"
        logger.critical(
            "BaseProjectManager._apply_json_sources_to_backend manager=%s section_variant_count=%d grid_pattern=%s",
            self.__class__.__name__,
            len(target_variants),
            grid_pattern,
        )

    def get_default_project_config_name(self):
        if self.project_state_backend.defaultProjectConfigId:
            defaultId = self.project_state_backend.defaultProjectConfigId
            return self.project_state_backend.projectConfigs[defaultId].name
        return None

    def get_single_config_state(self, projectConfigId: str):
        cache_size = len(self.json_source.json_sources)
        logger.critical(
            "BaseProjectManager.get_single_config_state manager=%s project_config_id=%s json_cache_entries=%d pending_dirty_variants=%d",
            self.__class__.__name__,
            projectConfigId,
            cache_size,
            len(self._pending_json_source_section_variants),
        )
        if cache_size > 0:
            self._apply_json_sources_to_backend(None)
        else:
            logger.critical(
                "BaseProjectManager.get_single_config_state skipping apply; json cache empty"
            )
        result = convert_backend_to_single_config(
            self.project_state_backend, projectConfigId
        )
        logger.critical(
            "BaseProjectManager.get_single_config_state result_grid_pattern=%s",
            self._extract_grid_pattern_value(result),
        )
        return result

    def get_new_project_state_backend(self, x: ProjectStateSingleConfig):
        return merge_single_config_into_backend(self.project_state_backend, x)

    async def update_and_broadcast_project_state(
        self, project_state: ProjectStateSingleConfig, updateFileWatcher: bool = True
    ):
        await self.update(project_state, updateFileWatcher=updateFileWatcher)
        self._mark_current_frontend_op_completed_before_broadcast()
        completed_op_ids = list(self.completed_op_ids_since_last_broadcast)
        pending_op_ids = list(self.pending_frontend_ops.keys())
        grid_pattern = self._extract_grid_pattern_value(project_state)
        if not completed_op_ids and not pending_op_ids:
            stack_lines = traceback.format_list(traceback.extract_stack(limit=12)[:-1])
            logger.critical(
                "BaseProjectManager.update_and_broadcast_project_state empty_ops "
                "manager=%s project_config_id=%s grid_pattern=%s stack=\n%s",
                self.__class__.__name__,
                project_state.projectConfig.id,
                grid_pattern,
                "".join(stack_lines),
            )
        logger.critical(
            "BaseProjectManager.update_and_broadcast_project_state manager=%s "
            "project_config_id=%s completed_op_ids=%s pending_op_ids=%s grid_pattern=%s",
            self.__class__.__name__,
            project_state.projectConfig.id,
            completed_op_ids,
            pending_op_ids,
            grid_pattern,
        )
        await self.websocket_msg_handler.broadcast_project_state(
            project_state,
            self.completed_op_ids_since_last_broadcast,
            pending_op_ids,
        )
        self.completed_op_ids_since_last_broadcast = []

    def get_all_project_metadata(self):
        defaultProjectConfigId = self.project_state_backend.defaultProjectConfigId
        projectMetadata = list(self.project_state_backend.projectConfigs.values())
        return defaultProjectConfigId, projectMetadata

    async def broadcast_all_project_metadata(self):
        defaultProjectConfigId, projectMetadata = self.get_all_project_metadata()
        await self.websocket_msg_handler.broadcast_all_project_metadata(
            defaultProjectConfigId=defaultProjectConfigId,
            projectMetadata=projectMetadata,
        )

    @property
    def project_state_backend(self):
        return self.history.get_current()

    @project_state_backend.setter
    def project_state_backend(self, x: ProjectStateBackend):
        self.history.set_current(x)

    def project_state_backend_getter_fn(self):
        return self.project_state_backend

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
        return projectState

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

    @abstractmethod
    async def save_as_new_project_config(self, x: SaveAsNewProjectConfigRequest):
        pass

    @abstractmethod
    def save_as_existing_project_config(self, x: SaveAsExistingProjectConfigRequest):
        pass

    def watch_json_source_files(self):
        self.json_source.watch_json_source_files(
            f"{self.__class__.__name__}_JSONSource",
            self.load_json_sources,
            self.project_state_backend_getter_fn,
        )

    def watch_artifact_files(self):
        self.artifacts.watch_artifact_files(
            f"{self.__class__.__name__}_Artifacts", self.project_state_backend
        )


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
