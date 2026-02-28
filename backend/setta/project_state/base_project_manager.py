import asyncio
import contextvars
import copy
import hashlib
import json
import logging
import shutil
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from functools import wraps
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import (
    TYPE_CHECKING,
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
from uuid import uuid4

from fastapi import HTTPException, status

from setta.agentic.chat_view import (
    EXTERNAL_AGENT_RUN_TYPE,
    LLM_CHAT_RUN_TYPE,
    SCRIPTABLE_CHAT_RUN_TYPE,
)
from setta.agentic.store import list_agent_run_ids_by_metadata
from setta.app.definition_diagnostics import (
    build_app_capabilities,
    validate_app_definition_payload,
    validate_app_theme_or_raise,
)
from setta.app.spec_store import (
    default_app_spec_path,
    normalize_app_spec_path,
    read_app_spec,
    write_app_spec,
)
from setta.app.spec_validation import (
    validate_app_action_definitions,
    validate_app_spec,
)
from setta.code_gen.dependency_graph import (
    DependencyGraph,
    RenameReferenceChangedValue,
)
from setta.code_gen.utils import sanitize_slug
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
from setta.project_state.code import (
    build_bash_run_command,
    build_python_module_run_command,
    create_snapshot_run_command_from_code_sections_only,
    create_snapshot_run_command_from_code_sections_only_with_path,
    create_snapshot_run_command_from_sections,
    create_snapshot_run_command_from_sections_with_path,
)
from setta.project_state.code_files import (
    CodeFileReloadPlan,
    CodeFiles,
)
from setta.project_state.draw_snapshots import apply_draw_snapshot_updates
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
from setta.project_state.lsp_diagnostics_state import ProjectLspDiagnosticsState
from setta.project_state.lsp_response_handlers.signatureHelp import SignatureHelpStatus
from setta.project_state.project_code import (
    ProjectBashCode,
    ProjectBasicCode,
    ProjectGenPythonCode,
    ProjectLSPCode,
    ProjectPythonCode,
    build_python_code_generator,
)
from setta.project_state.project_manager_types import (
    AcceptRenameRefactorRequest,
    AddKwargRequest,
    AppDefinitionResponse,
    AppendDrawAreaLayerItemRequest,
    AutoLayoutTopLevelSectionsRequest,
    ChangeParamImplRequest,
    ClearTextFieldCompletionRequest,
    CodeAreaCompletionRequest,
    CreateAgenticEdgeRequest,
    CreateChildSectionsRequest,
    CreateChildSectionsViaIncrementerRequest,
    CreateEdgeRequest,
    CreateNewSectionVariantRequest,
    CreateTopLevelSectionRequest,
    CreateTopLevelSectionResponse,
    CreateViewModeRequest,
    DeclineRenameRefactorRequest,
    DeleteAgenticEdgesRequest,
    DeleteChildSectionsViaDecrementerRequest,
    DeleteEdgesRequest,
    DeleteJSONSourceFileAndVariantRequest,
    DeleteKwargRequest,
    DeleteSectionsRequest,
    DeleteSectionVariantOrAskRequest,
    DeleteSelectedParamsRequest,
    DeleteViewModeRequest,
    FormatCodeRequest,
    GenCodePrefixCompletionRequest,
    GenCodeSuffixCompletionRequest,
    GetAppDefinitionRequest,
    GetChatSectionChatIdRequest,
    GetLatestLspDiagnosticsRequest,
    GetLatestProjectStateRequest,
    GetLatestProjectStateSummaryRequest,
    GroupSectionsRequest,
    IndentParamsRequest,
    MoveParamGroupsRequest,
    MoveParamsRequest,
    MoveSectionsRequest,
    OutputAccessorCompletionRequest,
    PasteSectionsRequest,
    PrepareSectionsForCopyRequest,
    ReconnectEdgeRequest,
    RedoRequest,
    RenameRefactorBroadcastContent,
    RunCodeRequest,
    RunDetachedRequest,
    SaveAsNewProjectConfigRequest,
    SetActiveIdsRequest,
    SetActiveViewModeRequest,
    SetAgenticEdgesRequest,
    SetAppDefinitionRequest,
    SetBrowserAreaViewModeRequest,
    SetBrowserColumnWidthsRequest,
    SetBrowserHideColumnRequest,
    SetBrowserSavedSearchesRequest,
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
    SetCodeSectionAttachedTerminalRequest,
    SetCodeSectionDiagnosticCodeSuppressionRequest,
    SetCodeSectionDiagnosticsMuteRequest,
    SetDefaultSectionVariantRequest,
    SetEdgesRequest,
    SetGenCodePrefixRequest,
    SetGenCodeSuffixRequest,
    SetGroupOverflowModeRequest,
    SetImageAreaImagePathRequest,
    SetListRootViewModeRequest,
    SetMetaControlShowSectionTitleRequest,
    SetParamEnteredValueRequest,
    SetParamNameAndValueRequest,
    SetParentDefaultChildSectionTypeRequest,
    SetProjectConfigCodegenTargetsRequest,
    SetPromptFormatRequest,
    SetPromptInputsRequest,
    SetPromptTemplateRequest,
    SetSectionColumnWidthRequest,
    SetSectionEdgeInputsRequest,
    SetSectionEdgeOutputsRequest,
    SetSectionHideUnpinnedParamsRequest,
    SetSectionNameRequest,
    SetSectionParamFilterRequest,
    SetSectionPinnedParamsRequest,
    SetSectionSizesRequest,
    SetSectionStyleColorRequest,
    SetSectionTagColorRequest,
    SetSectionVariantNameRequest,
    SetSectionVariantRequest,
    SetSectionVariantSortOrderRequest,
    SetShowParamDisplayNamesRequest,
    SetSocialUrlRequest,
    SetSpreadsheetFilePathRequest,
    SetSpreadsheetSectionSettingsRequest,
    SetTaskBoardSectionStateRequest,
    SetTextBlockDisplayModeRequest,
    SetTextBlockFormatRequest,
    SetTextBlockHeadingAsSectionNameRequest,
    SetTextBlockMasterFontSizeRequest,
    SetTextBlockMetaControlStyleRequest,
    SetTextBlockTextRequest,
    SetTopLevelSectionLayoutRequest,
    SetTypeErrorIgnoreRequest,
    SetVariantJsonSourceKeysRequest,
    SetViewModeNameRequest,
    SetViewModeSortOrderRequest,
    SetViewportRequest,
    SetWatchCodeEnabledRequest,
    SetWatchCodeInputsRequest,
    TextFieldCompletionRequest,
    ToggleGroupOrientationRequest,
    ToggleIsEditingViewModeRequest,
    ToggleMinimizedRequest,
    ToggleParamSelectedRequest,
    TogglePositionLocksRequest,
    ToggleSectionVisibilityRequest,
    ToggleVariantFrozenRequest,
    ToggleVariantJSONSourceRequest,
    ToggleViewModeTabRequest,
    ToggleViewModeUserFacingRequest,
    UndoRequest,
    UngroupGroupsRequest,
    UnindentParamsRequest,
    UnselectAllParamsRequest,
    UpdateAgenticEdgeRequest,
    UpdateAppDefinitionRequest,
    UpdateEdgeRequest,
    UpdateParamImplConfigRequest,
    ValidateAppDefinitionRequest,
    ValidateAppDefinitionResponse,
)
from setta.project_state.watch_code import (
    WatchCodeManager,
    build_watch_code_snapshot,
    normalize_watch_code_files,
    normalize_watch_code_folders,
)
from setta.types.agentic_edges import AgenticEdge
from setta.types.app_definition import AppDefinition
from setta.types.chat_messages import JSONValue
from setta.types.clipboard import (
    ProjectStateCoreWithSectionVariantMap,
    SectionsClipboardData,
)
from setta.types.code_obj_impls import BaseParentCodeObjImpl
from setta.types.dependency_key import (
    SectionDependencyKey,
    SectionParamDependencyKey,
    create_dep_key,
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
    create_agentic_edge,
    create_child_sections,
    create_child_sections_via_incrementer,
    create_edge,
    create_new_section_variant,
    create_top_level_section,
    delete_agentic_edges,
    delete_child_sections_via_decrementer,
    delete_edges,
    delete_kwarg,
    delete_section_variant,
    delete_section_variant_or_ask,
    delete_sections,
    delete_selected_params,
    detach_code_section_attached_terminal,
    ensure_code_section_attached_terminal,
    ensure_code_section_embedded_terminal_size,
    get_curr_section_callable_code_obj,
    get_meta_control_param_id,
    group_sections,
    indent_params,
    maybe_update_gen_python_code_section,
    maybe_update_gen_python_metadata_section,
    move_params_to_parent,
    move_section_to_pane,
    move_section_to_parent_section,
    move_sections_to_parent_section,
    reconnect_edge,
    resolve_top_level_section_position_and_pan,
    set_agentic_edges,
    set_browser_area_view_mode,
    set_browser_column_widths,
    set_browser_hide_column,
    set_browser_saved_searches,
    set_callable_hide_params,
    set_chart_area_data_path,
    set_chart_settings,
    set_chart_type,
    set_chat_section_chat_id,
    set_chat_section_settings,
    set_chat_section_state,
    set_code,
    set_code_file_binding,
    set_code_section_diagnostic_code_suppression,
    set_code_section_diagnostics_mute,
    set_default_section_variant,
    set_edges,
    set_group_overflow_mode,
    set_image_area_image_path,
    set_list_root_view_mode,
    set_meta_control_show_section_title,
    set_param_entered_value,
    set_parent_default_child_section_type,
    set_project_config_name,
    set_prompt_section_format,
    set_prompt_section_inputs,
    set_prompt_section_template,
    set_section_column_width,
    set_section_edge_inputs,
    set_section_edge_outputs,
    set_section_hide_unpinned_params,
    set_section_name,
    set_section_param_filter,
    set_section_pinned_params,
    set_section_sizes,
    set_section_style_color,
    set_section_tag_color,
    set_section_variant,
    set_section_variant_name,
    set_social_url,
    set_spreadsheet_file_path,
    set_spreadsheet_section_settings,
    set_task_board_section_state,
    set_text_block_display_mode,
    set_text_block_format,
    set_text_block_heading_as_section_name,
    set_text_block_master_font_size,
    set_text_block_meta_control_style,
    set_text_block_text,
    set_type_error_ignore,
    set_variant_json_source_keys,
    toggle_group_orientation,
    toggle_minimized,
    toggle_param_selected,
    toggle_position_locks,
    toggle_variant_frozen,
    toggle_variant_json_source,
    ungroup_groups,
    unindent_params,
    unselect_all_params,
    update_agentic_edge,
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
from setta.types.lsp import SettaLspDiagnosticsPayload
from setta.types.name_validation import SettaProjectNameValidationErrors
from setta.types.notifications import (
    SettaBackendLogEventSeverity,
    SettaNotification,
    SettaNotificationType,
)
from setta.types.project_config import (
    Position,
    ProjectCodegenLanguage,
    ProjectCodegenPluginTarget,
    ProjectCodegenPythonTarget,
    ProjectCodegenTarget,
    ProjectConfig,
    TopLevelSectionLayout,
    ViewModeConfig,
    Viewport,
    get_python_codegen_target,
    get_python_codegen_target_with_type_guard,
    project_config_has_codegen_language,
)
from setta.types.project_state import (
    RUNNABLE_CODE_LANGUAGES,
    ProjectStateBackend,
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
    ChatSectionImpl,
    CodeFileAccessMode,
    CodeFileBinding,
    CodeLanguage,
    CodeLanguageKey,
    CodeSectionImpl,
    GenPythonCodeSectionImpl,
    GenPythonMetadataSectionImpl,
    SectionType,
    TerminalSectionImpl,
)
from setta.types.settings_state import RenameRefactorMode, RunSnapshotMode
from setta.ui_settings.errors import UISettingExpectedOldValueMismatchError
from setta.utils.async_debouncer import AsyncDebouncer
from setta.utils.async_rw_lock import AsyncReadWriteLock
from setta.utils.constants import C
from setta.utils.format_code import ruff_format_with_error
from setta.utils.generate_memorable_string import generate_memorable_string
from setta.utils.name_validation import (
    collect_param_name_errors,
    collect_project_name_format_errors,
    collect_section_name_conflicts,
    collect_section_name_format_errors,
    collect_text_block_heading_name_errors,
    validate_param_name,
    validate_param_name_format,
    validate_project_name,
    validate_view_mode_name,
)
from setta.utils.paths import get_setta_paths, normalize_workspace_path
from setta.utils.utils import build_project_sections_dir
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender

if TYPE_CHECKING:
    from setta.plugins.manager import PluginManager

logger = logging.getLogger(__name__)


def _assert_ui_setting_expected_old_value_matches(
    *,
    setting_id: str,
    expected_old_value: object | None,
    observed_old_value: object,
) -> None:
    if expected_old_value is None:
        return
    if expected_old_value == observed_old_value:
        return
    raise UISettingExpectedOldValueMismatchError(
        setting_id=setting_id,
        expected_old_value=expected_old_value,
        observed_old_value=observed_old_value,
    )


HISTORY_COALESCE_WINDOW_TEXT_S = 0.75
HISTORY_COALESCE_WINDOW_DRAG_S = 0.3
_DEFAULT_MINIMAL_APP_SPEC: dict[str, JSONValue] = {
    "key": "root",
    "type": "Stack",
    "props": {},
    "children": [],
}

_P = ParamSpec("_P")
_R = TypeVar("_R")
_T = TypeVar("_T")
_EnqueueCallable = Callable[Concatenate["BaseProjectManager", _P], Awaitable[_R]]

PluginCodegenHashesByRelativePath = dict[str, str]
PluginCodegenStatsByRelativePath = dict[str, tuple[int, int]]
PluginCodegenTargetState = tuple[
    str,
    PluginCodegenHashesByRelativePath,
    PluginCodegenStatsByRelativePath,
]


def _parse_param_override_key(key: str) -> SectionParamDependencyKey:
    pieces = key.split(":", 1)
    if len(pieces) != 2 or not pieces[0] or not pieces[1]:
        raise ValueError(f"Invalid param override key: {key!r}")
    return SectionParamDependencyKey(sectionId=pieces[0], codeObjId=pieces[1])


def _resolve_run_command_builder(
    code_language: CodeLanguageKey,
) -> Callable[[Path], str]:
    if code_language == CodeLanguage.python:
        return build_python_module_run_command
    if code_language == CodeLanguage.bash:
        return build_bash_run_command

    def _unsupported(_path: Path, *, _language: CodeLanguageKey = code_language) -> str:
        raise ValueError(f"Run is not supported for language {_language}")

    return _unsupported


def _build_code_section_inputs(
    project_state: ProjectStateSingleConfig,
) -> dict[ID, tuple[str, CodeFileBinding, Callable[[Path], str]]]:
    section_inputs: dict[ID, tuple[str, CodeFileBinding, Callable[[Path], str]]] = {}
    for section_id in project_state.sections.keys():
        section_impl = get_curr_effective_section_impl(project_state, section_id)
        if not isinstance(section_impl, CodeSectionImpl):
            continue
        binding = section_impl.codeFileBinding
        if binding is None:
            raise ValueError(f"Code section {section_id} missing codeFileBinding")
        section_inputs[section_id] = (
            section_impl.code,
            binding,
            _resolve_run_command_builder(section_impl.codeLanguage),
        )
    return section_inputs


def _apply_run_overrides(
    project_state: ProjectStateSingleConfig,
    *,
    section_variant_overrides: dict[ID, ID] | None,
    param_overrides: dict[str, str] | None,
) -> None:
    if section_variant_overrides:
        for section_id, variant_id in section_variant_overrides.items():
            if section_id not in project_state.sections:
                raise KeyError(f"Unknown section id: {section_id}")
            if variant_id not in project_state.sectionVariants:
                raise KeyError(f"Unknown variant id: {variant_id}")
            if variant_id not in project_state.sections[section_id].variants:
                raise KeyError(
                    f"Variant {variant_id} is not part of section {section_id}"
                )
            set_section_variant(project_state, section_id, variant_id)
    if param_overrides:
        for key, value in param_overrides.items():
            dep_key = _parse_param_override_key(key)
            if dep_key.sectionId not in project_state.sections:
                raise KeyError(f"Unknown section id: {dep_key.sectionId}")
            if dep_key.codeObjId not in project_state.codeObjs:
                raise KeyError(f"Unknown param id: {dep_key.codeObjId}")
            set_param_entered_value(
                project_state,
                dep_key.sectionId,
                dep_key.codeObjId,
                value,
            )


def _apply_json_merge_patch(
    base: JSONValue | None,
    patch: JSONValue,
) -> JSONValue:
    if not isinstance(patch, dict):
        return patch
    base_obj: dict[str, JSONValue] = {}
    if isinstance(base, dict):
        base_obj = dict(base)
    for key, value in patch.items():
        if value is None:
            base_obj.pop(key, None)
            continue
        base_obj[key] = _apply_json_merge_patch(base_obj.get(key), value)
    return base_obj


def _is_lsp_code_entry(
    code_entry: object,
) -> bool:
    return isinstance(code_entry, (ProjectPythonCode, ProjectLSPCode))


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
        plugin_manager: "PluginManager | None" = None,
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
        self.plugin_manager = plugin_manager
        self._file_watcher_category_prefix = f"{type(self).__name__}:{id(self)}"
        self.history = History(self.load_initial_state())
        watch_loop = None
        try:
            watch_loop = asyncio.get_running_loop()
        except RuntimeError:
            watch_loop = None
        self.watch_code_manager = WatchCodeManager(self, loop=watch_loop)
        self.gen_code: dict[str, ProjectGenPythonCode] = {}
        self.code_dict: dict[
            str,
            dict[
                str,
                ProjectPythonCode | ProjectLSPCode | ProjectBashCode | ProjectBasicCode,
            ],
        ] = {}
        self._plugin_codegen_target_state_by_project_config: dict[
            ID, dict[str, PluginCodegenTargetState]
        ] = {}
        self._plugin_codegen_output_root_by_project_config: dict[ID, Path] = {}
        self._plugin_codegen_project_state_hash_by_project_config_revision: dict[
            ID, tuple[int, str]
        ] = {}
        self.lsp_diagnostics_state_by_project_config: dict[
            ID, ProjectLspDiagnosticsState
        ] = {}
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
            self._process_queue,
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
        self._ui_setting_reveal_active_ids_version_by_project: dict[ID, int] = {}
        self._ui_setting_reveal_leases: dict[str, tuple[ID, int]] = {}
        self._bootstrap_watch_code_baselines()
        self.watch_code_manager.sync_from_backend(self.project_state_backend)
        self.watch_json_source_files()
        self.watch_artifact_files()
        self.watch_code_files()

    def _get_lsp_diagnostics_state(
        self, project_config_id: ID
    ) -> ProjectLspDiagnosticsState:
        diagnostics_state = self.lsp_diagnostics_state_by_project_config.get(
            project_config_id
        )
        if diagnostics_state is None:
            diagnostics_state = ProjectLspDiagnosticsState(
                project_config_id=project_config_id,
                websocket_msg_handler=self.websocket_msg_handler,
            )
            self.lsp_diagnostics_state_by_project_config[project_config_id] = (
                diagnostics_state
            )
        return diagnostics_state

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
                # Set the result for the waiting call unless it was cancelled.
                if future.cancelled():
                    logger.debug("Skipping result for cancelled future")
                elif future.done():
                    logger.debug("Skipping result for completed future")
                else:
                    logger.debug("Setting result on future")
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
                if future.cancelled():
                    logger.debug("Skipping exception for cancelled future")
                elif future.done():
                    logger.debug("Skipping exception for completed future")
                else:
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
        self._raise_queue_task_issue_if_any()

        if logger.isEnabledFor(logging.DEBUG):
            queue_exception: BaseException | None = None
            if self.queue_task.done() and not self.queue_task.cancelled():
                queue_exception = self.queue_task.exception()
            logger.debug(
                "Queue task status: cancelled=%s, done=%s, exception=%s",
                self.queue_task.cancelled(),
                self.queue_task.done(),
                queue_exception,
            )

        # Create a future to hold the result
        future: asyncio.Future[_T] = asyncio.get_running_loop().create_future()
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
                try:
                    self._current_frontend_op_id.reset(token)
                except ValueError:
                    # See setta.logging.context.reset_logging_context for rationale.
                    self._current_frontend_op_id.set(None)

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
        dict[
            ID, ProjectPythonCode | ProjectLSPCode | ProjectBashCode | ProjectBasicCode
        ],
    ]:
        gen_code = self.gen_code.get(projectConfigId)
        code_entries = self.code_dict.get(projectConfigId, {})
        if gen_code is not None:
            gen_code.write_to_disk(gen_code.code)
            gen_code.write_meta_to_disk()
        for code_entry in code_entries.values():
            code_entry.write_to_disk(code_entry.code)
        return gen_code, code_entries

    def _flush_code_files_for_all_configs(self) -> None:
        for project_config_id in self.project_state_backend.projectConfigs.keys():
            self._flush_code_files(project_config_id)

    def flush_code_files_for_all_configs(self) -> None:
        """Write any in-memory code buffers to disk for all configs."""
        self._flush_code_files_for_all_configs()

    @enqueue_method
    async def create_run_command(
        self,
        x: RunCodeRequest,
    ):
        project_config_id = x.projectConfigId
        section_id = x.sectionId
        run_snapshot_mode = x.runSnapshotMode
        draw_snapshots_by_section_id = x.drawSnapshotsBySectionId
        has_overrides = bool(x.sectionVariantOverrides) or bool(x.paramOverrides)
        lock = (
            self._project_state_lock.write_lock()
            if draw_snapshots_by_section_id
            else self._project_state_lock.read_lock()
        )
        async with lock:
            project_state = convert_backend_to_single_config(
                self.project_state_backend, project_config_id
            )
            project_config = project_state.projectConfig
            python_codegen_enabled = project_config_has_codegen_language(
                project_config,
                ProjectCodegenLanguage.python,
            )
            if draw_snapshots_by_section_id:
                snapshots_updated = apply_draw_snapshot_updates(
                    dbe=self.dbe,
                    project_state=project_state,
                    snapshots_by_section_id=draw_snapshots_by_section_id,
                    artifact_root=C.ARTIFACTS_FOLDER,
                )
                if snapshots_updated:
                    project_state.validate_for_update(validate_code_file_bindings=False)
                    if python_codegen_enabled:
                        await self._refresh_codegen_state(project_state)
                    self._merge_project_state_backend(
                        project_state, updateFileWatcher=False
                    )
                    if self.settings_file.settings.backend.autosave:
                        self.autosave_debouncer.trigger()
            resolved_run_snapshot_mode = (
                run_snapshot_mode or self.settings_file.settings.backend.runSnapshotMode
            )
            if has_overrides and resolved_run_snapshot_mode == RunSnapshotMode.never:
                # Overrides must be applied to an isolated snapshot.
                resolved_run_snapshot_mode = RunSnapshotMode.ephemeral

            if has_overrides:
                base_state = convert_backend_to_single_config(
                    self.project_state_backend, project_config_id
                )
                run_state = base_state.model_copy(deep=True)
                try:
                    _apply_run_overrides(
                        run_state,
                        section_variant_overrides=x.sectionVariantOverrides,
                        param_overrides=x.paramOverrides,
                    )
                except (KeyError, ValueError) as exc:
                    detail = exc.args[0] if exc.args else str(exc)
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=str(detail),
                    ) from exc

                entry_section_id = (
                    section_id or run_state.projectConfig.entryCodeBlockId
                )
                if entry_section_id:
                    section_impl = get_curr_effective_section_impl(
                        run_state, entry_section_id
                    )
                    if isinstance(
                        section_impl,
                        (GenPythonCodeSectionImpl, GenPythonMetadataSectionImpl),
                    ):
                        entry_section_id = None
                    elif isinstance(section_impl, CodeSectionImpl):
                        if section_impl.codeLanguage not in RUNNABLE_CODE_LANGUAGES:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Run is only available for Python and Bash.",
                            )

                section_inputs = _build_code_section_inputs(run_state)
                if not python_codegen_enabled:
                    if entry_section_id is None:
                        raise KeyError(
                            "Python codegen is disabled; select a code section to run."
                        )
                    if entry_section_id not in section_inputs:
                        raise KeyError(
                            f"Missing code section for run: {entry_section_id}"
                        )
                    return create_snapshot_run_command_from_code_sections_only(
                        dbe=self.dbe,
                        snapshot_root=self._resolve_run_snapshot_root(
                            resolved_run_snapshot_mode
                        ),
                        entry_section_id=entry_section_id,
                        section_inputs=section_inputs,
                    )

                dep_graph = DependencyGraph(run_state)
                code_generator = build_python_code_generator(run_state, dep_graph)
                code_generator.generate_code()
                gen_binding = run_state.genCodeBinding
                if gen_binding is None:
                    raise ValueError("Project state missing generated code binding")
                return create_snapshot_run_command_from_sections(
                    dbe=self.dbe,
                    snapshot_root=self._resolve_run_snapshot_root(
                        resolved_run_snapshot_mode
                    ),
                    entry_section_id=entry_section_id,
                    gen_code=code_generator.code,
                    gen_meta_code=code_generator.meta_code,
                    gen_binding=gen_binding,
                    section_inputs=section_inputs,
                    gen_command_builder=build_python_module_run_command,
                )

            gen_code, code_entries = self._flush_code_files(project_config_id)
            if not section_id:
                section_id = project_config.entryCodeBlockId
            if section_id:
                project_state = convert_backend_to_single_config(
                    self.project_state_backend, project_config_id
                )
                section_impl = get_curr_effective_section_impl(
                    project_state, section_id
                )
                if (
                    isinstance(section_impl, CodeSectionImpl)
                    and section_impl.codeLanguage not in RUNNABLE_CODE_LANGUAGES
                ):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Run is only available for Python and Bash.",
                    )

            if not python_codegen_enabled:
                if not section_id:
                    raise KeyError(
                        "Python codegen is disabled; select a code section to run."
                    )
                if section_id not in code_entries:
                    raise KeyError(f"Missing code section for run: {section_id}")
                if resolved_run_snapshot_mode == RunSnapshotMode.never:
                    return code_entries[section_id].get_run_command(
                        code_entries[section_id].binding.canonical_path
                    )
                snapshot_section_inputs = {
                    sid: (
                        code_entry.code,
                        code_entry.binding,
                        code_entry.get_run_command,
                    )
                    for sid, code_entry in code_entries.items()
                }
                return create_snapshot_run_command_from_code_sections_only(
                    dbe=self.dbe,
                    snapshot_root=self._resolve_run_snapshot_root(
                        resolved_run_snapshot_mode
                    ),
                    entry_section_id=section_id,
                    section_inputs=snapshot_section_inputs,
                )
            if gen_code is None:
                raise KeyError(
                    f"Missing generated code for project config {project_config_id}"
                )
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
                gen_meta_code=gen_code.meta_code,
                gen_binding=gen_code.binding,
                section_inputs=snapshot_section_inputs,
                gen_command_builder=gen_code.get_run_command,
            )

    @enqueue_method
    async def create_run_command_with_overrides(
        self,
        x: RunDetachedRequest,
    ) -> tuple[str, Path, ID | None]:
        project_config_id = x.projectConfigId
        entry_section_id = x.entrySectionId
        run_snapshot_mode = x.runSnapshotMode
        if run_snapshot_mode == RunSnapshotMode.never:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Detached runs always snapshot; runSnapshotMode=never is not supported.",
            )
        async with self._project_state_lock.read_lock():
            base_state = convert_backend_to_single_config(
                self.project_state_backend, project_config_id
            )
        project_state = base_state.model_copy(deep=True)
        _apply_run_overrides(
            project_state,
            section_variant_overrides=x.sectionVariantOverrides,
            param_overrides=x.paramOverrides,
        )
        resolved_run_snapshot_mode = (
            run_snapshot_mode or self.settings_file.settings.backend.runSnapshotMode
        )
        if resolved_run_snapshot_mode == RunSnapshotMode.never:
            resolved_run_snapshot_mode = RunSnapshotMode.ephemeral
        if not entry_section_id:
            entry_section_id = project_state.projectConfig.entryCodeBlockId
        if entry_section_id:
            section_impl = get_curr_effective_section_impl(
                project_state, entry_section_id
            )
            if isinstance(
                section_impl, (GenPythonCodeSectionImpl, GenPythonMetadataSectionImpl)
            ):
                entry_section_id = None
            elif isinstance(section_impl, CodeSectionImpl):
                if section_impl.codeLanguage not in RUNNABLE_CODE_LANGUAGES:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Run is only available for Python and Bash.",
                    )
        section_inputs = _build_code_section_inputs(project_state)
        python_codegen_enabled = project_config_has_codegen_language(
            project_state.projectConfig,
            ProjectCodegenLanguage.python,
        )
        if not python_codegen_enabled:
            if not entry_section_id:
                raise KeyError(
                    "Python codegen is disabled; select a code section to run."
                )
            if entry_section_id not in section_inputs:
                raise KeyError(f"Missing code section for run: {entry_section_id}")
            command, snapshot_path = (
                create_snapshot_run_command_from_code_sections_only_with_path(
                    dbe=self.dbe,
                    snapshot_root=self._resolve_run_snapshot_root(
                        resolved_run_snapshot_mode
                    ),
                    entry_section_id=entry_section_id,
                    section_inputs=section_inputs,
                )
            )
            return command, snapshot_path, entry_section_id

        dep_graph = DependencyGraph(project_state)
        code_generator = build_python_code_generator(project_state, dep_graph)
        code_generator.generate_code()
        gen_binding = project_state.genCodeBinding
        if gen_binding is None:
            raise ValueError("Project state missing generated code binding")
        command, snapshot_path = create_snapshot_run_command_from_sections_with_path(
            dbe=self.dbe,
            snapshot_root=self._resolve_run_snapshot_root(resolved_run_snapshot_mode),
            entry_section_id=entry_section_id,
            gen_code=code_generator.code,
            gen_meta_code=code_generator.meta_code,
            gen_binding=gen_binding,
            section_inputs=section_inputs,
            gen_command_builder=build_python_module_run_command,
        )
        return command, snapshot_path, entry_section_id

    def _resolve_run_snapshot_root(self, run_snapshot_mode: RunSnapshotMode) -> Path:
        if run_snapshot_mode == RunSnapshotMode.ephemeral:
            return C.RUNTIME_FOLDER
        if run_snapshot_mode == RunSnapshotMode.always:
            return C.CODE_FOLDER
        raise ValueError(f"Unsupported run snapshot mode: {run_snapshot_mode}")

    def _plugin_codegen_output_root(self, project_config_name: str) -> Path:
        return (
            build_project_sections_dir(C.CODE_FOLDER, project_config_name)
            / "plugin_codegen"
        )

    def _plugin_codegen_target_dir_name(self, target_id: str) -> str:
        normalized_chars: list[str] = []
        for char in target_id:
            if char.isalnum() or char in {"-", "_", "."}:
                normalized_chars.append(char)
            else:
                normalized_chars.append("_")
        normalized = "".join(normalized_chars).strip("_")
        if normalized == "":
            normalized = "_"
        short_hash = hashlib.sha256(target_id.encode("utf-8")).hexdigest()[:12]
        return f"{normalized}__{short_hash}"

    def _normalize_plugin_codegen_relative_path(self, relative_path: str) -> str:
        normalized_relative_path = relative_path.strip().replace("\\", "/")
        if normalized_relative_path == "":
            raise ValueError("Plugin codegen output path cannot be empty.")
        pure_posix_path = PurePosixPath(normalized_relative_path)
        pure_windows_path = PureWindowsPath(normalized_relative_path)
        if (
            pure_posix_path.is_absolute()
            or pure_windows_path.is_absolute()
            or pure_windows_path.drive != ""
        ):
            raise ValueError(
                "Plugin codegen output path cannot be absolute: "
                f"{normalized_relative_path}"
            )
        parts: list[str] = []
        for part in normalized_relative_path.split("/"):
            if part in {"", "."}:
                continue
            if part == "..":
                raise ValueError(
                    "Plugin codegen output path cannot escape target root: "
                    f"{normalized_relative_path}"
                )
            parts.append(part)
        if len(parts) == 0:
            raise ValueError("Plugin codegen output path cannot be empty.")
        return "/".join(parts)

    def _resolve_plugin_codegen_output_path(
        self, *, target_root: Path, relative_path: str
    ) -> Path:
        normalized_relative_path = self._normalize_plugin_codegen_relative_path(
            relative_path
        )
        target_root_resolved = target_root.resolve(strict=False)
        output_path = (target_root / normalized_relative_path).resolve(strict=False)
        if not output_path.is_relative_to(target_root_resolved):
            raise ValueError(
                "Plugin codegen output path escapes target root: "
                f"{normalized_relative_path}"
            )
        return output_path

    def _resolve_plugin_codegen_targets(
        self,
        codegen_targets: list[ProjectCodegenTarget],
    ) -> list[ProjectCodegenPluginTarget]:
        plugin_targets = self._collect_plugin_codegen_targets(codegen_targets)
        if len(plugin_targets) == 0:
            return []
        if self.plugin_manager is None:
            raise KeyError(
                "Plugin codegen targets are enabled, but plugin manager is unavailable."
            )
        for target in plugin_targets:
            if not self.plugin_manager.has_backend_codegen_target(target.language):
                raise KeyError(
                    f"Plugin codegen target is not registered: {target.language}"
                )
        return plugin_targets

    def _resolve_plugin_codegen_targets_for_refresh(
        self,
        codegen_targets: list[ProjectCodegenTarget],
    ) -> tuple[list[ProjectCodegenPluginTarget], list[str]]:
        plugin_targets = self._collect_plugin_codegen_targets(codegen_targets)
        missing_targets: list[str] = []
        if len(plugin_targets) == 0:
            return ([], [])
        if self.plugin_manager is None:
            return ([], [target.language for target in plugin_targets])
        resolved_targets: list[ProjectCodegenPluginTarget] = []
        for target in plugin_targets:
            if self.plugin_manager.has_backend_codegen_target(target.language):
                resolved_targets.append(target)
                continue
            missing_targets.append(target.language)
        return (resolved_targets, missing_targets)

    def _collect_plugin_codegen_targets(
        self,
        codegen_targets: list[ProjectCodegenTarget],
    ) -> list[ProjectCodegenPluginTarget]:
        plugin_targets: list[ProjectCodegenPluginTarget] = []
        for target in codegen_targets:
            if target.language == ProjectCodegenLanguage.python:
                continue
            if not isinstance(target, ProjectCodegenPluginTarget):
                raise TypeError("Expected plugin codegen target.")
            plugin_targets.append(target)
        return plugin_targets

    def _refresh_plugin_codegen_outputs(
        self,
        project_state: ProjectStateSingleConfig,
    ) -> None:
        plugin_targets, missing_target_ids = (
            self._resolve_plugin_codegen_targets_for_refresh(
                project_state.projectConfig.codegenTargets
            )
        )
        if len(missing_target_ids) > 0:
            missing_target_label = ", ".join(sorted(set(missing_target_ids)))
            logger.warning(
                "Skipping stale plugin codegen targets for project %s: %s",
                project_state.projectConfig.name,
                missing_target_label,
            )
        if len(plugin_targets) == 0 and len(missing_target_ids) > 0:
            logger.warning(
                "Project %s has configured plugin codegen targets with no active registrations.",
                project_state.projectConfig.name,
            )
        project_config_id = project_state.projectConfig.id
        output_root = self._plugin_codegen_output_root(project_state.projectConfig.name)
        previous_output_root = self._plugin_codegen_output_root_by_project_config.get(
            project_config_id
        )
        if (
            previous_output_root is not None
            and previous_output_root != output_root
            and previous_output_root.exists()
        ):
            shutil.rmtree(previous_output_root)
        if len(plugin_targets) == 0:
            self._plugin_codegen_target_state_by_project_config.pop(
                project_config_id, None
            )
            self._plugin_codegen_output_root_by_project_config.pop(
                project_config_id, None
            )
            self._plugin_codegen_project_state_hash_by_project_config_revision.pop(
                project_config_id,
                None,
            )
            if output_root.exists():
                shutil.rmtree(output_root)
            return
        self._plugin_codegen_output_root_by_project_config[project_config_id] = (
            output_root
        )
        assert self.plugin_manager is not None
        project_state_payload: dict[str, Any] | None = None
        project_state_hash = self._resolve_plugin_codegen_project_state_hash(
            project_state
        )
        current_target_dir_names = {
            self._plugin_codegen_target_dir_name(target.language)
            for target in plugin_targets
        }
        if output_root.exists():
            for child in output_root.iterdir():
                if not child.is_dir():
                    continue
                if child.name in current_target_dir_names:
                    continue
                shutil.rmtree(child)
        previous_target_state = self._plugin_codegen_target_state_by_project_config.get(
            project_config_id, {}
        )
        next_target_state: dict[str, PluginCodegenTargetState] = {}

        for target in plugin_targets:
            target_language = target.language
            target_root = output_root / self._plugin_codegen_target_dir_name(
                target_language
            )
            target_fingerprint = self._build_plugin_codegen_target_fingerprint(
                project_state_hash=project_state_hash,
                target_id=target_language,
                target_options=target.options,
                target_implementation_key=self.plugin_manager.get_backend_codegen_target_implementation_key(
                    target_language
                ),
            )
            previous_state = previous_target_state.get(target_language)
            if previous_state is not None and previous_state[0] == target_fingerprint:
                cached_outputs_exist, output_stats_by_relative_path = (
                    self._cached_plugin_codegen_outputs_exist(
                        target_root=target_root,
                        output_hashes_by_relative_path=previous_state[1],
                        output_stats_by_relative_path=previous_state[2],
                    )
                )
                if cached_outputs_exist:
                    next_target_state[target_language] = (
                        target_fingerprint,
                        previous_state[1],
                        output_stats_by_relative_path,
                    )
                    continue

            if previous_state is None and target_root.exists():
                shutil.rmtree(target_root)
            if project_state_payload is None:
                project_state_payload = project_state.model_dump(mode="json")
            generated_files = self.plugin_manager.generate_backend_codegen_target(
                target_id=target_language,
                project_state=project_state_payload,
                target_options=target.options,
            )
            generated_contents_by_relative_path: dict[str, str] = {}
            for relative_path, content in generated_files:
                normalized_relative_path = self._normalize_plugin_codegen_relative_path(
                    relative_path
                )
                if normalized_relative_path in generated_contents_by_relative_path:
                    raise ValueError(
                        "Plugin codegen output path is duplicated: "
                        f"{normalized_relative_path}"
                    )
                output_path = self._resolve_plugin_codegen_output_path(
                    target_root=target_root,
                    relative_path=normalized_relative_path,
                )
                self._prepare_plugin_codegen_output_path_for_write(
                    target_root=target_root,
                    output_path=output_path,
                )
                output_path.parent.mkdir(parents=True, exist_ok=True)
                generated_contents_by_relative_path[normalized_relative_path] = (
                    self._hash_plugin_codegen_content(content)
                )
                if output_path.exists():
                    existing_content = output_path.read_text(encoding="utf-8")
                    if existing_content == content:
                        continue
                self.dbe.write(output_path, content)

            previous_paths = (
                set(previous_state[1].keys()) if previous_state is not None else set()
            )
            normalized_previous_paths = {
                self._normalize_plugin_codegen_relative_path(relative_path)
                for relative_path in previous_paths
            }
            stale_relative_paths = normalized_previous_paths - set(
                generated_contents_by_relative_path.keys()
            )
            for relative_path in stale_relative_paths:
                stale_path = self._resolve_plugin_codegen_output_path(
                    target_root=target_root,
                    relative_path=relative_path,
                )
                if not stale_path.exists() or not stale_path.is_file():
                    continue
                stale_path.unlink()
                self._prune_empty_codegen_directories(
                    directory=stale_path.parent,
                    stop_root=target_root,
                )
            self._prune_unexpected_plugin_codegen_outputs(
                target_root=target_root,
                expected_relative_paths=set(generated_contents_by_relative_path.keys()),
            )
            generated_output_stats = self._collect_plugin_codegen_output_stats(
                target_root=target_root,
                relative_paths=set(generated_contents_by_relative_path.keys()),
            )
            next_target_state[target_language] = (
                target_fingerprint,
                generated_contents_by_relative_path,
                generated_output_stats,
            )
        self._plugin_codegen_target_state_by_project_config[project_config_id] = (
            next_target_state
        )

    def _cached_plugin_codegen_outputs_exist(
        self,
        *,
        target_root: Path,
        output_hashes_by_relative_path: PluginCodegenHashesByRelativePath,
        output_stats_by_relative_path: PluginCodegenStatsByRelativePath,
    ) -> tuple[bool, PluginCodegenStatsByRelativePath]:
        if not target_root.exists() or not target_root.is_dir():
            return (False, {})
        expected_hashes_by_relative_path: PluginCodegenHashesByRelativePath = {
            self._normalize_plugin_codegen_relative_path(relative_path): expected_hash
            for relative_path, expected_hash in output_hashes_by_relative_path.items()
        }
        expected_relative_paths = set(expected_hashes_by_relative_path.keys())
        discovered_relative_paths = self._collect_plugin_codegen_relative_paths(
            target_root
        )
        if discovered_relative_paths != expected_relative_paths:
            return (False, {})
        observed_output_stats = self._collect_plugin_codegen_output_stats(
            target_root=target_root,
            relative_paths=expected_relative_paths,
        )
        expected_output_stats = {
            self._normalize_plugin_codegen_relative_path(relative_path): stats
            for relative_path, stats in output_stats_by_relative_path.items()
        }
        if observed_output_stats == expected_output_stats:
            return (True, observed_output_stats)
        for relative_path, expected_hash in expected_hashes_by_relative_path.items():
            output_path = target_root / relative_path
            if not output_path.exists() or not output_path.is_file():
                return (False, {})
            output_content = output_path.read_text(encoding="utf-8")
            output_hash = self._hash_plugin_codegen_content(output_content)
            if output_hash != expected_hash:
                return (False, {})
        return (True, observed_output_stats)

    def _collect_plugin_codegen_relative_paths(self, target_root: Path) -> set[str]:
        relative_paths: set[str] = set()
        for output_path in target_root.rglob("*"):
            if not output_path.is_file():
                continue
            relative_path = output_path.relative_to(target_root).as_posix()
            normalized_relative_path = self._normalize_plugin_codegen_relative_path(
                relative_path
            )
            relative_paths.add(normalized_relative_path)
        return relative_paths

    def _collect_plugin_codegen_output_stats(
        self,
        *,
        target_root: Path,
        relative_paths: set[str],
    ) -> PluginCodegenStatsByRelativePath:
        output_stats: PluginCodegenStatsByRelativePath = {}
        for relative_path in relative_paths:
            output_path = self._resolve_plugin_codegen_output_path(
                target_root=target_root,
                relative_path=relative_path,
            )
            if not output_path.exists() or not output_path.is_file():
                return {}
            stat = output_path.stat()
            output_stats[relative_path] = (stat.st_size, stat.st_mtime_ns)
        return output_stats

    def _prune_unexpected_plugin_codegen_outputs(
        self,
        *,
        target_root: Path,
        expected_relative_paths: set[str],
    ) -> None:
        existing_relative_paths = self._collect_plugin_codegen_relative_paths(
            target_root
        )
        stale_relative_paths = existing_relative_paths - expected_relative_paths
        for relative_path in stale_relative_paths:
            stale_path = self._resolve_plugin_codegen_output_path(
                target_root=target_root,
                relative_path=relative_path,
            )
            if not stale_path.exists() or not stale_path.is_file():
                continue
            stale_path.unlink()
            self._prune_empty_codegen_directories(
                directory=stale_path.parent,
                stop_root=target_root,
            )

    def _hash_plugin_codegen_content(self, content: str) -> str:
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    def _prepare_plugin_codegen_output_path_for_write(
        self,
        *,
        target_root: Path,
        output_path: Path,
    ) -> None:
        parent_paths: list[Path] = []
        current = output_path.parent
        while current != target_root and current.is_relative_to(target_root):
            parent_paths.append(current)
            current = current.parent
        for parent_path in reversed(parent_paths):
            if not parent_path.exists():
                continue
            if parent_path.is_file() or parent_path.is_symlink():
                parent_path.unlink()
        if not output_path.exists():
            return
        if output_path.is_symlink():
            output_path.unlink()
            return
        if output_path.is_file():
            return
        shutil.rmtree(output_path)

    def _hash_plugin_codegen_project_state(self, project_state: dict[str, Any]) -> str:
        encoded = json.dumps(
            project_state,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    def _resolve_plugin_codegen_project_state_hash(
        self,
        project_state: ProjectStateSingleConfig,
    ) -> str:
        project_config_id = project_state.projectConfig.id
        history_revision = self.history.revision
        cached_hash = (
            self._plugin_codegen_project_state_hash_by_project_config_revision.get(
                project_config_id
            )
        )
        if cached_hash is not None and cached_hash[0] == history_revision:
            return cached_hash[1]
        project_state_payload = project_state.model_dump(mode="json")
        project_state_hash = self._hash_plugin_codegen_project_state(
            project_state_payload
        )
        self._plugin_codegen_project_state_hash_by_project_config_revision[
            project_config_id
        ] = (history_revision, project_state_hash)
        return project_state_hash

    def _hash_plugin_codegen_target_options(
        self, target_options: dict[str, Any]
    ) -> str:
        encoded = json.dumps(
            target_options,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    def _build_plugin_codegen_target_fingerprint(
        self,
        *,
        project_state_hash: str,
        target_id: str,
        target_options: dict[str, Any],
        target_implementation_key: str,
    ) -> str:
        target_options_hash = self._hash_plugin_codegen_target_options(target_options)
        encoded = (
            f"{project_state_hash}:{target_id}:{target_options_hash}:"
            f"{target_implementation_key}"
        )
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    def _prune_empty_codegen_directories(
        self, *, directory: Path, stop_root: Path
    ) -> None:
        current = directory
        while current != stop_root and current.is_relative_to(stop_root):
            if not current.exists() or not current.is_dir():
                current = current.parent
                continue
            if any(current.iterdir()):
                return
            current.rmdir()
            current = current.parent

    def _require_python_codegen(self, project_config_id: ID) -> ProjectGenPythonCode:
        project_config = self.project_state_backend.projectConfigs[project_config_id]
        if not project_config_has_codegen_language(
            project_config,
            ProjectCodegenLanguage.python,
        ):
            raise KeyError(
                f"Python codegen disabled for project config {project_config_id}."
            )
        if project_config_id not in self.gen_code:
            raise KeyError(
                f"Missing generated code for project config {project_config_id}."
            )
        return self.gen_code[project_config_id]

    def _get_active_view_mode(
        self,
        project_state: ProjectStateSingleConfig,
    ) -> ViewModeConfig:
        active_view_mode_id = project_state.projectConfig.activeViewModeId
        if active_view_mode_id is None:
            raise KeyError("Active view mode is not set")
        view_mode = project_state.projectConfig.viewModes.get(active_view_mode_id)
        if not view_mode:
            raise KeyError(f"View mode {active_view_mode_id} not found")
        return view_mode

    def _clone_top_level_sections(
        self,
        top_level_sections: dict[ID, TopLevelSectionLayout],
    ) -> dict[ID, TopLevelSectionLayout]:
        return copy.deepcopy(top_level_sections)

    def _clone_viewport(self, viewport: Viewport | None) -> Viewport | None:
        return copy.deepcopy(viewport)

    @enqueue_method
    async def load_project_config(self, projectConfigId: ID):
        projectState = convert_backend_to_single_config(
            self.project_state_backend, projectConfigId
        )
        project_state = await self.maybe_init_project_config(projectState)
        await self._broadcast_name_validation_errors(project_state)
        return project_state

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
        ),
        access_type="structural",
    )
    async def set_top_level_section_layout(self, x: SetTopLevelSectionLayoutRequest):
        """Persist the provided top-level section layout ordering for a project."""
        project_config = self.project_state_backend.projectConfigs[x.projectConfigId]
        active_view_mode_id = project_config.activeViewModeId
        if active_view_mode_id is None:
            raise KeyError("Active view mode is not set")
        view_mode = project_config.viewModes.get(active_view_mode_id)
        if view_mode is None:
            raise KeyError(f"View mode {active_view_mode_id} not found")
        existing_layouts = view_mode.topLevelSections
        section_variant_ids = set(project_config.sectionVariantMap.keys())
        existing_section_ids = {
            section_id
            for section_id in section_variant_ids
            if section_id in self.project_state_backend.sections
        }
        parent_section_map = convert_backend_to_single_config(
            self.project_state_backend, x.projectConfigId
        ).parentSectionMap
        valid_top_level_section_ids = {
            section_id
            for section_id in existing_section_ids
            if section_id in parent_section_map
            and parent_section_map[section_id] is None
        }
        merged_layouts = {
            section_id: layout
            for section_id, layout in existing_layouts.items()
            if section_id in valid_top_level_section_ids
        }
        for section_id, layout in x.topLevelSections.items():
            if section_id not in valid_top_level_section_ids:
                continue
            merged_layouts[section_id] = layout
        project_config.topLevelSections = merged_layouts
        view_mode.topLevelSections = merged_layouts

    @enqueue_method
    @project_state_tool(access_type="structural")
    async def auto_layout_top_level_sections(
        self, x: AutoLayoutTopLevelSectionsRequest
    ):
        """Automatically arrange top-level sections using rectangle packing."""
        project_state = self.get_single_config_state(x.projectConfigId)
        auto_layout_top_level_sections(
            self.settings_file.settings, project_state, margin=x.margin
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionSizes"]}
        ),
        access_type="structural",
    )
    async def set_section_sizes(self, x: SetSectionSizesRequest):
        """Update section size settings for the requested sections and broadcast the refreshed project state."""
        section_ids = sorted(x.sectionSizes.keys())
        coalesce_key = f"sectionSize:{x.projectConfigId}:{','.join(section_ids)}"
        self.add_new_history_entry(
            coalesce_key=coalesce_key,
            coalesce_window_s=HISTORY_COALESCE_WINDOW_DRAG_S,
        )
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_sizes(self.settings_file.settings, project_state, x.sectionSizes)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

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
                singleConfig,
                updateFileWatcher=False,
            )

    async def _refresh_codegen_state(
        self,
        projectState: ProjectStateSingleConfig,
    ) -> None:
        projectConfig = projectState.projectConfig
        projectConfigId = projectConfig.id
        diagnostics_state = self._get_lsp_diagnostics_state(projectConfigId)
        valid_code_section_ids: set[ID] = set()
        for section_id in projectState.sections.keys():
            section_impl = get_curr_effective_section_impl(projectState, section_id)
            if isinstance(section_impl, CodeSectionImpl):
                valid_code_section_ids.add(section_id)
        await diagnostics_state.prune_code_sections(valid_code_section_ids)
        python_codegen_enabled = project_config_has_codegen_language(
            projectConfig,
            ProjectCodegenLanguage.python,
        )

        if python_codegen_enabled:
            dep_graph = DependencyGraph(projectState)
            prev_undefined_callable_sections: set[ID] = set()
            prev_callable_mismatch_sections: set[ID] = set()
            if projectConfigId in self.gen_code:
                prev_undefined_callable_sections = set(
                    self.gen_code[projectConfigId].latest_undefined_callable_sections
                )
                prev_callable_mismatch_sections = set(
                    self.gen_code[projectConfigId].latest_callable_mismatch_sections
                )
                await self.maybe_do_rename_refactor(
                    projectState, projectConfigId, dep_graph
                )
                self.gen_code[projectConfigId].callback_cleanup()

            code_generator = build_python_code_generator(projectState, dep_graph)
            code_generator.generate_code()
            # Keep existing diagnostics until the LSP publishes for the new code to
            # avoid flicker from intermediate empty snapshots.
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
                diagnostics_state,
                initial_undefined_callable_sections=prev_undefined_callable_sections,
                initial_callable_mismatch_sections=prev_callable_mismatch_sections,
                on_callable_symbols_resolved=self.auto_refetch_callable_params,
                on_callable_signature_mismatch=(
                    self.auto_refetch_callable_params_on_lsp_mismatch
                ),
            )
            if not new_gen_code.binding.canonical_path.exists():
                new_gen_code.write_to_disk(new_gen_code.code)
            if new_gen_code.meta_code is not None:
                new_gen_code.write_meta_to_disk()
            if self.lsp_writers.full is not None:
                await new_gen_code.sync_lsp(new_gen_code.code)
            else:
                # No LSP will publish new diagnostics, so clear stale gen code state.
                await diagnostics_state.reset(
                    clear_gen_code=True,
                    clear_unmapped=True,
                )
            maybe_update_gen_python_code_section(
                projectState, new_gen_code.generated_code
            )
            maybe_update_gen_python_metadata_section(
                projectState, new_gen_code.meta_code
            )
            self.gen_code[projectConfigId] = new_gen_code
        else:
            if projectConfigId in self.gen_code:
                self.gen_code[projectConfigId].callback_cleanup()
                self.gen_code.pop(projectConfigId, None)
            await diagnostics_state.reset(
                clear_gen_code=True,
                clear_unmapped=True,
            )
        self._refresh_plugin_codegen_outputs(projectState)

        if self.code_dict.get(projectConfigId):
            for c in self.code_dict[projectConfigId].values():
                if _is_lsp_code_entry(c):
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
                if (
                    _is_lsp_code_entry(section_code)
                    and section_code.lsp_writer is not None
                ):
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
            self.watch_code_manager.sync_from_backend(self.project_state_backend)

    def _bootstrap_watch_code_baselines(self) -> None:
        base_backend = self.project_state_backend
        updated_backend = base_backend
        for project_config_id, config in base_backend.projectConfigs.items():
            if not config.watchCodeEnabled:
                continue
            if config.watchCodeBaselineByPath:
                continue
            project_state = convert_backend_to_single_config(
                updated_backend, project_config_id
            )
            self.watch_code_manager.baseline_on_enable(project_state)
            updated_backend = merge_single_config_into_backend(
                updated_backend, project_state
            )
        if updated_backend is not base_backend:
            self.project_state_backend = updated_backend

    def shutdown(self) -> None:
        categories = (
            f"{self._file_watcher_category_prefix}_JSONSource",
            f"{self._file_watcher_category_prefix}_Artifacts",
            f"{self._file_watcher_category_prefix}_CodeFiles",
        )
        for category in categories:
            self.specific_file_watcher.update_callbacks({}, category, [])
        self.watch_code_manager.shutdown()
        self.autosave_debouncer.cancel()
        self.queue_task.cancel()

    async def update(
        self,
        projectState: ProjectStateSingleConfig,
        updateFileWatcher: bool = True,
        validate_code_file_bindings: bool = True,
        allow_reserved_project_name: bool = False,
        validate_name_rules: bool = True,
    ):
        async with self._project_state_lock.write_lock():
            projectState._section_slug_cache = None
            projectState.validate_for_update(
                validate_code_file_bindings=validate_code_file_bindings,
                allow_reserved_project_name=allow_reserved_project_name,
                validate_name_rules=validate_name_rules,
            )
            # Codegen state is required even when the LSP is disabled (e.g. in tests
            # or headless/server contexts). _refresh_codegen_state already handles
            # the no-LSP case by skipping sync and resetting diagnostics.
            await self._refresh_codegen_state(projectState)
            self._merge_project_state_backend(
                projectState,
                updateFileWatcher=updateFileWatcher,
            )

    @enqueue_method(require_serialization=False)
    async def type_check(self, projectConfigId: ID):
        async with self._project_state_lock.read_lock():
            gen_code = self.gen_code.get(projectConfigId)
            code_entries = list(self.code_dict.get(projectConfigId, {}).values())
        if gen_code is not None:
            await gen_code.type_check()
        for code_entry in code_entries:
            if _is_lsp_code_entry(code_entry):
                await code_entry.type_check()

    async def _refetch_callable_params(
        self,
        projectConfigId: ID,
        sectionIds: set[ID],
        *,
        coalesce_key_prefix: str,
    ) -> None:
        if not sectionIds:
            return
        project_state = self.get_single_config_state(projectConfigId)
        refetch_targets: list[tuple[ID, str]] = []
        for section_id in sorted(sectionIds):
            if section_id not in project_state.sections:
                continue
            section_impl = get_curr_effective_section_impl(project_state, section_id)
            if not isinstance(section_impl, CallableSectionImpl):
                continue
            if section_impl.callable is None:
                continue
            callable_id = section_impl.callable
            if callable_id not in project_state.codeObjs:
                raise KeyError(
                    f"Missing callable {callable_id} for section {section_id}."
                )
            callable_name = project_state.codeObjs[callable_id].name
            refetch_targets.append((section_id, callable_name))
        if not refetch_targets:
            return
        gen_code = self._require_python_codegen(projectConfigId)
        should_add_history = any(
            create_dep_key(sectionId=section_id) in gen_code.code_generator.lines
            for section_id, _ in refetch_targets
        )
        on_before_mutation = None
        if should_add_history:
            refetch_section_ids = [section_id for section_id, _ in refetch_targets]
            coalesce_key = (
                f"{coalesce_key_prefix}:{projectConfigId}:"
                f"{','.join(map(str, refetch_section_ids))}"
            )
            history_recorded = False

            def record_history() -> None:
                nonlocal history_recorded
                if history_recorded:
                    return
                history_recorded = True
                self.add_new_history_entry(
                    coalesce_key=coalesce_key,
                    coalesce_window_s=HISTORY_COALESCE_WINDOW_TEXT_S,
                )

            on_before_mutation = record_history
        settings = self.settings_file.settings
        did_update = False
        for section_id, callable_name in refetch_targets:
            prev_callable = get_curr_section_callable_code_obj(
                project_state, section_id
            )
            prev_callable_id = prev_callable.id if prev_callable else None
            response = await gen_code.set_callable(
                settings,
                project_state,
                section_id,
                callable_name,
                True,
                on_before_mutation=on_before_mutation,
            )
            if response.lspStatus != SignatureHelpStatus.SKIPPED:
                did_update = True
                continue
            if response.callableId != prev_callable_id:
                did_update = True
        if did_update:
            await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def auto_refetch_callable_params(
        self,
        projectConfigId: ID,
        sectionIds: set[ID],
    ) -> None:
        await self._refetch_callable_params(
            projectConfigId,
            sectionIds,
            coalesce_key_prefix="autoRefetchCallable",
        )

    @enqueue_method
    async def auto_refetch_callable_params_on_lsp_mismatch(
        self,
        projectConfigId: ID,
        sectionIds: set[ID],
    ) -> None:
        if not sectionIds:
            return
        if not self.settings_file.settings.backend.autoRefetchCallableParamsOnLspMismatch:
            return
        logger.debug(
            "auto_refetch_callable_params_on_lsp_mismatch project_config_id=%s section_ids=%s",
            projectConfigId,
            sorted(sectionIds),
        )
        await self._refetch_callable_params(
            projectConfigId,
            sectionIds,
            coalesce_key_prefix="autoRefetchCallableMismatch",
        )

    @enqueue_method(require_serialization=False)
    async def text_field_completion(self, x: TextFieldCompletionRequest):
        async with self._project_state_lock.read_lock():
            gen_code = self._require_python_codegen(x.projectConfigId)
        return await gen_code.text_field_completion(
            x.sectionId, x.paramInfoId, x.fullText, x.position
        )

    @enqueue_method(require_serialization=False)
    async def output_accessor_completion(self, x: OutputAccessorCompletionRequest):
        async with self._project_state_lock.read_lock():
            gen_code = self._require_python_codegen(x.projectConfigId)
        return await gen_code.output_accessor_completion(
            x.sectionId, x.fullText, x.position
        )

    @enqueue_method(require_serialization=False)
    async def clear_text_field_completion(self, x: ClearTextFieldCompletionRequest):
        async with self._project_state_lock.read_lock():
            gen_code = self._require_python_codegen(x.projectConfigId)
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
        access_type="write",
    )
    async def set_callable(self, x: SetCallableRequest) -> SetCallableResponse:
        """Update a section's callable binding and refresh the surrounding project."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        gen_code = self._require_python_codegen(x.projectConfigId)
        result = await gen_code.set_callable(
            self.settings_file.settings,
            project_state,
            x.sectionId,
            x.callableName,
            x.refetchParams,
        )
        await self.update_and_broadcast_project_state(
            project_state,
            validate_name_rules=False,
        )
        return result

    @enqueue_method(require_serialization=False)
    async def code_area_completion(self, x: CodeAreaCompletionRequest):
        async with self._project_state_lock.read_lock():
            code = self.code_dict[x.projectConfigId][x.sectionId]
        if _is_lsp_code_entry(code):
            return await code.code_area_completion(x.fullText, x.position)
        return []

    @enqueue_method(require_serialization=False)
    async def gen_code_prefix_completion(self, x: GenCodePrefixCompletionRequest):
        async with self._project_state_lock.read_lock():
            gen_code = self._require_python_codegen(x.projectConfigId)
        return await gen_code.gen_code_prefix_completion(x.fullText, x.position)

    @enqueue_method(require_serialization=False)
    async def gen_code_suffix_completion(self, x: GenCodeSuffixCompletionRequest):
        async with self._project_state_lock.read_lock():
            gen_code = self._require_python_codegen(x.projectConfigId)
        return await gen_code.gen_code_suffix_completion(x.fullText, x.position)

    @enqueue_method
    @project_state_tool(
        access_type="write", default_target_singleton_section="GenPythonCode"
    )
    async def set_gen_code_prefix(self, x: SetGenCodePrefixRequest):
        """Persist the prefix template used when generating runtime code."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        python_target = get_python_codegen_target_with_type_guard(
            project_state.projectConfig
        )
        python_target.genCodePrefix = x.genCodePrefix
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    @project_state_tool(
        access_type="write", default_target_singleton_section="GenPythonCode"
    )
    async def set_gen_code_suffix(self, x: SetGenCodeSuffixRequest):
        """Persist the suffix template used when generating runtime code."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        python_target = get_python_codegen_target_with_type_guard(
            project_state.projectConfig
        )
        python_target.genCodeSuffix = x.genCodeSuffix
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    @project_state_tool(access_type="structural")
    async def set_project_config_codegen_targets(
        self, x: SetProjectConfigCodegenTargetsRequest
    ):
        """Update the codegen targets for a project configuration."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        self._apply_project_config_codegen_targets(
            project_state=project_state,
            codegen_targets=x.codegenTargets,
        )
        await self.update_and_broadcast_project_state(
            project_state,
            validate_name_rules=False,
        )

    def _apply_project_config_codegen_targets(
        self,
        *,
        project_state: ProjectStateSingleConfig,
        codegen_targets: list[ProjectCodegenTarget],
    ) -> None:
        seen_languages: set[str] = set()
        for target in codegen_targets:
            if target.language in seen_languages:
                raise ValueError(
                    f"Duplicate codegen target language: {target.language}"
                )
            seen_languages.add(target.language)
        self._resolve_plugin_codegen_targets(codegen_targets)
        prev_python_target = get_python_codegen_target(project_state.projectConfig)
        prev_python_enabled = project_config_has_codegen_language(
            project_state.projectConfig,
            ProjectCodegenLanguage.python,
        )
        prev_metadata_enabled = bool(
            prev_python_target and prev_python_target.generateMetadata
        )
        project_state.projectConfig.codegenTargets = codegen_targets
        next_python_target = get_python_codegen_target(project_state.projectConfig)
        next_python_enabled = project_config_has_codegen_language(
            project_state.projectConfig,
            ProjectCodegenLanguage.python,
        )
        next_metadata_enabled = bool(
            next_python_target and next_python_target.generateMetadata
        )
        if prev_python_enabled and not next_python_enabled:
            project_state.genCodeBinding = None
            gen_section_id = project_state.singletonSections.GenPythonCode
            meta_section_id = project_state.singletonSections.GenPythonMetadata
            sections_to_delete: list[ID] = []
            if (
                gen_section_id is not None
                and project_state.projectConfig.entryCodeBlockId == gen_section_id
            ):
                project_state.projectConfig.entryCodeBlockId = None
            if gen_section_id is not None:
                sections_to_delete.append(gen_section_id)
            if meta_section_id is not None:
                sections_to_delete.append(meta_section_id)
            if sections_to_delete:
                project_state.validate_parent_section_map()
                delete_sections(project_state, sections_to_delete)
        if (
            next_python_enabled
            and project_state.singletonSections.GenPythonCode is None
        ):
            create_top_level_section(
                self.settings_file.settings,
                project_state,
                SectionType.GenPythonCode,
                Position(),
            )
        if next_python_enabled:
            if prev_metadata_enabled and not next_metadata_enabled:
                meta_section_id = project_state.singletonSections.GenPythonMetadata
                if meta_section_id is not None:
                    project_state.validate_parent_section_map()
                    delete_sections(project_state, [meta_section_id])
            if (
                next_metadata_enabled
                and project_state.singletonSections.GenPythonMetadata is None
            ):
                create_top_level_section(
                    self.settings_file.settings,
                    project_state,
                    SectionType.GenPythonMetadata,
                    Position(),
                )

    @enqueue_method
    async def compare_and_set_python_codegen_enabled(
        self,
        project_config_id: ID,
        enabled: bool,
        *,
        expected_old_value: bool | None = None,
    ) -> tuple[bool, bool]:
        project_state = self.get_single_config_state(project_config_id)
        old_value = project_config_has_codegen_language(
            project_state.projectConfig,
            ProjectCodegenLanguage.python,
        )
        _assert_ui_setting_expected_old_value_matches(
            setting_id="core.run_instructions.python_codegen_enabled",
            expected_old_value=expected_old_value,
            observed_old_value=old_value,
        )
        existing_targets = list(project_state.projectConfig.codegenTargets)
        python_target: ProjectCodegenPythonTarget | None = None
        for target in existing_targets:
            if target.language == ProjectCodegenLanguage.python:
                if not isinstance(target, ProjectCodegenPythonTarget):
                    raise ValueError(
                        "Project config has invalid python codegen target type."
                    )
                python_target = target
                continue
            if not isinstance(target, ProjectCodegenPluginTarget):
                raise ValueError(
                    "Project config has invalid plugin codegen target type: "
                    f"{target.language}."
                )
        if old_value == enabled:
            return old_value, old_value
        next_targets: list[ProjectCodegenTarget]
        if enabled:
            next_targets = [
                *existing_targets,
                python_target
                if python_target is not None
                else ProjectCodegenPythonTarget(),
            ]
        else:
            next_targets = [
                target
                for target in existing_targets
                if target.language != ProjectCodegenLanguage.python
            ]
        self.add_new_history_entry()
        self._apply_project_config_codegen_targets(
            project_state=project_state,
            codegen_targets=next_targets,
        )
        await self.update_and_broadcast_project_state(
            project_state,
            validate_name_rules=False,
        )
        new_value = project_config_has_codegen_language(
            project_state.projectConfig,
            ProjectCodegenLanguage.python,
        )
        return old_value, new_value

    @enqueue_method(require_serialization=False)
    @project_state_tool(access_type="structural")
    async def get_app_definition(
        self, _x: GetAppDefinitionRequest
    ) -> AppDefinitionResponse:
        """Fetch the stored app UI spec and definition."""
        self._get_default_project_state()
        app_definition = self.project_state_backend.appDefinition
        app_spec = None
        if app_definition and app_definition.appSpecPath:
            app_spec = read_app_spec(self.dbe, app_definition.appSpecPath)
        return AppDefinitionResponse(appSpec=app_spec, appDefinition=app_definition)

    @enqueue_method(require_serialization=False)
    @project_state_tool(access_type="structural")
    async def validate_app_definition(
        self, x: ValidateAppDefinitionRequest
    ) -> ValidateAppDefinitionResponse:
        """Validate an app spec + definition overrides without persisting them."""
        self._get_default_project_state()
        app_definition = self.project_state_backend.appDefinition or AppDefinition()
        updates: dict[str, JSONValue | str | None] = {}
        if x.appSpecVersion is not None:
            updates["appSpecVersion"] = x.appSpecVersion
        if x.catalogId is not None:
            updates["catalogId"] = x.catalogId
        if x.routes is not None:
            updates["routes"] = x.routes
        if x.dataBindings is not None:
            updates["dataBindings"] = x.dataBindings
        if x.actions is not None:
            updates["actions"] = x.actions
        if x.theme is not None:
            updates["theme"] = x.theme
        if x.assets is not None:
            updates["assets"] = x.assets

        updated_definition = app_definition.model_copy(update=updates)
        errors, warnings = validate_app_definition_payload(
            x.appSpec, definition=updated_definition
        )
        capabilities = build_app_capabilities(updated_definition)
        return ValidateAppDefinitionResponse(
            errors=errors,
            warnings=warnings,
            capabilities=capabilities,
        )

    @enqueue_method
    @project_state_tool(access_type="structural")
    async def set_app_definition(
        self, x: SetAppDefinitionRequest
    ) -> AppDefinitionResponse:
        """Replace the stored app UI spec and update app definition metadata."""
        self.add_new_history_entry()
        project_state = self._get_default_project_state()
        app_definition = self.project_state_backend.appDefinition or AppDefinition()
        target_path = (
            x.appSpecPath or app_definition.appSpecPath or default_app_spec_path()
        )
        normalized_path = normalize_app_spec_path(self.dbe, target_path)
        updates: dict[str, JSONValue | str | None] = {"appSpecPath": normalized_path}
        if x.appSpecVersion is not None:
            updates["appSpecVersion"] = x.appSpecVersion
        if x.catalogId is not None:
            updates["catalogId"] = x.catalogId
        if x.routes is not None:
            updates["routes"] = x.routes
        if x.dataBindings is not None:
            updates["dataBindings"] = x.dataBindings
        if x.actions is not None:
            updates["actions"] = x.actions
        if x.theme is not None:
            updates["theme"] = x.theme
        if x.assets is not None:
            updates["assets"] = x.assets
        updated_definition = app_definition.model_copy(update=updates)
        validate_app_theme_or_raise(updated_definition.theme)
        validate_app_action_definitions(updated_definition.actions)
        validate_app_spec(
            x.appSpec,
            catalog_id=updated_definition.catalogId,
            action_definitions=updated_definition.actions,
            data_bindings=updated_definition.dataBindings,
        )
        self.project_state_backend = self.project_state_backend.model_copy(
            update={"appDefinition": updated_definition}
        )
        write_app_spec(self.dbe, normalized_path, x.appSpec)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)
        return AppDefinitionResponse(
            appSpec=x.appSpec,
            appDefinition=updated_definition,
        )

    @enqueue_method
    @project_state_tool(access_type="structural")
    async def update_app_definition(
        self, x: UpdateAppDefinitionRequest
    ) -> AppDefinitionResponse:
        """Apply a JSON merge patch to the stored app UI spec."""
        self.add_new_history_entry()
        self._get_default_project_state()
        app_definition = self.project_state_backend.appDefinition
        if app_definition is None or not app_definition.appSpecPath:
            raise KeyError("App spec path is not configured for this project.")
        existing = read_app_spec(self.dbe, app_definition.appSpecPath)
        if existing is None:
            raise KeyError("App spec not found for this project.")
        merged = _apply_json_merge_patch(existing, x.patch)
        validate_app_action_definitions(app_definition.actions)
        validate_app_spec(
            merged,
            catalog_id=app_definition.catalogId,
            action_definitions=app_definition.actions,
            data_bindings=app_definition.dataBindings,
        )
        write_app_spec(self.dbe, app_definition.appSpecPath, merged)
        return AppDefinitionResponse(
            appSpec=merged,
            appDefinition=app_definition,
        )

    @staticmethod
    def _resolve_app_spec_path_or_default(app_definition: AppDefinition) -> str:
        if (
            isinstance(app_definition.appSpecPath, str)
            and app_definition.appSpecPath.strip() != ""
        ):
            return app_definition.appSpecPath
        return default_app_spec_path()

    @staticmethod
    def _resolve_app_theme_mode(app_definition: AppDefinition) -> str:
        theme = app_definition.theme
        if isinstance(theme, dict):
            mode = theme.get("mode")
            if mode in {"auto", "dark", "light"}:
                return mode
        return "auto"

    def _resolve_current_app_spec_for_metadata_update(
        self,
        *,
        app_definition: AppDefinition,
    ) -> tuple[str, JSONValue]:
        target_path = self._resolve_app_spec_path_or_default(app_definition)
        normalized_path = normalize_app_spec_path(self.dbe, target_path)
        current_app_spec = read_app_spec(self.dbe, normalized_path)
        if current_app_spec is None:
            current_app_spec = copy.deepcopy(_DEFAULT_MINIMAL_APP_SPEC)
        return normalized_path, current_app_spec

    async def _commit_app_definition_metadata_update(
        self,
        *,
        updated_definition: AppDefinition,
        app_spec: JSONValue,
        app_spec_path: str,
    ) -> None:
        project_state = self._get_default_project_state()
        validate_app_theme_or_raise(updated_definition.theme)
        validate_app_action_definitions(updated_definition.actions)
        validate_app_spec(
            app_spec,
            catalog_id=updated_definition.catalogId,
            action_definitions=updated_definition.actions,
            data_bindings=updated_definition.dataBindings,
        )
        self.project_state_backend = self.project_state_backend.model_copy(
            update={"appDefinition": updated_definition}
        )
        write_app_spec(self.dbe, app_spec_path, app_spec)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def compare_and_set_app_definition_catalog_id(
        self,
        *,
        catalog_id: str,
        expected_old_value: str | None = None,
    ) -> tuple[str, str]:
        app_definition = self.project_state_backend.appDefinition or AppDefinition()
        old_value = app_definition.catalogId
        _assert_ui_setting_expected_old_value_matches(
            setting_id="core.app.catalog_id",
            expected_old_value=expected_old_value,
            observed_old_value=old_value,
        )
        normalized_path, current_app_spec = (
            self._resolve_current_app_spec_for_metadata_update(
                app_definition=app_definition
            )
        )
        updated_definition = app_definition.model_copy(
            update={"appSpecPath": normalized_path, "catalogId": catalog_id}
        )
        self.add_new_history_entry()
        await self._commit_app_definition_metadata_update(
            updated_definition=updated_definition,
            app_spec=current_app_spec,
            app_spec_path=normalized_path,
        )
        return old_value, updated_definition.catalogId

    @enqueue_method
    async def compare_and_set_app_definition_spec_version(
        self,
        *,
        app_spec_version: str,
        expected_old_value: str | None = None,
    ) -> tuple[str, str]:
        app_definition = self.project_state_backend.appDefinition or AppDefinition()
        old_value = app_definition.appSpecVersion
        _assert_ui_setting_expected_old_value_matches(
            setting_id="core.app.spec_version",
            expected_old_value=expected_old_value,
            observed_old_value=old_value,
        )
        normalized_path, current_app_spec = (
            self._resolve_current_app_spec_for_metadata_update(
                app_definition=app_definition
            )
        )
        updated_definition = app_definition.model_copy(
            update={"appSpecPath": normalized_path, "appSpecVersion": app_spec_version}
        )
        self.add_new_history_entry()
        await self._commit_app_definition_metadata_update(
            updated_definition=updated_definition,
            app_spec=current_app_spec,
            app_spec_path=normalized_path,
        )
        return old_value, updated_definition.appSpecVersion

    @enqueue_method
    async def compare_and_set_app_definition_spec_path(
        self,
        *,
        app_spec_path: str,
        expected_old_value: str | None = None,
    ) -> tuple[str, str]:
        app_definition = self.project_state_backend.appDefinition or AppDefinition()
        old_value = self._resolve_app_spec_path_or_default(app_definition)
        _assert_ui_setting_expected_old_value_matches(
            setting_id="core.app.spec_path",
            expected_old_value=expected_old_value,
            observed_old_value=old_value,
        )
        _, current_app_spec = self._resolve_current_app_spec_for_metadata_update(
            app_definition=app_definition
        )
        normalized_path = normalize_app_spec_path(self.dbe, app_spec_path)
        updated_definition = app_definition.model_copy(
            update={"appSpecPath": normalized_path}
        )
        self.add_new_history_entry()
        await self._commit_app_definition_metadata_update(
            updated_definition=updated_definition,
            app_spec=current_app_spec,
            app_spec_path=normalized_path,
        )
        return old_value, normalized_path

    @enqueue_method
    async def compare_and_set_app_definition_theme_mode(
        self,
        *,
        theme_mode: str,
        expected_old_value: str | None = None,
    ) -> tuple[str, str]:
        app_definition = self.project_state_backend.appDefinition or AppDefinition()
        old_value = self._resolve_app_theme_mode(app_definition)
        _assert_ui_setting_expected_old_value_matches(
            setting_id="core.app.theme_mode",
            expected_old_value=expected_old_value,
            observed_old_value=old_value,
        )
        normalized_path, current_app_spec = (
            self._resolve_current_app_spec_for_metadata_update(
                app_definition=app_definition
            )
        )
        theme_payload: dict[str, JSONValue]
        if isinstance(app_definition.theme, dict):
            theme_payload = dict(app_definition.theme)
        else:
            theme_payload = {}
        theme_payload["mode"] = theme_mode
        updated_definition = app_definition.model_copy(
            update={"appSpecPath": normalized_path, "theme": theme_payload}
        )
        self.add_new_history_entry()
        await self._commit_app_definition_metadata_update(
            updated_definition=updated_definition,
            app_spec=current_app_spec,
            app_spec_path=normalized_path,
        )
        return old_value, self._resolve_app_theme_mode(updated_definition)

    @enqueue_method
    @project_state_tool(access_type="structural")
    async def set_show_param_display_names(self, x: SetShowParamDisplayNamesRequest):
        """Toggle whether parameter display names are shown in the UI."""
        project_state = self.get_single_config_state(x.projectConfigId)
        project_state.projectConfig.showParamDisplayNames = x.showParamDisplayNames
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    @project_state_tool(access_type="structural")
    async def compare_and_set_show_param_display_names(
        self,
        x: SetShowParamDisplayNamesRequest,
        *,
        expected_old_value: bool | None = None,
    ) -> tuple[bool, bool]:
        project_state = self.get_single_config_state(x.projectConfigId)
        old_value = project_state.projectConfig.showParamDisplayNames
        _assert_ui_setting_expected_old_value_matches(
            setting_id="core.project.show_param_display_names",
            expected_old_value=expected_old_value,
            observed_old_value=old_value,
        )
        project_state.projectConfig.showParamDisplayNames = x.showParamDisplayNames
        await self._update_and_broadcast_project_state_no_name_validation(project_state)
        return old_value, project_state.projectConfig.showParamDisplayNames

    @enqueue_method
    @project_state_tool(access_type="structural")
    async def set_watch_code_enabled(self, x: SetWatchCodeEnabledRequest):
        """Enable or disable watch code mode for the project."""
        project_state = self.get_single_config_state(x.projectConfigId)
        previous_enabled = project_state.projectConfig.watchCodeEnabled
        project_state.projectConfig.watchCodeEnabled = x.enabled
        if x.enabled and not previous_enabled:
            self.watch_code_manager.baseline_on_enable(project_state)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(access_type="structural")
    async def compare_and_set_watch_code_enabled(
        self,
        x: SetWatchCodeEnabledRequest,
        *,
        expected_old_value: bool | None = None,
    ) -> tuple[bool, bool]:
        project_state = self.get_single_config_state(x.projectConfigId)
        old_value = project_state.projectConfig.watchCodeEnabled
        _assert_ui_setting_expected_old_value_matches(
            setting_id="core.watch_code.enabled",
            expected_old_value=expected_old_value,
            observed_old_value=old_value,
        )
        project_state.projectConfig.watchCodeEnabled = x.enabled
        if x.enabled and not old_value:
            self.watch_code_manager.baseline_on_enable(project_state)
        await self.update_and_broadcast_project_state(project_state)
        return old_value, project_state.projectConfig.watchCodeEnabled

    @enqueue_method
    @project_state_tool(access_type="structural")
    async def set_watch_code_inputs(self, x: SetWatchCodeInputsRequest):
        """Update watched folders and files for watch code mode."""
        project_state = self.get_single_config_state(x.projectConfigId)
        previous_snapshot = build_watch_code_snapshot(project_state)
        project_state.projectConfig.watchCodeFolders = normalize_watch_code_folders(
            x.watchCodeFolders
        )
        project_state.projectConfig.watchCodeFiles = normalize_watch_code_files(
            x.watchCodeFiles
        )
        if project_state.projectConfig.watchCodeEnabled:
            self.watch_code_manager.baseline_for_new_inputs(
                project_state, previous_snapshot
            )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(access_type="structural")
    async def compare_and_set_watch_code_folders(
        self,
        x: SetWatchCodeInputsRequest,
        *,
        expected_old_value: list[dict[str, object]] | None = None,
    ) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
        project_state = self.get_single_config_state(x.projectConfigId)
        old_folders = [
            {
                "path": folder.path,
                "recursive": folder.recursive,
            }
            for folder in project_state.projectConfig.watchCodeFolders
        ]
        _assert_ui_setting_expected_old_value_matches(
            setting_id="core.watch_code.folders",
            expected_old_value=expected_old_value,
            observed_old_value=old_folders,
        )
        previous_snapshot = build_watch_code_snapshot(project_state)
        project_state.projectConfig.watchCodeFolders = normalize_watch_code_folders(
            x.watchCodeFolders
        )
        if project_state.projectConfig.watchCodeEnabled:
            self.watch_code_manager.baseline_for_new_inputs(
                project_state, previous_snapshot
            )
        await self.update_and_broadcast_project_state(project_state)
        new_folders = [
            {
                "path": folder.path,
                "recursive": folder.recursive,
            }
            for folder in project_state.projectConfig.watchCodeFolders
        ]
        return old_folders, new_folders

    @enqueue_method
    @project_state_tool(access_type="structural")
    async def compare_and_set_watch_code_files(
        self,
        x: SetWatchCodeInputsRequest,
        *,
        expected_old_value: list[str] | None = None,
    ) -> tuple[list[str], list[str]]:
        project_state = self.get_single_config_state(x.projectConfigId)
        old_files = list(project_state.projectConfig.watchCodeFiles)
        _assert_ui_setting_expected_old_value_matches(
            setting_id="core.watch_code.files",
            expected_old_value=expected_old_value,
            observed_old_value=old_files,
        )
        previous_snapshot = build_watch_code_snapshot(project_state)
        project_state.projectConfig.watchCodeFiles = normalize_watch_code_files(
            x.watchCodeFiles
        )
        if project_state.projectConfig.watchCodeEnabled:
            self.watch_code_manager.baseline_for_new_inputs(
                project_state, previous_snapshot
            )
        await self.update_and_broadcast_project_state(project_state)
        return old_files, list(project_state.projectConfig.watchCodeFiles)

    @enqueue_method
    async def apply_watch_code_file_update(
        self,
        project_config_id: ID,
        path: Path,
        raw: str,
        *,
        baseline_only: bool,
        moved_from: Path | None,
    ) -> None:
        if project_config_id not in self.project_state_backend.projectConfigs:
            return
        normalized_path = normalize_workspace_path(path)
        project_state = self.get_single_config_state(project_config_id)
        project_config = project_state.projectConfig
        if not baseline_only and not project_config.watchCodeEnabled:
            return
        snapshot = build_watch_code_snapshot(project_state)
        if not self.watch_code_manager._path_matches_watch_inputs(
            normalized_path, snapshot.files, snapshot.folders
        ):
            return
        did_update = await self.watch_code_manager.apply_scan_update(
            project_state,
            normalized_path,
            raw,
            baseline_only=baseline_only,
            moved_from=moved_from,
        )
        if did_update:
            await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def apply_watch_code_file_delete(
        self,
        project_config_id: ID,
        path: Path,
    ) -> None:
        if project_config_id not in self.project_state_backend.projectConfigs:
            return
        normalized_path = normalize_workspace_path(path)
        project_state = self.get_single_config_state(project_config_id)
        project_config = project_state.projectConfig
        if not project_config.watchCodeEnabled:
            return
        snapshot = build_watch_code_snapshot(project_state)
        if not self.watch_code_manager._path_matches_watch_inputs(
            normalized_path, snapshot.files, snapshot.folders
        ):
            return
        did_update = await self.watch_code_manager.apply_delete_update(
            project_state,
            normalized_path,
        )
        if did_update:
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
        access_type="write",
    )
    async def set_param_entered_value(self, x: SetParamEnteredValueRequest):
        """Write a new manual value for the targeted section parameter."""
        self.add_new_history_entry(
            coalesce_key=(f"param:{x.projectConfigId}:{x.sectionId}:{x.paramInfoId}"),
            coalesce_window_s=HISTORY_COALESCE_WINDOW_TEXT_S,
        )
        project_state = self.get_single_config_state(x.projectConfigId)
        set_param_entered_value(
            project_state,
            x.sectionId,
            x.paramInfoId,
            x.value,
        )
        await self.update_and_broadcast_project_state(
            project_state,
            broadcast_name_validation_errors=False,
            validate_name_rules=False,
        )

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"], "codeObj": ["paramInfoId"]}
        ),
        access_type="write",
    )
    async def set_type_error_ignore(self, x: SetTypeErrorIgnoreRequest):
        """Toggle ignoring type errors for the targeted section entry."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        set_type_error_ignore(
            project_state, x.sectionId, x.paramInfoId, x.ignoreTypeErrors
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    async def _apply_code_section_diagnostics_ignore_state(
        self,
        project_config_id: ID,
        section_id: ID,
    ) -> None:
        code_entries = self.code_dict.get(project_config_id)
        if not code_entries:
            return
        if section_id not in code_entries:
            return
        code_entry = code_entries[section_id]
        if not _is_lsp_code_entry(code_entry):
            return
        project_state = self.get_single_config_state(project_config_id)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state, section_id, CodeSectionImpl
        )
        ignore_state = section_impl.diagnosticsIgnoreState
        code_entry.update_diagnostics_ignore_state(ignore_state)
        diagnostics_state = self._get_lsp_diagnostics_state(project_config_id)
        await diagnostics_state.reapply_code_section_ignore_state(
            section_id,
            ignore_state,
        )

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="write",
    )
    async def set_code_section_diagnostics_mute(
        self, x: SetCodeSectionDiagnosticsMuteRequest
    ):
        """Toggle muting LSP diagnostics for a code section."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        set_code_section_diagnostics_mute(project_state, x.sectionId, x.mute)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)
        await self._apply_code_section_diagnostics_ignore_state(
            x.projectConfigId, x.sectionId
        )

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="write",
    )
    async def set_code_section_diagnostic_code_suppression(
        self, x: SetCodeSectionDiagnosticCodeSuppressionRequest
    ):
        """Toggle suppressing an LSP diagnostic code for a code section."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        set_code_section_diagnostic_code_suppression(
            project_state,
            x.sectionId,
            x.code,
            x.suppress,
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)
        await self._apply_code_section_diagnostics_ignore_state(
            x.projectConfigId, x.sectionId
        )

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId", "terminalSectionId"]}
        ),
        access_type="structural",
    )
    async def set_code_section_attached_terminal(
        self, x: SetCodeSectionAttachedTerminalRequest
    ):
        """Attach or detach a terminal section for a code section."""
        logger.info(
            "set_code_section_attached_terminal start project=%s section=%s terminal=%s",
            x.projectConfigId,
            x.sectionId,
            x.terminalSectionId,
        )
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        get_curr_effective_section_impl_with_type_guard(
            project_state, x.sectionId, BaseCodeSectionImpl
        )
        if x.terminalSectionId is None:
            detach_code_section_attached_terminal(
                self.settings_file.settings,
                project_state,
                x.sectionId,
            )
        else:
            get_curr_effective_section_impl_with_type_guard(
                project_state, x.terminalSectionId, TerminalSectionImpl
            )
            move_section_to_parent_section(
                project_state, x.sectionId, x.terminalSectionId, 0
            )
            ensure_code_section_embedded_terminal_size(
                self.settings_file.settings,
                project_state,
                x.sectionId,
                x.terminalSectionId,
            )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)
        logger.info(
            "set_code_section_attached_terminal done project=%s section=%s terminal=%s",
            x.projectConfigId,
            x.sectionId,
            x.terminalSectionId,
        )

    @enqueue_method
    async def ensure_code_section_attached_terminal_for_run(
        self, projectConfigId: ID, sectionId: ID
    ) -> ID:
        logger.info(
            "ensure_code_section_attached_terminal start project=%s section=%s",
            projectConfigId,
            sectionId,
        )
        project_state = self.get_single_config_state(projectConfigId)
        code_impl = get_curr_effective_section_impl_with_type_guard(
            project_state, sectionId, BaseCodeSectionImpl
        )
        attached_terminal_id = code_impl.attachedTerminalSectionId
        if (
            attached_terminal_id is not None
            and code_impl.children == [attached_terminal_id]
            and attached_terminal_id in project_state.sections
        ):
            terminal_impl = get_curr_effective_section_impl(
                project_state, attached_terminal_id
            )
            if (
                isinstance(terminal_impl, TerminalSectionImpl)
                and attached_terminal_id
                not in project_state.projectConfig.topLevelSections
            ):
                logger.info(
                    "ensure_code_section_attached_terminal existing project=%s section=%s terminal=%s",
                    projectConfigId,
                    sectionId,
                    attached_terminal_id,
                )
                return attached_terminal_id
        self.add_new_history_entry()
        terminal_id = ensure_code_section_attached_terminal(
            self.settings_file.settings,
            project_state,
            sectionId,
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)
        logger.info(
            "ensure_code_section_attached_terminal done project=%s section=%s terminal=%s",
            projectConfigId,
            sectionId,
            terminal_id,
        )
        return terminal_id

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
        access_type="write",
    )
    async def set_param_name_and_value(self, x: SetParamNameAndValueRequest):
        """Set a parameter's name and value in one step."""
        self.add_new_history_entry(
            coalesce_key=f"param:{x.projectConfigId}:{x.sectionId}:{x.codeObjId}",
            coalesce_window_s=HISTORY_COALESCE_WINDOW_TEXT_S,
        )
        project_state = self.get_single_config_state(x.projectConfigId)
        normalized_name = validate_param_name(
            project_state, x.sectionId, x.codeObjId, x.name
        )
        project_state.codeObjs[x.codeObjId].name = normalized_name
        set_param_entered_value(
            project_state,
            x.sectionId,
            x.codeObjId,
            x.value,
        )
        await self.update_and_broadcast_project_state(
            project_state,
            validate_name_rules=False,
        )

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"codeObj": ["codeObjId"]}
        ),
        access_type="write",
    )
    async def set_code_obj_name(self, x: SetCodeObjNameRequest):
        """Rename the requested code object within the active project state."""
        project_state = self.get_single_config_state(x.projectConfigId)
        section_ids = self._find_section_ids_for_code_obj(project_state, x.codeObjId)
        normalized_name: str | None = None
        for section_id in section_ids:
            section_impl = get_curr_effective_section_impl(project_state, section_id)
            if isinstance(section_impl, BaseSectionWithParamsImpl):
                normalized_name = validate_param_name(
                    project_state, section_id, x.codeObjId, x.name
                )
            elif section_impl.type == SectionType.MetaControl:
                normalized_name = validate_param_name_format(
                    project_state, section_id, x.codeObjId, x.name
                )
            else:
                raise TypeError(
                    f"Section {section_id} does not support code obj renames."
                )
        if normalized_name is None:
            raise KeyError(f"Code obj {x.codeObjId} not found in any section.")
        project_state.codeObjs[x.codeObjId].name = normalized_name
        await self.update_and_broadcast_project_state(
            project_state,
            validate_name_rules=False,
        )

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"codeObj": ["codeObjId"]}
        ),
        access_type="write",
    )
    async def set_code_obj_display_name(self, x: SetCodeObjDisplayNameRequest):
        """Update the user-facing display name for the requested code object."""
        project_state = self.get_single_config_state(x.projectConfigId)
        project_state.codeObjs[x.codeObjId].displayName = x.displayName
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_code_file_binding(self, x: SetCodeFileBindingRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        canonical_path = normalize_workspace_path(x.binding.canonical_path)
        updated_binding = CodeFileBinding(
            canonical_path=canonical_path,
            access_mode=x.binding.access_mode,
            autoBinding=False,
        )
        set_code_file_binding(project_state, x.sectionId, updated_binding)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionIds"]}
        ),
        access_type="structural",
    )
    async def toggle_position_locks(self, x: TogglePositionLocksRequest):
        """Flip whether multiple sections' layouts are locked in place."""
        project_state = self.get_single_config_state(x.projectConfigId)
        toggle_position_locks(project_state, x.sectionIds)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="structural",
    )
    async def toggle_minimized(self, x: ToggleMinimizedRequest):
        """Expand or collapse a section panel within the project workspace."""
        project_state = self.get_single_config_state(x.projectConfigId)
        toggle_minimized(project_state, x.sectionId)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="structural",
    )
    async def toggle_group_orientation(self, x: ToggleGroupOrientationRequest):
        """Flip whether a group section lays out children horizontally."""
        project_state = self.get_single_config_state(x.projectConfigId)
        toggle_group_orientation(project_state, x.sectionId)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="structural",
    )
    async def set_group_overflow_mode(self, x: SetGroupOverflowModeRequest):
        """Set whether a group section constrains its children in a scrollable area."""
        project_state = self.get_single_config_state(x.projectConfigId)
        set_group_overflow_mode(project_state, x.sectionId, x.overflowMode)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

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
        access_type="write",
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
        await self._sync_code_section_lsp_for_watch_code(
            project_state,
            x.sectionId,
            x.code,
        )
        await self.watch_code_manager.handle_code_section_update(
            project_state, x.sectionId, x.code
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="write",
    )
    async def format_code(self, x: FormatCodeRequest):
        """Format code for a Python code section using Ruff."""
        project_state = self.get_single_config_state(x.projectConfigId)
        section_impl = get_curr_effective_section_impl(project_state, x.sectionId)
        if isinstance(section_impl, CodeSectionImpl):
            if section_impl.codeLanguage != CodeLanguage.python:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Format code only supports Python code sections.",
                )
            binding = section_impl.codeFileBinding
            if (
                binding is not None
                and binding.access_mode == CodeFileAccessMode.read_only
            ):
                logger.warning(
                    "Rejecting format_code for read-only binding: section %s (config %s)",
                    x.sectionId,
                    x.projectConfigId,
                )
                raise PermissionError(
                    f"Cannot edit read-only code section {x.sectionId}"
                )
            formatted_code, error = ruff_format_with_error(
                section_impl.code,
                include_lint=False,
            )
            if error or formatted_code is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=error or "Formatting failed.",
                )
            set_code(project_state, x.sectionId, formatted_code)
            await self._sync_code_section_lsp_for_watch_code(
                project_state,
                x.sectionId,
                formatted_code,
            )
            await self.watch_code_manager.handle_code_section_update(
                project_state, x.sectionId, formatted_code
            )
            await self._update_and_broadcast_project_state_no_name_validation(
                project_state
            )
            return
        if isinstance(section_impl, GenPythonCodeSectionImpl):
            python_target = get_python_codegen_target_with_type_guard(
                project_state.projectConfig
            )
            formatted_prefix, error = ruff_format_with_error(
                python_target.genCodePrefix,
                include_lint=False,
            )
            if error or formatted_prefix is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Gen code prefix: {error or 'formatting failed.'}",
                )
            formatted_suffix, error = ruff_format_with_error(
                python_target.genCodeSuffix,
                include_lint=False,
            )
            if error or formatted_suffix is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Gen code suffix: {error or 'formatting failed.'}",
                )
            python_target.genCodePrefix = formatted_prefix
            python_target.genCodeSuffix = formatted_suffix
            await self._update_and_broadcast_project_state_no_name_validation(
                project_state
            )
            return
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Format code only supports Python code sections.",
        )

    async def _sync_code_section_lsp_for_watch_code(
        self,
        project_state: ProjectStateSingleConfig,
        section_id: ID,
        code: str,
    ) -> None:
        project_config = project_state.projectConfig
        if not project_config.watchCodeEnabled:
            return
        if not project_config_has_codegen_language(
            project_config, ProjectCodegenLanguage.python
        ):
            return
        section_impl = get_curr_effective_section_impl(project_state, section_id)
        if not isinstance(section_impl, CodeSectionImpl):
            return
        if self.lsp_writers.get_for_language(section_impl.codeLanguage) is None:
            return
        if section_impl.codeFileBinding is None:
            return
        code_entries = self.code_dict.setdefault(project_config.id, {})
        section_code = code_entries.get(section_id)
        if not _is_lsp_code_entry(section_code):
            section_code = self.create_project_code(
                project_state, section_id, section_impl
            )
            if not _is_lsp_code_entry(section_code):
                return
            code_entries[section_id] = section_code
        section_code.code = code
        logger.debug(
            "sync_code_section_lsp_for_watch_code section_id=%s code_len=%s",
            section_id,
            len(code),
        )
        await section_code.sync_lsp(code)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="write",
    )
    async def set_section_param_filter(self, x: SetSectionParamFilterRequest):
        """Update the value filter applied to a section's parameter list."""
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_param_filter(project_state, x.sectionId, x.value)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_section_edge_inputs(self, x: SetSectionEdgeInputsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_edge_inputs(
            self.settings_file.settings,
            project_state,
            x.sectionId,
            x.edgeInputParams,
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

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
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    def _apply_edge_value(self, project_state: ProjectStateSingleConfig, edge: Edge):
        gen_code = self._require_python_codegen(project_state.projectConfig.id)
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
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def update_edge(self, x: UpdateEdgeRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        update_edge(project_state, x.edge)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def delete_edges(self, x: DeleteEdgesRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        delete_edges(project_state, x.edgeIds)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

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
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_edges(self, x: SetEdgesRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        set_edges(project_state, x.edges)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def create_agentic_edge(self, x: CreateAgenticEdgeRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        edge_kwargs = {
            "sourceSectionId": x.sourceSectionId,
            "targetSectionId": x.targetSectionId,
            "kind": x.kind,
            "contextMode": x.contextMode,
            "style": x.style,
            "hidden": x.hidden,
            "zIndex": x.zIndex,
        }
        if x.id is not None:
            edge_kwargs["id"] = x.id
        edge = AgenticEdge(**edge_kwargs)
        create_agentic_edge(project_state, edge)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def update_agentic_edge(self, x: UpdateAgenticEdgeRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        update_agentic_edge(project_state, x.edge)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def delete_agentic_edges(self, x: DeleteAgenticEdgesRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        delete_agentic_edges(project_state, x.edgeIds)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_agentic_edges(self, x: SetAgenticEdgesRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        set_agentic_edges(project_state, x.edges)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="write",
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
        ),
        access_type="write",
    )
    async def set_default_section_variant(self, x: SetDefaultSectionVariantRequest):
        """Change the default variant automatically used for a section."""
        project_state = self.get_single_config_state(x.projectConfigId)
        set_default_section_variant(project_state, x.sectionId, x.variantId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="write",
    )
    async def set_section_variant_sort_order(
        self, x: SetSectionVariantSortOrderRequest
    ) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        if x.sectionId not in project_state.sections:
            raise KeyError(f"Section {x.sectionId} not found")
        section = project_state.sections[x.sectionId]
        existing_ids = set(section.variants)
        ordered_ids = x.orderedVariantIds
        if len(ordered_ids) != len(existing_ids):
            raise ValueError(
                "orderedVariantIds must contain every variant exactly once."
            )
        seen: set[str] = set()
        for variant_id in ordered_ids:
            if variant_id not in existing_ids:
                raise KeyError(
                    f"Variant {variant_id} not found in section {x.sectionId}"
                )
            if variant_id in seen:
                raise ValueError(
                    "orderedVariantIds must not contain duplicate variant IDs."
                )
            seen.add(variant_id)
        section.variants = ordered_ids
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"], "codeObj": ["paramInfoId"]}
        ),
        access_type="write",
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
        ),
        access_type="structural",
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
        meta_control_param_id = (
            get_meta_control_param_id(project_state, sectionId)
            if x.implType == SectionType.MetaControl
            else None
        )
        await self.update_and_broadcast_project_state(project_state)
        return CreateTopLevelSectionResponse(
            sectionId=sectionId,
            metaControlParamId=meta_control_param_id,
            panTo=pan_to,
        )

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["parentId"]}
        ),
        access_type="structural",
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
        ),
        access_type="structural",
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
        ),
        access_type="structural",
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
        ),
        access_type="structural",
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
        ),
        access_type="write",
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
        ),
        access_type="structural",
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
        ),
        access_type="write",
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
        ),
        access_type="write",
    )
    async def delete_kwarg(self, x: DeleteKwargRequest):
        """Remove the last keyword argument entry from the section."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        delete_kwarg(self.settings_file.settings, project_state, x.sectionId)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="write",
    )
    async def delete_selected_params(self, x: DeleteSelectedParamsRequest):
        """Remove selected parameters from the section."""
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        delete_selected_params(
            self.settings_file.settings, project_state, x.sectionId, x.paramInfoIds
        )
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
                self._get_lsp_diagnostics_state(project_state.projectConfig.id),
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
        lsp_writer = self.lsp_writers.get_for_language(codeLanguage)
        if lsp_writer is not None:
            return ProjectLSPCode(
                self.dbe,
                self.code_files,
                self.lsp_writers,
                self.websocket_msg_handler,
                self._get_lsp_diagnostics_state(project_state.projectConfig.id),
                project_state,
                sectionId,
                code_language=codeLanguage,
            )
        return ProjectBasicCode(
            self.dbe,
            self.code_files,
            project_state,
            sectionId,
            codeLanguage,
        )

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
        normalized_name = validate_project_name(
            self.project_state_backend, None, new_project_config.name
        )
        new_project_config.name = normalized_name
        project_state = ProjectStateSingleConfig(projectConfig=new_project_config)
        if project_config_has_codegen_language(
            new_project_config,
            ProjectCodegenLanguage.python,
        ):
            create_top_level_section(
                self.settings_file.settings,
                project_state,
                SectionType.GenPythonCode,
                Position(),
            )
            python_target = get_python_codegen_target(new_project_config)
            if python_target and python_target.generateMetadata:
                create_top_level_section(
                    self.settings_file.settings,
                    project_state,
                    SectionType.GenPythonMetadata,
                    Position(),
                )
        project_state.validate_view_modes()
        self.project_state_backend = merge_single_config_into_backend(
            self.project_state_backend, project_state
        )
        self.project_state_backend.validate_default_project_id()
        await self.broadcast_all_project_metadata()
        return new_project_config.name

    @enqueue_method
    async def delete_project_configs(self, project_config_ids: list[ID]):
        for project_config_id in project_config_ids:
            project_config = self.project_state_backend.projectConfigs[
                project_config_id
            ]
            previous_output_root = (
                self._plugin_codegen_output_root_by_project_config.pop(
                    project_config_id,
                    self._plugin_codegen_output_root(project_config.name),
                )
            )
            if previous_output_root.exists():
                shutil.rmtree(previous_output_root)
            del self.project_state_backend.projectConfigs[project_config_id]
            gen_code = self.gen_code.pop(project_config_id, None)
            if gen_code is not None:
                gen_code.callback_cleanup()
            code_entries = self.code_dict.pop(project_config_id, None)
            if code_entries:
                for code_entry in code_entries.values():
                    if _is_lsp_code_entry(code_entry):
                        code_entry.callback_cleanup()
            self.lsp_diagnostics_state_by_project_config.pop(project_config_id, None)
            self._plugin_codegen_target_state_by_project_config.pop(
                project_config_id, None
            )
            self._plugin_codegen_project_state_hash_by_project_config_revision.pop(
                project_config_id, None
            )
        self.project_state_backend.validate_default_project_id()
        self.watch_code_manager.sync_from_backend(self.project_state_backend)
        await self.broadcast_all_project_metadata()

    @enqueue_method
    async def set_as_default_project(self, projectConfigId: ID):
        self.project_state_backend.defaultProjectConfigId = projectConfigId
        await self.broadcast_all_project_metadata()

    @enqueue_method
    async def set_project_config_name(self, projectConfigId: ID, newName: str):
        old_name = self.project_state_backend.projectConfigs[projectConfigId].name
        previous_output_root = self._plugin_codegen_output_root_by_project_config.get(
            projectConfigId,
            self._plugin_codegen_output_root(old_name),
        )
        set_project_config_name(self.project_state_backend, projectConfigId, newName)
        new_name = self.project_state_backend.projectConfigs[projectConfigId].name
        if previous_output_root.exists() and old_name != new_name:
            shutil.rmtree(previous_output_root)
        if projectConfigId in self._plugin_codegen_output_root_by_project_config:
            self._plugin_codegen_output_root_by_project_config[projectConfigId] = (
                self._plugin_codegen_output_root(new_name)
            )

    @enqueue_method
    async def compare_and_set_project_config_name(
        self,
        projectConfigId: ID,
        newName: str,
        *,
        expected_old_value: str | None = None,
    ) -> tuple[str, str]:
        old_name = self.project_state_backend.projectConfigs[projectConfigId].name
        _assert_ui_setting_expected_old_value_matches(
            setting_id="core.project.name",
            expected_old_value=expected_old_value,
            observed_old_value=old_name,
        )
        previous_output_root = self._plugin_codegen_output_root_by_project_config.get(
            projectConfigId,
            self._plugin_codegen_output_root(old_name),
        )
        set_project_config_name(self.project_state_backend, projectConfigId, newName)
        new_name = self.project_state_backend.projectConfigs[projectConfigId].name
        if previous_output_root.exists() and old_name != new_name:
            shutil.rmtree(previous_output_root)
        if projectConfigId in self._plugin_codegen_output_root_by_project_config:
            self._plugin_codegen_output_root_by_project_config[projectConfigId] = (
                self._plugin_codegen_output_root(new_name)
            )
        await self.broadcast_all_project_metadata()
        self.perform_manual_save()
        return old_name, new_name

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
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_variant_json_source_keys(self, x: SetVariantJsonSourceKeysRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        if not project_state.projectConfig.allowJsonSourceKeyEdits:
            raise HTTPException(
                status_code=403,
                detail="JSON source key edits are disabled for this project.",
            )
        variant = project_state.sectionVariants[x.variantId]
        filename = normalize_workspace_path(variant.name)
        processed = None
        if filename.exists():
            processed_updates = self.json_source.process_json_source_files([filename])
            processed = processed_updates.get(filename)
            if processed is not None:
                self.json_source.json_sources[filename] = processed
            else:
                self.json_source.json_sources.pop(filename, None)
        else:
            self.json_source.json_sources.pop(filename, None)
        if processed is not None:
            key_path = tuple(x.jsonSourceKeys)
            if key_path not in processed.hierarchy.name_path_to_id:
                joined = ".".join(x.jsonSourceKeys) if x.jsonSourceKeys else "<root>"
                raise HTTPException(
                    status_code=400,
                    detail=f"jsonSourceKeys path not found: {joined}",
                )
            processed_id = processed.hierarchy.name_path_to_id[key_path]
            variant_id = processed.keyValueInfo.codeObjVariantMap[processed_id]
            variant_info = processed.keyValueInfo.codeObjVariants[variant_id]
            impl = processed.keyValueInfo.codeObjImpls[variant_info.impl]
            if not isinstance(impl, BaseParentCodeObjImpl):
                joined = ".".join(x.jsonSourceKeys) if x.jsonSourceKeys else "<root>"
                raise HTTPException(
                    status_code=400,
                    detail=f"jsonSourceKeys must resolve to an object: {joined}",
                )

        set_variant_json_source_keys(
            project_state, x.sectionId, x.variantId, x.jsonSourceKeys
        )
        async with self._project_state_lock.write_lock():
            project_state.validate_for_update(validate_code_file_bindings=True)
            self._merge_project_state_backend(
                project_state,
                updateFileWatcher=False,
            )
        load_fn = self.load_json_sources.__wrapped__
        await load_fn(
            self,
            json_sources=self.json_source.json_sources,
            section_variants_to_load=[(x.sectionId, x.variantId)],
        )

    @enqueue_method
    async def toggle_variant_frozen(self, x: ToggleVariantFrozenRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        toggle_variant_frozen(project_state, x.variantId)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def delete_json_source_file_and_variant(
        self, x: DeleteJSONSourceFileAndVariantRequest
    ):
        project_state = self.get_single_config_state(x.projectConfigId)
        success = False
        try:
            target_path = normalize_workspace_path(x.filepath)
            workspace_root = get_setta_paths().workspace_root
            if not target_path.is_relative_to(workspace_root):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="File path must be within the project root.",
                )
            target_path.unlink()
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
        await self.update_and_broadcast_project_state(
            project_state,
            validate_name_rules=False,
        )

    @enqueue_method
    async def set_prompt_template(self, x: SetPromptTemplateRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_prompt_section_template(project_state, x.sectionId, x.template)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_prompt_inputs(self, x: SetPromptInputsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_prompt_section_inputs(project_state, x.sectionId, x.inputs)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_prompt_format(self, x: SetPromptFormatRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_prompt_section_format(project_state, x.sectionId, x.format)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_section_variant_name(self, x: SetSectionVariantNameRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_variant_name(project_state, x.variantId, x.name)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_active_ids(self, x: SetActiveIdsRequest):
        self.project_state_backend.projectConfigs[
            x.projectConfigId
        ].activeIds = x.activeIds
        self._record_ui_setting_reveal_active_ids_mutation(
            project_config_id=x.projectConfigId,
            invalidate_existing_leases=True,
        )

    @enqueue_method
    async def set_active_ids_for_ui_setting_reveal(
        self,
        *,
        project_config_id: ID,
        active_ids: list[ID],
    ) -> str:
        current_active_ids = self.project_state_backend.projectConfigs[
            project_config_id
        ].activeIds
        active_ids_changed = current_active_ids != active_ids
        if active_ids_changed:
            self.project_state_backend.projectConfigs[
                project_config_id
            ].activeIds = active_ids
        mutation_version = self._record_ui_setting_reveal_active_ids_mutation(
            project_config_id=project_config_id,
            invalidate_existing_leases=True,
        )
        reveal_activation_lease_id = uuid4().hex
        self._ui_setting_reveal_leases[reveal_activation_lease_id] = (
            project_config_id,
            mutation_version,
        )
        if active_ids_changed:
            project_state = self.get_single_config_state(project_config_id)
            await self._update_and_broadcast_project_state_no_name_validation(
                project_state,
                updateFileWatcher=False,
            )
        return reveal_activation_lease_id

    @enqueue_method
    async def rollback_active_ids_for_ui_setting_reveal(
        self,
        *,
        project_config_id: ID,
        reveal_activation_lease_id: str,
        rollback_active_ids: list[ID],
    ) -> bool:
        lease_record = self._ui_setting_reveal_leases.pop(
            reveal_activation_lease_id, None
        )
        if lease_record is None:
            return False
        lease_project_config_id, lease_mutation_version = lease_record
        if lease_project_config_id != project_config_id:
            return False
        current_mutation_version = (
            self._ui_setting_reveal_active_ids_version_by_project.get(
                project_config_id, 0
            )
        )
        if current_mutation_version != lease_mutation_version:
            return False
        self.project_state_backend.projectConfigs[
            project_config_id
        ].activeIds = rollback_active_ids
        self._record_ui_setting_reveal_active_ids_mutation(
            project_config_id=project_config_id,
            invalidate_existing_leases=True,
        )
        project_state = self.get_single_config_state(project_config_id)
        await self._update_and_broadcast_project_state_no_name_validation(
            project_state,
            updateFileWatcher=False,
        )
        return True

    def _record_ui_setting_reveal_active_ids_mutation(
        self,
        *,
        project_config_id: ID,
        invalidate_existing_leases: bool,
    ) -> int:
        next_mutation_version = (
            self._ui_setting_reveal_active_ids_version_by_project.get(
                project_config_id, 0
            )
            + 1
        )
        self._ui_setting_reveal_active_ids_version_by_project[project_config_id] = (
            next_mutation_version
        )
        if invalidate_existing_leases:
            self._invalidate_ui_setting_reveal_leases(
                project_config_id=project_config_id
            )
        return next_mutation_version

    def _invalidate_ui_setting_reveal_leases(
        self,
        *,
        project_config_id: ID,
    ) -> None:
        lease_ids_to_invalidate = [
            lease_id
            for lease_id, (
                lease_project_config_id,
                _,
            ) in self._ui_setting_reveal_leases.items()
            if lease_project_config_id == project_config_id
        ]
        for lease_id in lease_ids_to_invalidate:
            del self._ui_setting_reveal_leases[lease_id]

    @enqueue_method
    async def set_viewport(self, x: SetViewportRequest):
        """Update the stored viewport offsets/zoom for a project configuration.

        Passing `None` for the viewport instructs the UI to re-fit the project into
        view instead of persisting explicit coordinates.
        """
        self.add_new_history_entry(
            coalesce_key=f"viewport:{x.projectConfigId}",
            coalesce_window_s=HISTORY_COALESCE_WINDOW_DRAG_S,
        )
        project_config = self.project_state_backend.projectConfigs[x.projectConfigId]
        project_config.viewport = x.viewport
        project_config.viewportInitialized = x.viewport is not None
        active_view_mode_id = project_config.activeViewModeId
        if active_view_mode_id is None:
            raise KeyError("Active view mode is not set")
        view_mode = project_config.viewModes.get(active_view_mode_id)
        if view_mode is None:
            raise KeyError(f"View mode {active_view_mode_id} not found")
        view_mode.viewport = x.viewport
        view_mode.viewportInitialized = x.viewport is not None

    @enqueue_method
    async def create_view_mode(self, x: CreateViewModeRequest) -> ID:
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        visibility_by_section_id = {
            section_id: True for section_id in project_state.sections.keys()
        }
        next_sort_index = (
            max(
                (
                    view_mode.sortIndex
                    for view_mode in project_state.projectConfig.viewModes.values()
                ),
                default=-1,
            )
            + 1
        )
        existing_slugs = {
            sanitize_slug(view_mode.name)
            for view_mode in project_state.projectConfig.viewModes.values()
        }
        name = generate_memorable_string()
        while sanitize_slug(name) in existing_slugs:
            name = generate_memorable_string()
        top_level_sections = self._clone_top_level_sections(
            project_state.projectConfig.topLevelSections
        )
        viewport = self._clone_viewport(project_state.projectConfig.viewport)
        view_mode = ViewModeConfig(
            name=name,
            sortIndex=next_sort_index,
            visibilityBySectionId=visibility_by_section_id,
            topLevelSections=top_level_sections,
            viewport=viewport,
            viewportInitialized=project_state.projectConfig.viewportInitialized,
        )
        project_state.projectConfig.viewModes[view_mode.id] = view_mode
        project_state.projectConfig.activeViewModeId = view_mode.id
        project_state.projectConfig.isEditingViewMode = True
        project_state.projectConfig.topLevelSections = view_mode.topLevelSections
        project_state.projectConfig.viewport = view_mode.viewport
        project_state.projectConfig.viewportInitialized = view_mode.viewportInitialized
        await self._update_and_broadcast_project_state_no_name_validation(project_state)
        return view_mode.id

    @enqueue_method
    async def set_active_view_mode(self, x: SetActiveViewModeRequest) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        view_modes = project_state.projectConfig.viewModes
        if x.activeViewModeId not in view_modes:
            raise KeyError(f"View mode {x.activeViewModeId} not found")
        current_view_mode = self._get_active_view_mode(project_state)
        current_view_mode.topLevelSections = (
            project_state.projectConfig.topLevelSections
        )
        current_view_mode.viewport = project_state.projectConfig.viewport
        current_view_mode.viewportInitialized = (
            project_state.projectConfig.viewportInitialized
        )
        next_view_mode = view_modes[x.activeViewModeId]
        if not next_view_mode.topLevelSections:
            next_view_mode.topLevelSections = self._clone_top_level_sections(
                project_state.projectConfig.topLevelSections
            )
        project_state.projectConfig.topLevelSections = next_view_mode.topLevelSections
        project_state.projectConfig.viewport = next_view_mode.viewport
        project_state.projectConfig.viewportInitialized = (
            next_view_mode.viewportInitialized
        )
        project_state.projectConfig.activeViewModeId = x.activeViewModeId
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def toggle_is_editing_view_mode(
        self, x: ToggleIsEditingViewModeRequest
    ) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        project_state.projectConfig.isEditingViewMode = (
            not project_state.projectConfig.isEditingViewMode
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

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
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def toggle_view_mode_user_facing(
        self, x: ToggleViewModeUserFacingRequest
    ) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        view_mode = project_state.projectConfig.viewModes[x.viewModeId]
        view_mode.isUserFacing = not view_mode.isUserFacing
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def toggle_view_mode_tab(self, x: ToggleViewModeTabRequest) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        view_mode = project_state.projectConfig.viewModes[x.viewModeId]
        view_mode.isTab = not view_mode.isTab
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_view_mode_name(self, x: SetViewModeNameRequest) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        view_mode = project_state.projectConfig.viewModes[x.viewModeId]
        normalized_name = validate_view_mode_name(project_state, x.viewModeId, x.name)
        view_mode.name = normalized_name
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_view_mode_sort_order(self, x: SetViewModeSortOrderRequest) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        view_modes = project_state.projectConfig.viewModes
        existing_ids = set(view_modes.keys())
        ordered_ids = x.orderedViewModeIds
        if len(ordered_ids) != len(existing_ids):
            raise ValueError(
                "orderedViewModeIds must contain every view mode exactly once."
            )
        seen: set[str] = set()
        for view_mode_id in ordered_ids:
            if view_mode_id not in view_modes:
                raise KeyError(f"View mode {view_mode_id} not found")
            if view_mode_id in seen:
                raise ValueError(
                    "orderedViewModeIds must not contain duplicate view mode IDs."
                )
            seen.add(view_mode_id)
        for index, view_mode_id in enumerate(ordered_ids):
            view_modes[view_mode_id].sortIndex = index
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

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
        sorted_view_modes = sorted(
            view_modes.values(),
            key=lambda view_mode: (
                view_mode.sortIndex,
                view_mode.name.lower(),
                view_mode.id,
            ),
        )
        if project_state.projectConfig.activeViewModeId == x.viewModeId:
            next_view_mode = sorted_view_modes[0]
            if not next_view_mode.topLevelSections:
                next_view_mode.topLevelSections = self._clone_top_level_sections(
                    project_state.projectConfig.topLevelSections
                )
            project_state.projectConfig.activeViewModeId = next_view_mode.id
            project_state.projectConfig.topLevelSections = (
                next_view_mode.topLevelSections
            )
            project_state.projectConfig.viewport = next_view_mode.viewport
            project_state.projectConfig.viewportInitialized = (
                next_view_mode.viewportInitialized
            )
        for index, view_mode in enumerate(sorted_view_modes):
            view_mode.sortIndex = index
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="write",
    )
    async def set_section_name(self, x: SetSectionNameRequest):
        """Rename a section and broadcast the updated project state."""
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_name(project_state, x.sectionId, x.name)
        await self.update_and_broadcast_project_state(
            project_state,
            validate_name_rules=False,
        )

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="write",
    )
    async def set_section_tag_color(self, x: SetSectionTagColorRequest):
        """Set or clear the per-section color tag."""
        self.add_new_history_entry(
            coalesce_key=f"sectionTagColor:{x.projectConfigId}:{x.sectionId}",
            coalesce_window_s=HISTORY_COALESCE_WINDOW_TEXT_S,
        )
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_tag_color(project_state, x.sectionId, x.tagColor)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="write",
    )
    async def set_section_style_color(self, x: SetSectionStyleColorRequest):
        """Set or clear the per-section style chrome color."""
        self.add_new_history_entry(
            coalesce_key=f"sectionStyleColor:{x.projectConfigId}:{x.sectionId}",
            coalesce_window_s=HISTORY_COALESCE_WINDOW_TEXT_S,
        )
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_style_color(project_state, x.sectionId, x.styleColor)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    @project_state_tool(
        ai_follow_tool_arguments=AIFollowToolArgumentsMetadata(
            pathsByIdType={"section": ["sectionId"]}
        ),
        access_type="write",
    )
    async def set_meta_control_show_section_title(
        self, x: SetMetaControlShowSectionTitleRequest
    ):
        """Toggle meta control title visibility and broadcast the updated project state."""
        project_state = self.get_single_config_state(x.projectConfigId)
        set_meta_control_show_section_title(
            project_state, x.sectionId, x.showSectionTitle
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

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
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_text_block_master_font_size(
        self, x: SetTextBlockMasterFontSizeRequest
    ):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_text_block_master_font_size(project_state, x.sectionId, x.masterFontSizePx)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_text_block_meta_control_style(
        self, x: SetTextBlockMetaControlStyleRequest
    ):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_text_block_meta_control_style(
            project_state, x.sectionId, x.metaControlStyle
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_callable_hide_params(self, x: SetCallableHideParamsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_callable_hide_params(project_state, x.sectionId, x.hideParams)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_section_hide_unpinned_params(
        self, x: SetSectionHideUnpinnedParamsRequest
    ):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_hide_unpinned_params(
            project_state, x.sectionId, x.hideUnpinnedParams
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_section_pinned_params(self, x: SetSectionPinnedParamsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_pinned_params(project_state, x.sectionId, x.pinnedParams)
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def set_section_column_width(self, x: SetSectionColumnWidthRequest):
        self.add_new_history_entry(
            coalesce_key=f"sectionColumnWidth:{x.projectConfigId}:{x.sectionId}",
            coalesce_window_s=HISTORY_COALESCE_WINDOW_DRAG_S,
        )
        project_state = self.get_single_config_state(x.projectConfigId)
        set_section_column_width(project_state, x.sectionId, x.columnWidth)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_parent_default_child_section_type(
        self, x: SetParentDefaultChildSectionTypeRequest
    ):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_parent_default_child_section_type(
            project_state,
            x.sectionId,
            x.defaultChildSectionType,
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_list_root_view_mode(self, x: SetListRootViewModeRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_list_root_view_mode(
            project_state,
            x.sectionId,
            x.viewMode,
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_task_board_section_state(self, x: SetTaskBoardSectionStateRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_task_board_section_state(
            project_state,
            x.sectionId,
            x.viewMode,
            x.columns,
            x.tasks,
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_spreadsheet_file_path(self, x: SetSpreadsheetFilePathRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_spreadsheet_file_path(
            project_state,
            x.sectionId,
            x.filePath,
            x.activeSheet,
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_spreadsheet_section_settings(
        self, x: SetSpreadsheetSectionSettingsRequest
    ):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_spreadsheet_section_settings(
            project_state,
            x.sectionId,
            x.readOnly,
            x.showRowNumbers,
            x.density,
            x.autoReloadOnExternalChange,
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_browser_column_widths(self, x: SetBrowserColumnWidthsRequest):
        self.add_new_history_entry(
            coalesce_key=f"browserColumnWidths:{x.projectConfigId}:{x.sectionId}",
            coalesce_window_s=HISTORY_COALESCE_WINDOW_DRAG_S,
        )
        project_state = self.get_single_config_state(x.projectConfigId)
        set_browser_column_widths(
            project_state,
            x.sectionId,
            x.columnWidth,
            x.typesColumnWidth,
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_browser_area_view_mode(self, x: SetBrowserAreaViewModeRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_browser_area_view_mode(project_state, x.sectionId, x.viewMode)
        # Pure UI state: avoid running full `update()` (which can trigger expensive
        # codegen/LSP refresh) for a simple view-mode toggle.
        async with self._project_state_lock.write_lock():
            project_state._section_slug_cache = None
            self._merge_project_state_backend(
                project_state,
                updateFileWatcher=False,
            )
        await self._broadcast_project_state_snapshot(project_state)

    @enqueue_method
    async def set_browser_hide_column(self, x: SetBrowserHideColumnRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_browser_hide_column(project_state, x.sectionId, x.hideColumn)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_browser_saved_searches(self, x: SetBrowserSavedSearchesRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_browser_saved_searches(project_state, x.sectionId, x.savedSearches)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_text_block_format(self, x: SetTextBlockFormatRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_text_block_format(project_state, x.sectionId, x.format)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_chat_section_settings(self, x: SetChatSectionSettingsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_chat_section_settings(
            project_state,
            x.sectionId,
            x.managed,
            x.engineConfigId,
            x.transcriptionProfileId,
            x.agentProfileId,
            x.thinking,
            x.permissionMode,
            x.searchEnabled,
            x.dictationMode,
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_chat_section_state(self, x: SetChatSectionStateRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_chat_section_state(project_state, x.sectionId, x.state)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_social_url(self, x: SetSocialUrlRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_social_url(project_state, x.sectionId, x.url)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def append_draw_area_layer_item(self, x: AppendDrawAreaLayerItemRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        append_draw_area_layer_item(project_state, x.sectionId, x.layerIdx, x.element)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

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
        for run_type in (
            LLM_CHAT_RUN_TYPE,
            SCRIPTABLE_CHAT_RUN_TYPE,
            EXTERNAL_AGENT_RUN_TYPE,
        ):
            run_ids = list_agent_run_ids_by_metadata(
                self.dbe, run_type=run_type, chat_id=chat_id
            )
            if run_ids:
                return chat_id
        set_chat_section_chat_id(project_state, x.sectionId, None)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)
        return None

    @enqueue_method
    async def set_chat_section_chat_id(self, x: SetChatSectionChatIdRequest) -> None:
        project_state = self.get_single_config_state(x.projectConfigId)
        set_chat_section_chat_id(project_state, x.sectionId, x.chatId)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

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
            await self._update_and_broadcast_project_state_no_name_validation(
                project_state
            )

        if artifact_payloads:
            await self.websocket_msg_handler.broadcast_artifacts_update(
                artifacts=artifact_payloads,
                updateType="update",
            )
            await self.artifacts.emit_realtime_image_updates(artifact_payloads)

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
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_chart_area_data_path(self, x: SetChartAreaDataPathRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_chart_area_data_path(project_state, x.sectionId, x.dataPath)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_chart_type(self, x: SetChartTypeRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_chart_type(project_state, x.sectionId, x.chartType)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def set_chart_settings(self, x: SetChartSettingsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        set_chart_settings(
            project_state, x.sectionId, x.chartSettings, x.changedSettings
        )
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def move_sections(self, x: MoveSectionsRequest):
        if not x.sectionIds:
            return
        project_state = self.get_single_config_state(x.projectConfigId)
        if x.newParentId is None:
            if not x.positionsById:
                raise KeyError("Expected positionsById when moving sections to pane.")
            self.add_new_history_entry()
            for section_id in x.sectionIds:
                position = x.positionsById.get(section_id)
                if position is None:
                    raise KeyError(
                        f"Missing position when moving section {section_id} to pane."
                    )
                move_section_to_pane(project_state, section_id, position)
        else:
            if x.newIndex is None:
                raise KeyError(
                    "Expected newIndex when moving sections into parent section."
                )
            self.add_new_history_entry()
            move_sections_to_parent_section(
                project_state, x.newParentId, x.sectionIds, x.newIndex
            )
            parent_impl = get_curr_effective_section_impl(project_state, x.newParentId)
            if isinstance(parent_impl, BaseCodeSectionImpl):
                terminal_id = parent_impl.attachedTerminalSectionId
                if terminal_id is None and parent_impl.children:
                    terminal_id = parent_impl.children[0]
                if terminal_id:
                    ensure_code_section_embedded_terminal_size(
                        self.settings_file.settings,
                        project_state,
                        x.newParentId,
                        terminal_id,
                    )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def move_params(self, x: MoveParamsRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        move_params_to_parent(
            self.settings_file.settings,
            project_state,
            x.sectionId,
            x.paramIds,
            x.newParentId,
            x.newIndex,
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def move_param_groups(self, x: MoveParamGroupsRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        next_state = copy.deepcopy(project_state)
        for move in x.moves:
            move_params_to_parent(
                self.settings_file.settings,
                next_state,
                x.sectionId,
                move.paramIds,
                move.newParentId,
                move.newIndex,
            )
        await self.update_and_broadcast_project_state(next_state)

    @enqueue_method
    async def indent_params(self, x: IndentParamsRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        indent_params(
            self.settings_file.settings, project_state, x.sectionId, x.paramIds
        )
        await self.update_and_broadcast_project_state(project_state)

    @enqueue_method
    async def unindent_params(self, x: UnindentParamsRequest):
        self.add_new_history_entry()
        project_state = self.get_single_config_state(x.projectConfigId)
        unindent_params(
            self.settings_file.settings, project_state, x.sectionId, x.paramIds
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
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

    @enqueue_method
    async def unselect_all_params(self, x: UnselectAllParamsRequest):
        project_state = self.get_single_config_state(x.projectConfigId)
        unselect_all_params(project_state)
        await self._update_and_broadcast_project_state_no_name_validation(project_state)

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

    def _get_default_project_state(self) -> ProjectStateSingleConfig:
        default_id = self.project_state_backend.defaultProjectConfigId
        if default_id is None:
            raise KeyError("Missing default project config.")
        return self.get_single_config_state(default_id)

    def get_single_config_state(self, projectConfigId: ID):
        return convert_backend_to_single_config(
            self.project_state_backend, projectConfigId
        )

    def _find_section_ids_for_code_obj(
        self,
        project_state: ProjectStateSingleConfig,
        code_obj_id: ID,
    ) -> list[ID]:
        matches: list[ID] = []
        for section_id in project_state.sections:
            section_impl = get_curr_effective_section_impl(project_state, section_id)
            if not isinstance(section_impl, BaseSectionWithParamsImpl):
                if section_impl.type != SectionType.MetaControl:
                    continue
                if code_obj_id in section_impl.codeObjVariantMap:
                    matches.append(section_id)
                continue
            if code_obj_id in section_impl.codeObjVariantMap:
                matches.append(section_id)
        if not matches:
            raise KeyError(f"Code obj {code_obj_id} not found in any section.")
        return matches

    def get_new_project_state_backend(self, x: ProjectStateSingleConfig):
        return merge_single_config_into_backend(self.project_state_backend, x)

    async def update_and_broadcast_project_state(
        self,
        project_state: ProjectStateSingleConfig,
        updateFileWatcher: bool = True,
        broadcast_name_validation_errors: bool = True,
        validate_name_rules: bool = True,
    ):
        await self.update(
            project_state,
            updateFileWatcher=updateFileWatcher,
            validate_name_rules=validate_name_rules,
        )
        await self._broadcast_project_state_snapshot(project_state)
        if broadcast_name_validation_errors:
            await self._broadcast_name_validation_errors(project_state)

    async def _update_and_broadcast_project_state_no_name_validation(
        self,
        project_state: ProjectStateSingleConfig,
        updateFileWatcher: bool = True,
    ):
        await self.update_and_broadcast_project_state(
            project_state,
            updateFileWatcher=updateFileWatcher,
            broadcast_name_validation_errors=False,
            validate_name_rules=False,
        )

    async def _broadcast_project_state_snapshot(
        self,
        project_state: ProjectStateSingleConfig,
    ) -> None:
        self._mark_current_frontend_op_completed_before_broadcast()
        completed_op_ids = self.completed_op_ids_since_last_broadcast
        pending_op_ids = list(self.pending_frontend_ops.keys())
        logger.debug(
            "broadcast_project_state project_config_id=%s sections=%s code_objs=%s variants=%s completed_ops=%s pending_ops=%s",
            project_state.projectConfig.id,
            len(project_state.sections),
            len(project_state.codeObjs),
            len(project_state.sectionVariants),
            len(completed_op_ids),
            len(pending_op_ids),
        )
        await self.websocket_msg_handler.broadcast_project_state(
            project_state,
            completed_op_ids,
            pending_op_ids,
        )
        self.completed_op_ids_since_last_broadcast = []

    async def _broadcast_name_validation_errors(
        self,
        project_state: ProjectStateSingleConfig,
    ) -> None:
        section_errors = collect_section_name_conflicts(project_state)
        param_errors, param_format_errors = collect_param_name_errors(project_state)
        section_format_errors = collect_section_name_format_errors(project_state)
        heading_name_errors = collect_text_block_heading_name_errors(project_state)
        for section_id, errors in section_format_errors.items():
            section_errors.setdefault(section_id, []).extend(errors)
        for section_id, errors in heading_name_errors.items():
            section_errors.setdefault(section_id, []).extend(errors)
        for param_id, errors in param_format_errors.items():
            param_errors.setdefault(param_id, []).extend(errors)
        project_errors = collect_project_name_format_errors(project_state)
        content = SettaProjectNameValidationErrors(
            projectConfigId=project_state.projectConfig.id,
            projectErrors=project_errors,
            sectionErrors=section_errors,
            paramErrors=param_errors,
        )
        await self.websocket_msg_handler.broadcast_name_validation_errors(content)

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

    def add_new_history_entry(
        self,
        trigger_autosave: bool = True,
        coalesce_key: str | None = None,
        coalesce_window_s: float | None = None,
    ):
        self.history.add_current_copy(
            coalesce_key=coalesce_key, coalesce_window_s=coalesce_window_s
        )
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
    @project_state_tool(
        tool_type=SettaToolType.init,
        access_type="read",
        result_filter="project_state_summary",
    )
    async def get_latest_project_state_summary(
        self, x: GetLatestProjectStateSummaryRequest
    ):
        """Return a lightweight summary for the requested project config."""
        project_state = convert_backend_to_single_config(
            self.project_state_backend, x.projectConfigId
        )
        return build_project_state_summary(project_state)

    @enqueue_method(require_serialization=False)
    @project_state_tool(
        tool_type=SettaToolType.init,
        access_type="read",
        result_filter="lsp_diagnostics",
    )
    async def get_latest_lsp_diagnostics(
        self, x: GetLatestLspDiagnosticsRequest
    ) -> SettaLspDiagnosticsPayload:
        """Return the latest parsed LSP diagnostics payload for the project config."""
        diagnostics_state = self._get_lsp_diagnostics_state(x.projectConfigId)
        return diagnostics_state.snapshot()

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
                    await self.watch_code_manager.handle_code_section_update(
                        single_state, section_id, plan.raw_content
                    )
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
