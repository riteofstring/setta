from io import StringIO
from pathlib import Path
from typing import Callable, assert_never

from dotenv import dotenv_values

from setta.types.specific_file_watcher import (
    FileWatcherCoreUpdate,
    FileWatcherUpdate,
    FileWatcherUpdateAPIKeys,
    FileWatcherUpdateGenPythonCode,
    FileWatcherUpdateJSONSource,
    FileWatchGroupName,
)
from setta.utils.constants import C

FileWatcherUpdateHandler = Callable[[FileWatcherCoreUpdate, Path], FileWatcherUpdate]


def get_content_processor(
    file_watch_group_name: FileWatchGroupName,
) -> FileWatcherUpdateHandler:
    match file_watch_group_name:
        case FileWatchGroupName.jsonSource:
            return content_processor_json_source
        case FileWatchGroupName.genPythonCode:
            return content_processor_gen_python_code
        case FileWatchGroupName.apiKeys:
            return content_processor_api_keys
        case _:
            assert_never(file_watch_group_name)


def content_processor_gen_python_code(
    coreUpdate: FileWatcherCoreUpdate,
    file_to_read: Path,
):
    with open(file_to_read, "r", encoding="utf-8") as f:
        raw_content = f.read()
    return FileWatcherUpdateGenPythonCode(
        coreUpdate=coreUpdate,
        fileContent=raw_content,
    )


def content_processor_api_keys(coreUpdate: FileWatcherCoreUpdate, file_to_read: Path):
    with open(file_to_read, "r", encoding="utf-8") as f:
        raw_content = f.read()
    env_vars = dotenv_values(stream=StringIO(raw_content))
    fileContent = get_llm_api_keys_from_env_vars(env_vars)
    return FileWatcherUpdateAPIKeys(coreUpdate=coreUpdate, fileContent=fileContent)


def content_processor_json_source(
    coreUpdate: FileWatcherCoreUpdate, file_to_read: Path
):
    return FileWatcherUpdateJSONSource(coreUpdate=coreUpdate, fileContent=None)


def get_llm_api_keys_from_env_vars(env_vars: dict[str, str | None]):
    return {
        key: value
        for key, value in env_vars.items()
        if key in C.LLM_API_KEY_NAMES.values() and value
    }
