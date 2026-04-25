from typing import Any

from setta.local_core_client import LocalCoreCommandError, run_local_core_command_once

__all__ = ["LocalCoreCommandError", "run_local_core_command"]


def run_local_core_command(
    command_name: str,
    payload: dict[str, Any] | None = None,
) -> Any:
    return run_local_core_command_once(command_name, payload)
