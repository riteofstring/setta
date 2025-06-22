from enum import Enum
from pathlib import Path
from typing import Annotated, Any, Callable, Literal, Union

from pydantic import BaseModel, Field


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


class FileWatcherCoreUpdate(BaseModel):
    absPath: Path
    relPath: Path
    eventType: FileEventType
    matchingGlobPatterns: list[str]
    destAbsPath: Path | None = None
    destRelPath: Path | None = None


class FileWatcherUpdate(BaseModel):
    fileWatchGroupName: Any
    coreUpdate: FileWatcherCoreUpdate
    fileContent: Any


FileWatcherUpdateHandler = Callable[[FileWatcherCoreUpdate, Path], FileWatcherUpdate]


class FileWatcherUpdateJSONSource(FileWatcherUpdate):
    fileWatchGroupName: Literal[FileWatchGroupName.jsonSource] = (
        FileWatchGroupName.jsonSource
    )
    fileContent: None = None


class FileWatcherUpdateAPIKeys(FileWatcherUpdate):
    fileContent: dict[str, str | None]
    fileWatchGroupName: Literal[FileWatchGroupName.apiKeys] = FileWatchGroupName.apiKeys


class FileWatcherUpdateGenPythonCode(FileWatcherUpdate):
    fileContent: str
    fileWatchGroupName: Literal[FileWatchGroupName.genPythonCode] = (
        FileWatchGroupName.genPythonCode
    )


FileWatcherUpdateUnion = Union[
    FileWatcherUpdateJSONSource,
    FileWatcherUpdateAPIKeys,
    FileWatcherUpdateGenPythonCode,
]

FileWatcherUpdateUnionWithDiscriminator = Annotated[
    FileWatcherUpdateUnion, Field(discriminator="fileWatchGroupName")
]
