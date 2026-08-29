from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class SettaError(Exception):
    code: str
    message: str
    exit_code: int = 2
    details: Mapping[str, object] | None = None

    def document(self) -> dict[str, object]:
        error: dict[str, object] = {"code": self.code, "message": self.message}
        if self.details:
            error["details"] = dict(self.details)
        return {"error": error}


class InvalidInputError(SettaError):
    def __init__(self, message: str, details: Mapping[str, object] | None = None):
        super().__init__("invalid_input", message, 2, details)


class UnknownCommandError(SettaError):
    def __init__(self, message: str, details: Mapping[str, object] | None = None):
        super().__init__("invalid_command", message, 2, details)


class RuntimeAssetError(SettaError):
    def __init__(self, message: str, details: Mapping[str, object] | None = None):
        super().__init__("runtime_invalid", message, 1, details)


class RuntimeExecutionError(SettaError):
    def __init__(self, message: str, details: Mapping[str, object] | None = None):
        super().__init__("runtime_failed", message, 1, details)


class SessionNotFoundError(SettaError):
    def __init__(self, message: str, details: Mapping[str, object] | None = None):
        super().__init__("session_not_found", message, 2, details)


class SessionStaleError(SettaError):
    def __init__(self, message: str, details: Mapping[str, object] | None = None):
        super().__init__("session_stale", message, 2, details)


class SessionAlreadyRunningError(SettaError):
    def __init__(self, message: str, details: Mapping[str, object] | None = None):
        super().__init__("session_already_running", message, 2, details)
