from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from setta.cli.logger import get_wrapper_for_loading
from setta.database.db.sections.load import load_artifact_metadata
from setta.utils.constants import C

from .dependencies import get_dbq, get_websocket_manager

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
def route_load_artifacts(x: LoadArtifactsRequest, dbq=Depends(get_dbq)):
    with dbq as db:
        artifactMetadata = load_artifact_metadata(db, x.sectionId, x.artifactPaths)
    artifacts = {}
    for p in artifactMetadata:
        if p.get("value") is not None:
            data = {"value": p["value"], "type": p["type"]}
        else:
            wrapper = get_wrapper_for_loading(p["type"])
            wrapper.load(p["path"])
            data = wrapper.serialize()

        artifacts[p["path"]] = {
            **data,
            "displayName": p["displayName"],
            "isSaved": True,
        }

    return artifacts
