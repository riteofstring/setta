from enum import Enum


class PythonValueMode(str, Enum):
    """Selects how dependency values should be rendered for Python code."""

    LIVE_RUNTIME = "live_runtime"
    PACKAGED_RUNTIME = "packaged_runtime"
