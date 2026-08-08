from __future__ import annotations

from types import MappingProxyType
from typing import Any, Mapping

from setta.local_core_client import LocalCoreCommandError, run_local_core_command_once
from setta.types.generated.go_shared_constants import (
    LOCAL_CORE_COMMAND_WATCH_CODE_GET_PROJECT_DATA,
    LOCAL_CORE_COMMAND_WATCH_CODE_SET_FILES,
    LOCAL_CORE_COMMAND_WATCH_CODE_SET_FOLDERS,
    LOCAL_CORE_COMMAND_WATCH_CODE_SET_INPUTS,
    WATCH_CODE_BACKEND_LOCAL_SETTING_FILES,
    WATCH_CODE_BACKEND_LOCAL_SETTING_FOLDERS,
    WATCH_CODE_BACKEND_READ_HANDLER_BY_LOCAL_SETTING_ID,
    WATCH_CODE_BACKEND_WRITE_HANDLER_BY_LOCAL_SETTING_ID,
)

WatchCodeCommandError = LocalCoreCommandError

WATCH_CODE_READ_HANDLER_TO_SETTING = MappingProxyType(
    {
        handler_id: setting_id
        for setting_id, handler_id in WATCH_CODE_BACKEND_READ_HANDLER_BY_LOCAL_SETTING_ID.items()
    }
)
WATCH_CODE_WRITE_HANDLER_TO_SETTING = MappingProxyType(
    {
        handler_id: setting_id
        for setting_id, handler_id in WATCH_CODE_BACKEND_WRITE_HANDLER_BY_LOCAL_SETTING_ID.items()
    }
)


def setting_id_for_read_handler(handler_id: str) -> str:
    return _setting_id_for_handler(handler_id, WATCH_CODE_READ_HANDLER_TO_SETTING)


def setting_id_for_write_handler(handler_id: str) -> str:
    return _setting_id_for_handler(handler_id, WATCH_CODE_WRITE_HANDLER_TO_SETTING)


def get_project_data(
    *,
    setta_files_root: str,
    plugin_id: str,
    project_config_id: str,
    runtime_root: str | None = None,
) -> Any:
    return run_local_core_command_once(
        LOCAL_CORE_COMMAND_WATCH_CODE_GET_PROJECT_DATA,
        _base_payload(
            setta_files_root=setta_files_root,
            plugin_id=plugin_id,
            project_config_id=project_config_id,
            runtime_root=runtime_root,
        ),
    )


def set_inputs(
    *,
    setta_files_root: str,
    workspace_root: str,
    plugin_id: str,
    project_config_id: str,
    folders: list[dict[str, Any]],
    files: list[str],
    runtime_root: str | None = None,
    frontend_op_id: str | None = None,
) -> Any:
    return run_local_core_command_once(
        LOCAL_CORE_COMMAND_WATCH_CODE_SET_INPUTS,
        {
            **_base_payload(
                setta_files_root=setta_files_root,
                workspace_root=workspace_root,
                runtime_root=runtime_root,
                plugin_id=plugin_id,
                project_config_id=project_config_id,
                frontend_op_id=frontend_op_id,
            ),
            "folders": folders,
            "files": files,
        },
    )


def set_folders(
    *,
    setta_files_root: str,
    workspace_root: str,
    plugin_id: str,
    project_config_id: str,
    folders: list[dict[str, Any]],
    runtime_root: str | None = None,
    frontend_op_id: str | None = None,
) -> Any:
    return run_local_core_command_once(
        LOCAL_CORE_COMMAND_WATCH_CODE_SET_FOLDERS,
        {
            **_base_payload(
                setta_files_root=setta_files_root,
                workspace_root=workspace_root,
                runtime_root=runtime_root,
                plugin_id=plugin_id,
                project_config_id=project_config_id,
                frontend_op_id=frontend_op_id,
            ),
            "folders": folders,
        },
    )


def set_files(
    *,
    setta_files_root: str,
    workspace_root: str,
    plugin_id: str,
    project_config_id: str,
    files: list[str],
    runtime_root: str | None = None,
    frontend_op_id: str | None = None,
) -> Any:
    return run_local_core_command_once(
        LOCAL_CORE_COMMAND_WATCH_CODE_SET_FILES,
        {
            **_base_payload(
                setta_files_root=setta_files_root,
                workspace_root=workspace_root,
                runtime_root=runtime_root,
                plugin_id=plugin_id,
                project_config_id=project_config_id,
                frontend_op_id=frontend_op_id,
            ),
            "files": files,
        },
    )


def value_for_setting(project_data: Any, setting_id: str) -> Any:
    if not isinstance(project_data, dict):
        return [] if setting_id in _watch_code_input_setting_ids() else None
    if setting_id == WATCH_CODE_BACKEND_LOCAL_SETTING_FOLDERS:
        value = project_data.get("folders")
        return value if isinstance(value, list) else []
    if setting_id == WATCH_CODE_BACKEND_LOCAL_SETTING_FILES:
        value = project_data.get("files")
        return value if isinstance(value, list) else []
    raise KeyError(f"unknown watch code setting {setting_id!r}")


def _base_payload(
    *,
    setta_files_root: str,
    plugin_id: str,
    project_config_id: str,
    workspace_root: str | None = None,
    runtime_root: str | None = None,
    frontend_op_id: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "settaFilesRoot": setta_files_root,
        "pluginId": plugin_id,
        "projectConfigId": project_config_id,
    }
    if workspace_root is not None:
        payload["workspaceRoot"] = workspace_root
    if runtime_root is not None:
        payload["runtimeRoot"] = runtime_root
    if frontend_op_id is not None:
        payload["frontendOpId"] = frontend_op_id
    return payload


def _setting_id_for_handler(
    handler_id: str,
    mapping: Mapping[str, str],
) -> str:
    normalized = handler_id.strip()
    try:
        return mapping[normalized]
    except KeyError as error:
        raise KeyError(f"unknown watch code setting handler {handler_id!r}") from error


def _watch_code_input_setting_ids() -> tuple[str, str]:
    return (
        WATCH_CODE_BACKEND_LOCAL_SETTING_FOLDERS,
        WATCH_CODE_BACKEND_LOCAL_SETTING_FILES,
    )
