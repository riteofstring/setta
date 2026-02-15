from typing import Literal

from mcp.server.fastmcp.server import Context

from setta.mcp.tool_metadata import ToolAccessMetadata, attach_tool_access
from setta.mcp.tool_setup import setta_tool
from setta.plugins.models import (
    PluginInstallResponse,
    PluginRollbackResponse,
    PluginsRescanResponse,
    PluginUninstallResponse,
    PluginUpdateResponse,
)

PluginScopeValue = Literal["workspace", "setta_files", "global"]


def _require_ide_mode(ctx: Context) -> None:
    if ctx.fastmcp.state.deployment_mode:
        raise PermissionError("Deployment mode does not allow plugin mutations.")


@setta_tool
def install_plugin(
    *,
    sourceSpec: str,
    scope: PluginScopeValue | None = None,
    enable: bool = True,
    force: bool = False,
    ctx: Context,
) -> PluginInstallResponse:
    """
    Install a plugin from a source spec.

    Args:
        sourceSpec: Plugin source spec (for example github:owner/repo#ref or pypi:pkg==x.y.z).
        scope: Installation scope (workspace, setta_files, global).
        enable: Whether to enable after install.
        force: Whether to overwrite existing install target.
    """
    _require_ide_mode(ctx)
    return ctx.fastmcp.state.plugin_manager.install_plugin(
        source_spec=sourceSpec,
        scope=scope,
        enable=enable,
        force=force,
    )


attach_tool_access(
    install_plugin,
    ToolAccessMetadata(accessType="structural"),
)


@setta_tool
def uninstall_plugin(
    *,
    pluginId: str,
    scope: PluginScopeValue | None = None,
    ctx: Context,
) -> PluginUninstallResponse:
    """
    Uninstall a plugin by id.

    Args:
        pluginId: Plugin id.
        scope: Optional scope; required when same plugin id exists in multiple scopes.
    """
    _require_ide_mode(ctx)
    return ctx.fastmcp.state.plugin_manager.uninstall_plugin(
        plugin_id=pluginId,
        scope=scope,
    )


attach_tool_access(
    uninstall_plugin,
    ToolAccessMetadata(accessType="structural"),
)


@setta_tool
def rescan_plugins(*, ctx: Context) -> PluginsRescanResponse:
    """
    Rescan plugin directories and refresh discovery state.
    """
    _require_ide_mode(ctx)
    return ctx.fastmcp.state.plugin_manager.rescan()


attach_tool_access(
    rescan_plugins,
    ToolAccessMetadata(accessType="structural"),
)


@setta_tool
def update_plugin(
    *,
    pluginId: str,
    scope: PluginScopeValue | None = None,
    to: str | None = None,
    ctx: Context,
) -> PluginUpdateResponse:
    """
    Update an installed plugin to the latest source target or explicit version/ref.

    Args:
        pluginId: Plugin id.
        scope: Optional scope override.
        to: Optional explicit version/ref/source target.
    """
    _require_ide_mode(ctx)
    return ctx.fastmcp.state.plugin_manager.update_plugin(
        plugin_id=pluginId,
        scope=scope,
        to=to,
    )


attach_tool_access(
    update_plugin,
    ToolAccessMetadata(accessType="structural"),
)


@setta_tool
def rollback_plugin(
    *,
    pluginId: str,
    scope: PluginScopeValue | None = None,
    ctx: Context,
) -> PluginRollbackResponse:
    """
    Roll back an installed plugin to the previous known snapshot.

    Args:
        pluginId: Plugin id.
        scope: Optional scope override.
    """
    _require_ide_mode(ctx)
    return ctx.fastmcp.state.plugin_manager.rollback_plugin(
        plugin_id=pluginId,
        scope=scope,
    )


attach_tool_access(
    rollback_plugin,
    ToolAccessMetadata(accessType="structural"),
)
