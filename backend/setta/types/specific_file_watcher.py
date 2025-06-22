from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any


class FileWatchGroupName(str, Enum):
    jsonSource = "jsonSource"
    apiKeys = "apiKeys"
    genPythonCode = "genPythonCode"


class FileEventType(str, Enum):
    created = "created"
    modified = "modified"
    deleted = "deleted"
    moved = "moved"
    readRequested = "readRequested"


@dataclass
class FileWatcherUpdate:
    """File watcher update event with Path support."""

    absPath: Path
    relPath: Path
    eventType: FileEventType
    matchingGlobPatterns: list[str]
    fileWatchGroupName: FileWatchGroupName
    fileContent: Any = None
    destAbsPath: Path | None = None
    destRelPath: Path | None = None
