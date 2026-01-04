from mcp.server.fastmcp.server import Context


def resolve_share_session_id(ctx: Context) -> str | None:
    request_context = ctx.request_context
    meta = request_context.meta if request_context else None
    if meta is None:
        return None
    share_session_id = getattr(meta, "shareSessionId", None)
    if share_session_id is None:
        extra = getattr(meta, "model_extra", None)
        if isinstance(extra, dict):
            share_session_id = extra.get("shareSessionId")
    if share_session_id is None:
        return None
    if not isinstance(share_session_id, str) or not share_session_id:
        raise ValueError("shareSessionId must be a non-empty string")
    return share_session_id


def require_share_session_id(ctx: Context) -> str:
    share_session_id = resolve_share_session_id(ctx)
    if share_session_id is None:
        raise KeyError("Missing share session id for MCP tool call")
    return share_session_id
