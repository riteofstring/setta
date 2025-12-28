from enum import Enum

from pydantic import BaseModel


class PythonEnvironmentSource(str, Enum):
    current = "current"
    venv = "venv"
    pyenv = "pyenv"
    conda = "conda"
    path = "path"


class PythonEnvironmentInfo(BaseModel, extra="forbid"):
    path: str
    label: str
    source: PythonEnvironmentSource
