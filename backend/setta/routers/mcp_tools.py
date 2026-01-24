import json
from typing import Any

from fastapi import Depends, HTTPException, status
from mcp.types import CallToolResult, TextContent
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
    arguments = payload.arguments or {}
    if not isinstance(arguments, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="arguments must be an object.",
        )
    tool = ctx.state.mcp_server._tool_manager.get_tool(tool_name)
    if tool is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown tool: {tool_name}",
        )
    try:
        tool.fn_metadata.arg_model.model_validate(arguments)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.errors(),
        ) from exc
    context = ctx.state.mcp_server.get_context()
    result = await tool.run(arguments, context=context, convert_result=True)
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
    if isinstance(result, dict):
        return CallToolResult(
            content=[TextContent(type="text", text=json.dumps(result, indent=2))],
            structuredContent=result,
            isError=False,
        )
    if isinstance(result, list):
        return CallToolResult(content=result, isError=False)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"Unexpected tool result type: {type(result).__name__}",
    )
