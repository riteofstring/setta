from dataclasses import dataclass

from mcp.server.fastmcp.server import Context

from setta.runtime.context import RuntimeContext

_PENDING_MCP_RUN_START_AUTHORIZATIONS_ATTR = "_pending_mcp_run_start_authorizations"


@dataclass(frozen=True)
class MCPRunStartAuthorization:
    share_session_id: str | None
    reserved_single_run: bool


async def authorize_mcp_run_start(ctx: Context) -> MCPRunStartAuthorization:
    share_session_id = ctx.fastmcp._resolve_share_session_id(ctx)
    runtime_context = RuntimeContext(
        ctx.fastmcp.state,
        share_session_id=share_session_id,
    )
    await runtime_context.enforce_run_allowed()
    reserved_single_run = await runtime_context.enforce_multiple_runs_allowed()
    return MCPRunStartAuthorization(
        share_session_id=share_session_id,
        reserved_single_run=reserved_single_run,
    )


async def enforce_mcp_llm_allowed(
    ctx: Context,
    *,
    share_session_id: str | None,
) -> None:
    runtime_context = RuntimeContext(
        ctx.fastmcp.state,
        share_session_id=share_session_id,
    )
    await runtime_context.enforce_llm_allowed()


def commit_mcp_run_start(
    ctx: Context,
    authorization: MCPRunStartAuthorization,
) -> None:
    if (
        ctx.fastmcp.state.deployment_mode
        and authorization.share_session_id is not None
        and not authorization.reserved_single_run
    ):
        ctx.fastmcp.state.share_runtime_state.increment_session_run_count(
            authorization.share_session_id
        )


async def rollback_mcp_run_start(
    ctx: Context,
    authorization: MCPRunStartAuthorization,
) -> None:
    if (
        authorization.reserved_single_run
        and ctx.fastmcp.state.deployment_mode
        and authorization.share_session_id is not None
    ):
        await ctx.fastmcp.state.share_runtime_state.rollback_reserved_session_run_count(
            authorization.share_session_id
        )


def _resolve_pending_run_start_request(ctx: Context) -> tuple[object, object] | None:
    try:
        request_context = ctx.request_context
    except ValueError:
        return None
    session = getattr(request_context, "session", None)
    request_id = getattr(request_context, "request_id", None)
    if session is None or request_id is None:
        return None
    return session, request_id


def _get_pending_run_start_authorizations(
    session: object,
) -> dict[object, MCPRunStartAuthorization]:
    authorizations = getattr(
        session,
        _PENDING_MCP_RUN_START_AUTHORIZATIONS_ATTR,
        None,
    )
    if authorizations is None:
        authorizations = {}
        setattr(
            session,
            _PENDING_MCP_RUN_START_AUTHORIZATIONS_ATTR,
            authorizations,
        )
    return authorizations


def has_pending_mcp_run_start_authorization(ctx: Context) -> bool:
    pending_request = _resolve_pending_run_start_request(ctx)
    if pending_request is None:
        return False
    session, request_id = pending_request
    authorizations = getattr(
        session,
        _PENDING_MCP_RUN_START_AUTHORIZATIONS_ATTR,
        None,
    )
    if authorizations is None:
        return False
    return request_id in authorizations


async def authorize_pending_mcp_run_start(ctx: Context) -> None:
    authorization = await authorize_mcp_run_start(ctx)
    pending_request = _resolve_pending_run_start_request(ctx)
    if pending_request is None:
        raise KeyError(
            "Missing MCP request-scoped context for pending run-start authorization."
        )
    session, request_id = pending_request
    authorizations = _get_pending_run_start_authorizations(session)
    authorizations[request_id] = authorization


def commit_pending_mcp_run_start(ctx: Context) -> None:
    pending_request = _resolve_pending_run_start_request(ctx)
    if pending_request is None:
        return
    session, request_id = pending_request
    authorizations = getattr(
        session,
        _PENDING_MCP_RUN_START_AUTHORIZATIONS_ATTR,
        None,
    )
    if authorizations is None:
        return
    authorization = authorizations.pop(request_id, None)
    if authorization is None:
        return
    if len(authorizations) == 0:
        delattr(session, _PENDING_MCP_RUN_START_AUTHORIZATIONS_ATTR)
    commit_mcp_run_start(ctx, authorization)


async def rollback_pending_mcp_run_start(ctx: Context) -> None:
    pending_request = _resolve_pending_run_start_request(ctx)
    if pending_request is None:
        return
    session, request_id = pending_request
    authorizations = getattr(
        session,
        _PENDING_MCP_RUN_START_AUTHORIZATIONS_ATTR,
        None,
    )
    if authorizations is None:
        return
    authorization = authorizations.pop(request_id, None)
    if authorization is None:
        return
    if len(authorizations) == 0:
        delattr(session, _PENDING_MCP_RUN_START_AUTHORIZATIONS_ATTR)
    await rollback_mcp_run_start(ctx, authorization)
