import os

from fastapi import APIRouter, Depends
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
from setta.utils.constants import C

from .dependencies import get_dbe, get_wmh_artifact

router = APIRouter()


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


@router.post(C.ROUTE_SEND_ARTIFACT)
async def route_send_artifact(
    x: SendArtifactRequest,
    dbe=Depends(get_dbe),
    websocket_msg_handler=Depends(get_wmh_artifact),
):
    with dbe.session as db:
        save_or_create_artifacts(db, x.data)

    await websocket_msg_handler.broadcast_artifact(x.data)


@router.post(C.ROUTE_LOAD_ARTIFACTS)
def route_load_artifacts(x: LoadArtifactsRequest, dbe=Depends(get_dbe)):
    with dbe.session as db:
        return load_artifact_metadata_and_maybe_value_from_disk(db, x.artifactIds)


@router.post(C.ROUTE_LOAD_AVAILABLE_ARTIFACTS)
def route_load_available_artifacts(
    x: LoadAvailableArtifactsRequest, dbe=Depends(get_dbe)
):
    with dbe.session as db:
        return load_available_artifacts(db, x.sectionType)


@router.post(C.ROUTE_CHECK_IF_FILE_EXISTS)
def route_check_if_file_exists(x: CheckIfFileExistsRequests):
    return os.path.exists(x.filepath)


@router.post(C.ROUTE_LOAD_ARTIFACT_FROM_DISK)
def route_load_artifact_from_disk(x: LoadArtifactFromDiskRequest):
    return load_artifact_from_disk(x.filepath, x.type)


@router.post(C.ROUTE_READ_CSV_BASE64)
def route_read_csv_base64(x: ReadCSVBase64Request):
    return load_from_csv_base64(x.base64Str)


@router.post(C.ROUTE_FILL_IN_MISSING_ARTIFACT_IDS)
def route_get_artifact_ids_from_name_path_type(
    x: FillInMissingArtifactIdsRequest, dbe=Depends(get_dbe)
):
    with dbe.session as db:
        return fill_in_missing_artifact_ids(db, x.namesPathsTypes)
