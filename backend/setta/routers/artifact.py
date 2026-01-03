import os
from pathlib import Path
from typing import TypedDict

from pydantic import BaseModel

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


class CheckIfFileExistsRequests(BaseModel):
    filepath: str


class GetFolderContentsRequest(BaseModel):
    folderPath: str


class FolderContentItem(TypedDict):
    name: str
    type: str


class LoadCachedPathsRequest(BaseModel):
    paths: list[str]


class UpdateArtifactsRequest(BaseModel):
    artifacts: list[BaseArtifactUnion]
    conflictStrategy: SaveConflictStrategy | None = None


@router.post(Route.CHECK_IF_FILE_EXISTS)
def route_check_if_file_exists(x: CheckIfFileExistsRequests) -> bool:
    return os.path.exists(x.filepath)


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
) -> list[ArtifactSaveResult]:
    conflict_strategy = x.conflictStrategy or SaveConflictStrategy.backup
    results = await state.artifacts.apply_updates(x.artifacts, conflict_strategy)
    return results
