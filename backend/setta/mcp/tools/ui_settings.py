import inspect
from typing import Any, Literal
from uuid import uuid4

from mcp.server.fastmcp.server import Context
from pydantic import BaseModel

from setta.mcp.errors import InvalidToolArgumentsError
from setta.mcp.tool_metadata import (
    ToolAccessMetadata,
    attach_tool_access,
    attach_tool_search_category,
    attach_tool_search_tags,
)
from setta.mcp.tool_setup import setta_tool
from setta.mcp.ui_settings_context import (
    resolve_project_config_id_from_ctx,
    resolve_project_manager_from_ctx,
    resolve_section_id_from_ctx,
)
from setta.types.chat_messages import JSONValue
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.id import ID
from setta.types.section_impls import SectionType
from setta.types.websocket import (
    UISettingRevealActivationStep as WebsocketUISettingRevealActivationStep,
)
from setta.types.websocket import (
    UISettingRevealResultStatus,
    UISettingRevealTarget,
)
from setta.ui_settings.models import (
    UISettingEntry,
    UISettingLocation,
    UISettingRuntimeEntry,
    UISettingToolError,
    UISettingValueSchema,
)
from setta.ui_settings.registry import (
    UISettingRegistry,
    UISettingValidationError,
    build_ui_settings_registry,
    describe_plugin_runtime_states,
    parse_plugin_setting_id,
    resolve_plugin_runtime_availability,
    validate_ui_setting_value,
)
from setta.ui_settings.reveal_coordinator import UISettingRevealCoordinator
from setta.ui_settings.section_ui_editor_tab_compatibility import (
    REQUIRED_UI_EDITOR_TABS_BY_SECTION_TYPE,
)

UISettingSourceFilterLiteral = Literal["core", "plugin", "all"]


class UISettingResultSummary(BaseModel, extra="forbid"):
    settingId: str
    title: str
    description: str
    source: Literal["core", "plugin"]
    pluginId: str | None = None
    mutability: Literal["readOnly", "writable"]
    location: UISettingLocation
    valueSchema: UISettingValueSchema


class SearchUISettingsResult(BaseModel, extra="forbid"):
    results: list[UISettingResultSummary]


class RevealUISettingStatus(BaseModel, extra="forbid"):
    settingId: str
    status: Literal["revealed", "failed"]
    target: UISettingRevealTarget | None = None
    error: UISettingToolError | None = None


class RevealUISettingResult(BaseModel, extra="forbid"):
    requestId: str
    projectConfigId: ID
    durationMs: int
    emittedRevealCount: int
    statuses: list[RevealUISettingStatus]


class GetUISettingValueResult(BaseModel, extra="forbid"):
    setting: UISettingResultSummary | None = None
    value: JSONValue = None
    error: UISettingToolError | None = None


class SetUISettingValueResult(BaseModel, extra="forbid"):
    setting: UISettingResultSummary | None = None
    oldValue: JSONValue = None
    newValue: JSONValue = None
    normalizedValue: JSONValue = None
    changed: bool = False
    reveal: RevealUISettingResult | None = None
    error: UISettingToolError | None = None


@setta_tool
def search_ui_settings(
    *,
    query: str,
    limit: int = 5,
    sourceFilter: UISettingSourceFilterLiteral = "all",
    projectConfigId: ID | None = None,
    ctx: Context,
) -> SearchUISettingsResult:
    """Search canonical UI settings by natural-language query."""

    normalized_query = query.strip()
    if normalized_query == "":
        raise InvalidToolArgumentsError("query must not be empty")

    project_config_id = _resolve_project_config_id(
        ctx=ctx,
        project_config_id=projectConfigId,
    )
    registry = build_ui_settings_registry(
        ctx=ctx,
        project_config_id=project_config_id,
    )
    results = registry.search(
        query=normalized_query,
        limit=limit,
        source_filter=sourceFilter,
    )
    return SearchUISettingsResult(
        results=[_build_result_summary(entry) for entry in results],
    )


attach_tool_access(
    search_ui_settings,
    ToolAccessMetadata(
        accessType="read", defaultTargetSingletonSection="GlobalVariables"
    ),
)
attach_tool_search_category(search_ui_settings, "project")
attach_tool_search_tags(search_ui_settings, ["ui", "settings", "discover"])


@setta_tool
async def reveal_ui_setting(
    *,
    settingId: str,
    sectionIdToActivate: ID | None = None,
    durationMs: int = 3000,
    projectConfigId: ID | None = None,
    ctx: Context,
) -> RevealUISettingResult:
    """Open pane/tab targets for settings and highlight their controls.

    For right-pane settings, pass `sectionIdToActivate` when no section is active.
    If omitted and no section is active, this tool returns a structured failure.
    """

    project_config_id = _resolve_project_config_id(
        ctx=ctx,
        project_config_id=projectConfigId,
    )
    normalized_setting_id = _normalize_setting_id(settingId)
    resolved_section_id_to_activate = _resolve_section_id_for_reveal(
        ctx=ctx,
        explicit_section_id=sectionIdToActivate,
    )
    return await _reveal_settings(
        ctx=ctx,
        project_config_id=project_config_id,
        setting_id=normalized_setting_id,
        section_id_to_activate=resolved_section_id_to_activate,
        duration_ms=durationMs,
    )


attach_tool_access(
    reveal_ui_setting,
    ToolAccessMetadata(
        accessType="read", defaultTargetSingletonSection="GlobalVariables"
    ),
)
attach_tool_search_category(reveal_ui_setting, "project")
attach_tool_search_tags(reveal_ui_setting, ["ui", "settings", "reveal", "highlight"])


@setta_tool
async def get_ui_setting_value(
    *,
    settingId: str,
    projectConfigId: ID | None = None,
    ctx: Context,
) -> GetUISettingValueResult:
    """Read the current value for a canonical UI setting ID."""

    normalized_setting_id = _normalize_setting_id(settingId)
    project_config_id = _resolve_project_config_id(
        ctx=ctx,
        project_config_id=projectConfigId,
    )
    registry = build_ui_settings_registry(
        ctx=ctx,
        project_config_id=project_config_id,
    )
    runtime_entry = registry.get(normalized_setting_id)
    if runtime_entry is None:
        return GetUISettingValueResult(
            error=_resolve_missing_setting_error(
                ctx=ctx,
                setting_id=normalized_setting_id,
                registry=registry,
            )
        )

    try:
        value = await _call_maybe_async(runtime_entry.readValue(ctx, project_config_id))
        _validate_runtime_value_against_schema(
            setting_id=normalized_setting_id,
            schema=runtime_entry.metadata.valueSchema,
            value=value,
            operation="read",
        )
    except UISettingValidationError as exc:
        return GetUISettingValueResult(
            setting=_build_result_summary(runtime_entry.metadata),
            error=UISettingToolError(code=exc.code, message=str(exc)),
        )
    except Exception as exc:
        return GetUISettingValueResult(
            setting=_build_result_summary(runtime_entry.metadata),
            error=UISettingToolError(
                code="mutation_failed",
                message=f"Failed to read {normalized_setting_id}: {exc}",
            ),
        )
    return GetUISettingValueResult(
        setting=_build_result_summary(runtime_entry.metadata),
        value=value,
    )


attach_tool_access(
    get_ui_setting_value,
    ToolAccessMetadata(
        accessType="read", defaultTargetSingletonSection="GlobalVariables"
    ),
)
attach_tool_search_category(get_ui_setting_value, "project")
attach_tool_search_tags(get_ui_setting_value, ["ui", "settings", "read"])


@setta_tool
async def set_ui_setting_value(
    *,
    settingId: str,
    value: JSONValue,
    revealAfterSet: bool = False,
    durationMs: int = 3000,
    projectConfigId: ID | None = None,
    ctx: Context,
) -> SetUISettingValueResult:
    """Set a canonical UI setting ID to a validated value."""

    normalized_setting_id = _normalize_setting_id(settingId)
    project_config_id = _resolve_project_config_id(
        ctx=ctx,
        project_config_id=projectConfigId,
    )
    registry = build_ui_settings_registry(
        ctx=ctx,
        project_config_id=project_config_id,
    )
    runtime_entry = registry.get(normalized_setting_id)
    if runtime_entry is None:
        return SetUISettingValueResult(
            error=_resolve_missing_setting_error(
                ctx=ctx,
                setting_id=normalized_setting_id,
                registry=registry,
            )
        )
    if runtime_entry.writeValue is None:
        return SetUISettingValueResult(
            setting=_build_result_summary(runtime_entry.metadata),
            error=UISettingToolError(
                code="setting_read_only",
                message=f"Setting {normalized_setting_id} is read-only.",
            ),
        )

    try:
        normalized_value = validate_ui_setting_value(
            runtime_entry.metadata.valueSchema, value
        )
    except UISettingValidationError as exc:
        return SetUISettingValueResult(
            setting=_build_result_summary(runtime_entry.metadata),
            error=UISettingToolError(code=exc.code, message=str(exc)),
        )

    try:
        current_value = await _call_maybe_async(
            runtime_entry.readValue(ctx, project_config_id)
        )
        _validate_runtime_value_against_schema(
            setting_id=normalized_setting_id,
            schema=runtime_entry.metadata.valueSchema,
            value=current_value,
            operation="pre-write oldValue read",
        )
        mutation_result = await _call_write_value_with_precondition(
            write_value=runtime_entry.writeValue,
            ctx=ctx,
            project_config_id=project_config_id,
            normalized_value=normalized_value,
            expected_old_value=current_value,
        )
        _validate_runtime_value_against_schema(
            setting_id=normalized_setting_id,
            schema=runtime_entry.metadata.valueSchema,
            value=mutation_result.newValue,
            operation="post-write newValue read",
        )
        if mutation_result.oldValue != current_value:
            return SetUISettingValueResult(
                setting=_build_result_summary(runtime_entry.metadata),
                error=UISettingToolError(
                    code="mutation_failed",
                    message=(
                        f"Failed to set {normalized_setting_id}: write operation "
                        "returned an oldValue that does not match the validated "
                        "pre-write snapshot."
                    ),
                ),
            )
    except UISettingValidationError as exc:
        return SetUISettingValueResult(
            setting=_build_result_summary(runtime_entry.metadata),
            error=UISettingToolError(code=exc.code, message=str(exc)),
        )
    except Exception as exc:
        return SetUISettingValueResult(
            setting=_build_result_summary(runtime_entry.metadata),
            error=UISettingToolError(
                code="mutation_failed",
                message=f"Failed to set {normalized_setting_id}: {exc}",
            ),
        )

    reveal_result: RevealUISettingResult | None = None
    if revealAfterSet:
        resolved_section_id_to_activate = _resolve_section_id_for_reveal(
            ctx=ctx,
            explicit_section_id=None,
        )
        reveal_result = await _reveal_settings(
            ctx=ctx,
            project_config_id=project_config_id,
            setting_id=normalized_setting_id,
            section_id_to_activate=resolved_section_id_to_activate,
            duration_ms=durationMs,
            runtime_entry=runtime_entry,
        )

    return SetUISettingValueResult(
        setting=_build_result_summary(runtime_entry.metadata),
        oldValue=mutation_result.oldValue,
        newValue=mutation_result.newValue,
        normalizedValue=mutation_result.normalizedValue,
        changed=mutation_result.changed,
        reveal=reveal_result,
    )


attach_tool_access(
    set_ui_setting_value,
    ToolAccessMetadata(
        accessType="write", defaultTargetSingletonSection="GlobalVariables"
    ),
)
attach_tool_search_category(set_ui_setting_value, "project")
attach_tool_search_tags(set_ui_setting_value, ["ui", "settings", "write", "mutate"])


def _build_result_summary(entry: UISettingEntry) -> UISettingResultSummary:
    return UISettingResultSummary(
        settingId=entry.settingId,
        title=entry.title,
        description=entry.description,
        source=entry.source,
        pluginId=entry.pluginId,
        mutability=entry.mutability,
        location=entry.location,
        valueSchema=entry.valueSchema,
    )


def _normalize_setting_id(setting_id: str) -> str:
    normalized_setting_id = setting_id.strip()
    if normalized_setting_id == "":
        raise InvalidToolArgumentsError("settingId must not be empty.")
    return normalized_setting_id


def _validate_runtime_value_against_schema(
    *,
    setting_id: str,
    schema: UISettingValueSchema,
    value: JSONValue,
    operation: str,
) -> None:
    try:
        validate_ui_setting_value(schema, value)
    except UISettingValidationError as exc:
        raise UISettingValidationError(
            exc.code,
            f"UI setting {setting_id} {operation} returned an invalid value: {exc}",
        ) from exc


def _resolve_project_config_id(
    *,
    ctx: Context,
    project_config_id: ID | None,
) -> ID:
    return resolve_project_config_id_from_ctx(
        ctx=ctx,
        project_config_id=project_config_id,
    )


def _resolve_section_id_for_reveal(
    *,
    ctx: Context,
    explicit_section_id: ID | None,
) -> ID | None:
    return resolve_section_id_from_ctx(
        ctx=ctx,
        explicit_section_id=explicit_section_id,
    )


def _resolve_missing_setting_error(
    *,
    ctx: Context,
    setting_id: str,
    registry: UISettingRegistry | None = None,
) -> UISettingToolError:
    parsed_plugin_setting = parse_plugin_setting_id(setting_id)
    if parsed_plugin_setting is None:
        return UISettingToolError(
            code="setting_not_found",
            message=f"Unknown setting id: {setting_id}",
        )

    plugin_id, local_setting_id = parsed_plugin_setting
    if registry is not None:
        if not registry.has_known_plugin(plugin_id):
            return UISettingToolError(
                code="setting_not_found",
                message=f"Unknown setting id: {setting_id}",
            )
        plugin_errors_by_plugin_and_local_setting_id = getattr(
            registry,
            "pluginErrorsByPluginAndLocalSettingId",
            {},
        )
        plugin_registry_error = plugin_errors_by_plugin_and_local_setting_id.get(
            (plugin_id, local_setting_id)
        )
        if plugin_registry_error is not None:
            return UISettingToolError(
                code="plugin_unavailable",
                message=(
                    f"Plugin {plugin_id} ui setting metadata is invalid: "
                    f"{plugin_registry_error}"
                ),
            )
    plugin_runtime_error = _resolve_plugin_runtime_support_error(
        ctx=ctx,
        plugin_id=plugin_id,
    )
    if registry is not None and not registry.has_known_plugin_setting(
        plugin_id, local_setting_id
    ):
        if plugin_runtime_error is not None:
            return plugin_runtime_error
        return UISettingToolError(
            code="setting_not_found",
            message=f"Unknown setting id: {setting_id}",
        )
    if plugin_runtime_error is not None:
        return plugin_runtime_error

    return UISettingToolError(
        code="setting_not_found",
        message=f"Unknown setting id: {setting_id}",
    )


async def _reveal_settings(
    *,
    ctx: Context,
    project_config_id: ID,
    setting_id: str,
    section_id_to_activate: ID | None,
    duration_ms: int,
    runtime_entry: UISettingRuntimeEntry | None = None,
) -> RevealUISettingResult:
    bounded_duration_ms = _bound_duration(duration_ms)
    request_id = uuid4().hex
    try:
        manager = resolve_project_manager_from_ctx(
            ctx=ctx,
            project_config_id=project_config_id,
        )
        project_state = manager.get_single_config_state(project_config_id)
    except KeyError as exc:
        return RevealUISettingResult(
            requestId=request_id,
            projectConfigId=project_config_id,
            durationMs=bounded_duration_ms,
            emittedRevealCount=0,
            statuses=[
                RevealUISettingStatus(
                    settingId=setting_id,
                    status="failed",
                    error=UISettingToolError(
                        code="mutation_failed",
                        message=(
                            "Failed to resolve project manager for UI setting reveal: "
                            f"{exc}"
                        ),
                    ),
                )
            ],
        )
    resolved_runtime_entry = runtime_entry
    registry: UISettingRegistry | None = None
    if resolved_runtime_entry is None:
        registry = build_ui_settings_registry(
            ctx=ctx,
            project_config_id=project_config_id,
        )
        resolved_runtime_entry = registry.get(setting_id)
    if resolved_runtime_entry is None:
        return RevealUISettingResult(
            requestId=request_id,
            projectConfigId=project_config_id,
            durationMs=bounded_duration_ms,
            emittedRevealCount=0,
            statuses=[
                RevealUISettingStatus(
                    settingId=setting_id,
                    status="failed",
                    error=_resolve_missing_setting_error(
                        ctx=ctx,
                        setting_id=setting_id,
                        registry=registry,
                    ),
                )
            ],
        )

    location = resolved_runtime_entry.metadata.location
    plugin_id = resolved_runtime_entry.metadata.pluginId
    if plugin_id is not None:
        plugin_error = _resolve_plugin_runtime_support_error(
            ctx=ctx,
            plugin_id=plugin_id,
        )
        if plugin_error is not None:
            return RevealUISettingResult(
                requestId=request_id,
                projectConfigId=project_config_id,
                durationMs=bounded_duration_ms,
                emittedRevealCount=0,
                statuses=[
                    RevealUISettingStatus(
                        settingId=setting_id,
                        status="failed",
                        error=plugin_error,
                    )
                ],
            )

    requested_active_section_id: ID | None = None
    if location.side == "right" and location.requiresSectionSelection:
        active_section_id_for_reveal: ID | None = None
        if section_id_to_activate is not None:
            active_section_id_for_reveal = section_id_to_activate
            requested_active_section_id = section_id_to_activate
        elif project_state.projectConfig.activeIds:
            active_section_id_for_reveal = project_state.projectConfig.activeIds[0]

        if active_section_id_for_reveal is None:
            return RevealUISettingResult(
                requestId=request_id,
                projectConfigId=project_config_id,
                durationMs=bounded_duration_ms,
                emittedRevealCount=0,
                statuses=[
                    RevealUISettingStatus(
                        settingId=setting_id,
                        status="failed",
                        error=UISettingToolError(
                            code="mutation_failed",
                            message=(
                                "Right-pane reveal requires an active section. "
                                "Pick a section and pass sectionIdToActivate."
                            ),
                        ),
                    )
                ],
            )
        incompatible_tab_error = _resolve_right_pane_incompatible_tab_error(
            project_state=project_state,
            section_id=active_section_id_for_reveal,
            ui_editor_tab_name=location.uiEditorTabName,
        )
        if incompatible_tab_error is not None:
            return RevealUISettingResult(
                requestId=request_id,
                projectConfigId=project_config_id,
                durationMs=bounded_duration_ms,
                emittedRevealCount=0,
                statuses=[
                    RevealUISettingStatus(
                        settingId=setting_id,
                        status="failed",
                        error=incompatible_tab_error,
                    )
                ],
            )

    target = UISettingRevealTarget(
        settingId=resolved_runtime_entry.metadata.settingId,
        side=location.side,
        overviewTabKey=location.overviewTabKey,
        uiEditorTabName=location.uiEditorTabName,
        pluginId=location.pluginId,
        paneId=location.paneId,
        strategy=resolved_runtime_entry.metadata.highlight.strategy,
        anchorId=resolved_runtime_entry.metadata.highlight.anchorId,
        pluginRevealKey=resolved_runtime_entry.metadata.highlight.pluginRevealKey,
        revealActivationSteps=[
            WebsocketUISettingRevealActivationStep.model_validate(step.model_dump())
            for step in resolved_runtime_entry.metadata.revealActivationSteps
        ],
    )
    reveal_coordinator = UISettingRevealCoordinator(
        ctx=ctx,
        project_config_id=project_config_id,
        timeout_seconds_resolver=_resolve_frontend_reveal_timeout_seconds,
    )
    dispatch_result = await reveal_coordinator.dispatch_and_wait_for_single_target(
        request_id=request_id,
        bounded_duration_ms=bounded_duration_ms,
        target=target,
        active_section_id=requested_active_section_id,
    )
    if dispatch_result.error_message is not None:
        return RevealUISettingResult(
            requestId=request_id,
            projectConfigId=project_config_id,
            durationMs=bounded_duration_ms,
            emittedRevealCount=0,
            statuses=[
                RevealUISettingStatus(
                    settingId=setting_id,
                    status="failed",
                    error=UISettingToolError(
                        code="mutation_failed",
                        message=dispatch_result.error_message,
                    ),
                )
            ],
        )

    frontend_status = dispatch_result.frontend_status
    if frontend_status is None:
        return RevealUISettingResult(
            requestId=request_id,
            projectConfigId=project_config_id,
            durationMs=bounded_duration_ms,
            emittedRevealCount=0,
            statuses=[
                RevealUISettingStatus(
                    settingId=setting_id,
                    status="failed",
                    error=UISettingToolError(
                        code="mutation_failed",
                        message=(
                            "Frontend reveal response was missing status payload "
                            f"for {setting_id}."
                        ),
                    ),
                )
            ],
        )

    if frontend_status.status == "revealed":
        return RevealUISettingResult(
            requestId=request_id,
            projectConfigId=project_config_id,
            durationMs=bounded_duration_ms,
            emittedRevealCount=1,
            statuses=[
                RevealUISettingStatus(
                    settingId=setting_id,
                    status="revealed",
                    target=target,
                )
            ],
        )

    return RevealUISettingResult(
        requestId=request_id,
        projectConfigId=project_config_id,
        durationMs=bounded_duration_ms,
        emittedRevealCount=0,
        statuses=[
            RevealUISettingStatus(
                settingId=setting_id,
                status="failed",
                error=_build_ui_setting_error_from_frontend_reveal_status(
                    frontend_status
                ),
            )
        ],
    )


def _resolve_plugin_runtime_support_error(
    *,
    ctx: Context,
    plugin_id: str,
) -> UISettingToolError | None:
    plugin_manager = getattr(ctx.fastmcp.state, "plugin_manager", None)
    if plugin_manager is None:
        return UISettingToolError(
            code="plugin_unavailable",
            message=f"Plugin {plugin_id} is unavailable.",
        )

    runtime_response = plugin_manager.get_runtime_response()
    availability = resolve_plugin_runtime_availability(
        runtime_response=runtime_response,
        plugin_id=plugin_id,
    )
    if not availability.hasOperationalState:
        observed_state = describe_plugin_runtime_states(
            observed_states=availability.observedStates
        )
        if observed_state is None:
            return UISettingToolError(
                code="plugin_unavailable",
                message=f"Plugin {plugin_id} is unavailable.",
            )
        return UISettingToolError(
            code="plugin_unavailable",
            message=f"Plugin {plugin_id} is unavailable (state={observed_state}).",
        )

    plugin_entry = availability.pluginEntry
    if plugin_entry is None:
        observed_state = (
            describe_plugin_runtime_states(observed_states=availability.observedStates)
            or "unknown"
        )
        return UISettingToolError(
            code="plugin_unavailable",
            message=(
                f"Plugin {plugin_id} is unavailable "
                f"(state={observed_state}, runtime entry missing)."
            ),
        )
    if "registerPane" not in plugin_entry.effectiveCapabilities:
        return UISettingToolError(
            code="plugin_unavailable",
            message=(
                f"Plugin {plugin_id} is unavailable for UI setting reveal "
                "(registerPane capability not effective)."
            ),
        )

    entrypoint_url = plugin_entry.frontend.entrypointUrl
    if not isinstance(entrypoint_url, str) or entrypoint_url.strip() == "":
        return UISettingToolError(
            code="plugin_unavailable",
            message=(
                f"Plugin {plugin_id} is unavailable for UI setting reveal "
                "(frontend entrypoint not available)."
            ),
        )
    return None


def _resolve_right_pane_incompatible_tab_error(
    *,
    project_state,
    section_id: ID,
    ui_editor_tab_name: str | None,
) -> UISettingToolError | None:
    if section_id not in project_state.sections:
        return UISettingToolError(
            code="mutation_failed",
            message=f"Unknown section id: {section_id}",
        )
    if not isinstance(ui_editor_tab_name, str) or ui_editor_tab_name.strip() == "":
        return UISettingToolError(
            code="mutation_failed",
            message="Right-pane reveal is missing uiEditorTabName metadata.",
        )
    section_impl = get_curr_effective_section_impl(project_state, section_id)
    section_type_name = (
        section_impl.type.value
        if isinstance(section_impl.type, SectionType)
        else str(section_impl.type)
    )
    required_tabs = REQUIRED_UI_EDITOR_TABS_BY_SECTION_TYPE.get(section_impl.type)
    if required_tabs is None:
        return UISettingToolError(
            code="mutation_failed",
            message=(
                f"Section type {section_type_name} does not support tab "
                f"{ui_editor_tab_name}."
            ),
        )
    if ui_editor_tab_name not in required_tabs:
        return UISettingToolError(
            code="mutation_failed",
            message=(
                f"Section type {section_type_name} does not support tab "
                f"{ui_editor_tab_name}."
            ),
        )
    return None


def _bound_duration(duration_ms: int) -> int:
    if duration_ms <= 0:
        return 2500
    if duration_ms > 10000:
        return 10000
    return duration_ms


def _resolve_frontend_reveal_timeout_seconds(duration_ms: int) -> float:
    timeout_seconds = (duration_ms / 1000.0) + 1.5
    if timeout_seconds < 3.0:
        return 3.0
    if timeout_seconds > 12.0:
        return 12.0
    return timeout_seconds


def _build_ui_setting_error_from_frontend_reveal_status(
    status: UISettingRevealResultStatus,
) -> UISettingToolError:
    raw_error_code = status.errorCode
    resolved_code: Literal[
        "setting_not_found",
        "setting_read_only",
        "invalid_value_type",
        "invalid_value_range_or_enum",
        "plugin_unavailable",
        "mutation_failed",
    ] = "mutation_failed"
    if raw_error_code in {
        "setting_not_found",
        "setting_read_only",
        "invalid_value_type",
        "invalid_value_range_or_enum",
        "plugin_unavailable",
        "mutation_failed",
    }:
        resolved_code = raw_error_code
    return UISettingToolError(
        code=resolved_code,
        message=(
            status.errorMessage
            if isinstance(status.errorMessage, str)
            and status.errorMessage.strip() != ""
            else f"Frontend reveal failed for {status.settingId}."
        ),
    )


async def _call_maybe_async(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


def _write_value_accepts_expected_old_value(write_value: Any) -> bool:
    try:
        signature = inspect.signature(write_value)
    except (TypeError, ValueError):
        return False
    return "expected_old_value" in signature.parameters


async def _call_write_value_with_precondition(
    *,
    write_value,
    ctx: Context,
    project_config_id: ID,
    normalized_value: JSONValue,
    expected_old_value: JSONValue,
):
    if not _write_value_accepts_expected_old_value(write_value):
        raise UISettingValidationError(
            "mutation_failed",
            (
                "UI setting writer is misconfigured: writeValue must accept "
                "expected_old_value."
            ),
        )
    return await _call_maybe_async(
        write_value(
            ctx,
            project_config_id,
            normalized_value,
            expected_old_value=expected_old_value,
        )
    )
