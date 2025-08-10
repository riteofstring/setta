from io import StringIO
from pathlib import Path
from typing import Awaitable, Callable, assert_never

from dotenv import dotenv_values

from setta.database.settings_file import SettingsFile
from setta.project_state.project_manager import ProjectManager
from setta.types.helpers import get_variant_base_and_effective_section_impl
from setta.types.project_state import (
    ProjectStateCore,
)
from setta.types.section_impls import BaseDictSectionImpl
from setta.types.specific_file_watcher import (
    FileWatcherCoreUpdate,
    FileWatcherUpdate,
    FileWatcherUpdateAPIKeys,
    FileWatcherUpdateGenPythonCode,
    FileWatcherUpdateJSONSource,
    FileWatchGroupName,
)
from setta.utils.constants import C

FileWatcherUpdateHandler = Callable[
    [FileWatcherCoreUpdate, Path], Awaitable[FileWatcherUpdate]
]


def get_content_processor(
    project_manager: ProjectManager,
    settings_file: SettingsFile,
    file_watch_group_name: FileWatchGroupName,
) -> FileWatcherUpdateHandler:
    match file_watch_group_name:
        case FileWatchGroupName.jsonSource:
            return get_content_processor_json_source(project_manager, settings_file)
        case FileWatchGroupName.genPythonCode:
            return content_processor_gen_python_code
        case FileWatchGroupName.apiKeys:
            return content_processor_api_keys
        case _:
            assert_never(file_watch_group_name)


async def content_processor_gen_python_code(
    coreUpdate: FileWatcherCoreUpdate,
    file_to_read: Path,
):
    with open(file_to_read, "r", encoding="utf-8") as f:
        raw_content = f.read()
    return FileWatcherUpdateGenPythonCode(
        coreUpdate=coreUpdate,
        fileContent=raw_content,
    )


async def content_processor_api_keys(
    coreUpdate: FileWatcherCoreUpdate, file_to_read: Path
):
    with open(file_to_read, "r", encoding="utf-8") as f:
        raw_content = f.read()
    env_vars = dotenv_values(stream=StringIO(raw_content))
    fileContent = get_llm_api_keys_from_env_vars(env_vars)
    return FileWatcherUpdateAPIKeys(coreUpdate=coreUpdate, fileContent=fileContent)


def get_content_processor_json_source(
    project_manager: ProjectManager, settings_file: SettingsFile
):
    async def content_processor_json_source(
        coreUpdate: FileWatcherCoreUpdate, file_to_read: Path
    ):
        await maybe_read_json_source_contents(
            project_manager, settings_file, coreUpdate
        )
        return FileWatcherUpdateJSONSource(coreUpdate=coreUpdate, fileContent=None)

    return content_processor_json_source


def get_llm_api_keys_from_env_vars(env_vars: dict[str, str | None]):
    return {
        key: value
        for key, value in env_vars.items()
        if key in C.LLM_API_KEY_NAMES.values() and value
    }


async def maybe_read_json_source_contents(
    project_manager: ProjectManager,
    settings_file: SettingsFile,
    coreUpdate: FileWatcherCoreUpdate,
):
    p = project_manager.project_state_backend
    variantsToLoad = get_json_source_variants(p, coreUpdate)
    if len(variantsToLoad) > 0:
        await project_manager.load_json_sources(variantsToLoad)

    variantsToLoad = get_json_source_variants(settings_file.project_state, coreUpdate)
    if len(variantsToLoad) > 0:
        await settings_file.load_and_broadcast_settings_project()
        await settings_file.load_and_broadcast_settings()


def get_json_source_variants(p: ProjectStateCore, coreUpdate: FileWatcherCoreUpdate):
    variantsToLoad: list[str] = []
    processed = set()
    for section in p.sections.values():
        for variant_id in section.variants:
            if variant_id in variantsToLoad:
                continue
            processed.add(variant_id)
            variant, _, impl = get_variant_base_and_effective_section_impl(
                p, section, variant_id
            )
            if (
                not isinstance(impl, BaseDictSectionImpl)
                or not impl.isJsonSource
                or variant.name != str(coreUpdate.relPath)
            ):
                continue

            variantsToLoad.append(variant_id)
    return variantsToLoad
