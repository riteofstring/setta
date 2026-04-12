from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request, status
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.fastmcp.server import Context
from mcp.shared.context import RequestContext
from mcp.shared.exceptions import UrlElicitationRequiredError
from mcp.types import CallToolResult
from pydantic import BaseModel, ValidationError, field_validator

from setta.agentic.agentic_scope import (
    normalize_linked_chat_invocation_chain_section_ids,
    normalize_linked_chat_invocation_depth,
)
from setta.mcp.errors import InvalidToolArgumentsError
from setta.mcp.namespacing import MCP_TOOL_NAME_SEPARATOR
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.frontend_affinity_token import (
    validate_frontend_affinity_token_for_model,
)
from setta.routers.setta_api_router import SettaNonLauncherAPIRouter
from setta.types.id import ID
from setta.types.routes import Route

router = SettaNonLauncherAPIRouter()


class _MCPToolsCallSession:
    """Synthetic MCP session for /__setta__/tools/call.

    Must be weakrefable because SettaFastMCP stores agentic context by session.
    """


class MCPToolCallRequest(BaseModel):
    tool: str
    arguments: Any | None = None
    agenticContext: "MCPToolCallAgenticContext | None" = None


class MCPToolCallAgenticContext(BaseModel):
    projectConfigId: ID
    chatId: ID | None = None
    sectionId: ID | None = None
    runId: str | None = None
    frontendAffinityToken: str | None = None
    allowUnscoped: bool = False
    linkedChatInvocationDepth: int = 0
    linkedChatInvocationChainSectionIds: tuple[ID, ...] = ()

    @field_validator("frontendAffinityToken")
    @classmethod
    def _normalize_frontend_affinity_token(cls, value: str | None) -> str | None:
        return validate_frontend_affinity_token_for_model(value)

    @field_validator("linkedChatInvocationDepth", mode="before")
    @classmethod
    def _normalize_linked_chat_invocation_depth(cls, value: Any) -> int:
        return normalize_linked_chat_invocation_depth(value)

    @field_validator("linkedChatInvocationChainSectionIds", mode="before")
    @classmethod
    def _normalize_linked_chat_invocation_chain(
        cls,
        value: Any,
    ) -> tuple[ID, ...]:
        return normalize_linked_chat_invocation_chain_section_ids(value)


class _MCPToolRequestContextMeta(BaseModel):
    projectConfigId: ID | None = None
    chatId: ID | None = None
    sectionId: ID | None = None
    runId: str | None = None
    frontendAffinityToken: str | None = None
    allowUnscoped: bool = False
    linkedChatInvocationDepth: int = 0
    linkedChatInvocationChainSectionIds: tuple[ID, ...] = ()
    shareSessionId: str | None = None

    @field_validator("frontendAffinityToken")
    @classmethod
    def _normalize_frontend_affinity_token(cls, value: str | None) -> str | None:
        return validate_frontend_affinity_token_for_model(value)

    @field_validator("linkedChatInvocationDepth", mode="before")
    @classmethod
    def _normalize_linked_chat_invocation_depth(cls, value: Any) -> int:
        return normalize_linked_chat_invocation_depth(value)

    @field_validator("linkedChatInvocationChainSectionIds", mode="before")
    @classmethod
    def _normalize_linked_chat_invocation_chain(
        cls,
        value: Any,
    ) -> tuple[ID, ...]:
        return normalize_linked_chat_invocation_chain_section_ids(value)


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
        meta = _build_mcp_request_context_meta(
            payload.agenticContext,
            share_session_id=ctx.share_session_id,
        )
        request_context = RequestContext(
            request_id=str(uuid4()),
            meta=meta,
            session=_MCPToolsCallSession(),
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
    except InvalidToolArgumentsError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "InvalidToolArguments",
                "message": str(exc),
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "ToolError", "message": str(exc)},
        ) from exc
    except ToolError as exc:
        cause = exc.__cause__
        if isinstance(cause, HTTPException):
            raise cause from exc
        if isinstance(cause, ValidationError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=cause.errors(),
            ) from exc
        if isinstance(cause, InvalidToolArgumentsError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "InvalidToolArguments",
                    "message": str(cause),
                },
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


def _build_mcp_request_context_meta(
    agentic_context: MCPToolCallAgenticContext | None,
    *,
    share_session_id: str | None,
) -> _MCPToolRequestContextMeta | None:
    if agentic_context is None and share_session_id is None:
        return None
    payload: dict[str, Any] = {}
    if agentic_context is not None:
        payload.update(agentic_context.model_dump(exclude_none=True))
    if share_session_id is not None:
        payload["shareSessionId"] = share_session_id
    return _MCPToolRequestContextMeta.model_validate(payload)
