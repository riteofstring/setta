from dataclasses import dataclass
from enum import Enum
from typing import Any


class FileWatchGroupName(str, Enum):
    jsonSource = "jsonSource"
    apiKeys = "apiKeys"
    genPythonCode = "genPythonCode"


@dataclass
class FileWatcherUpdate:
    absPath: str
    relPath: str
    eventType: str
    fileContent: Any
    matchingGlobPatterns: list[str]
    fileWatchGroupName: FileWatchGroupName
    destAbsPath: str | None = None
    destRelPath: str | None = None
