from __future__ import annotations

from types import MappingProxyType
from typing import Any, Mapping

from setta.local_core_client import run_local_core_command_once
from setta.types.generated.go_shared_constants import (
    LOCAL_CORE_COMMAND_WATCH_CODE_GET_PROJECT_DATA,
    LOCAL_CORE_COMMAND_WATCH_CODE_READ_SETTING,
    LOCAL_CORE_COMMAND_WATCH_CODE_SET_ENABLED,
    LOCAL_CORE_COMMAND_WATCH_CODE_SET_INPUTS,
    LOCAL_CORE_COMMAND_WATCH_CODE_WRITE_SETTING,
)

WATCH_CODE_SETTING_ENABLED = "enabled"
WATCH_CODE_SETTING_FOLDERS = "folders"
WATCH_CODE_SETTING_FILES = "files"

WATCH_CODE_READ_HANDLER_TO_SETTING = MappingProxyType(
    {
        "read_enabled": WATCH_CODE_SETTING_ENABLED,
        "read_folders": WATCH_CODE_SETTING_FOLDERS,
        "read_files": WATCH_CODE_SETTING_FILES,
    }
)
WATCH_CODE_WRITE_HANDLER_TO_SETTING = MappingProxyType(
    {
        "write_enabled": WATCH_CODE_SETTING_ENABLED,
        "write_folders": WATCH_CODE_SETTING_FOLDERS,
        "write_files": WATCH_CODE_SETTING_FILES,
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
) -> Any:
    return run_local_core_command_once(
        LOCAL_CORE_COMMAND_WATCH_CODE_GET_PROJECT_DATA,
        _base_payload(
            setta_files_root=setta_files_root,
            plugin_id=plugin_id,
            project_config_id=project_config_id,
        ),
    )


def set_enabled(
    *,
    setta_files_root: str,
    workspace_root: str,
    plugin_id: str,
    project_config_id: str,
    enabled: bool,
    frontend_op_id: str | None = None,
) -> Any:
    return run_local_core_command_once(
        LOCAL_CORE_COMMAND_WATCH_CODE_SET_ENABLED,
        {
            **_base_payload(
                setta_files_root=setta_files_root,
                workspace_root=workspace_root,
                plugin_id=plugin_id,
                project_config_id=project_config_id,
                frontend_op_id=frontend_op_id,
            ),
            "enabled": enabled,
        },
    )


def set_inputs(
    *,
    setta_files_root: str,
    workspace_root: str,
    plugin_id: str,
    project_config_id: str,
    watch_code_folders: list[dict[str, Any]],
    watch_code_files: list[str],
    frontend_op_id: str | None = None,
) -> Any:
    return run_local_core_command_once(
        LOCAL_CORE_COMMAND_WATCH_CODE_SET_INPUTS,
        {
            **_base_payload(
                setta_files_root=setta_files_root,
                workspace_root=workspace_root,
                plugin_id=plugin_id,
                project_config_id=project_config_id,
                frontend_op_id=frontend_op_id,
            ),
            "watchCodeFolders": watch_code_folders,
            "watchCodeFiles": watch_code_files,
        },
    )


def read_setting(
    *,
    setta_files_root: str,
    plugin_id: str,
    project_config_id: str,
    setting_id: str,
) -> Any:
    return run_local_core_command_once(
        LOCAL_CORE_COMMAND_WATCH_CODE_READ_SETTING,
        {
            **_base_payload(
                setta_files_root=setta_files_root,
                plugin_id=plugin_id,
                project_config_id=project_config_id,
            ),
            "settingId": setting_id,
        },
    )


def write_setting(
    *,
    setta_files_root: str,
    workspace_root: str,
    plugin_id: str,
    project_config_id: str,
    setting_id: str,
    value: Any,
    frontend_op_id: str | None = None,
) -> Any:
    return run_local_core_command_once(
        LOCAL_CORE_COMMAND_WATCH_CODE_WRITE_SETTING,
        {
            **_base_payload(
                setta_files_root=setta_files_root,
                workspace_root=workspace_root,
                plugin_id=plugin_id,
                project_config_id=project_config_id,
                frontend_op_id=frontend_op_id,
            ),
            "settingId": setting_id,
            "value": value,
        },
    )


def _base_payload(
    *,
    setta_files_root: str,
    plugin_id: str,
    project_config_id: str,
    workspace_root: str | None = None,
    frontend_op_id: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "settaFilesRoot": setta_files_root,
        "pluginId": plugin_id,
        "projectConfigId": project_config_id,
    }
    if workspace_root is not None:
        payload["workspaceRoot"] = workspace_root
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
