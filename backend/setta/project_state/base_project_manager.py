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

from setta.code_gen.dependency_graph import (
    DependencyGraph,
    RenameReferenceChangedValue,
)
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import (
    SpecificFileWatcher,
)
from setta.logging.errors import log_failure
from setta.logging.tasks import spawn_background_task
from setta.lsp.managers import LSPWriters, NoopLSPWriters
from setta.mcp.tool_metadata import (
    AIFollowToolArgumentsMetadata,
    AIFollowToolResultMetadata,
    SettaToolType,
    ToolArgumentPreviewKind,
    ToolArgumentPreviewMetadata,
)
from setta.mcp.tools.project_state_registry import project_state_tool
from setta.project_state.artifacts import Artifacts
from setta.project_state.chats.load import load_chat
from setta.project_state.code import (
    create_snapshot_run_command_from_sections,
)
from setta.project_state.code_files import (
    CodeFileReloadPlan,
    CodeFiles,
)
from setta.project_state.history import History
from setta.project_state.jsonSource.jsonSource import (
    JSONSource,
    ProcessedJSONInfo,
)
from setta.project_state.jsonSource.load import load_json_sources_into_data_structures
from setta.project_state.listener_artifact_updates import (
    apply_listener_artifact_updates,
)
from setta.project_state.listener_dependency_updates import (
    apply_listener_dependency_updates,
)
from setta.project_state.project_code import (
    ProjectBashCode,
    ProjectGenPythonCode,
    ProjectPythonCode,
    build_python_code_generator,
)
from setta.project_state.project_manager_types import (
    AcceptRenameRefactorRequest,
    AddKwargRequest,
    AppendDrawAreaLayerItemRequest,
    AutoLayoutTopLevelSectionsRequest,
    ChangeParamImplRequest,
    ClearTextFieldCompletionRequest,
    CodeAreaCompletionRequest,
    CreateChildSectionsRequest,
    CreateChildSectionsViaIncrementerRequest,
    CreateEdgeRequest,
    CreateNewSectionVariantRequest,
    CreateTopLevelSectionRequest,
    CreateTopLevelSectionResponse,
    CreateViewModeRequest,
    DeclineRenameRefactorRequest,
    DeleteChildSectionsViaDecrementerRequest,
    DeleteEdgesRequest,
    DeleteJSONSourceFileAndVariantRequest,
    DeleteKwargRequest,
    DeleteSectionsRequest,
    DeleteSectionVariantOrAskRequest,
    DeleteViewModeRequest,
    GenCodePrefixCompletionRequest,
    GenCodeSuffixCompletionRequest,
    GetChatSectionChatIdRequest,
    GetLatestLspDiagnosticsRequest,
    GetLatestProjectStateRequest,
    GetLatestProjectStateSummaryRequest,
    GroupSectionsRequest,
    MoveSectionRequest,
    OutputAccessorCompletionRequest,
    PasteSectionsRequest,
    PrepareSectionsForCopyRequest,
    ReconnectEdgeRequest,
    RedoRequest,
    RenameRefactorBroadcastContent,
    RunCodeRequest,
    SaveAsNewProjectConfigRequest,
    SetActiveIdsRequest,
    SetActiveViewModeRequest,
    SetBrowserAreaViewModeRequest,
    SetBrowserColumnWidthsRequest,
    SetBrowserHideColumnRequest,
    SetCallableHideParamsRequest,
    SetCallableRequest,
    SetCallableResponse,
    SetChartAreaDataPathRequest,
    SetChartSettingsRequest,
    SetChartTypeRequest,
    SetChatSectionChatIdRequest,
    SetChatSectionSettingsRequest,
    SetChatSectionStateRequest,
    SetCodeFileBindingRequest,
    SetCodeObjDisplayNameRequest,
    SetCodeObjNameRequest,
    SetCodeRequest,
    SetDefaultSectionVariantRequest,
    SetEdgesRequest,
    SetGenCodePrefixRequest,
    SetGenCodeSuffixRequest,
    SetGroupOverflowModeRequest,
    SetImageAreaImagePathRequest,
    SetMetaControlShowSectionTitleRequest,
    SetParamEnteredValueRequest,
    SetParamNameAndValueRequest,
    SetSectionColumnWidthRequest,
    SetSectionEdgeInputsRequest,
    SetSectionEdgeOutputsRequest,
    SetSectionHideUnpinnedParamsRequest,
    SetSectionNameRequest,
    SetSectionParamFilterRequest,
    SetSectionSizesRequest,
    SetSectionVariantNameRequest,
    SetSectionVariantRequest,
    SetShowParamDisplayNamesRequest,
    SetSocialUrlRequest,
    SetTextBlockDisplayModeRequest,
    SetTextBlockFormatRequest,
    SetTextBlockHeadingAsSectionNameRequest,
    SetTextBlockMetaControlStyleRequest,
    SetTextBlockTextRequest,
    SetTopLevelSectionLayoutRequest,
    SetTypeErrorIgnoreRequest,
    SetViewModeNameRequest,
    SetViewportRequest,
    TextFieldCompletionRequest,
    ToggleGroupOrientationRequest,
    ToggleIsEditingViewModeRequest,
    ToggleMinimizedRequest,
    ToggleParamSelectedRequest,
    TogglePositionLocksRequest,
    ToggleSectionVisibilityRequest,
    ToggleVariantFrozenRequest,
    ToggleVariantJSONSourceRequest,
    ToggleViewModeUserFacingRequest,
    UndoRequest,
    UngroupGroupsRequest,
    UnselectAllParamsRequest,
    UpdateEdgeRequest,
    UpdateParamImplConfigRequest,
)
from setta.types.clipboard import (
    ProjectStateCoreWithSectionVariantMap,
    SectionsClipboardData,
)
from setta.types.dependency_key import (
    SectionDependencyKey,
    SectionParamDependencyKey,
)
from setta.types.edges import Edge
from setta.types.generated.unions import (
    BaseArtifactUnion,
    BaseArtifactUnionWithDiscriminator,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl2 import (
    add_kwarg,
    append_draw_area_layer_item,
    apply_top_level_section_layout_snapshot,
    auto_layout_top_level_sections,
    change_param_impl,
    collect_ignore_type_errors_by_section,
    create_child_sections,
    create_child_sections_via_incrementer,
    create_edge,
    create_new_section_variant,
    create_top_level_section,
    delete_child_sections_via_decrementer,
    delete_edges,
    delete_kwarg,
    delete_section_variant,
    delete_section_variant_or_ask,
    delete_sections,
    get_curr_section_callable_code_obj,
    group_sections,
    maybe_update_gen_python_code_section,
    move_section_to_pane,
    move_section_to_parent_section,
    reconnect_edge,
    resolve_top_level_section_position_and_pan,
    set_browser_area_view_mode,
    set_browser_column_widths,
    set_browser_hide_column,
    set_callable_hide_params,
    set_chart_area_data_path,
    set_chart_settings,
    set_chart_type,
    set_chat_section_chat_id,
    set_chat_section_settings,
    set_chat_section_state,
    set_code,
    set_code_file_binding,
    set_default_section_variant,
    set_edges,
    set_group_overflow_mode,
    set_image_area_image_path,
    set_meta_control_show_section_title,
    set_param_entered_value,
    set_project_config_name,
    set_section_column_width,
    set_section_edge_inputs,
    set_section_edge_outputs,
    set_section_hide_unpinned_params,
    set_section_name,
    set_section_param_filter,
    set_section_sizes,
    set_section_variant,
    set_section_variant_name,
    set_social_url,
    set_text_block_display_mode,
    set_text_block_format,
    set_text_block_heading_as_section_name,
    set_text_block_meta_control_style,
    set_text_block_text,
    set_type_error_ignore,
    toggle_group_orientation,
    toggle_minimized,
    toggle_param_selected,
    toggle_position_locks,
    toggle_variant_frozen,
    toggle_variant_json_source,
    ungroup_groups,
    unselect_all_params,
    update_edge,
    update_param_impl_config,
)
from setta.types.helpers_lvl3 import (
    build_project_state_summary,
    convert_backend_to_single_config,
    merge_single_config_into_backend,
    paste_sections,
    prepare_sections_for_copy,
)
from setta.types.id import ID
from setta.types.listener import ListenerFrontendEmitKeyAndValue
from setta.types.lsp import SettaProjectConfigDiagnostics
from setta.types.notifications import (
    SettaBackendLogEventSeverity,
    SettaNotification,
    SettaNotificationType,
)
from setta.types.project_config import Position, ProjectConfig, ViewModeConfig
from setta.types.project_state import (
    ProjectStateBackend,
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    ChatSectionImpl,
    CodeFileAccessMode,
    CodeFileBinding,
    CodeLanguage,
    CodeSectionImpl,
    SectionType,
)
from setta.types.settings_state import RenameRefactorMode, RunSnapshotMode
from setta.utils.async_debouncer import AsyncDebouncer
from setta.utils.async_rw_lock import AsyncReadWriteLock
from setta.utils.constants import C
from setta.utils.utils import normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender

logger = logging.getLogger(__name__)

_P = ParamSpec("_P")
_R = TypeVar("_R")
_T = TypeVar("_T")
_EnqueueCallable = Callable[Concatenate["BaseProjectManager", _P], Awaitable[_R]]


class BaseProjectManager(ABC):
    def __init__(
        self,
        lsp_writers: LSPWriters | NoopLSPWriters,
        websocket_msg_handler: WMHFrontendSender,
        python_script_sender: WMHPythonScriptSender,
        settings_file: SettingsFile,
        specific_file_watcher: SpecificFileWatcher,
        dbe: DBE,
        artifacts: Artifacts,
        json_source: JSONSource,
        code_files: CodeFiles,
    ):
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.python_script_sender = python_script_sender
        self.settings_file = settings_file
        self.specific_file_watcher = specific_file_watcher
        self.dbe = dbe
        self.artifacts = artifacts
        self.json_source = json_source
        self.code_files = code_files
        self._file_watcher_category_prefix = f"{type(self).__name__}:{id(self)}"
        self.history = History(self.load_initial_state())
        self.gen_code: dict[str, ProjectGenPythonCode] = {}
        self.code_dict: dict[str, dict[str, ProjectPythonCode | ProjectBashCode]] = {}
        self.message_queue: asyncio.Queue[
            tuple[Coroutine, asyncio.Future, str | None]
        ] = asyncio.Queue()
        # Dict doubles as ordered set so pending op ids keep enqueue order when broadcast
        self.pending_frontend_ops: dict[str, None] = {}
        self._pending_ops_idle: asyncio.Event = asyncio.Event()
        self._pending_ops_idle.set()
        self._project_state_lock = AsyncReadWriteLock()
        self._current_frontend_op_id: contextvars.ContextVar[str | None] = (
            contextvars.ContextVar("current_frontend_op_id", default=None)
        )
        logger.debug("Creating queue task in BaseProjectManager.__init__")
        self._process_queue_task_started = asyncio.Event()
        self.queue_task = spawn_background_task(
            self._process_queue(),
            label=f"{type(self).__name__}-queue",
            extra_values={"project_manager": type(self).__name__},
        )
        logger.debug("Queue task created with id %s", id(self.queue_task))
        self.autosave_debouncer = AsyncDebouncer(
            self.autosave,
            wait=2.0,
            label=f"{type(self).__name__}-autosave",
        )
        self.completed_op_ids_since_last_broadcast: list[str] = []
        self._deferred_json_source_loads: dict[str, set[tuple[str, str]]] = {}
        self.pending_rename_results: dict[
            str, tuple[str, list[RenameReferenceChangedValue]]
        ] = {}
        self.watch_json_source_files()
        self.watch_artifact_files()
        self.watch_code_files()

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
            except Exception as exc:
                # Propagate any exceptions back to the caller
                log_failure(
                    exc,
                    label="project-manager-queue-handler",
                    logger=logger,
                    context={
                        "handler_name": handler_name,
                        "project_manager": type(self).__name__,
                    },
                )
                future.set_exception(exc)
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
        self._update_pending_ops_idle_event()

    def _register_pending_frontend_op(self, frontend_op_id: str | None):
        if frontend_op_id:
            self.pending_frontend_ops[frontend_op_id] = None
        self._update_pending_ops_idle_event()

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
        self._update_pending_ops_idle_event()

    def _update_pending_ops_idle_event(self) -> None:
        if self.pending_frontend_ops:
            self._pending_ops_idle.clear()
            return
        self._pending_ops_idle.set()

    def _flush_code_files(
        self, projectConfigId: ID
    ) -> tuple[
        ProjectGenPythonCode | None,
        dict[ID, ProjectPythonCode | ProjectBashCode],
    ]:
        gen_code = self.gen_code.get(projectConfigId)
        if gen_code is None:
            return None, {}
        gen_code.write_to_disk(gen_code.code)
        code_entries = self.code_dict.get(projectConfigId, {})
        for code_entry in code_entries.values():
            code_entry.write_to_disk(code_entry.code)
        return gen_code, code_entries

    def _flush_code_files_for_all_configs(self) -> None:
        for project_config_id in self.project_state_backend.projectConfigs.keys():
            self._flush_code_files(project_config_id)

    @enqueue_method
    async def create_run_command(
        self,
        x: RunCodeRequest,
    ):
        project_config_id = x.projectConfigId
        section_id = x.sectionId
        run_snapshot_mode = x.runSnapshotMode
        async with self._project_state_lock.read_lock():
            gen_code, code_entries = self._flush_code_files(project_config_id)
            if gen_code is None:
                raise KeyError(
                    f"Missing generated code for project config {project_config_id}"
                )
            resolved_run_snapshot_mode = (
                run_snapshot_mode or self.settings_file.settings.backend.runSnapshotMode
            )
            if not section_id:
                section_id = self.project_state_backend.projectConfigs[
                    project_config_id
                ].entryCodeBlockId
            if resolved_run_snapshot_mode == RunSnapshotMode.never:
                gen_code_path = gen_code.get_gen_python_code_path()
                code_paths = {
                    sid: c.binding.canonical_path for sid, c in code_entries.items()
                }
                if section_id:
                    if section_id not in code_paths:
                        raise KeyError(f"Missing code section for run: {section_id}")
                    return code_entries[section_id].get_run_command(
                        code_paths[section_id]
                    )
                return gen_code.get_run_command(gen_code_path)

            snapshot_section_inputs = {
                sid: (
                    code_entry.code,
                    code_entry.binding,
                    code_entry.get_run_command,
                )
                for sid, code_entry in code_entries.items()
            }
            return create_snapshot_run_command_from_sections(
                dbe=self.dbe,
                snapshot_root=self._resolve_run_snapshot_root(
                    resolved_run_snapshot_mode
                ),
                entry_section_id=section_id,
                gen_code=gen_code.code,
                gen_binding=gen_code.binding,
                section_inputs=snapshot_section_inputs,
                gen_command_builder=gen_code.get_run_command,
            )

    def _resolve_run_snapshot_root(self, run_snapshot_mode: RunSnapshotMode) -> Path:
        if run_snapshot_mode == RunSnapshotMode.ephemeral:
            return C.RUN_FOLDER
        if run_snapshot_mode == RunSnapshotMode.always:
            return C.CODE_FOLDER
        raise ValueError(f"Unsupported run snapshot mode: {run_snapshot_mode}")

    @enqueue_method
    async def load_project_config(self, projectConfigId: ID):
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
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["topLevelSections"]}
        )
    )
    async def set_top_level_section_layout(self, x: SetTopLevelSectionLayoutRequest):
        """Persist the provided top-level section layout ordering for a project."""
        self.project_state_backend.projectConfigs[
            x.projectConfigId
        ].topLevelSections = x.topLevelSections

    @enqueue_method
    @project_state_tool()
    async def auto_layout_top_level_sections(
        self, x: AutoLayoutTopLevelSectionsRequest
    ):
        """Automatically arrange top-level sections using rectangle packing."""
        project_state = self.get_single_config_state(x.projectConfigId)
        auto_layout_top_level_sections(project_state, margin=x.margin)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionSizes"]}
        )
    )
    async def set_section_sizes(self, x: SetSectionSizesRequest):
        """Update section size settings for the requested sections and broadcast the refreshed project state."""
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_sizes(project_state, x.sectionSizes)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def load_json_sources(
        self,
        json_sources: dict[Path, ProcessedJSONInfo],
        section_variants_to_load: Iterable[tuple[ID, ID]],
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

    async def _refresh_codegen_state(
        self,
        projectState: ProjectStateSingleConfig,
    ) -> None:
        dep_graph = DependencyGraph(projectState)
        projectConfig = projectState.projectConfig
        projectConfigId = projectConfig.id
        if self.gen_code.get(projectConfigId):
            await self.maybe_do_rename_refactor(
                projectState, projectConfigId, dep_graph
            )
            self.gen_code[projectConfigId].callback_cleanup()

        code_generator = build_python_code_generator(projectState, dep_graph)
        code_generator.generate_code()
        ignore_type_errors_by_section = collect_ignore_type_errors_by_section(
            projectState
        )

        gen_code_binding = projectState.genCodeBinding
        if gen_code_binding is None:
            raise ValueError("Project state missing generated code binding")
        new_gen_code = ProjectGenPythonCode(
            self.dbe,
            self.code_files,
            gen_code_binding,
            self.lsp_writers,
            self.websocket_msg_handler,
            projectConfigId,
            dep_graph,
            code_generator,
            ignore_type_errors_by_section,
        )
        if not new_gen_code.binding.canonical_path.exists():
            new_gen_code.write_to_disk(new_gen_code.code)
        if self.lsp_writers.full is not None:
            await new_gen_code.sync_lsp(new_gen_code.code)
        maybe_update_gen_python_code_section(projectState, new_gen_code.generated_code)
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

                if not section_code.binding.canonical_path.exists():
                    section_code.write_to_disk(section_code.code)
                if self.lsp_writers.full is not None:
                    await section_code.sync_lsp(section_code.code)
                self.code_dict[projectConfigId][sectionId] = section_code

    def _merge_project_state_backend(
        self,
        projectState: ProjectStateSingleConfig,
        *,
        updateFileWatcher: bool,
    ) -> None:
        self.project_state_backend = self.get_new_project_state_backend(projectState)
        if updateFileWatcher:
            self.watch_json_source_files()
            self.watch_artifact_files()
            self.watch_code_files()

    def shutdown(self) -> None:
        categories = (
            f"{self._file_watcher_category_prefix}_JSONSource",
            f"{self._file_watcher_category_prefix}_Artifacts",
            f"{self._file_watcher_category_prefix}_CodeFiles",
        )
        for category in categories:
            self.specific_file_watcher.update_callbacks({}, category, [])
        self.autosave_debouncer.cancel()
        self.queue_task.cancel()

    async def update(
        self,
        projectState: ProjectStateSingleConfig,
        updateFileWatcher: bool = True,
        validate_code_file_bindings: bool = True,
    ):
        async with self._project_state_lock.write_lock():
            projectState.validate_for_update(
                validate_code_file_bindings=validate_code_file_bindings,
            )
            if self.lsp_writers.full is not None:
                await self._refresh_codegen_state(projectState)
            self._merge_project_state_backend(
                projectState,
                updateFileWatcher=updateFileWatcher,
            )

    @enqueue_method(require_serialization=False)
    async def type_check(self, projectConfigId: ID):
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
    async def output_accessor_completion(self, x: OutputAccessorCompletionRequest):
        async with self._project_state_lock.read_lock():
            gen_code = self.gen_code[x.projectConfigId]
        return await gen_code.output_accessor_completion(
            x.sectionId, x.fullText, x.position
        )

    @enqueue_method(require_serialization=False)
    async def clear_text_field_completion(self, x: ClearTextFieldCompletionRequest):
        async with self._project_state_lock.read_lock():
            gen_code = self.gen_code[x.projectConfigId]
        await gen_code.clear_text_field_completion(x.sectionId, x.paramInfoId)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        tool_argument_preview=ToolArgumentPreviewMetadata(
            targetIdPathsByType={"section": ["sectionId"]},
            previewValuePath="callableName",
            previewKind=ToolArgumentPreviewKind.callableName,
        ),
    )
    async def set_callable(self, x: SetCallableRequest) -> SetCallableResponse:
        """Update a section's callable binding and refresh the surrounding project."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)

        result = await self.gen_code[x.projectConfigId].set_callable(
            self.settings_file.settings,
            project_state,
            x.sectionId,
            x.callableName,
            x.refetchParams,
        )
        await self.update_and_broadcast_project_state(project_state)
        return result

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
    @project_state_tool()
    async def set_gen_code_prefix(self, x: SetGenCodePrefixRequest):
        """Persist the prefix template used when generating runtime code."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        project_state.projectConfig.genCodePrefix = x.genCodePrefix
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool()
    async def set_gen_code_suffix(self, x: SetGenCodeSuffixRequest):
        """Persist the suffix template used when generating runtime code."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        project_state.projectConfig.genCodeSuffix = x.genCodeSuffix
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool()
    async def set_show_param_display_names(self, x: SetShowParamDisplayNamesRequest):
        """Toggle whether parameter display names are shown in the UI."""
        project_state = self.get_single_config_state(x.projectConfigId)
        project_state.projectConfig.showParamDisplayNames = x.showParamDisplayNames
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"], "codeObj": ["paramInfoId"]}
        ),
        tool_argument_preview=ToolArgumentPreviewMetadata(
            targetIdPathsByType={"section": ["sectionId"], "codeObj": ["paramInfoId"]},
            previewValuePath="value",
            previewKind=ToolArgumentPreviewKind.paramValue,
        ),
    )
    async def set_param_entered_value(self, x: SetParamEnteredValueRequest):
        """Write a new manual value for the targeted section parameter."""
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
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"], "codeObj": ["paramInfoId"]}
        )
    )
    async def set_type_error_ignore(self, x: SetTypeErrorIgnoreRequest):
        """Toggle ignoring type errors for the targeted section entry."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        set_type_error_ignore(
            project_state, x.sectionId, x.paramInfoId, x.ignoreTypeErrors
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"], "codeObj": ["codeObjId"]}
        ),
        tool_argument_preview=ToolArgumentPreviewMetadata(
            targetIdPathsByType={"section": ["sectionId"], "codeObj": ["codeObjId"]},
            previewValuePath="value",
            previewKind=ToolArgumentPreviewKind.paramValue,
        ),
    )
    async def set_param_name_and_value(self, x: SetParamNameAndValueRequest):
        """Set a parameter's name and value in one step."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        project_state.codeObjs[x.codeObjId].name = x.name
        set_param_entered_value(
            project_state,
            x.sectionId,
            x.codeObjId,
            x.value,
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"codeObj": ["codeObjId"]}
        )
    )
    async def set_code_obj_name(self, x: SetCodeObjNameRequest):
        """Rename the requested code object within the active project state."""
        project_state = self.get_single_config_state(x.projectConfigId)
        project_state.codeObjs[x.codeObjId].name = x.name
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"codeObj": ["codeObjId"]}
        )
    )
    async def set_code_obj_display_name(self, x: SetCodeObjDisplayNameRequest):
        """Update the user-facing display name for the requested code object."""
        project_state = self.get_single_config_state(x.projectConfigId)
        project_state.codeObjs[x.codeObjId].displayName = x.displayName
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_code_file_binding(self, x: SetCodeFileBindingRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        canonical_path = normalize_path(x.binding.canonical_path)
        updated_binding = CodeFileBinding(
            canonical_path=canonical_path,
            access_mode=x.binding.access_mode,
        )
        set_code_file_binding(project_state, x.sectionId, updated_binding)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionIds"]}
        )
    )
    async def toggle_position_locks(self, x: TogglePositionLocksRequest):
        """Flip whether multiple sections' layouts are locked in place."""
        project_state = self.get_single_config_state(x.projectConfigId)
        toggle_position_locks(project_state, x.sectionIds)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        )
    )
    async def toggle_minimized(self, x: ToggleMinimizedRequest):
        """Expand or collapse a section panel within the project workspace."""
        project_state = self.get_single_config_state(x.projectConfigId)
        toggle_minimized(project_state, x.sectionId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        )
    )
    async def toggle_group_orientation(self, x: ToggleGroupOrientationRequest):
        """Flip whether a group section lays out children horizontally."""
        project_state = self.get_single_config_state(x.projectConfigId)
        toggle_group_orientation(project_state, x.sectionId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        )
    )
    async def set_group_overflow_mode(self, x: SetGroupOverflowModeRequest):
        """Set whether a group section constrains its children in a scrollable area."""
        project_state = self.get_single_config_state(x.projectConfigId)
        set_group_overflow_mode(project_state, x.sectionId, x.overflowMode)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        tool_argument_preview=ToolArgumentPreviewMetadata(
            targetIdPathsByType={"section": ["sectionId"]},
            previewValuePath="code",
            previewKind=ToolArgumentPreviewKind.code,
        ),
    )
    async def set_code(self, x: SetCodeRequest):
        """Persist inline code edits for the requested section if edits are allowed."""
        project_state = self.get_single_config_state(x.projectConfigId)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            x.sectionId,
            BaseCodeSectionImpl,
        )
        binding = section_impl.codeFileBinding
        if binding is not None and binding.access_mode == CodeFileAccessMode.read_only:
            logger.warning(
                "Rejecting set_code for read-only binding: section %s (config %s)",
                x.sectionId,
                x.projectConfigId,
            )
            raise PermissionError(f"Cannot edit read-only code section {x.sectionId}")
        set_code(project_state, x.sectionId, x.code)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        )
    )
    async def set_section_param_filter(self, x: SetSectionParamFilterRequest):
        """Update the value filter applied to a section's parameter list."""
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_param_filter(project_state, x.sectionId, x.value)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_section_edge_inputs(self, x: SetSectionEdgeInputsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_edge_inputs(
            self.settings_file.settings,
            project_state,
            x.sectionId,
            x.edgeInputParams,
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_section_edge_outputs(self, x: SetSectionEdgeOutputsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_edge_outputs(project_state, x.sectionId, x.edgeOutputPorts)
        variant_id = project_state.projectConfig.sectionVariantMap.get(x.sectionId)
        if variant_id is None:
            raise KeyError(f"Section {x.sectionId} missing active variant.")
        for edge in project_state.projectConfig.edges:
            if (
                edge.sourceSectionId != x.sectionId
                or edge.sourceVariantId != variant_id
            ):
                continue
            target_variant_id = project_state.projectConfig.sectionVariantMap.get(
                edge.targetSectionId
            )
            if target_variant_id is None:
                raise KeyError(
                    f"Section {edge.targetSectionId} missing active variant."
                )
            if target_variant_id != edge.targetVariantId:
                continue
            self._apply_edge_value(project_state, edge)
        await self.update_and_broadcast_project_state(project_state)

    def _apply_edge_value(self, project_state: ProjectStateSingleConfig, edge: Edge):
        gen_code = self.gen_code.get(project_state.projectConfig.id)
        if gen_code is None:
            raise KeyError(
                f"Generated code missing for project config {project_state.projectConfig.id}."
            )
        edge_value = gen_code.build_edge_expression(project_state, edge)
        set_param_entered_value(
            project_state,
            edge.targetSectionId,
            edge.targetPortId,
            edge_value,
        )

    @enqueue_method
    async def create_edge(self, x: CreateEdgeRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        edge = Edge(
            sourceSectionId=x.sourceSectionId,
            sourceVariantId=x.sourceVariantId,
            sourcePortId=x.sourcePortId,
            targetSectionId=x.targetSectionId,
            targetVariantId=x.targetVariantId,
            targetPortId=x.targetPortId,
            type=x.type,
            label=x.label,
            style=x.style,
            animated=x.animated,
            hidden=x.hidden,
            zIndex=x.zIndex,
            data=x.data,
        )
        create_edge(project_state, edge)
        self._apply_edge_value(project_state, edge)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def update_edge(self, x: UpdateEdgeRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        update_edge(project_state, x.edge)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def delete_edges(self, x: DeleteEdgesRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        delete_edges(project_state, x.edgeIds)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def reconnect_edge(self, x: ReconnectEdgeRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        reconnect_edge(
            project_state,
            x.edgeId,
            x.sourceSectionId,
            x.sourceVariantId,
            x.sourcePortId,
            x.targetSectionId,
            x.targetVariantId,
            x.targetPortId,
        )
        updated_edge = next(
            (edge for edge in project_state.projectConfig.edges if edge.id == x.edgeId),
            None,
        )
        if updated_edge is None:
            raise KeyError(f"Edge {x.edgeId} not found.")
        self._apply_edge_value(project_state, updated_edge)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_edges(self, x: SetEdgesRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        set_edges(project_state, x.edges)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        )
    )
    async def set_section_variant(self, x: SetSectionVariantRequest):
        """Switch a section to an explicit variant and propagate its state."""
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_variant(project_state, x.sectionId, x.variantId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        )
    )
    async def set_default_section_variant(self, x: SetDefaultSectionVariantRequest):
        """Change the default variant automatically used for a section."""
        project_state = self.get_single_config_state(x.projectConfigId)
        set_default_section_variant(project_state, x.sectionId, x.variantId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"], "codeObj": ["paramInfoId"]}
        )
    )
    async def change_param_impl(self, x: ChangeParamImplRequest):
        """Swap the selected implementation backing a section parameter."""
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
    @project_state_tool(
        ai_follow_tool_result=AIFollowToolResultMetadata(
            pathsByIdType={
                "section": ["sectionId"],
            },
        )
    )
    async def create_top_level_section(self, x: CreateTopLevelSectionRequest):
        """Create a root-level section for the requested implementation.

        Returns:
            CreateTopLevelSectionResponse: Identifier and optional viewport pan hint.
        """
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        apply_top_level_section_layout_snapshot(
            project_state,
            x.topLevelSections,
        )

        position, pan_to = resolve_top_level_section_position_and_pan(
            self.settings_file.settings,
            project_state,
            x.implType,
            x.position,
            x.implOverrides,
            x.topLevelSections,
            x.viewportBounds,
        )
        sectionId = create_top_level_section(
            self.settings_file.settings,
            project_state,
            x.implType,
            position,
            x.implOverrides,
            control_code_obj_type=x.controlCodeObjType,
        )
        await self.update_and_broadcast_project_state(project_state)
        return CreateTopLevelSectionResponse(sectionId=sectionId, panTo=pan_to)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["parentId"]}
        )
    )
    async def create_child_sections(self, x: CreateChildSectionsRequest):
        """Create one or more child sections beneath a parent section."""
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
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["calledBy"]}
        )
    )
    async def create_child_sections_via_incrementer(
        self, x: CreateChildSectionsViaIncrementerRequest
    ):
        """Expand incrementer-driven child sections for a repeated structure."""
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
    async def create_temporary_terminal(self, projectConfigId: ID, terminalId: ID):
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
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionIds"]}
        )
    )
    async def delete_sections(self, x: DeleteSectionsRequest):
        """Remove the specified sections and broadcast the updated project."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        delete_sections(project_state, x.sectionIds)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["calledBy"]}
        )
    )
    async def delete_child_sections_via_decrementer(
        self, x: DeleteChildSectionsViaDecrementerRequest
    ):
        """Shrink an incrementer-driven group by deleting trailing children."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        delete_child_sections_via_decrementer(project_state, x.calledBy, x.numChildren)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"], "codeObj": ["paramInfoId"]}
        )
    )
    async def update_param_impl_config(self, x: UpdateParamImplConfigRequest):
        """Overwrite the configuration dict for a parameter implementation."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        update_param_impl_config(project_state, x.sectionId, x.paramInfoId, x.newConfig)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        )
    )
    async def create_new_section_variant(self, x: CreateNewSectionVariantRequest):
        """Duplicate the current section state into an additional variant."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        create_new_section_variant(project_state, x.sectionId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        )
    )
    async def add_kwarg(self, x: AddKwargRequest):
        """Append a blank keyword argument entry to the section."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        add_kwarg(self.settings_file.settings, project_state, x.sectionId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        )
    )
    async def delete_kwarg(self, x: DeleteKwargRequest):
        """Remove the last keyword argument entry from the section."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        delete_kwarg(self.settings_file.settings, project_state, x.sectionId)
        await self.update_and_broadcast_project_state(project_state)

    def create_project_code(
        self,
        project_state: ProjectStateSingleConfig,
        sectionId: ID,
        section_impl: CodeSectionImpl,
    ):
        if section_impl.codeFileBinding is None:
            raise ValueError(f"Code section {sectionId} missing codeFileBinding")
        codeLanguage = section_impl.codeLanguage
        if codeLanguage == CodeLanguage.python:
            return ProjectPythonCode(
                self.dbe,
                self.code_files,
                self.lsp_writers,
                self.websocket_msg_handler,
                project_state,
                sectionId,
            )
        if codeLanguage == CodeLanguage.bash:
            return ProjectBashCode(
                self.dbe,
                self.code_files,
                project_state,
                sectionId,
            )
        return None

    def _apply_rename_result_auto_mode(
        self,
        project_state: ProjectStateSingleConfig,
        changed_values: list[RenameReferenceChangedValue],
    ):
        if not changed_values:
            return
        for changed in changed_values:
            new_value = changed.newValue
            depKey = changed.depKey
            if isinstance(depKey, SectionParamDependencyKey):
                set_param_entered_value(
                    project_state,
                    depKey.sectionId,
                    depKey.codeObjId,
                    new_value,
                )
                continue
            elif isinstance(depKey, SectionDependencyKey):
                callable_code_obj = get_curr_section_callable_code_obj(
                    project_state, depKey.sectionId
                )
                if not callable_code_obj:
                    raise KeyError(
                        f"Expected callable code object for section {depKey.sectionId}"
                    )
                project_state.codeObjs[callable_code_obj.id].name = new_value

    async def maybe_do_rename_refactor(
        self,
        project_state: ProjectStateSingleConfig,
        projectConfigId: ID,
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

        changed_values = new_dep_graph.rename_references(old_dep_graph)

        if not changed_values:
            return
        if renameRefactorMode == RenameRefactorMode.ALWAYS_RENAME:
            self._apply_rename_result_auto_mode(project_state, changed_values)
            frontend_op_id = self._current_frontend_op_id.get()
            if frontend_op_id:
                self.pending_rename_results.pop(frontend_op_id, None)
            return

        frontend_op_id = self._current_frontend_op_id.get()
        if frontend_op_id:
            self.pending_rename_results[frontend_op_id] = (
                projectConfigId,
                changed_values,
            )
            await self.websocket_msg_handler.broadcast_rename_refactor_results(
                RenameRefactorBroadcastContent(
                    projectConfigId=projectConfigId,
                    frontendOpId=frontend_op_id,
                    renameMode=renameRefactorMode,
                    changedNodeValues=changed_values,
                )
            )

    @enqueue_method
    async def accept_rename_refactor(self, x: AcceptRenameRefactorRequest):
        frontend_op_id = x.frontendOpId
        if not frontend_op_id:
            raise KeyError("Expected frontendOpId when accepting rename refactor.")
        pending = self.pending_rename_results.get(frontend_op_id)
        if not pending:
            raise KeyError(f"Pending rename result not found for op {frontend_op_id}.")
        pending_project_config_id, pending_values = pending
        if pending_project_config_id != x.projectConfigId:
            raise KeyError(
                "Pending rename result projectConfigId mismatch; "
                f"expected {pending_project_config_id}, got {x.projectConfigId}."
            )
        project_state = self.get_single_config_state(x.projectConfigId)
        self._apply_rename_result_auto_mode(project_state, pending_values)
        self.pending_rename_results.pop(frontend_op_id, None)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def decline_rename_refactor(self, x: DeclineRenameRefactorRequest):
        frontend_op_id = x.frontendOpId
        if not frontend_op_id:
            raise KeyError("Expected frontendOpId when declining rename refactor.")
        pending = self.pending_rename_results.get(frontend_op_id)
        if not pending:
            raise KeyError(f"Pending rename result not found for op {frontend_op_id}.")
        pending_project_config_id, _ = pending
        if pending_project_config_id != x.projectConfigId:
            raise KeyError(
                "Pending rename result projectConfigId mismatch; "
                f"expected {pending_project_config_id}, got {x.projectConfigId}."
            )
        self.pending_rename_results.pop(frontend_op_id, None)

    @enqueue_method
    async def create_project_config(self, previewImgColor: str):
        new_project_config = ProjectConfig(
            previewImgColor=previewImgColor, viewport=None
        )
        project_state = ProjectStateSingleConfig(projectConfig=new_project_config)
        create_top_level_section(
            self.settings_file.settings,
            project_state,
            SectionType.GenPythonCode,
            Position(),
        )
        visibility_by_section_id = {
            section_id: True for section_id in project_state.sections.keys()
        }
        view_mode = ViewModeConfig(visibilityBySectionId=visibility_by_section_id)
        project_state.projectConfig.viewModes[view_mode.id] = view_mode
        project_state.projectConfig.activeViewModeId = view_mode.id
        self.project_state_backend = merge_single_config_into_backend(
            self.project_state_backend, project_state
        )
        self.project_state_backend.validate_default_project_id()
        await self.broadcast_all_project_metadata()
        return new_project_config.name

    @enqueue_method
    async def delete_project_configs(self, project_config_ids: list[ID]):
        for id in project_config_ids:
            del self.project_state_backend.projectConfigs[id]
        self.project_state_backend.validate_default_project_id()
        await self.broadcast_all_project_metadata()

    @enqueue_method
    async def set_as_default_project(self, projectConfigId: ID):
        self.project_state_backend.defaultProjectConfigId = projectConfigId
        await self.broadcast_all_project_metadata()

    @enqueue_method
    async def set_project_config_name(self, projectConfigId: ID, newName: str):
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
        try:
            Path(x.filepath).unlink()
            success = True
        except FileNotFoundError:
            await self.websocket_msg_handler.log_and_broadcast_backend_log_event(
                f"File '{x.filepath}' not found",
                severity=SettaBackendLogEventSeverity.error,
                project_config_id=x.projectConfigId,
            )
        except OSError as exc:
            await self.websocket_msg_handler.log_and_broadcast_backend_log_event(
                f"Failed to delete file: {exc}",
                severity=SettaBackendLogEventSeverity.error,
                project_config_id=x.projectConfigId,
            )
        if success:
            delete_section_variant(project_state, x.sectionId, x.variantId)
            await self.update_and_broadcast_project_state(project_state)
            await self.websocket_msg_handler.log_and_broadcast_backend_log_event(
                "Variant and file deleted",
                project_config_id=x.projectConfigId,
            )

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
        """Update the stored viewport offsets/zoom for a project configuration.

        Passing `None` for the viewport instructs the UI to re-fit the project into
        view instead of persisting explicit coordinates.
        """
        self.project_state_backend.projectConfigs[
            x.projectConfigId
        ].viewport = x.viewport

    @enqueue_method
    async def create_view_mode(self, x: CreateViewModeRequest) -> ID:
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        visibility_by_section_id = {
            section_id: True for section_id in project_state.sections.keys()
        }
        view_mode = ViewModeConfig(visibilityBySectionId=visibility_by_section_id)
        project_state.projectConfig.viewModes[view_mode.id] = view_mode
        project_state.projectConfig.activeViewModeId = view_mode.id
        project_state.projectConfig.isEditingViewMode = True
        await self.update_and_broadcast_project_state(project_state)
        return view_mode.id

    @enqueue_method
    async def set_active_view_mode(self, x: SetActiveViewModeRequest) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        if x.activeViewModeId not in project_state.projectConfig.viewModes:
            raise KeyError(f"View mode {x.activeViewModeId} not found")
        project_state.projectConfig.activeViewModeId = x.activeViewModeId
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def toggle_is_editing_view_mode(
        self, x: ToggleIsEditingViewModeRequest
    ) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        project_state.projectConfig.isEditingViewMode = (
            not project_state.projectConfig.isEditingViewMode
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def toggle_section_visibility(
        self, x: ToggleSectionVisibilityRequest
    ) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        for section_id in x.sectionIds:
            if section_id not in project_state.sections:
                raise KeyError(f"Section {section_id} not found")
        active_view_mode_id = project_state.projectConfig.activeViewModeId
        if active_view_mode_id is None:
            raise KeyError("Active view mode is not set")
        if active_view_mode_id not in project_state.projectConfig.viewModes:
            raise KeyError(f"View mode {active_view_mode_id} not found")
        view_mode = project_state.projectConfig.viewModes[active_view_mode_id]
        visibility_by_section_id = view_mode.visibilityBySectionId
        all_visible = True
        for section_id in x.sectionIds:
            if section_id not in visibility_by_section_id:
                raise KeyError(
                    "Missing visibility for section "
                    f"{section_id} in view mode {view_mode.id}"
                )
            if not visibility_by_section_id[section_id]:
                all_visible = False
                break
        next_visibility = not all_visible
        for section_id in x.sectionIds:
            visibility_by_section_id[section_id] = next_visibility
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def toggle_view_mode_user_facing(
        self, x: ToggleViewModeUserFacingRequest
    ) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        view_mode = project_state.projectConfig.viewModes[x.viewModeId]
        view_mode.isUserFacing = not view_mode.isUserFacing
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_view_mode_name(self, x: SetViewModeNameRequest) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        view_mode = project_state.projectConfig.viewModes[x.viewModeId]
        view_mode.name = x.name
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def delete_view_mode(self, x: DeleteViewModeRequest) -> None:
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        view_modes = project_state.projectConfig.viewModes
        if x.viewModeId not in view_modes:
            raise KeyError(f"View mode {x.viewModeId} not found")
        if len(view_modes) < 2:
            return
        del view_modes[x.viewModeId]
        if project_state.projectConfig.activeViewModeId == x.viewModeId:
            project_state.projectConfig.activeViewModeId = next(iter(view_modes))
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        )
    )
    async def set_section_name(self, x: SetSectionNameRequest):
        """Rename a section and broadcast the updated project state."""
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_name(project_state, x.sectionId, x.name)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        )
    )
    async def set_meta_control_show_section_title(
        self, x: SetMetaControlShowSectionTitleRequest
    ):
        """Toggle meta control title visibility and broadcast the updated project state."""
        project_state = self.get_single_config_state(x.projectConfigId)
        set_meta_control_show_section_title(
            project_state, x.sectionId, x.showSectionTitle
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_text_block_heading_as_section_name(
        self, x: SetTextBlockHeadingAsSectionNameRequest
    ):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_text_block_heading_as_section_name(
            project_state, x.sectionId, x.headingAsSectionName
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_text_block_display_mode(self, x: SetTextBlockDisplayModeRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_text_block_display_mode(project_state, x.sectionId, x.textDisplayMode)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_text_block_meta_control_style(
        self, x: SetTextBlockMetaControlStyleRequest
    ):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_text_block_meta_control_style(
            project_state, x.sectionId, x.metaControlStyle
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
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
    async def set_section_column_width(self, x: SetSectionColumnWidthRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_column_width(project_state, x.sectionId, x.columnWidth)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_browser_column_widths(self, x: SetBrowserColumnWidthsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_browser_column_widths(
            project_state,
            x.sectionId,
            x.columnWidth,
            x.typesColumnWidth,
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
    async def set_chat_section_settings(self, x: SetChatSectionSettingsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_chat_section_settings(
            project_state,
            x.sectionId,
            x.managed,
            x.llmConfigId,
            x.deepThink,
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_chat_section_state(self, x: SetChatSectionStateRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_chat_section_state(project_state, x.sectionId, x.state)
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
    async def get_chat_section_chat_id(
        self, x: GetChatSectionChatIdRequest
    ) -> ID | None:
        project_state = self.get_single_config_state(x.projectConfigId)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            x.sectionId,
            ChatSectionImpl,
        )
        chat_id = section_impl.chatId
        if chat_id is None:
            return None
        if load_chat(self.dbe, chat_id) is not None:
            return chat_id
        set_chat_section_chat_id(project_state, x.sectionId, None)
        await self.update_and_broadcast_project_state(project_state)
        return None

    @enqueue_method
    async def set_chat_section_chat_id(self, x: SetChatSectionChatIdRequest) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        set_chat_section_chat_id(project_state, x.sectionId, x.chatId)
        await self.update_and_broadcast_project_state(project_state)

    async def _apply_listener_emit_updates_to_state(
        self,
        project_state: ProjectStateSingleConfig,
        dependency_updates: list[ListenerFrontendEmitKeyAndValue],
        artifact_updates: list[BaseArtifactUnionWithDiscriminator],
    ) -> None:
        artifact_payloads: list[BaseArtifactUnion] = []

        if dependency_updates:
            apply_listener_dependency_updates(
                project_state=project_state,
                updates=dependency_updates,
            )

        if artifact_updates:
            artifact_payloads = apply_listener_artifact_updates(
                artifacts=self.artifacts,
                updates=artifact_updates,
            )

        if dependency_updates:
            await self.update_and_broadcast_project_state(project_state)

        if artifact_payloads:
            await self.websocket_msg_handler.broadcast_artifacts_update(
                artifacts=artifact_payloads,
                updateType="update",
            )

    @enqueue_method
    async def apply_listener_emit_updates(
        self,
        projectConfigId: ID,
        dependency_updates: list[ListenerFrontendEmitKeyAndValue],
        artifact_updates: list[BaseArtifactUnionWithDiscriminator],
    ) -> None:
        if not dependency_updates and not artifact_updates:
            raise ValueError("listener emits require dependency or artifact updates")

        project_state = self.get_single_config_state(projectConfigId)
        await self._apply_listener_emit_updates_to_state(
            project_state,
            dependency_updates,
            artifact_updates,
        )

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
    async def move_section(self, x: MoveSectionRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        if x.newParentId is None:
            if x.position is None:
                raise KeyError("Expected position when moving section to pane.")
            move_section_to_pane(project_state, x.sectionId, x.position)
        else:
            if x.newIndex is None:
                raise KeyError(
                    "Expected newIndex when moving section into parent section."
                )
            move_section_to_parent_section(
                project_state, x.newParentId, x.sectionId, x.newIndex
            )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def group_sections(self, x: GroupSectionsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        success = group_sections(
            self.settings_file.settings, project_state, x.sectionIds
        )
        if not success:
            await self.websocket_msg_handler.log_and_broadcast_backend_log_event(
                "Cannot group sections from different parents",
                severity=SettaBackendLogEventSeverity.error,
                project_config_id=x.projectConfigId,
            )
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

    def get_single_config_state(self, projectConfigId: ID):
        return convert_backend_to_single_config(
            self.project_state_backend, projectConfigId
        )

    def get_new_project_state_backend(self, x: ProjectStateSingleConfig):
        return merge_single_config_into_backend(self.project_state_backend, x)

    async def update_and_broadcast_project_state(
        self, project_state: ProjectStateSingleConfig, updateFileWatcher: bool = True
    ):
        await self.update(project_state, updateFileWatcher=updateFileWatcher)
        await self._broadcast_project_state_snapshot(project_state)

    async def _broadcast_project_state_snapshot(
        self,
        project_state: ProjectStateSingleConfig,
    ) -> None:
        self._mark_current_frontend_op_completed_before_broadcast()
        completed_op_ids = self.completed_op_ids_since_last_broadcast
        pending_op_ids = list(self.pending_frontend_ops.keys())
        await self.websocket_msg_handler.broadcast_project_state(
            project_state,
            completed_op_ids,
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
        """Return the most recent project state snapshot for the requested config."""
        projectState = convert_backend_to_single_config(
            self.project_state_backend, x.projectConfigId
        )
        return projectState

    @enqueue_method
    @project_state_tool(tool_type=SettaToolType.init)
    async def get_latest_project_state_summary(
        self, x: GetLatestProjectStateSummaryRequest
    ):
        """Return a lightweight summary for the requested project config."""
        project_state = convert_backend_to_single_config(
            self.project_state_backend, x.projectConfigId
        )
        return build_project_state_summary(project_state)

    @enqueue_method(require_serialization=False)
    @project_state_tool(tool_type=SettaToolType.init)
    async def get_latest_lsp_diagnostics(
        self, x: GetLatestLspDiagnosticsRequest
    ) -> SettaProjectConfigDiagnostics:
        """Return the latest parsed LSP diagnostics for generated code."""
        async with self._project_state_lock.read_lock():
            if x.projectConfigId not in self.gen_code:
                raise KeyError(
                    f"Missing generated code for project config {x.projectConfigId}"
                )
            return self.gen_code[x.projectConfigId].latest_diagnostics

    @enqueue_method
    async def autosave(self):
        try:
            self.save()
            await self._flush_deferred_json_source_loads()
            notification = SettaNotification(
                message="Autosaved!", type=SettaNotificationType.save
            )
            await self.websocket_msg_handler.broadcast_notification(notification)
        except Exception as exc:
            await (
                self.websocket_msg_handler.log_failure_and_broadcast_backend_log_event(
                    exc,
                    label="autosave",
                    message="Failed to autosave",
                    severity=SettaBackendLogEventSeverity.error,
                )
            )

    @abstractmethod
    def save(self):
        pass

    @abstractmethod
    async def save_as_new_project_config(self, x: SaveAsNewProjectConfigRequest):
        pass

    def perform_manual_save(self):
        """Run a manual save, clearing any pending autosave first."""
        self.autosave_debouncer.cancel_pending()
        self.save()

    async def finish_pending_operations(self, *, timeout: float | None = None) -> None:
        """Await completion of all queued and in-flight frontend operations."""

        async def _drain():
            await self._process_queue_task_started.wait()
            self._raise_queue_task_issue_if_any()
            await self.message_queue.join()
            while self.pending_frontend_ops:
                self._raise_queue_task_issue_if_any()
                await self._pending_ops_idle.wait()
            self._raise_queue_task_issue_if_any()

        if timeout is None:
            await _drain()
            return
        await asyncio.wait_for(_drain(), timeout)

    def _raise_queue_task_issue_if_any(self) -> None:
        if not self.queue_task.done():
            return
        if self.queue_task.cancelled():
            raise asyncio.CancelledError("BaseProjectManager queue task cancelled")
        exception = self.queue_task.exception()
        if exception:
            raise exception

    def watch_json_source_files(self):
        callback_category = f"{self._file_watcher_category_prefix}_JSONSource"

        def should_defer_reload(
            section_variants_to_load: set[tuple[ID, ID]],
            *,
            new_mapping: dict[Path, set[tuple[ID, ID]]],
            previous_mapping: dict[Path, set[tuple[ID, ID]]],
        ) -> bool:
            return self._should_defer_json_source_reload(
                section_variants_to_load,
                new_mapping,
                previous_mapping,
            )

        def on_deferred(section_variants_to_load: set[tuple[ID, ID]]) -> None:
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
            f"{self._file_watcher_category_prefix}_Artifacts",
            self.project_state_backend,
        )

    def watch_code_files(self):
        self.code_files.watch_code_files(
            f"{self._file_watcher_category_prefix}_CodeFiles",
            self.project_state_backend_getter_fn,
            self.reload_code_sections,
        )

    async def reload_code_sections(
        self,
        plan: CodeFileReloadPlan,
    ) -> None:
        """
        Handle code file watcher events by hydrating project state, updating
        cached code objects, and broadcasting the refreshed sections.
        """
        logger.debug(
            "Received code file watcher event for %s (%s) via %s",
            plan.path,
            {
                binding.section_id
                for bindings in plan.bindings_by_config.values()
                for binding in bindings
            },
            plan.core_update.eventType.value,
        )

        if not plan.bindings_by_config:
            return

        self.code_files.record_read(plan.path, plan.content_hash)

        if plan.raw_content is None:
            logger.debug(
                "No on-disk content for %s; skipping project state reload", plan.path
            )
            return

        states_to_broadcast: list[ProjectStateSingleConfig] = []
        async with self._project_state_lock.write_lock():
            base_backend = self.project_state_backend
            updated_configs: dict[ID, ProjectStateSingleConfig] = {}
            for (
                project_config_id,
                config_bindings,
            ) in plan.bindings_by_config.items():
                single_state = convert_backend_to_single_config(
                    base_backend, project_config_id
                )

                for binding in config_bindings:
                    section_id = binding.section_id
                    if section_id not in single_state.sections:
                        logger.debug(
                            "Section %s not found in project config %s during reload",
                            section_id,
                            project_config_id,
                        )
                        continue
                    set_code(single_state, section_id, plan.raw_content)
                if config_bindings:
                    updated_configs[project_config_id] = single_state

            if not updated_configs:
                return

            backend = base_backend
            for single_state in updated_configs.values():
                backend = merge_single_config_into_backend(backend, single_state)
            self.project_state_backend = backend

            for project_config_id, single_state in updated_configs.items():
                code_entries = self.code_dict.setdefault(project_config_id, {})
                config_bindings_for_id = plan.bindings_by_config.get(
                    project_config_id, []
                )
                for binding in config_bindings_for_id:
                    section_id = binding.section_id
                    if section_id not in single_state.sections:
                        continue
                    section_impl = get_curr_effective_section_impl(
                        single_state, section_id
                    )
                    if not isinstance(section_impl, CodeSectionImpl):
                        continue
                    code_entry = code_entries.get(section_id)
                    if code_entry is None:
                        code_entry = self.create_project_code(
                            single_state, section_id, section_impl
                        )
                        if code_entry:
                            code_entries[section_id] = code_entry
                    if code_entry is None:
                        continue
                    await code_entry.handle_external_reload(section_impl.code)

                states_to_broadcast.append(single_state)

        for single_state in states_to_broadcast:
            await self._broadcast_project_state_snapshot(single_state)

    def _should_defer_json_source_reload(
        self,
        section_variants_to_load: set[tuple[ID, ID]],
        new_mapping: dict[Path, set[tuple[ID, ID]]],
        previous_mapping: dict[Path, set[tuple[ID, ID]]],
    ) -> bool:
        if not section_variants_to_load or not self.autosave_debouncer.is_pending:
            return False

        variant_to_path: dict[tuple[ID, ID], Path] = {}
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
        section_variants_to_load: set[tuple[ID, ID]],
    ) -> None:
        if not section_variants_to_load:
            return
        pending = self._deferred_json_source_loads.setdefault(callback_category, set())
        pending.update(section_variants_to_load)

    async def _flush_deferred_json_source_loads(self) -> None:
        callback_category = f"{self._file_watcher_category_prefix}_JSONSource"
        pending = self._deferred_json_source_loads.pop(callback_category, None)
        if not pending:
            return
        await self.load_json_sources(self.json_source.json_sources, pending)
