from enum import StrEnum


class PythonValueMode(StrEnum):
    """Selects how dependency values should be rendered for Python code."""

    LIVE_RUNTIME = "live_runtime"
    PACKAGED_RUNTIME = "packaged_runtime"
