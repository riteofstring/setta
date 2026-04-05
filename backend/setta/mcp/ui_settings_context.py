from dataclasses import dataclass
from typing import Any

from mcp.server.fastmcp.server import Context
from pydantic import BaseModel

from setta.agentic.agentic_scope import AgenticContext
from setta.frontend_affinity_token import parse_frontend_affinity_token
from setta.mcp.errors import InvalidToolArgumentsError
from setta.types.id import ID


def _normalize_non_empty_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if normalized == "":
        return None
    return normalized


def _resolve_agentic_context(ctx: Context) -> AgenticContext | None:
    fastmcp = getattr(ctx, "fastmcp", None)
    if fastmcp is None:
        return None
    resolve_agentic_context = getattr(fastmcp, "_resolve_agentic_context", None)
    if not callable(resolve_agentic_context):
        return None
    try:
        return resolve_agentic_context(ctx)
    except (TypeError, ValueError) as exc:
        raise InvalidToolArgumentsError(str(exc)) from exc


def _parse_frontend_affinity_token_from_meta(
    meta: dict[str, Any],
) -> str | None:
    if "frontendAffinityToken" not in meta:
        return None
    try:
        return parse_frontend_affinity_token(meta.get("frontendAffinityToken"))
    except (TypeError, ValueError) as exc:
        raise InvalidToolArgumentsError(str(exc)) from exc


@dataclass(frozen=True)
class FrontendWebsocketAffinityResolution:
    frontend_websocket_id: str | None
    error_message: str | None = None


def resolve_request_meta(ctx: Context) -> dict[str, Any]:
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


def resolve_project_config_id_from_ctx(
    *,
    ctx: Context,
    project_config_id: ID | None,
) -> ID:
    agentic_context = _resolve_agentic_context(ctx)
    if agentic_context is not None:
        if (
            project_config_id is not None
            and project_config_id != agentic_context.project_config_id
        ):
            raise InvalidToolArgumentsError(
                (
                    f"projectConfigId argument {project_config_id} does not match "
                    "agentic context projectConfigId "
                    f"{agentic_context.project_config_id}."
                )
            )
        return agentic_context.project_config_id
    if project_config_id is not None:
        return project_config_id
    meta = resolve_request_meta(ctx)
    normalized_meta_project_config_id = _normalize_non_empty_string(
        meta.get("projectConfigId")
    )
    if normalized_meta_project_config_id is not None:
        return ID(normalized_meta_project_config_id)
    share_session_id = resolve_share_session_id_from_ctx(ctx)
    if share_session_id is not None:
        return _resolve_share_scoped_default_project_config_id(
            ctx=ctx,
            share_session_id=share_session_id,
        )
    manager = ctx.fastmcp.state.project_manager_switcher.main
    if manager is None:
        raise KeyError("Missing main project manager.")
    default_project_config_id = manager.project_state_backend.defaultProjectConfigId
    if default_project_config_id is None:
        raise KeyError("No default project config id is available.")
    return default_project_config_id


def _resolve_share_scoped_default_project_config_id(
    *,
    ctx: Context,
    share_session_id: str,
) -> ID:
    project_manager_switcher = ctx.fastmcp.state.project_manager_switcher
    try:
        manager = project_manager_switcher.get(
            ID("__share_session_default_project__"),
            share_session_id=share_session_id,
        )
    except (TypeError, ValueError) as exc:
        raise InvalidToolArgumentsError(str(exc)) from exc
    default_project_config_id = manager.project_state_backend.defaultProjectConfigId
    if default_project_config_id is None:
        raise KeyError(
            "No default project config id is available for share session "
            f"{share_session_id}."
        )
    return default_project_config_id


def resolve_chat_id_from_ctx(ctx: Context) -> ID | None:
    agentic_context = _resolve_agentic_context(ctx)
    if agentic_context is not None and agentic_context.chat_id is not None:
        return agentic_context.chat_id
    meta = resolve_request_meta(ctx)
    normalized_chat_id = _normalize_non_empty_string(meta.get("chatId"))
    if normalized_chat_id is None:
        return None
    return ID(normalized_chat_id)


def resolve_share_session_id_from_ctx(ctx: Context) -> str | None:
    fastmcp = getattr(ctx, "fastmcp", None)
    if fastmcp is not None:
        resolve_share_session_id = getattr(fastmcp, "_resolve_share_session_id", None)
        if callable(resolve_share_session_id):
            try:
                resolved_share_session_id = resolve_share_session_id(ctx)
            except (TypeError, ValueError) as exc:
                raise InvalidToolArgumentsError(str(exc)) from exc
            normalized_resolved_share_session_id = _normalize_non_empty_string(
                resolved_share_session_id
            )
            if normalized_resolved_share_session_id is not None:
                return normalized_resolved_share_session_id
    if not _is_share_scope_enabled(ctx):
        return None
    meta = resolve_request_meta(ctx)
    return _normalize_non_empty_string(meta.get("shareSessionId"))


def _is_share_scope_enabled(ctx: Context) -> bool:
    fastmcp = getattr(ctx, "fastmcp", None)
    if fastmcp is None:
        return False
    state = getattr(fastmcp, "state", None)
    if state is None:
        return False
    if bool(getattr(state, "deployment_mode", False)):
        return True
    frontend_sender = getattr(state, "wmh_frontend_sender", None)
    if frontend_sender is None:
        return False
    return bool(getattr(frontend_sender, "share_mode", False))


def resolve_frontend_websocket_id_from_ctx(ctx: Context) -> str | None:
    resolution = resolve_frontend_websocket_affinity_from_ctx(ctx)
    return resolution.frontend_websocket_id


def resolve_frontend_websocket_affinity_from_ctx(
    ctx: Context,
) -> FrontendWebsocketAffinityResolution:
    share_session_id = resolve_share_session_id_from_ctx(ctx)
    agentic_context = _resolve_agentic_context(ctx)
    affinity_token: str | None = None
    if agentic_context is not None:
        try:
            affinity_token = parse_frontend_affinity_token(
                agentic_context.frontend_affinity_token
            )
        except (TypeError, ValueError) as exc:
            raise InvalidToolArgumentsError(str(exc)) from exc
    if affinity_token is None and share_session_id is None:
        meta = resolve_request_meta(ctx)
        affinity_token = _parse_frontend_affinity_token_from_meta(meta)
    if affinity_token is None:
        return FrontendWebsocketAffinityResolution(frontend_websocket_id=None)
    fastmcp = getattr(ctx, "fastmcp", None)
    if fastmcp is None:
        return FrontendWebsocketAffinityResolution(
            frontend_websocket_id=None,
            error_message="MCP context is missing fastmcp state.",
        )
    state = getattr(fastmcp, "state", None)
    if state is None:
        return FrontendWebsocketAffinityResolution(
            frontend_websocket_id=None,
            error_message="MCP context is missing fastmcp state.",
        )
    frontend_sender = getattr(state, "wmh_frontend_sender", None)
    if frontend_sender is None:
        return FrontendWebsocketAffinityResolution(
            frontend_websocket_id=None,
            error_message="Frontend sender is unavailable for affinity resolution.",
        )
    resolve_from_token = getattr(
        frontend_sender, "resolve_frontend_websocket_id_from_affinity_token", None
    )
    if not callable(resolve_from_token):
        return FrontendWebsocketAffinityResolution(
            frontend_websocket_id=None,
            error_message="Frontend affinity resolution is not available.",
        )
    resolved_frontend_websocket_id = resolve_from_token(
        affinity_token=affinity_token,
        share_session_id=share_session_id,
    )
    if resolved_frontend_websocket_id is None:
        list_frontend_websocket_ids = getattr(
            frontend_sender,
            "list_frontend_websocket_ids_for_ui_setting_reveal",
            None,
        )
        if callable(list_frontend_websocket_ids):
            connected_frontend_ids = list_frontend_websocket_ids(
                share_session_id=share_session_id
            )
            if affinity_token in connected_frontend_ids:
                raise InvalidToolArgumentsError(
                    "frontendAffinityToken must be a frontend affinity token "
                    "from FrontendIdentity, not a websocket id."
                )
        return FrontendWebsocketAffinityResolution(
            frontend_websocket_id=None,
            error_message=(
                "Frontend affinity token is invalid or no longer available for "
                f"reveal routing: {affinity_token}"
            ),
        )
    return FrontendWebsocketAffinityResolution(
        frontend_websocket_id=resolved_frontend_websocket_id
    )


def resolve_section_id_from_ctx(
    *,
    ctx: Context,
    explicit_section_id: ID | None,
) -> ID | None:
    if explicit_section_id is not None:
        return explicit_section_id
    agentic_context = _resolve_agentic_context(ctx)
    if agentic_context is not None:
        return agentic_context.section_id
    meta = resolve_request_meta(ctx)
    normalized_section_id = _normalize_non_empty_string(meta.get("sectionId"))
    if normalized_section_id is None:
        return None
    return ID(normalized_section_id)


def resolve_project_manager_from_ctx(
    *,
    ctx: Context,
    project_config_id: ID,
):
    share_session_id = resolve_share_session_id_from_ctx(ctx)
    return ctx.fastmcp.state.project_manager_switcher.get(
        project_config_id,
        share_session_id=share_session_id,
    )
