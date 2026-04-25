from setta.types.generated.go_shared_constants import (
    APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION as _GENERATED_APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION,
)
from setta.types.generated.go_shared_constants import (
    APP_SUBSYSTEM_BACKEND_LISTENER_ENDPOINT_NAMES,
    APP_SUBSYSTEM_BACKEND_LISTENER_ENDPOINT_TO_LOCAL_CORE_COMMAND,
)

APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION = (
    _GENERATED_APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION
)


def listener_endpoint_names() -> tuple[str, ...]:
    return tuple(APP_SUBSYSTEM_BACKEND_LISTENER_ENDPOINT_NAMES)


def local_core_command_for_listener_endpoint(endpoint_name: str) -> str:
    try:
        return APP_SUBSYSTEM_BACKEND_LISTENER_ENDPOINT_TO_LOCAL_CORE_COMMAND[
            endpoint_name
        ]
    except KeyError as error:
        raise KeyError(f"unknown listener endpoint {endpoint_name!r}") from error
