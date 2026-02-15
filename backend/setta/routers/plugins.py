from collections.abc import Callable
from pathlib import Path
from typing import Literal, TypeVar

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from setta.plugins.errors import PluginManagerError
from setta.plugins.manager import PluginManager
from setta.plugins.models import (
    PluginConfigWriteResponse,
    PluginEnableDisableResponse,
    PluginInstallResponse,
    PluginLockApplyResponse,
    PluginLockWriteResponse,
    PluginRollbackResponse,
    PluginRuntimeResponse,
    PluginsRescanResponse,
    PluginUninstallResponse,
    PluginUpdateResponse,
)
from setta.routers.dependencies import AppStateFromRequest, require_ide_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route

router = SettaAPIRouter()
assets_router = APIRouter()

ScopeValue = Literal["workspace", "setta_files", "global"]
InstallerValue = Literal["auto", "pip", "uv"]
T = TypeVar("T")


class PluginInstallRequest(BaseModel):
    sourceSpec: str
    scope: ScopeValue | None = None
    installer: InstallerValue = "auto"
    enable: bool = True
    force: bool = False


class PluginUninstallRequest(BaseModel):
    pluginId: str
    scope: ScopeValue | None = None


class PluginLinkRequest(BaseModel):
    localPluginRoot: str
    scope: ScopeValue | None = None
    enable: bool = True
    force: bool = False


class PluginEnableDisableRequest(BaseModel):
    pluginId: str


class PluginConfigRequest(BaseModel):
    pluginId: str
    config: dict


class PluginUpdateRequest(BaseModel):
    pluginId: str
    scope: ScopeValue | None = None
    to: str | None = None


class PluginRollbackRequest(BaseModel):
    pluginId: str
    scope: ScopeValue | None = None


class PluginLockApplyRequest(BaseModel):
    check: bool = False


class PluginRestartResponse(BaseModel):
    accepted: bool
    mode: Literal["programmatic", "manual"]
    command: str | None = None
    reason: str | None = None


def _manager(state: AppStateFromRequest) -> PluginManager:
    return state.plugin_manager


def _raise_http(exc: PluginManagerError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.to_dict()) from exc


def _run_manager_call(operation: Callable[[], T]) -> T:
    try:
        return operation()
    except PluginManagerError as exc:
        _raise_http(exc)


@router.get(Route.PLUGINS_RUNTIME)
def route_plugins_runtime(state: AppStateFromRequest) -> PluginRuntimeResponse:
    return _run_manager_call(lambda: _manager(state).get_runtime_response())


@router.post(Route.PLUGINS_RESCAN, dependencies=[Depends(require_ide_mode)])
def route_plugins_rescan(state: AppStateFromRequest) -> PluginsRescanResponse:
    return _run_manager_call(lambda: _manager(state).rescan())


@router.post(Route.PLUGINS_RESTART, dependencies=[Depends(require_ide_mode)])
def route_plugins_restart(state: AppStateFromRequest) -> PluginRestartResponse:
    payload = _run_manager_call(lambda: _manager(state).restart_backend())
    return PluginRestartResponse.model_validate(payload)


@router.post(Route.PLUGINS_INSTALL, dependencies=[Depends(require_ide_mode)])
def route_plugins_install(
    x: PluginInstallRequest,
    state: AppStateFromRequest,
) -> PluginInstallResponse:
    return _run_manager_call(
        lambda: _manager(state).install_plugin(
            source_spec=x.sourceSpec,
            scope=x.scope,
            installer=x.installer,
            enable=x.enable,
            force=x.force,
        )
    )


@router.post(Route.PLUGINS_UNINSTALL, dependencies=[Depends(require_ide_mode)])
def route_plugins_uninstall(
    x: PluginUninstallRequest,
    state: AppStateFromRequest,
) -> PluginUninstallResponse:
    return _run_manager_call(
        lambda: _manager(state).uninstall_plugin(plugin_id=x.pluginId, scope=x.scope)
    )


@router.post(Route.PLUGINS_LINK, dependencies=[Depends(require_ide_mode)])
def route_plugins_link(
    x: PluginLinkRequest,
    state: AppStateFromRequest,
) -> PluginInstallResponse:
    return _run_manager_call(
        lambda: _manager(state).link_plugin(
            local_plugin_root=x.localPluginRoot,
            scope=x.scope,
            enable=x.enable,
            force=x.force,
        )
    )


@router.post(Route.PLUGINS_UNLINK, dependencies=[Depends(require_ide_mode)])
def route_plugins_unlink(
    x: PluginUninstallRequest,
    state: AppStateFromRequest,
) -> PluginUninstallResponse:
    return _run_manager_call(
        lambda: _manager(state).unlink_plugin(plugin_id=x.pluginId, scope=x.scope)
    )


@router.post(Route.PLUGINS_ENABLE, dependencies=[Depends(require_ide_mode)])
def route_plugins_enable(
    x: PluginEnableDisableRequest,
    state: AppStateFromRequest,
) -> PluginEnableDisableResponse:
    return _run_manager_call(
        lambda: _manager(state).enable_plugin(plugin_id=x.pluginId)
    )


@router.post(Route.PLUGINS_DISABLE, dependencies=[Depends(require_ide_mode)])
def route_plugins_disable(
    x: PluginEnableDisableRequest,
    state: AppStateFromRequest,
) -> PluginEnableDisableResponse:
    return _run_manager_call(
        lambda: _manager(state).disable_plugin(plugin_id=x.pluginId)
    )


@router.post(Route.PLUGINS_CONFIG, dependencies=[Depends(require_ide_mode)])
def route_plugins_config(
    x: PluginConfigRequest,
    state: AppStateFromRequest,
) -> PluginConfigWriteResponse:
    return _run_manager_call(
        lambda: _manager(state).write_plugin_config(
            plugin_id=x.pluginId, config=x.config
        )
    )


@router.post(Route.PLUGINS_UPDATE, dependencies=[Depends(require_ide_mode)])
def route_plugins_update(
    x: PluginUpdateRequest,
    state: AppStateFromRequest,
) -> PluginUpdateResponse:
    return _run_manager_call(
        lambda: _manager(state).update_plugin(
            plugin_id=x.pluginId,
            scope=x.scope,
            to=x.to,
        )
    )


@router.post(Route.PLUGINS_ROLLBACK, dependencies=[Depends(require_ide_mode)])
def route_plugins_rollback(
    x: PluginRollbackRequest,
    state: AppStateFromRequest,
) -> PluginRollbackResponse:
    return _run_manager_call(
        lambda: _manager(state).rollback_plugin(plugin_id=x.pluginId, scope=x.scope)
    )


@router.post(Route.PLUGINS_LOCK_WRITE, dependencies=[Depends(require_ide_mode)])
def route_plugins_lock_write(state: AppStateFromRequest) -> PluginLockWriteResponse:
    return _run_manager_call(lambda: _manager(state).write_lockfile())


@router.post(Route.PLUGINS_LOCK_APPLY, dependencies=[Depends(require_ide_mode)])
def route_plugins_lock_apply(
    x: PluginLockApplyRequest,
    state: AppStateFromRequest,
) -> PluginLockApplyResponse:
    return _run_manager_call(lambda: _manager(state).apply_lockfile(check=x.check))


@assets_router.get("/plugins/{pluginId}/{assetPath:path}")
def route_plugin_asset(
    pluginId: str,
    assetPath: str,
    state: AppStateFromRequest,
):
    asset_path = _run_manager_call(
        lambda: _manager(state).resolve_plugin_asset_path(
            plugin_id=pluginId,
            asset_path=assetPath,
        )
    )
    return FileResponse(Path(asset_path))
