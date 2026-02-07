from typing import Any
from uuid import uuid4

from fastapi import Depends, HTTPException, Request, status
from mcp.server.fastmcp.server import Context
from mcp.shared.context import RequestContext
from mcp.server.fastmcp.exceptions import ToolError
from mcp.shared.exceptions import UrlElicitationRequiredError
from mcp.types import CallToolResult
from pydantic import BaseModel, ValidationError

from setta.mcp.namespacing import MCP_TOOL_NAME_SEPARATOR
from setta.routers.dependencies import RuntimeContextFromRequest, require_ide_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route

router = SettaAPIRouter(dependencies=[Depends(require_ide_mode)])


class MCPToolCallRequest(BaseModel):
    tool: str
    arguments: Any | None = None


@router.post(Route.TOOLS_CALL)
async def route_call_mcp_tool(
    payload: MCPToolCallRequest,
    ctx: RuntimeContextFromRequest,
    request: Request,
) -> dict[str, Any]:
    tool_name = payload.tool.strip()
    if not tool_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="tool must be a non-empty string.",
        )
    if MCP_TOOL_NAME_SEPARATOR in tool_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="tool must be a bare MCP tool name.",
        )
    arguments = payload.arguments if payload.arguments is not None else {}
    if not isinstance(arguments, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="arguments must be an object.",
        )
    tool = ctx.state.mcp_server.get_tool(tool_name)
    if tool is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown tool: {tool_name}",
        )
    try:
        # `SettaFastMCP` scope enforcement relies on MCP request context. The
        # `/__setta__/tools/call` route isn't an MCP transport, so we synthesize a
        # request context from the HTTP request to avoid unscoped tool execution.
        request_context = RequestContext(
            request_id=str(uuid4()),
            meta=None,
            session=object(),
            lifespan_context=object(),
            request=request,
        )
        context = Context(
            fastmcp=ctx.state.mcp_server,
            request_context=request_context,
        )
        result = await tool.run(arguments, context=context, convert_result=True)
    except UrlElicitationRequiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=exc.error.model_dump(by_alias=True, exclude_none=True),
        ) from exc
    except ToolError as exc:
        cause = exc.__cause__
        if isinstance(cause, ValidationError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=cause.errors(),
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "ToolError", "message": str(exc)},
        ) from exc
    call_result = _normalize_call_result(result)
    return call_result.model_dump(by_alias=True)


def _normalize_call_result(result: Any) -> CallToolResult:
    if isinstance(result, CallToolResult):
        return result
    if isinstance(result, tuple) and len(result) == 2:
        content, structured = result
        return CallToolResult(
            content=list(content),
            structuredContent=structured,
            isError=False,
        )
    if isinstance(result, list):
        return CallToolResult(content=result, isError=False)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"Unexpected tool result type: {type(result).__name__}",
    )
