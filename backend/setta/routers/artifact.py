import os
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.cli.logger import get_wrapper_for_loading
from setta.database.db.artifacts.load import load_artifacts, load_available_artifacts
from setta.utils.constants import C

from .dependencies import get_dbq, get_websocket_manager

router = APIRouter()


class SendArtifactRequest(BaseModel):
    data: Dict[str, Any]
    sendDataTo: str
    messageType: str


class LoadArtifactsRequest(BaseModel):
    artifactIds: List[str]


class LoadAvailableArtifactsRequest(BaseModel):
    sectionType: str


class CheckIfFileExistsRequests(BaseModel):
    filepath: str


class LoadArtifactFromDiskRequest(BaseModel):
    filepath: str
    type: str


@router.post(C.ROUTE_SEND_ARTIFACT)
async def route_send_artifact(
    x: SendArtifactRequest, websocket_manager=Depends(get_websocket_manager)
):
    x = x.dict()
    location = x.pop("sendDataTo")
    messageType = x.pop("messageType")
    await websocket_manager.send_message_to_location(x["data"], messageType, location)


@router.post(C.ROUTE_LOAD_ARTIFACTS)
def route_load_artifacts(x: LoadArtifactsRequest, dbq=Depends(get_dbq)):
    with dbq as db:
        artifacts = load_artifacts(db, x.artifactIds)
    for a in artifacts.values():
        if a["path"]:
            a.update(load_artifact_from_disk(a["path"], a["type"]))
    return artifacts


@router.post(C.ROUTE_LOAD_AVAILABLE_ARTIFACTS)
def route_load_available_artifacts(
    x: LoadAvailableArtifactsRequest, dbq=Depends(get_dbq)
):
    with dbq as db:
        return load_available_artifacts(db, x.sectionType)


@router.post(C.ROUTE_CHECK_IF_FILE_EXISTS)
def route_check_if_file_exists(x: CheckIfFileExistsRequests):
    return os.path.exists(x.filepath)


@router.post(C.ROUTE_LOAD_ARTIFACT_FROM_DISK)
def route_load_artifact_from_disk(x: LoadArtifactFromDiskRequest):
    return load_artifact_from_disk(x.filepath, x.type)


def load_artifact_from_disk(filepath, type):
    wrapper = get_wrapper_for_loading(type)
    wrapper.load(filepath)
    return wrapper.serialize()
