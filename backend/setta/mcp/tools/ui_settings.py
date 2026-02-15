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
from setta.types.chat_messages import JSONValue
from setta.types.id import ID
from setta.types.websocket import UISettingRevealContent, UISettingRevealTarget
from setta.ui_settings.models import (
    UISettingEntry,
    UISettingLocation,
    UISettingToolError,
    UISettingValueSchema,
)
from setta.ui_settings.registry import (
    UISettingValidationError,
    build_ui_settings_registry,
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
    settingId: str | None = None,
    settingIds: list[str] | None = None,
    durationMs: int = 3000,
    projectConfigId: ID | None = None,
    ctx: Context,
) -> RevealUISettingResult:
    """Open the pane/tab for settings and highlight their controls."""

    project_config_id = _resolve_project_config_id(
        ctx=ctx,
        project_config_id=projectConfigId,
    )
    normalized_ids = _normalize_setting_ids(settingId=settingId, settingIds=settingIds)
    return await _reveal_settings(
        ctx=ctx,
        project_config_id=project_config_id,
        setting_ids=normalized_ids,
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
            error=UISettingToolError(
                code="setting_not_found",
                message=f"Unknown setting id: {settingId}",
            )
        )

    value = await _call_maybe_async(runtime_entry.readValue(ctx, project_config_id))
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
            error=UISettingToolError(
                code="setting_not_found",
                message=f"Unknown setting id: {settingId}",
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
            setting_ids=[settingId],
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


def _normalize_setting_ids(
    *,
    settingId: str | None,
    settingIds: list[str] | None,
) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    if settingId is not None:
        normalized = settingId.strip()
        if normalized:
            output.append(normalized)
            seen.add(normalized)
    if settingIds is not None:
        for candidate in settingIds:
            normalized = candidate.strip()
            if not normalized or normalized in seen:
                continue
            output.append(normalized)
            seen.add(normalized)
    if not output:
        raise ValueError("Provide settingId or settingIds.")
    return output


async def _reveal_settings(
    *,
    ctx: Context,
    project_config_id: ID,
    setting_ids: list[str],
    duration_ms: int,
) -> RevealUISettingResult:
    bounded_duration_ms = _bound_duration(duration_ms)
    registry = build_ui_settings_registry(
        ctx=ctx,
        project_config_id=project_config_id,
    )
    manager = ctx.fastmcp.state.project_manager_switcher.get(project_config_id)
    project_state = manager.get_single_config_state(project_config_id)
    statuses: list[RevealUISettingStatus] = []
    reveal_targets: list[UISettingRevealTarget] = []

    for setting_id in setting_ids:
        runtime_entry = registry.get(setting_id)
        if runtime_entry is None:
            statuses.append(
                RevealUISettingStatus(
                    settingId=setting_id,
                    status="failed",
                    error=UISettingToolError(
                        code="setting_not_found",
                        message=f"Unknown setting id: {setting_id}",
                    ),
                )
            )
            continue

        location = runtime_entry.metadata.location
        if location.side == "right" and location.requiresSectionSelection:
            if not project_state.projectConfig.activeIds:
                statuses.append(
                    RevealUISettingStatus(
                        settingId=setting_id,
                        status="failed",
                        error=UISettingToolError(
                            code="mutation_failed",
                            message="Right-pane reveal requires an active section selection.",
                        ),
                    )
                )
                continue

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
        reveal_targets.append(target)
        statuses.append(
            RevealUISettingStatus(
                settingId=setting_id,
                status="revealed",
                target=target,
            )
        )

    request_id = uuid4().hex
    if reveal_targets:
        await ctx.fastmcp.state.wmh_frontend_sender.broadcast_ui_setting_reveal(
            UISettingRevealContent(
                projectConfigId=project_config_id,
                chatId=_resolve_chat_id(ctx),
                reveals=reveal_targets,
                durationMs=bounded_duration_ms,
                requestId=request_id,
            ),
            share_session_id=_resolve_share_session_id(ctx),
        )

    return RevealUISettingResult(
        requestId=request_id,
        projectConfigId=project_config_id,
        durationMs=bounded_duration_ms,
        emittedRevealCount=len(reveal_targets),
        statuses=statuses,
    )


def _bound_duration(duration_ms: int) -> int:
    if duration_ms <= 0:
        return 2500
    if duration_ms > 10000:
        return 10000
    return duration_ms


async def _call_maybe_async(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value
