from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.cli.logger import get_wrapper_for_loading
from setta.database.db.sections.load import load_artifact_metadata
from setta.utils.constants import C

from .dependencies import get_dbs, get_websocket_manager

router = APIRouter()


class SendArtifactRequest(BaseModel):
    data: Dict[str, Any]
    sendDataTo: str
    messageType: str


class LoadArtifactsRequest(BaseModel):
    sectionId: str
    artifactPaths: List[str]


@router.post(C.ROUTE_SEND_ARTIFACT)
async def route_send_artifact(
    x: SendArtifactRequest, websocket_manager=Depends(get_websocket_manager)
):
    x = x.dict()
    location = x.pop("sendDataTo")
    messageType = x.pop("messageType")
    await websocket_manager.send_message_to_location(x["data"], messageType, location)


@router.post(C.ROUTE_LOAD_ARTIFACTS)
def route_load_artifacts(x: LoadArtifactsRequest, dbs=Depends(get_dbs)):
    with dbs:
        artifactMetadata = load_artifact_metadata(dbs, x.sectionId, x.artifactPaths)
    artifacts = {}
    for p in artifactMetadata:
        wrapper = get_wrapper_for_loading(p["type"])
        wrapper.load(p["path"])
        artifacts[p["path"]] = {
            **wrapper.serialize(),
            "displayName": p["displayName"],
            "isSaved": True,
        }

    return artifacts
