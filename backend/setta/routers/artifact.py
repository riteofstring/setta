import base64
import os
from pathlib import Path
from typing import TypedDict

from pydantic import BaseModel

from setta.api.logger import load_from_csv_base64, parse_csv_content
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
from setta.types.chart import ChartDataType
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


class GetFolderContentsRequest(BaseModel):
    folderPath: str


class FolderContentItem(TypedDict):
    name: str
    type: str


class LoadImageArtifactRequest(BaseModel):
    imagePath: str


class LoadChartDataRequest(BaseModel):
    dataPath: str


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


@router.post(Route.GET_FOLDER_CONTENTS)
def route_get_folder_contents(
    x: GetFolderContentsRequest,
) -> list[FolderContentItem]:
    path = Path(x.folderPath)

    # Check if path exists and is a directory
    if not path.exists():
        raise FileNotFoundError(f"Path does not exist: {x.folderPath}")
    if not path.is_dir():
        raise NotADirectoryError(f"Path is not a directory: {x.folderPath}")

    contents: list[FolderContentItem] = []

    for item in path.iterdir():
        contents.append(
            {"name": item.name, "type": "folder" if item.is_dir() else "file"}
        )

    return contents


@router.post(Route.LOAD_IMAGE_ARTIFACT)
def route_load_image_artifact(x: LoadImageArtifactRequest) -> str:
    with open(x.imagePath, "rb") as f:
        img = f.read()
        b64_str = base64.b64encode(img).decode("utf-8")
        return b64_str


@router.post(Route.LOAD_CHART_DATA)
def route_load_chart_data(x: LoadChartDataRequest) -> ChartDataType:
    with open(x.dataPath, "r") as f:
        content = f.read()
        return parse_csv_content(content)
