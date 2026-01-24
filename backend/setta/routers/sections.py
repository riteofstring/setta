import os
from pathlib import Path

from pydantic import BaseModel

from setta.routers.dependencies import RuntimeContextFromRequest
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
def route_new_json_version_name(
    x: NewJSONVersionNameRequest, ctx: RuntimeContextFromRequest
):
    ctx.require_ide_mode("Share mode does not allow creating JSON source files.")
    new_filename = generate_new_filename(x.filename)
    Path(new_filename).parent.mkdir(parents=True, exist_ok=True)
    Path(new_filename).touch()
    return new_filename


@router.post(Route.CREATE_FILE)
def route_create_file(x: CreateFileRequest, ctx: RuntimeContextFromRequest):
    ctx.require_ide_mode("Share mode does not allow creating files.")
    target_path = Path(x.filepath)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.touch()


@router.post(Route.GET_JSON_SOURCE_PATH_TO_BE_DELETED)
def route_get_json_source_path_to_be_deleted(
    x: GetJSONSourcePathToBeDeleted, ctx: RuntimeContextFromRequest
) -> str:
    ctx.require_ide_mode("Share mode does not allow resolving JSON source paths.")
    return os.path.abspath(x.variantName)
