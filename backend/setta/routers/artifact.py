import os
from pathlib import Path
from typing import TypedDict

from pydantic import BaseModel

from setta.project_state.artifacts import ArtifactSaveResult, SaveConflictStrategy
from setta.routers.dependencies import (
    AppStateFromRequest,
    MaybeShareSessionIdFromRequest,
    require_share_session_id,
)
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.artifact import (
    BrushStrokeArtifact,
    ChartDataArtifact,
    DrawAreaLayerItemTransformArtifact,
    ImageArtifact,
)
from setta.types.generated.unions import BaseArtifactUnion
from setta.types.routes import Route
from setta.utils.utils import normalize_path

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


def _get_share_session_artifacts(
    state: AppStateFromRequest, share_session_id: str | None
):
    session_id = require_share_session_id(state, share_session_id)
    return state.share_project_manager.get_session_artifacts(session_id)


def _get_artifacts(state: AppStateFromRequest, share_session_id: str | None):
    if state.share_mode:
        return _get_share_session_artifacts(state, share_session_id)
    return state.artifacts


def _load_share_cached_image(artifacts, path: str) -> ImageArtifact | None:
    cached = artifacts.get_cached_image(path)
    if cached is not None:
        return cached
    normalized = normalize_path(path)
    if not normalized.exists():
        return None
    return artifacts.read_image_from_disk(normalized)


def _load_share_cached_chart_data(artifacts, path: str) -> ChartDataArtifact | None:
    cached = artifacts.get_cached_chart_data(path)
    if cached is not None:
        return cached
    normalized = normalize_path(path)
    if not normalized.exists():
        return None
    return artifacts.read_chart_data_from_disk(normalized)


def _load_share_cached_brush_stroke(artifacts, path: str) -> BrushStrokeArtifact | None:
    cached = artifacts.get_cached_brush_stroke(path)
    if cached is not None:
        return cached
    normalized = normalize_path(path)
    if not normalized.exists():
        return None
    return artifacts.read_brush_stroke_from_disk(normalized)


def _load_share_cached_transform(
    artifacts, path: str
) -> DrawAreaLayerItemTransformArtifact | None:
    cached = artifacts.get_cached_draw_area_layer_item_transform(path)
    if cached is not None:
        return cached
    normalized = normalize_path(path)
    if not normalized.exists():
        return None
    return artifacts.read_transform_from_disk(normalized)


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
    share_session_id: MaybeShareSessionIdFromRequest,
) -> list[ImageArtifact | None]:
    artifacts = _get_artifacts(state, share_session_id)
    if state.share_mode:
        return [_load_share_cached_image(artifacts, i) for i in x.paths]
    return [artifacts.get_cached_image(i) for i in x.paths]


@router.post(Route.LOAD_CACHED_CHART_DATA)
def route_load_cached_chart_data(
    x: LoadCachedPathsRequest,
    state: AppStateFromRequest,
    share_session_id: MaybeShareSessionIdFromRequest,
) -> list[ChartDataArtifact | None]:
    artifacts = _get_artifacts(state, share_session_id)
    if state.share_mode:
        return [_load_share_cached_chart_data(artifacts, i) for i in x.paths]
    return [artifacts.get_cached_chart_data(i) for i in x.paths]


@router.post(Route.LOAD_CACHED_BRUSH_STROKES)
def route_load_cached_brush_strokes(
    x: LoadCachedPathsRequest,
    state: AppStateFromRequest,
    share_session_id: MaybeShareSessionIdFromRequest,
) -> list[BrushStrokeArtifact | None]:
    artifacts = _get_artifacts(state, share_session_id)
    if state.share_mode:
        return [_load_share_cached_brush_stroke(artifacts, i) for i in x.paths]
    return [artifacts.get_cached_brush_stroke(i) for i in x.paths]


@router.post(Route.LOAD_CACHED_DRAW_AREA_LAYER_ITEM_TRANFORM)
def route_load_cached_draw_area_layer_item_transform(
    x: LoadCachedPathsRequest,
    state: AppStateFromRequest,
    share_session_id: MaybeShareSessionIdFromRequest,
) -> list[DrawAreaLayerItemTransformArtifact | None]:
    artifacts = _get_artifacts(state, share_session_id)
    if state.share_mode:
        return [_load_share_cached_transform(artifacts, i) for i in x.paths]
    return [artifacts.get_cached_draw_area_layer_item_transform(i) for i in x.paths]


@router.post(Route.UPDATE_ARTIFACTS)
async def route_update_artifacts(
    x: UpdateArtifactsRequest,
    state: AppStateFromRequest,
    share_session_id: MaybeShareSessionIdFromRequest,
) -> list[ArtifactSaveResult]:
    artifacts = _get_artifacts(state, share_session_id)
    if state.share_mode:
        results: list[ArtifactSaveResult] = []
        for artifact in x.artifacts:
            normalized_id = str(normalize_path(artifact.id))
            if normalized_id != artifact.id:
                artifact = artifact.model_copy(update={"id": normalized_id})
            artifacts.cache_artifact_in_memory(
                artifact,
                compute_last_read_hash=False,
                reset_conflict=True,
            )
            results.append(
                ArtifactSaveResult(
                    id=normalized_id,
                    type=artifact.type,
                    status="saved",
                )
            )
        return results
    conflict_strategy = x.conflictStrategy or SaveConflictStrategy.backup
    results = await artifacts.apply_updates(x.artifacts, conflict_strategy)
    return results
