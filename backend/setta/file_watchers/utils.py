from io import StringIO
from pathlib import Path
from typing import Awaitable, Callable, assert_never

from dotenv import dotenv_values

from setta.project_state.project_manager import ProjectManager
from setta.types.impl_helpers import get_effective_impl
from setta.types.sections import BaseDictSectionImpl
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
    file_watch_group_name: FileWatchGroupName,
) -> FileWatcherUpdateHandler:
    match file_watch_group_name:
        case FileWatchGroupName.jsonSource:
            return get_content_processor_json_source(project_manager)
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


def get_content_processor_json_source(project_manager: ProjectManager):
    async def content_processor_json_source(
        coreUpdate: FileWatcherCoreUpdate, file_to_read: Path
    ):
        await maybe_read_json_source_contents(project_manager, coreUpdate)
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
    coreUpdate: FileWatcherCoreUpdate,
):
    implLayeringsToLoad = []
    p = project_manager.project_state_backend
    for layering in p.sectionImplLayerings.values():
        impl = get_effective_impl(layering, p.sectionImpls)
        print("\n\n\nimpl", impl, flush=True)
        print("coreUpdate.relPath", str(coreUpdate.relPath), flush=True)
        if (
            not isinstance(impl, BaseDictSectionImpl)
            or not impl.isJsonSource
            or layering.name != str(coreUpdate.relPath)
        ):
            continue

        implLayeringsToLoad.append(layering.id)

    print("\n\n\nimplLayeringsToLoad", implLayeringsToLoad, flush=True)
    if len(implLayeringsToLoad) > 0:
        await project_manager.load_json_sources(implLayeringsToLoad)
        return True
    return False


# // TODO: this logic should be on the backend
# async function updateJSONSourceContents(updatedFileInfo) {
#   const { absPath, relPath, destAbsPath, destRelPath, matchingGlobPatterns } =
#     updatedFileInfo;

#   const variantIdsToLoad = [];
#   for (const [id, v] of Object.entries(useProjectState.getState().variants)) {
#     if (!v.isJsonSource) {
#       continue;
#     }

#     if (
#       !(absPath && v.name === absPath) &&
#       !(relPath && v.name === relPath) &&
#       !(destAbsPath && v.name === destAbsPath) &&
#       !(destRelPath && v.name === destRelPath)
#     ) {
#       continue;
#     }
#     variantIdsToLoad.push(id);
#   }

#   const { variants, codeInfo, codeInfoCols } =
#     await loadJsonContents(variantIdsToLoad);

#   useProjectState.setState((state) => {
#     updateProjectState({
#       variants,
#       codeInfo,
#       codeInfoCols,
#       state,
#     });
#   });
# }
