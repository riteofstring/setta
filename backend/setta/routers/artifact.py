import os
from pathlib import Path
from typing import TypedDict

from pydantic import BaseModel

from setta.api.logger import load_from_csv_base64
from setta.project_state.artifacts import ArtifactSaveResult, SaveConflictStrategy
from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.artifact import (
    BrushStrokeArtifact,
    ChartDataArtifact,
    DrawAreaLayerItemTransformArtifact,
    ImageArtifact,
)
from setta.types.generated.unions import BaseArtifactUnion
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


class LoadCachedPathsRequest(BaseModel):
    paths: list[str]


class UpdateArtifactsResponse(BaseModel):
    results: list[ArtifactSaveResult]


class UpdateArtifactsRequest(BaseModel):
    artifacts: list[BaseArtifactUnion]
    conflictStrategy: SaveConflictStrategy | None = None


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


@router.post(Route.LOAD_CACHED_IMAGE_ARTIFACTS)
def route_load_cached_image_artifacts(
    x: LoadCachedPathsRequest,
    state: AppStateFromRequest,
) -> list[ImageArtifact | None]:
    return [state.artifacts.get_cached_image(i) for i in x.paths]


@router.post(Route.LOAD_CACHED_CHART_DATA)
def route_load_cached_chart_data(
    x: LoadCachedPathsRequest,
    state: AppStateFromRequest,
) -> list[ChartDataArtifact | None]:
    return [state.artifacts.get_cached_chart_data(i) for i in x.paths]


@router.post(Route.LOAD_CACHED_BRUSH_STROKES)
def route_load_cached_brush_strokes(
    x: LoadCachedPathsRequest,
    state: AppStateFromRequest,
) -> list[BrushStrokeArtifact | None]:
    return [state.artifacts.get_cached_brush_stroke(i) for i in x.paths]


@router.post(Route.LOAD_CACHED_DRAW_AREA_LAYER_ITEM_TRANFORM)
def route_load_cached_draw_area_layer_item_transform(
    x: LoadCachedPathsRequest,
    state: AppStateFromRequest,
) -> list[DrawAreaLayerItemTransformArtifact | None]:
    return [
        state.artifacts.get_cached_draw_area_layer_item_transform(i) for i in x.paths
    ]


@router.post(Route.UPDATE_ARTIFACTS)
async def route_update_artifacts(
    x: UpdateArtifactsRequest,
    state: AppStateFromRequest,
) -> UpdateArtifactsResponse:
    conflict_strategy = x.conflictStrategy or SaveConflictStrategy.backup
    results = await state.artifacts.apply_updates(x.artifacts, conflict_strategy)
    return UpdateArtifactsResponse(results=results)
