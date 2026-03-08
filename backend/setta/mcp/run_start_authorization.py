from dataclasses import dataclass

from mcp.server.fastmcp.server import Context

from setta.runtime.context import RuntimeContext

_PENDING_MCP_RUN_START_AUTHORIZATION_ATTR = "_pending_mcp_run_start_authorization"


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


def _resolve_pending_run_start_session(ctx: Context) -> object | None:
    try:
        request_context = ctx.request_context
    except ValueError:
        return None
    return getattr(request_context, "session", None)


async def authorize_pending_mcp_run_start(ctx: Context) -> None:
    authorization = await authorize_mcp_run_start(ctx)
    session = _resolve_pending_run_start_session(ctx)
    if session is None:
        raise KeyError(
            "Missing MCP request session for pending run-start authorization."
        )
    setattr(session, _PENDING_MCP_RUN_START_AUTHORIZATION_ATTR, authorization)


def commit_pending_mcp_run_start(ctx: Context) -> None:
    session = _resolve_pending_run_start_session(ctx)
    if session is None:
        return
    authorization = getattr(session, _PENDING_MCP_RUN_START_AUTHORIZATION_ATTR, None)
    if authorization is None:
        return
    delattr(session, _PENDING_MCP_RUN_START_AUTHORIZATION_ATTR)
    commit_mcp_run_start(ctx, authorization)


async def rollback_pending_mcp_run_start(ctx: Context) -> None:
    session = _resolve_pending_run_start_session(ctx)
    if session is None:
        return
    authorization = getattr(session, _PENDING_MCP_RUN_START_AUTHORIZATION_ATTR, None)
    if authorization is None:
        return
    delattr(session, _PENDING_MCP_RUN_START_AUTHORIZATION_ATTR)
    await rollback_mcp_run_start(ctx, authorization)
