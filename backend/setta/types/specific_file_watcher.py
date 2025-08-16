from enum import Enum
from pathlib import Path

from pydantic import BaseModel


class FileEventType(str, Enum):
    created = "created"
    modified = "modified"
    deleted = "deleted"
    moved = "moved"
    readRequested = "readRequested"


class FileWatcherCoreUpdate(BaseModel):
    absPath: Path
    relPath: Path
    eventType: FileEventType
    matchingGlobPatterns: list[str]
    destAbsPath: Path | None = None
    destRelPath: Path | None = None
    fileToRead: Path
