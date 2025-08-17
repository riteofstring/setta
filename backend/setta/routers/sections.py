import os
from pathlib import Path

from fastapi import HTTPException, status
from pydantic import BaseModel

from setta.code_gen.yaml.section_dict import (
    section_dict_to_yaml,
)
from setta.database.db.sections.copy import (
    copy_relative_positions,
    copy_sections_and_other_info,
)
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
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


class NewJSONVersionNameRequest(BaseModel):
    filename: str


class CreateFileRequest(BaseModel):
    filepath: str


class GetJSONSourcePathToBeDeleted(BaseModel):
    variantName: str


class DeleteFileRequest(BaseModel):
    filepath: str


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
