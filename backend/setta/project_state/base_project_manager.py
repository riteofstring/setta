import asyncio
import contextvars
import copy
import logging
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from functools import wraps
from pathlib import Path
from typing import (
    Any,
    Awaitable,
    Callable,
    Concatenate,
    Coroutine,
    Iterable,
    ParamSpec,
    TypeVar,
    cast,
    overload,
)

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import (
    SpecificFileWatcher,
)
from setta.lsp.managers import LSPWriters
from setta.project_state.artifacts import Artifacts
from setta.project_state.code_file_sync import (
    BindingOwner,
    CodeFileSyncEvent,
    CodeFileSyncEventType,
    CodeFileSyncService,
)
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
    SetCodeFileBindingRequest,
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
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseCodeSectionImplArgsWithCallable,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
    set_curr_effective_section_impl_value,
)
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
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.project_config import ProjectConfig
from setta.types.project_state import (
    ProjectStateBackend,
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeFileBinding,
    CodeLanguage,
    CodeSectionImpl,
    SectionType,
)
from setta.types.settings_state import RenameRefactorMode
from setta.types.simplified_states import Position
from setta.utils.async_debouncer import AsyncDebouncer
from setta.utils.async_rw_lock import AsyncReadWriteLock
from setta.utils.constants import C
from setta.utils.utils import normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)

_P = ParamSpec("_P")
_R = TypeVar("_R")
_T = TypeVar("_T")
_EnqueueCallable = Callable[Concatenate["BaseProjectManager", _P], Awaitable[_R]]


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
        code_file_sync: CodeFileSyncService | None = None,
    ):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.settings_file = settings_file
        self.specific_file_watcher = specific_file_watcher
        self.code_file_sync = code_file_sync
        self.dbe = dbe
        self.artifacts = artifacts
        self.json_source = json_source
        self._code_sync_owner_ids_by_project: dict[str, set[str]] = {}
        self._code_sync_owner_prefix = f"{self.__class__.__name__}"
        self.history = History(self.load_initial_state())
        self.gen_code: dict[str, ProjectGenPythonCode] = {}
        self.code_dict: dict[str, dict[str, ProjectPythonCode | ProjectBashCode]] = {}
        self.message_queue: asyncio.Queue[
            tuple[Coroutine, asyncio.Future, str | None]
        ] = asyncio.Queue()
        # Dict doubles as ordered set so pending op ids keep enqueue order when broadcast
        self.pending_frontend_ops: dict[str, None] = {}
        self._project_state_lock = AsyncReadWriteLock()
        self._current_frontend_op_id: contextvars.ContextVar[str | None] = (
            contextvars.ContextVar("current_frontend_op_id", default=None)
        )
        logger.debug("Creating queue task in BaseProjectManager.__init__")
        self._process_queue_task_started = asyncio.Event()
        self.queue_task = asyncio.create_task(self._process_queue())
        logger.debug("Queue task created with id %s", id(self.queue_task))
        self.autosave_debouncer = AsyncDebouncer(self.autosave, wait=2.0)
        self.completed_op_ids_since_last_broadcast: list[str] = []
        self._deferred_json_source_loads: dict[str, set[tuple[str, str]]] = {}
        self.watch_json_source_files()
        self.watch_artifact_files()

    @abstractmethod
    def load_initial_state(self) -> ProjectStateBackend:
        pass

    async def _process_queue(self):
        """Background task that processes messages one at a time"""
        logger.debug("Starting _process_queue background task")
        self._process_queue_task_started.set()
        while True:
            logger.debug("Queue size before get: %s", self.message_queue.qsize())
            # Get the next message handler and its arguments
            logger.debug("Waiting for next message in queue...")
            coroutine, future, frontend_op_id = await self.message_queue.get()
            handler_name = self._describe_coroutine(coroutine)
            try:
                # Execute the actual implementation
                logger.debug("Starting handler %s", handler_name)
                async with self._track_frontend_op(frontend_op_id):
                    result = await coroutine
                logger.debug("Completed handler %s", handler_name)
                # Set the result for the waiting call
                logger.debug(
                    "Setting result on future (cancelled=%s)", future.cancelled()
                )
                future.set_result(result)
            except Exception as e:
                # Propagate any exceptions back to the caller
                logger.exception("Error in handler %s", handler_name)
                future.set_exception(e)
            finally:
                # Mark the task as done
                logger.debug("Marking queue task as done")
                self.message_queue.task_done()

    async def _enqueue(
        self,
        coroutine: Coroutine[Any, Any, _T],
        frontend_op_id: str | None = None,
    ) -> _T:
        """Enqueue a message for processing and wait for its completion"""
        await self._process_queue_task_started.wait()

        logger.debug(
            "Queue task status: cancelled=%s, done=%s, exception=%s",
            self.queue_task.cancelled(),
            self.queue_task.done(),
            self.queue_task.exception() if self.queue_task.done() else None,
        )

        # Create a future to hold the result
        future: asyncio.Future[_T] = asyncio.Future()
        logger.debug("Created future %s", id(future))

        # Put the message in the queue
        logger.debug("Putting message in queue")
        self._register_pending_frontend_op(frontend_op_id)
        await self.message_queue.put((coroutine, future, frontend_op_id))
        logger.debug("Message in queue, waiting for result")

        # Wait for the message to be processed and return the result
        logger.debug("Awaiting future %s", id(future))
        start_time = asyncio.get_event_loop().time()
        try:
            result = await future
            end_time = asyncio.get_event_loop().time()
            logger.debug(
                "Future completed after %.2fs with result", end_time - start_time
            )
            return result
        except Exception as e:
            end_time = asyncio.get_event_loop().time()
            logger.debug(
                "Future raised exception after %.2fs: %s", end_time - start_time, e
            )
            raise

    @overload
    @staticmethod
    def enqueue_method(
        func: _EnqueueCallable,
        *,
        require_serialization: bool = True,
    ) -> _EnqueueCallable: ...

    @overload
    @staticmethod
    def enqueue_method(
        func: None = ...,
        *,
        require_serialization: bool = True,
    ) -> Callable[[_EnqueueCallable], _EnqueueCallable]: ...

    @staticmethod
    def enqueue_method(
        func: _EnqueueCallable | None = None,
        *,
        require_serialization: bool = True,
    ) -> _EnqueueCallable | Callable[[_EnqueueCallable], _EnqueueCallable]:
        def decorator(actual_func: _EnqueueCallable) -> _EnqueueCallable:
            @wraps(actual_func)
            async def wrapper(
                self: "BaseProjectManager", *args: _P.args, **kwargs: _P.kwargs
            ) -> _R:
                frontend_op_id = self._extract_frontend_op_id(args, kwargs)
                coroutine = actual_func(self, *args, **kwargs)
                if require_serialization:
                    return await self._enqueue(
                        cast("Coroutine[Any, Any, _R]", coroutine),
                        frontend_op_id=frontend_op_id,
                    )

                self._register_pending_frontend_op(frontend_op_id)
                async with self._track_frontend_op(frontend_op_id):
                    return await coroutine

            return cast("_EnqueueCallable", wrapper)

        if func is None:
            return decorator
        return decorator(func)

    @staticmethod
    def _describe_coroutine(coroutine: Coroutine) -> str:
        name = getattr(coroutine, "__name__", None)
        if name:
            return name
        code = getattr(coroutine, "cr_code", None)
        if code and getattr(code, "co_name", None):
            return code.co_name
        return type(coroutine).__name__

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

    def _register_pending_frontend_op(self, frontend_op_id: str | None):
        if frontend_op_id:
            self.pending_frontend_ops[frontend_op_id] = None

    @asynccontextmanager
    async def _track_frontend_op(self, frontend_op_id: str | None):
        token = None
        if frontend_op_id is not None:
            token = self._current_frontend_op_id.set(frontend_op_id)
        try:
            yield
        except Exception:
            self._finalize_frontend_op(frontend_op_id, success=False)
            raise
        else:
            self._finalize_frontend_op(frontend_op_id, success=True)
        finally:
            if token is not None:
                self._current_frontend_op_id.reset(token)

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
        async with self._project_state_lock.read_lock():
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
        async with self._project_state_lock.read_lock():
            needs_init = projectState.projectConfig.id not in self.gen_code
        if needs_init:
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
        async with self._project_state_lock.write_lock():
            projectState.validate_singleton_sections()
            projectState.validate_parent_section_map()
            projectState.validate_shown_param_ids()
            projectState.validate_yaml_values()
            projectState.validate_required_decoded_images()
            projectState.validate_code_file_bindings()
            self._sync_code_file_bindings_for_project_state(projectState)
            dep_graph = DependencyGraph(projectState)
            projectConfig = projectState.projectConfig
            projectConfigId = projectConfig.id
            if self.gen_code.get(projectConfigId):
                await self.maybe_do_rename_refactor(
                    messageId, projectConfigId, dep_graph
                )
                self.gen_code[projectConfigId].callback_cleanup()

            code_generator = PythonCodeGenerator(
                dep_graph, projectConfig.genCodePrefix, projectConfig.genCodeSuffix
            )
            code_generator.generate_code()

            gen_code_binding = projectState.genCodeBinding
            if gen_code_binding is None:
                raise ValueError("Project state missing generated code binding")
            new_gen_code = ProjectGenPythonCode(
                self.dbe,
                gen_code_binding,
                self.lsp_writers,
                self.websocket_msg_handler,
                projectConfigId,
                dep_graph,
                code_generator,
            )
            await new_gen_code.update_file()
            maybe_update_gen_python_code_section(projectState, new_gen_code.code)
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
                        projectState, sectionId, section_impl
                    )

                    if not section_code:
                        continue

                    await section_code.update_file()
                    self.code_dict[projectConfigId][sectionId] = section_code

            self.project_state_backend = self.get_new_project_state_backend(
                projectState
            )
            if updateFileWatcher:
                self.watch_json_source_files()
                self.watch_artifact_files()

    @enqueue_method(require_serialization=False)
    async def type_check(self, projectConfigId: str):
        async with self._project_state_lock.read_lock():
            await self.gen_code[projectConfigId].type_check()

    @enqueue_method(require_serialization=False)
    async def text_field_completion(self, x: TextFieldCompletionRequest):
        async with self._project_state_lock.read_lock():
            gen_code = self.gen_code[x.projectConfigId]
        return await gen_code.text_field_completion(
            x.sectionId, x.paramInfoId, x.fullText, x.position
        )

    @enqueue_method(require_serialization=False)
    async def clear_text_field_completion(self, x: ClearTextFieldCompletionRequest):
        async with self._project_state_lock.read_lock():
            gen_code = self.gen_code[x.projectConfigId]
        await gen_code.clear_text_field_completion(x.sectionId, x.paramInfoId)

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

    @enqueue_method(require_serialization=False)
    async def code_area_completion(self, x: CodeAreaCompletionRequest):
        async with self._project_state_lock.read_lock():
            code = self.code_dict[x.projectConfigId][x.sectionId]
        if isinstance(code, ProjectPythonCode):
            return await code.code_area_completion(x.fullText, x.position)
        return []

    @enqueue_method(require_serialization=False)
    async def gen_code_prefix_completion(self, x: GenCodePrefixCompletionRequest):
        async with self._project_state_lock.read_lock():
            gen_code = self.gen_code[x.projectConfigId]
        return await gen_code.gen_code_prefix_completion(x.fullText, x.position)

    @enqueue_method(require_serialization=False)
    async def gen_code_suffix_completion(self, x: GenCodeSuffixCompletionRequest):
        async with self._project_state_lock.read_lock():
            gen_code = self.gen_code[x.projectConfigId]
        return await gen_code.gen_code_suffix_completion(x.fullText, x.position)

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
    async def set_code_file_binding(self, x: SetCodeFileBindingRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        get_curr_effective_section_impl_with_type_guard(
            project_state, x.sectionId, CodeSectionImpl
        )
        canonical_path = normalize_path(x.canonicalPath)
        binding = CodeFileBinding(
            canonical_path=canonical_path,
            snapshot_dir=normalize_path(canonical_path.parent),
            access_mode=x.accessMode,
        )
        binding_update_kwargs: dict[str, Any] = {"codeFileBinding": binding}
        if binding.access_mode == CodeFileAccessMode.read_only:
            try:
                existing_code = self.dbe.read(canonical_path)
            except Exception:
                logger.exception(
                    "Failed to read existing code while binding read_only file %s",
                    canonical_path,
                )
                existing_code = None
            if existing_code is not None:
                binding_update_kwargs["code"] = existing_code
        set_curr_effective_section_impl_value(
            project_state,
            x.sectionId,
            BaseCodeSectionImplArgsWithCallable(**binding_update_kwargs),
        )
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

    def create_project_code(
        self,
        project_state: ProjectStateSingleConfig,
        sectionId: str,
        section_impl: CodeSectionImpl,
    ):
        if section_impl.codeFileBinding is None:
            raise ValueError(f"Code section {sectionId} missing codeFileBinding")
        codeLanguage = section_impl.codeLanguage
        if codeLanguage == CodeLanguage.python:
            return ProjectPythonCode(
                self.dbe,
                self.lsp_writers,
                self.websocket_msg_handler,
                project_state,
                sectionId,
            )
        if codeLanguage == CodeLanguage.bash:
            return ProjectBashCode(self.dbe, project_state, sectionId)
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
        set_text_block_display_mode(project_state, x.sectionId, x.textDisplayMode)
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
        paste_sections(project_state, x.data, x.position, x.asRef)
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
        self._mark_current_frontend_op_completed_before_broadcast()
        await self.websocket_msg_handler.broadcast_project_state(
            project_state,
            self.completed_op_ids_since_last_broadcast,
            list(self.pending_frontend_ops.keys()),
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
        if trigger_autosave and self.settings_file.settings.backend.autosave:
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
            await self._flush_deferred_json_source_loads()
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

    def _sync_code_file_bindings_for_project_state(
        self, project_state: ProjectStateSingleConfig
    ) -> None:
        if not self.code_file_sync:
            return

        project_config_id = project_state.projectConfig.id
        existing_owner_ids = self._code_sync_owner_ids_by_project.get(
            project_config_id, set()
        )
        new_owner_ids: set[str] = set()
        owners: list[BindingOwner] = []

        for (
            section_id,
            variant_id,
        ) in project_state.projectConfig.sectionVariantMap.items():
            if variant_id is None:
                continue
            section_impl = get_curr_effective_section_impl(project_state, section_id)
            if not isinstance(section_impl, CodeSectionImpl):
                continue

            binding = section_impl.codeFileBinding
            if binding is None:
                continue

            owner_id = self._make_code_sync_owner_id(project_config_id, section_id)
            logger.critical(
                "code_sync_debug owner_candidate project=%s section=%s variant=%s path=%s mode=%s existing=%s",
                project_config_id,
                section_id,
                variant_id,
                binding.canonical_path,
                binding.access_mode,
                owner_id in existing_owner_ids,
            )
            owners.append(
                self._build_code_file_binding_owner(
                    owner_id,
                    project_config_id,
                    section_id,
                    variant_id,
                    binding,
                )
            )
            new_owner_ids.add(owner_id)

        stale_owner_ids = existing_owner_ids - new_owner_ids
        for owner_id in stale_owner_ids:
            logger.critical(
                "code_sync_debug unregister_stale_owner project=%s owner=%s",
                project_config_id,
                owner_id,
            )
            self.code_file_sync.unregister_binding(owner_id)

        for owner in owners:
            if owner.owner_id in existing_owner_ids:
                logger.critical(
                    "code_sync_debug refresh_owner project=%s owner=%s path=%s mode=%s",
                    project_config_id,
                    owner.owner_id,
                    owner.binding.canonical_path,
                    owner.binding.access_mode,
                )
                self.code_file_sync.refresh_binding(owner)
            else:
                logger.critical(
                    "code_sync_debug register_owner project=%s owner=%s path=%s mode=%s",
                    project_config_id,
                    owner.owner_id,
                    owner.binding.canonical_path,
                    owner.binding.access_mode,
                )
                self.code_file_sync.register_binding(owner)

        if new_owner_ids:
            self._code_sync_owner_ids_by_project[project_config_id] = new_owner_ids
        else:
            self._code_sync_owner_ids_by_project.pop(project_config_id, None)

    def _build_code_file_binding_owner(
        self,
        owner_id: str,
        project_config_id: str,
        section_id: str,
        variant_id: str,
        binding: CodeFileBinding,
    ) -> BindingOwner:
        description = f"{self._code_sync_owner_prefix}:{project_config_id}:{section_id}"

        async def handle_event(event: CodeFileSyncEvent) -> None:
            await self._handle_code_file_sync_event(
                project_config_id, section_id, variant_id, event
            )

        return BindingOwner(
            owner_id=owner_id,
            binding=binding,
            project_config_id=project_config_id,
            section_id=section_id,
            variant_id=variant_id,
            description=description,
            on_external_update=handle_event,
            on_created=handle_event,
            on_deleted=handle_event,
        )

    async def _handle_code_file_sync_event(
        self,
        project_config_id: str,
        section_id: str,
        expected_variant_id: str,
        event: CodeFileSyncEvent,
    ) -> None:
        logger.critical(
            "code_sync_debug event_received project=%s section=%s expected_variant=%s event_type=%s content_present=%s path=%s core_event=%s",
            project_config_id,
            section_id,
            expected_variant_id,
            event.event_type,
            event.content is not None,
            event.path,
            event.core_update.eventType,
        )
        if event.event_type == CodeFileSyncEventType.deleted:
            new_code = ""
        else:
            if event.content is None:
                logger.debug(
                    "Ignoring code sync event for %s due to missing content",
                    event.path,
                )
                logger.critical(
                    "code_sync_debug skip_missing_content project=%s section=%s path=%s",
                    project_config_id,
                    section_id,
                    event.path,
                )
                return
            new_code = event.content

        async with self._project_state_lock.read_lock():
            backend = self.project_state_backend
            if project_config_id not in backend.projectConfigs:
                logger.debug(
                    "Skipping code sync for unknown project config %s",
                    project_config_id,
                )
                return
            project_state = convert_backend_to_single_config(backend, project_config_id)

        current_variant_id = project_state.projectConfig.sectionVariantMap.get(
            section_id
        )
        if current_variant_id != expected_variant_id:
            logger.debug(
                "Skipping code sync for %s because variant changed (%s != %s)",
                section_id,
                current_variant_id,
                expected_variant_id,
            )
            logger.critical(
                "code_sync_debug skip_variant_mismatch project=%s section=%s expected_variant=%s current_variant=%s",
                project_config_id,
                section_id,
                expected_variant_id,
                current_variant_id,
            )
            return

        section_impl = get_curr_effective_section_impl(project_state, section_id)
        if not isinstance(section_impl, CodeSectionImpl):
            logger.debug(
                "Skipping code sync for %s because section impl is not code-based",
                section_id,
            )
            logger.critical(
                "code_sync_debug skip_non_code_impl project=%s section=%s type=%s",
                project_config_id,
                section_id,
                type(section_impl).__name__,
            )
            return

        current_code = section_impl.code
        if new_code == current_code:
            logger.debug(
                "Skipping code sync for %s because content is unchanged",
                section_id,
            )
            logger.critical(
                "code_sync_debug skip_unchanged_content project=%s section=%s",
                project_config_id,
                section_id,
            )
            return

        logger.critical(
            "code_sync_debug enqueue_set_code project=%s section=%s code_length_before=%s code_length_after=%s",
            project_config_id,
            section_id,
            len(current_code),
            len(new_code),
        )
        await self.set_code(
            SetCodeRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                code=new_code,
            )
        )

    def _make_code_sync_owner_id(self, project_config_id: str, section_id: str) -> str:
        return f"{self._code_sync_owner_prefix}:{project_config_id}:{section_id}"

    def perform_manual_save(self):
        """Run a manual save, clearing any pending autosave first."""
        self.autosave_debouncer.cancel_pending()
        self.save()

    def watch_json_source_files(self):
        callback_category = f"{self.__class__.__name__}_JSONSource"

        def should_defer_reload(
            section_variants_to_load: set[tuple[str, str]],
            *,
            new_mapping: dict[Path, set[tuple[str, str]]],
            previous_mapping: dict[Path, set[tuple[str, str]]],
        ) -> bool:
            return self._should_defer_json_source_reload(
                callback_category,
                section_variants_to_load,
                new_mapping,
                previous_mapping,
            )

        def on_deferred(section_variants_to_load: set[tuple[str, str]]) -> None:
            self._record_deferred_json_source_loads(
                callback_category, section_variants_to_load
            )

        self.json_source.watch_json_source_files(
            callback_category,
            self.load_json_sources,
            self.project_state_backend_getter_fn,
            should_defer_reload=should_defer_reload,
            on_deferred=on_deferred,
        )

    def watch_artifact_files(self):
        self.artifacts.watch_artifact_files(
            f"{self.__class__.__name__}_Artifacts", self.project_state_backend
        )

    def _should_defer_json_source_reload(
        self,
        callback_category: str,
        section_variants_to_load: set[tuple[str, str]],
        new_mapping: dict[Path, set[tuple[str, str]]],
        previous_mapping: dict[Path, set[tuple[str, str]]],
    ) -> bool:
        if not section_variants_to_load or not self.autosave_debouncer.is_pending:
            return False

        variant_to_path: dict[tuple[str, str], Path] = {}
        for path, variant_ids in new_mapping.items():
            for variant in variant_ids:
                variant_to_path[variant] = path

        for variant in section_variants_to_load:
            path = variant_to_path.get(variant)
            if path is None:
                return False
            if variant not in previous_mapping.get(path, set()):
                return False

        return True

    def _record_deferred_json_source_loads(
        self,
        callback_category: str,
        section_variants_to_load: set[tuple[str, str]],
    ) -> None:
        if not section_variants_to_load:
            return
        pending = self._deferred_json_source_loads.setdefault(callback_category, set())
        pending.update(section_variants_to_load)

    async def _flush_deferred_json_source_loads(self) -> None:
        callback_category = f"{self.__class__.__name__}_JSONSource"
        pending = self._deferred_json_source_loads.pop(callback_category, None)
        if not pending:
            return
        await self.load_json_sources(self.json_source.json_sources, pending)


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
