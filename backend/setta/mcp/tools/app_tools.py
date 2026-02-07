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
    SetAppDefinitionRequest,
)
from setta.share.policy import deny_in_share_mode
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
    ctx: Context,
) -> AppDefinitionResponse:
    """
    Persist an app spec by applying newline-delimited JSON patch operations.

    This tool is designed for tool-argument streaming: while `patches` is being produced,
    Setta can render a live preview by applying patch lines incrementally.
    """
    await deny_in_share_mode(
        share_mode=ctx.fastmcp.state.share_mode,
        frontend_sender=ctx.fastmcp.state.wmh_frontend_sender,
        message="Streaming app generation is not available in share/app mode.",
    )

    if not patches.strip():
        raise ValueError("patches must be non-empty.")

    ops = parse_patch_lines(patches)
    app_spec = apply_patch_ops(ops)

    manager = ctx.fastmcp.state.project_manager_switcher.main
    if manager is None:
        raise KeyError("Missing main project manager.")
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
