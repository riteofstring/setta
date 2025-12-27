import inspect
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

from mcp.server.fastmcp.server import Context
from pydantic import BaseModel
from pydantic.fields import FieldInfo
from pydantic_core import PydanticUndefined

from setta.mcp.tool_metadata import (
    AIFollowToolArgumentsMetadata,
    AIFollowToolResultMetadata,
    SettaToolType,
    ToolArgumentPreviewMetadata,
    attach_ai_follow_tool_arguments,
    attach_ai_follow_tool_result,
    attach_tool_argument_preview,
    attach_tool_search_category,
    attach_tool_search_tags,
)
from setta.mcp.tool_setup import setta_init_tool, setta_tool
from setta.utils.constants import C

if TYPE_CHECKING:
    from setta.project_state.base_project_manager import BaseProjectManager


def project_state_tool(
    *,
    name: str | None = None,
    tool_type: SettaToolType = SettaToolType.discoverable,
    ai_follow_tool_result: AIFollowToolResultMetadata | None = None,
    ai_follow_tool_arguments: AIFollowToolArgumentsMetadata | None = None,
    tool_argument_preview: ToolArgumentPreviewMetadata | None = None,
    search_tags: list[str] | None = None,
    search_category: str | None = None,
):
    """Decorator used on BaseProjectManager coroutines to expose them as MCP tools."""

    def decorator(
        method: Callable[["BaseProjectManager", BaseModel], Awaitable[Any]],
    ):
        request_model = _extract_request_model(method)
        tool_fn = _build_tool_callable(
            tool_name=name or method.__name__,
            manager_method_name=method.__name__,
            request_model=request_model,
            docstring=inspect.getdoc(method),
        )
        attach_ai_follow_tool_result(tool_fn, ai_follow_tool_result)
        attach_ai_follow_tool_arguments(tool_fn, ai_follow_tool_arguments)
        attach_tool_argument_preview(tool_fn, tool_argument_preview)
        attach_tool_search_tags(tool_fn, search_tags)
        attach_tool_search_category(tool_fn, search_category)
        register = setta_init_tool if tool_type == SettaToolType.init else setta_tool
        register(tool_fn)
        return method

    return decorator


def _build_tool_callable(
    *,
    tool_name: str,
    manager_method_name: str,
    request_model: type[BaseModel],
    docstring: str | None,
):
    async def tool_callable(**raw_kwargs: Any):
        ctx: Context = raw_kwargs.pop("ctx")
        request = request_model(**raw_kwargs)
        manager = ctx.fastmcp.state.project_manager_switcher.get(
            request.projectConfigId
        )
        manager_method = getattr(manager, manager_method_name)
        result = manager_method(request)
        if inspect.isawaitable(result):
            return await result
        return result

    tool_callable.__name__ = tool_name
    if docstring:
        tool_callable.__doc__ = docstring
    tool_callable.__signature__ = _build_signature(request_model)
    tool_callable.__annotations__ = _build_annotations(request_model)
    return tool_callable


def _extract_request_model(
    method: Callable[..., Awaitable[Any]],
) -> type[BaseModel]:
    signature = inspect.signature(method)
    params = list(signature.parameters.values())
    if len(params) < 2:
        msg = (
            f"{method.__qualname__} must accept a request model as its second argument."
        )
        raise ValueError(msg)
    request_param = params[1]
    annotation = request_param.annotation
    if not inspect.isclass(annotation) or not issubclass(annotation, BaseModel):
        msg = f"{method.__qualname__} second parameter must be a pydantic BaseModel."
        raise TypeError(msg)
    return annotation


def _build_signature(request_model: type[BaseModel]) -> inspect.Signature:
    parameters: list[inspect.Parameter] = []
    for field_name, field in request_model.model_fields.items():
        if _field_hidden_from_mcp(field):
            continue
        default = inspect._empty
        if not field.is_required():
            if field.default is not PydanticUndefined:
                default = field.default
            elif field.default_factory is not None:
                default = field.get_default(call_default_factory=True)
        parameters.append(
            inspect.Parameter(
                field_name,
                kind=inspect.Parameter.KEYWORD_ONLY,
                default=default,
                annotation=field.annotation,
            )
        )
    parameters.append(
        inspect.Parameter(
            "ctx",
            kind=inspect.Parameter.KEYWORD_ONLY,
            annotation=Context,
        )
    )
    return inspect.Signature(parameters=parameters)


def _build_annotations(request_model: type[BaseModel]) -> dict[str, Any]:
    annotations: dict[str, Any] = {}
    for field_name, field in request_model.model_fields.items():
        if _field_hidden_from_mcp(field):
            continue
        annotations[field_name] = field.annotation
    annotations["ctx"] = Context
    return annotations


def _field_hidden_from_mcp(field: FieldInfo) -> bool:
    extra = getattr(field, "json_schema_extra", None)
    if isinstance(extra, dict):
        return bool(extra.get(C.MCP_HIDDEN_FIELD_SCHEMA_KEY))
    return False
