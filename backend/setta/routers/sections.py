import os
from pathlib import Path

from pydantic import BaseModel

from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.share.path_guard import ensure_share_deployment_path
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
    x: NewJSONVersionNameRequest, state: AppStateFromRequest
):
    if state.share_mode:
        ensure_share_deployment_path(x.filename, state.share_deployment_root)
    new_filename = generate_new_filename(x.filename)
    if state.share_mode:
        target_path = ensure_share_deployment_path(
            new_filename, state.share_deployment_root
        )
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.touch()
    else:
        Path(new_filename).parent.mkdir(parents=True, exist_ok=True)
        Path(new_filename).touch()
    return new_filename


@router.post(Route.CREATE_FILE)
def route_create_file(x: CreateFileRequest, state: AppStateFromRequest):
    if state.share_mode:
        target_path = ensure_share_deployment_path(
            x.filepath, state.share_deployment_root
        )
    else:
        target_path = Path(x.filepath)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.touch()


@router.post(Route.GET_JSON_SOURCE_PATH_TO_BE_DELETED)
def route_get_json_source_path_to_be_deleted(x: GetJSONSourcePathToBeDeleted) -> str:
    return os.path.abspath(x.variantName)
