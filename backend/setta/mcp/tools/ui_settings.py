import inspect
from typing import Any, Literal
from uuid import uuid4

from mcp.server.fastmcp.server import Context
from pydantic import BaseModel

from setta.mcp.tool_metadata import (
    ToolAccessMetadata,
    attach_tool_access,
    attach_tool_search_category,
    attach_tool_search_tags,
)
from setta.mcp.tool_setup import setta_tool
from setta.project_state.project_manager_types import SetActiveIdsRequest
from setta.types.chat_messages import JSONValue
from setta.types.id import ID
from setta.types.websocket import UISettingRevealContent, UISettingRevealTarget
from setta.ui_settings.models import (
    UISettingEntry,
    UISettingLocation,
    UISettingToolError,
    UISettingValueSchema,
)
from setta.ui_settings.reveal_result_hub import (
    UISettingRevealResultContent,
    UISettingRevealResultStatus,
)
from setta.ui_settings.registry import (
    UISettingValidationError,
    build_ui_settings_registry,
    parse_plugin_setting_id,
    validate_ui_setting_value,
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

    project_config_id = _resolve_project_config_id(
        ctx=ctx,
        project_config_id=projectConfigId,
    )
    registry = build_ui_settings_registry(
        ctx=ctx,
        project_config_id=project_config_id,
    )
    results = registry.search(
        query=query,
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
    normalized_setting_id = settingId.strip()
    if normalized_setting_id == "":
        raise ValueError("settingId must not be empty.")
    return await _reveal_settings(
        ctx=ctx,
        project_config_id=project_config_id,
        setting_id=normalized_setting_id,
        section_id_to_activate=sectionIdToActivate,
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

    project_config_id = _resolve_project_config_id(
        ctx=ctx,
        project_config_id=projectConfigId,
    )
    registry = build_ui_settings_registry(
        ctx=ctx,
        project_config_id=project_config_id,
    )
    runtime_entry = registry.get(settingId)
    if runtime_entry is None:
        return GetUISettingValueResult(
            error=_resolve_missing_setting_error(
                ctx=ctx,
                setting_id=settingId,
            )
        )

    try:
        value = await _call_maybe_async(runtime_entry.readValue(ctx, project_config_id))
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
                message=f"Failed to read {settingId}: {exc}",
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

    project_config_id = _resolve_project_config_id(
        ctx=ctx,
        project_config_id=projectConfigId,
    )
    registry = build_ui_settings_registry(
        ctx=ctx,
        project_config_id=project_config_id,
    )
    runtime_entry = registry.get(settingId)
    if runtime_entry is None:
        return SetUISettingValueResult(
            error=_resolve_missing_setting_error(
                ctx=ctx,
                setting_id=settingId,
            )
        )
    if runtime_entry.writeValue is None:
        return SetUISettingValueResult(
            setting=_build_result_summary(runtime_entry.metadata),
            error=UISettingToolError(
                code="setting_read_only",
                message=f"Setting {settingId} is read-only.",
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
        mutation_result = await _call_maybe_async(
            runtime_entry.writeValue(ctx, project_config_id, normalized_value)
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
                message=f"Failed to set {settingId}: {exc}",
            ),
        )

    reveal_result: RevealUISettingResult | None = None
    if revealAfterSet:
        reveal_result = await _reveal_settings(
            ctx=ctx,
            project_config_id=project_config_id,
            setting_id=settingId,
            section_id_to_activate=None,
            duration_ms=durationMs,
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


def _resolve_request_meta(ctx: Context) -> dict[str, Any]:
    try:
        request_context = ctx.request_context
    except ValueError:
        return {}
    meta = request_context.meta
    if isinstance(meta, dict):
        return meta
    if isinstance(meta, BaseModel):
        dumped = meta.model_dump()
        if isinstance(dumped, dict):
            return dumped
    return {}


def _resolve_project_config_id(
    *,
    ctx: Context,
    project_config_id: ID | None,
) -> ID:
    if project_config_id is not None:
        return project_config_id
    meta = _resolve_request_meta(ctx)
    raw_project_config_id = meta.get("projectConfigId")
    if isinstance(raw_project_config_id, str) and raw_project_config_id.strip() != "":
        return ID(raw_project_config_id.strip())
    manager = ctx.fastmcp.state.project_manager_switcher.main
    if manager is None:
        raise KeyError("Missing main project manager.")
    default_project_config_id = manager.project_state_backend.defaultProjectConfigId
    if default_project_config_id is None:
        raise KeyError("No default project config id is available.")
    return default_project_config_id


def _resolve_chat_id(ctx: Context) -> ID | None:
    meta = _resolve_request_meta(ctx)
    raw_chat_id = meta.get("chatId")
    if isinstance(raw_chat_id, str) and raw_chat_id.strip() != "":
        return ID(raw_chat_id.strip())
    return None


def _resolve_share_session_id(ctx: Context) -> str | None:
    meta = _resolve_request_meta(ctx)
    raw_share_session_id = meta.get("shareSessionId")
    if isinstance(raw_share_session_id, str) and raw_share_session_id.strip() != "":
        return raw_share_session_id.strip()
    return None


def _resolve_missing_setting_error(
    *,
    ctx: Context,
    setting_id: str,
) -> UISettingToolError:
    parsed_plugin_setting = parse_plugin_setting_id(setting_id)
    if parsed_plugin_setting is None:
        return UISettingToolError(
            code="setting_not_found",
            message=f"Unknown setting id: {setting_id}",
        )

    plugin_id, _ = parsed_plugin_setting
    plugin_error = _resolve_plugin_runtime_support_error(
        ctx=ctx,
        plugin_id=plugin_id,
    )
    if plugin_error is not None:
        return plugin_error

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
) -> RevealUISettingResult:
    bounded_duration_ms = _bound_duration(duration_ms)
    registry = build_ui_settings_registry(
        ctx=ctx,
        project_config_id=project_config_id,
    )
    manager = ctx.fastmcp.state.project_manager_switcher.get(project_config_id)
    project_state = manager.get_single_config_state(project_config_id)
    request_id = uuid4().hex
    runtime_entry = registry.get(setting_id)
    if runtime_entry is None:
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
                    ),
                )
            ],
        )

    location = runtime_entry.metadata.location
    plugin_id = runtime_entry.metadata.pluginId
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

    if location.side == "right" and location.requiresSectionSelection:
        if section_id_to_activate is not None:
            section_error = await _activate_section_for_reveal(
                manager=manager,
                project_config_id=project_config_id,
                project_state=project_state,
                section_id_to_activate=section_id_to_activate,
            )
            if section_error is not None:
                return RevealUISettingResult(
                    requestId=request_id,
                    projectConfigId=project_config_id,
                    durationMs=bounded_duration_ms,
                    emittedRevealCount=0,
                    statuses=[
                        RevealUISettingStatus(
                            settingId=setting_id,
                            status="failed",
                            error=section_error,
                        )
                    ],
                )
            project_state = manager.get_single_config_state(project_config_id)

        if not project_state.projectConfig.activeIds:
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

    target = UISettingRevealTarget(
        settingId=runtime_entry.metadata.settingId,
        side=location.side,
        overviewTabKey=location.overviewTabKey,
        uiEditorTabName=location.uiEditorTabName,
        pluginId=location.pluginId,
        paneId=location.paneId,
        strategy=runtime_entry.metadata.highlight.strategy,
        anchorId=runtime_entry.metadata.highlight.anchorId,
        pluginRevealKey=runtime_entry.metadata.highlight.pluginRevealKey,
    )
    reveal_result_hub = getattr(ctx.fastmcp.state, "ui_setting_reveal_result_hub", None)
    if reveal_result_hub is not None:
        reveal_result_hub.register_request(request_id)
    await ctx.fastmcp.state.wmh_frontend_sender.broadcast_ui_setting_reveal(
        UISettingRevealContent(
            projectConfigId=project_config_id,
            chatId=_resolve_chat_id(ctx),
            reveals=[target],
            durationMs=bounded_duration_ms,
            requestId=request_id,
        ),
        share_session_id=_resolve_share_session_id(ctx),
    )

    if reveal_result_hub is None:
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

    frontend_reveal_result = await reveal_result_hub.wait_for_result(
        request_id=request_id,
        timeout_seconds=_resolve_frontend_reveal_timeout_seconds(bounded_duration_ms),
    )
    if frontend_reveal_result is None:
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
                            "Timed out waiting for frontend reveal confirmation "
                            f"for {setting_id}."
                        ),
                    ),
                )
            ],
        )

    frontend_status = _find_frontend_reveal_status(
        frontend_reveal_result=frontend_reveal_result,
        setting_id=setting_id,
    )
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
                            "Frontend reveal response did not include status for "
                            f"{setting_id}."
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
                error=_build_ui_setting_error_from_frontend_reveal_status(frontend_status),
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
    plugin_state: str | None = None
    for status_entry in runtime_response.status.plugins:
        if status_entry.pluginId != plugin_id:
            continue
        state_value = status_entry.state
        plugin_state = (
            state_value.value if hasattr(state_value, "value") else str(state_value)
        )
        break
    if plugin_state != "active":
        if plugin_state is None:
            return UISettingToolError(
                code="plugin_unavailable",
                message=f"Plugin {plugin_id} is unavailable.",
            )
        return UISettingToolError(
            code="plugin_unavailable",
            message=f"Plugin {plugin_id} is unavailable (state={plugin_state}).",
        )

    plugin_entry = None
    for candidate in runtime_response.list.plugins:
        if candidate.pluginId == plugin_id:
            plugin_entry = candidate
            break
    if plugin_entry is None:
        return UISettingToolError(
            code="plugin_unavailable",
            message=f"Plugin {plugin_id} is unavailable (active runtime entry missing).",
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


async def _activate_section_for_reveal(
    *,
    manager,
    project_config_id: ID,
    project_state,
    section_id_to_activate: ID,
) -> UISettingToolError | None:
    if section_id_to_activate not in project_state.sections:
        return UISettingToolError(
            code="mutation_failed",
            message=f"Unknown section id: {section_id_to_activate}",
        )

    target_active_ids = [section_id_to_activate]
    if project_state.projectConfig.activeIds == target_active_ids:
        return None

    await manager.set_active_ids(
        SetActiveIdsRequest(
            projectConfigId=project_config_id,
            activeIds=target_active_ids,
        )
    )
    refreshed_project_state = manager.get_single_config_state(project_config_id)
    await manager.update_and_broadcast_project_state(
        refreshed_project_state,
        updateFileWatcher=False,
        broadcast_name_validation_errors=False,
        validate_name_rules=False,
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


def _find_frontend_reveal_status(
    *,
    frontend_reveal_result: UISettingRevealResultContent,
    setting_id: str,
) -> UISettingRevealResultStatus | None:
    for status in frontend_reveal_result.statuses:
        if status.settingId == setting_id:
            return status
    return None


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
            if isinstance(status.errorMessage, str) and status.errorMessage.strip() != ""
            else f"Frontend reveal failed for {status.settingId}."
        ),
    )


async def _call_maybe_async(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value
