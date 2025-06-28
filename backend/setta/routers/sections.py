import os
from pathlib import Path

from fastapi import HTTPException, status
from pydantic import BaseModel

from setta.code_gen.yaml.section_dict import (
    section_dict_to_yaml,
)
from setta.database.db.jsonSource.load import (
    LoadJSONSourceObject,
    load_json_sources_into_data_structures,
)
from setta.database.db.jsonSource.save import save_json_source_data
from setta.database.db.sections.copy import (
    copy_relative_positions,
    copy_sections_and_other_info,
)
from setta.file_watchers.utils import get_content_processor
from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.types.specific_file_watcher import FileWatchGroupName
from setta.utils.generate_new_filename import generate_new_filename

router = SettaAPIRouter()


class SectionsMakeCopyRequest(BaseModel):
    sectionsAndOtherInfo: dict


class SectionToYamlRequest(BaseModel):
    codeInfo: dict
    codeInfoChildren: dict
    sectionVariant: dict
    pinnedIds: dict[str, list[str]]
    unpinnedIds: dict[str, list[str]]


class LoadSectionJSONSourceRequest(BaseModel):
    project: LoadJSONSourceObject
    variantIdsToLoad: list[str]


class SaveSectionJSONSourceRequest(BaseModel):
    project: dict
    variantId: str


class NewJSONVersionNameRequest(BaseModel):
    filename: str


class CreateFileRequest(BaseModel):
    filepath: str


class GetJSONSourcePathToBeDeleted(BaseModel):
    variantName: str


class DeleteFileRequest(BaseModel):
    filepath: str


class FileWatchListRequest(BaseModel):
    filepaths: list[str]
    fileWatchGroupName: FileWatchGroupName


class FileWatchGenPythonCodeRequest(BaseModel):
    projectConfigId: str
    watch: bool


@router.post(Route.COPY_SECTIONS)
def route_sections_make_copy(x: SectionsMakeCopyRequest):
    output = copy_sections_and_other_info(x.sectionsAndOtherInfo)
    relativePositions = copy_relative_positions(
        x.sectionsAndOtherInfo["relativePositions"], output["section_id_map"]
    )
    output.pop("section_id_map")
    return {**output, "relativePositions": relativePositions}


@router.post(Route.SECTION_TO_YAML)
def route_section_to_yaml(x: SectionToYamlRequest):
    output = export_section_to_dict(
        x.codeInfo,
        x.codeInfoChildren,
        x.sectionVariant,
        {"pinned": x.pinnedIds, "unpinned": x.unpinnedIds},
    )

    yamlValue = section_dict_to_yaml(output, x.codeInfo, x.sectionVariant)

    return {
        "yamlValue": yamlValue,
        "originalObj": {
            "pinned": output["pinned"].output,
            "unpinned": output["unpinned"].output,
        },
    }


@router.post(Route.LOAD_SECTION_JSON_SOURCE)
def route_load_section_json_source(x: LoadSectionJSONSourceRequest):
    load_json_sources_into_data_structures(
        x.project,
        variant_ids=x.variantIdsToLoad,
    )
    return {"project": x.project}


@router.post(Route.NEW_JSON_VERSION_NAME)
def route_new_json_version_name(x: NewJSONVersionNameRequest):
    new_filename = generate_new_filename(x.filename)
    Path(new_filename).parent.mkdir(parents=True, exist_ok=True)
    Path(new_filename).touch()
    return new_filename


@router.post(Route.CREATE_FILE)
def route_create_file(x: CreateFileRequest):
    Path(x.filepath).parent.mkdir(parents=True, exist_ok=True)
    Path(x.filepath).touch()


@router.post(Route.SAVE_SECTION_JSON_SOURCE)
def route_save_section_json_source(x: SaveSectionJSONSourceRequest):
    save_json_source_data(x.project, [x.variantId])


@router.post(Route.GET_JSON_SOURCE_PATH_TO_BE_DELETED)
def route_get_json_source_path_to_be_deleted(x: GetJSONSourcePathToBeDeleted) -> str:
    return os.path.abspath(x.variantName)


@router.post(Route.DELETE_FILE)
def route_delete_file(x: DeleteFileRequest):
    file = Path(x.filepath)
    if not file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{x.filepath}' not found",
        )

    try:
        file.unlink()
        return {"message": f"File '{x.filepath}' deleted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Failed to delete file: {str(e)}",
        )


@router.post(Route.FILE_WATCH_LIST)
def route_file_watch_list(x: FileWatchListRequest, state: AppStateFromRequest):
    # x.filepaths is the current list of file paths or glob patterns that should be watched
    state.specific_file_watcher.update_watch_list(
        x.filepaths,
        x.fileWatchGroupName,
        get_content_processor(
            state.project_manager,
            state.settings_file,
            x.fileWatchGroupName,
        ),
    )


@router.post(Route.FILE_WATCH_GEN_PYTHON_CODE)
async def route_file_watch_gen_python_code(
    x: FileWatchGenPythonCodeRequest, state: AppStateFromRequest
):
    filepaths = []

    if x.watch:
        path = await state.project_manager.get_gen_python_code_path(x.projectConfigId)
        if not path:
            raise HTTPException(status_code=404, detail="Path not found")
        filepaths = [str(path)]

    state.specific_file_watcher.update_watch_list(
        filepaths,
        FileWatchGroupName.genPythonCode,
        get_content_processor(
            state.project_manager,
            state.settings_file,
            FileWatchGroupName.genPythonCode,
        ),
    )
