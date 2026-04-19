from types import MappingProxyType

from setta.types.generated.go_shared_constants import (
    LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_CATALOG_ID,
    LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_PATH,
    LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_VERSION,
    LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_THEME_MODE,
    LOCAL_CORE_COMMAND_GET_APP_DEFINITION,
    LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_DEFINITION,
    LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_SPEC_PATH,
    LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_THEME_MODE,
    LOCAL_CORE_COMMAND_SET_APP_DEFINITION,
    LOCAL_CORE_COMMAND_STREAM_APP_DEFINITION,
    LOCAL_CORE_COMMAND_UPDATE_APP_DEFINITION,
    LOCAL_CORE_COMMAND_VALIDATE_APP_DEFINITION,
)

APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION = 1

_LISTENER_ENDPOINT_TO_LOCAL_CORE_COMMAND = MappingProxyType(
    {
        "appsubsystem_get_app_definition": LOCAL_CORE_COMMAND_GET_APP_DEFINITION,
        "appsubsystem_get_effective_app_definition": LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_DEFINITION,
        "appsubsystem_get_effective_app_spec_path": LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_SPEC_PATH,
        "appsubsystem_get_effective_app_theme_mode": LOCAL_CORE_COMMAND_GET_EFFECTIVE_APP_THEME_MODE,
        "appsubsystem_validate_app_definition": LOCAL_CORE_COMMAND_VALIDATE_APP_DEFINITION,
        "appsubsystem_set_app_definition": LOCAL_CORE_COMMAND_SET_APP_DEFINITION,
        "appsubsystem_stream_app_definition": LOCAL_CORE_COMMAND_STREAM_APP_DEFINITION,
        "appsubsystem_update_app_definition": LOCAL_CORE_COMMAND_UPDATE_APP_DEFINITION,
        "appsubsystem_compare_and_set_catalog_id": LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_CATALOG_ID,
        "appsubsystem_compare_and_set_spec_version": LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_VERSION,
        "appsubsystem_compare_and_set_spec_path": LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_SPEC_PATH,
        "appsubsystem_compare_and_set_theme_mode": LOCAL_CORE_COMMAND_COMPARE_AND_SET_APP_DEFINITION_THEME_MODE,
    }
)


def listener_endpoint_names() -> tuple[str, ...]:
    return tuple(_LISTENER_ENDPOINT_TO_LOCAL_CORE_COMMAND)


def local_core_command_for_listener_endpoint(endpoint_name: str) -> str:
    try:
        return _LISTENER_ENDPOINT_TO_LOCAL_CORE_COMMAND[endpoint_name]
    except KeyError as error:
        raise KeyError(f"unknown listener endpoint {endpoint_name!r}") from error
