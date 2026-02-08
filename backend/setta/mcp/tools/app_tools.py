from typing import Any

from mcp.server.fastmcp.server import Context
from pydantic import BaseModel

from setta.app.catalog import APP_CATALOG
from setta.app.catalog import list_app_components as list_catalog_components
from setta.app.spec_patch_stream import apply_patch_ops, parse_patch_lines
from setta.mcp.tool_metadata import (
    ToolArgumentPreviewKind,
    ToolArgumentPreviewMetadata,
    attach_tool_argument_preview,
)
from setta.mcp.tool_setup import setta_tool
from setta.project_state.project_manager_types import (
    AppDefinitionResponse,
    GetAppDefinitionRequest,
    SetAppDefinitionRequest,
)
from setta.share.policy import deny_in_deployment_mode
from setta.types.chat_messages import JSONValue


class AppCatalogResponse(BaseModel):
    catalog: JSONValue


class AppComponentList(BaseModel):
    components: list[str]


@setta_tool
def get_app_catalog() -> AppCatalogResponse:
    """Return the JSON render catalog used for app generation."""
    return AppCatalogResponse(catalog=APP_CATALOG)


@setta_tool
def list_app_components() -> AppComponentList:
    """List the allowed component types for app generation."""
    return AppComponentList(components=list_catalog_components())


@setta_tool
async def stream_app_definition(
    *,
    patches: str,
    appSpecPath: str | None = None,
    baseAppSpec: JSONValue | None = None,
    ctx: Context,
) -> AppDefinitionResponse:
    """
    Persist an app spec by applying newline-delimited JSON patch operations.

    This tool is designed for tool-argument streaming: while `patches` is being produced,
    Setta can render a live preview by applying patch lines incrementally.

    For updates, set `baseAppSpec` (or omit it to patch the currently stored app spec).
    """
    await deny_in_deployment_mode(
        deployment_mode=ctx.fastmcp.state.deployment_mode,
        frontend_sender=ctx.fastmcp.state.wmh_frontend_sender,
        message="Streaming app generation is not available in share/app mode.",
    )

    if not patches.strip():
        raise ValueError("patches must be non-empty.")

    ops = parse_patch_lines(patches)

    manager = ctx.fastmcp.state.project_manager_switcher.main
    if manager is None:
        raise KeyError("Missing main project manager.")

    initial_spec: dict[str, Any] | None = None
    if baseAppSpec is None:
        current = await manager.get_app_definition(GetAppDefinitionRequest())
        if isinstance(current.appSpec, dict):
            initial_spec = current.appSpec
    else:
        if not isinstance(baseAppSpec, dict):
            raise ValueError("baseAppSpec must be a JSON object (or omitted).")
        initial_spec = baseAppSpec

    app_spec = apply_patch_ops(ops, initial_spec=initial_spec)
    return await manager.set_app_definition(
        SetAppDefinitionRequest(
            appSpec=app_spec,
            appSpecPath=appSpecPath,
        )
    )


attach_tool_argument_preview(
    stream_app_definition,
    ToolArgumentPreviewMetadata(
        targetIdPathsByType={},
        previewValuePath="patches",
        previewKind=ToolArgumentPreviewKind.appSpecPatch,
    ),
)
