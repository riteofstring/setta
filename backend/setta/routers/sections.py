import os
from pathlib import Path

from pydantic import BaseModel

from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.utils.generate_new_filename import generate_new_filename

router = SettaAPIRouter()


class NewJSONVersionNameRequest(BaseModel):
    filename: str


class CreateFileRequest(BaseModel):
    filepath: str


class GetJSONSourcePathToBeDeleted(BaseModel):
    variantName: str


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
