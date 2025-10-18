import os

from pydantic import BaseModel

from setta.api.logger import load_from_csv_base64
from setta.database.db.artifacts.load import (
    load_artifact_from_disk,
    load_artifact_metadata_and_maybe_value_from_disk,
    load_available_artifacts,
)
from setta.database.db.artifacts.save import (
    fill_in_missing_artifact_ids,
    save_or_create_artifacts,
)
from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route

router = SettaAPIRouter()


class SendArtifactRequest(BaseModel):
    data: list[dict]


class LoadArtifactsRequest(BaseModel):
    artifactIds: list[str]


class LoadAvailableArtifactsRequest(BaseModel):
    sectionType: str


class CheckIfFileExistsRequests(BaseModel):
    filepath: str


class LoadArtifactFromDiskRequest(BaseModel):
    filepath: str
    type: str


class ReadCSVBase64Request(BaseModel):
    base64Str: str


class FillInMissingArtifactIdsRequest(BaseModel):
    namesPathsTypes: list


@router.post(Route.SEND_ARTIFACT)
async def route_send_artifact(
    x: SendArtifactRequest,
    state: AppStateFromRequest,
):
    with state.dbe.session as db:
        save_or_create_artifacts(db, x.data)

    await state.wmh_frontend_sender.broadcast_artifact(x.data)


@router.post(Route.LOAD_ARTIFACTS)
def route_load_artifacts(x: LoadArtifactsRequest, state: AppStateFromRequest):
    with state.dbe.session as db:
        return load_artifact_metadata_and_maybe_value_from_disk(db, x.artifactIds)


@router.post(Route.LOAD_AVAILABLE_ARTIFACTS)
def route_load_available_artifacts(
    x: LoadAvailableArtifactsRequest, state: AppStateFromRequest
):
    with state.dbe.session as db:
        return load_available_artifacts(db, x.sectionType)


@router.post(Route.CHECK_IF_FILE_EXISTS)
def route_check_if_file_exists(x: CheckIfFileExistsRequests) -> bool:
    return os.path.exists(x.filepath)


@router.post(Route.LOAD_ARTIFACT_FROM_DISK)
def route_load_artifact_from_disk(x: LoadArtifactFromDiskRequest):
    return load_artifact_from_disk(x.filepath, x.type)


@router.post(Route.READ_CSV_BASE64)
def route_read_csv_base64(x: ReadCSVBase64Request):
    return load_from_csv_base64(x.base64Str)


@router.post(Route.FILL_IN_MISSING_ARTIFACT_IDS)
def route_get_artifact_ids_from_name_path_type(
    x: FillInMissingArtifactIdsRequest,
    state: AppStateFromRequest,
):
    with state.dbe.session as db:
        return fill_in_missing_artifact_ids(db, x.namesPathsTypes)
