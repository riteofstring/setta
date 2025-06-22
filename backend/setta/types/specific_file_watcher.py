from enum import Enum


class FileWatchGroupName(str, Enum):
    jsonSource = "jsonSource"
    apiKeys = "apiKeys"
    genPythonCode = "genPythonCode"
