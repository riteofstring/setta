import os
from collections.abc import Callable
from pathlib import Path
from typing import TypedDict, TypeVar

from pydantic import BaseModel

from setta.project_state.artifacts import (
    Artifacts,
    ArtifactSaveResult,
    SaveConflictStrategy,
)
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.share.policy import ensure_share_deployment_path
from setta.types.artifact import (
    BrushStrokeArtifact,
    ChartDataArtifact,
    DrawAreaLayerItemTransformArtifact,
    ImageArtifact,
)
from setta.types.generated.unions import BaseArtifactUnion
from setta.types.routes import Route

router = SettaAPIRouter()
TArtifact = TypeVar("TArtifact")


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
    ctx: RuntimeContextFromRequest,
):
    return ctx.state.share_runtime_state.get_session_artifacts(ctx.session_id)


def _get_artifacts(ctx: RuntimeContextFromRequest):
    if ctx.share_mode:
        return _get_share_session_artifacts(ctx)
    return ctx.state.artifacts


def _load_share_cached_artifact(
    path: str,
    deployment_root: Path | None,
    get_cached: Callable[[Path | str], TArtifact | None],
    read_from_disk: Callable[[Path], TArtifact],
) -> TArtifact | None:
    cached = get_cached(path)
    if cached is not None:
        return cached
    resolved = ensure_share_deployment_path(path, deployment_root)
    if not resolved.exists():
        return None
    return read_from_disk(resolved)


def _load_share_cached_image(
    artifacts: Artifacts, path: str, deployment_root: Path | None
) -> ImageArtifact | None:
    return _load_share_cached_artifact(
        path,
        deployment_root,
        artifacts.get_cached_image,
        artifacts.read_image_from_disk,
    )


def _load_share_cached_chart_data(
    artifacts: Artifacts, path: str, deployment_root: Path | None
) -> ChartDataArtifact | None:
    return _load_share_cached_artifact(
        path,
        deployment_root,
        artifacts.get_cached_chart_data,
        artifacts.read_chart_data_from_disk,
    )


def _load_share_cached_brush_stroke(
    artifacts: Artifacts, path: str, deployment_root: Path | None
) -> BrushStrokeArtifact | None:
    return _load_share_cached_artifact(
        path,
        deployment_root,
        artifacts.get_cached_brush_stroke,
        artifacts.read_brush_stroke_from_disk,
    )


def _load_share_cached_transform(
    artifacts: Artifacts, path: str, deployment_root: Path | None
) -> DrawAreaLayerItemTransformArtifact | None:
    return _load_share_cached_artifact(
        path,
        deployment_root,
        artifacts.get_cached_draw_area_layer_item_transform,
        artifacts.read_transform_from_disk,
    )


@router.post(Route.CHECK_IF_FILE_EXISTS)
def route_check_if_file_exists(
    x: CheckIfFileExistsRequests, ctx: RuntimeContextFromRequest
) -> bool:
    if ctx.share_mode:
        target_path = ensure_share_deployment_path(x.filepath, ctx.deployment_root)
        return target_path.exists()
    return os.path.exists(x.filepath)


@router.post(Route.GET_FOLDER_CONTENTS)
def route_get_folder_contents(
    x: GetFolderContentsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[FolderContentItem]:
    if ctx.share_mode:
        path = ensure_share_deployment_path(x.folderPath, ctx.deployment_root)
    else:
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
    ctx: RuntimeContextFromRequest,
) -> list[ImageArtifact | None]:
    artifacts = _get_artifacts(ctx)
    if ctx.share_mode:
        return [
            _load_share_cached_image(artifacts, i, ctx.deployment_root) for i in x.paths
        ]
    return [artifacts.get_cached_image(i) for i in x.paths]


@router.post(Route.LOAD_CACHED_CHART_DATA)
def route_load_cached_chart_data(
    x: LoadCachedPathsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[ChartDataArtifact | None]:
    artifacts = _get_artifacts(ctx)
    if ctx.share_mode:
        return [
            _load_share_cached_chart_data(artifacts, i, ctx.deployment_root)
            for i in x.paths
        ]
    return [artifacts.get_cached_chart_data(i) for i in x.paths]


@router.post(Route.LOAD_CACHED_BRUSH_STROKES)
def route_load_cached_brush_strokes(
    x: LoadCachedPathsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[BrushStrokeArtifact | None]:
    artifacts = _get_artifacts(ctx)
    if ctx.share_mode:
        return [
            _load_share_cached_brush_stroke(artifacts, i, ctx.deployment_root)
            for i in x.paths
        ]
    return [artifacts.get_cached_brush_stroke(i) for i in x.paths]


@router.post(Route.LOAD_CACHED_DRAW_AREA_LAYER_ITEM_TRANFORM)
def route_load_cached_draw_area_layer_item_transform(
    x: LoadCachedPathsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[DrawAreaLayerItemTransformArtifact | None]:
    artifacts = _get_artifacts(ctx)
    if ctx.share_mode:
        return [
            _load_share_cached_transform(artifacts, i, ctx.deployment_root)
            for i in x.paths
        ]
    return [artifacts.get_cached_draw_area_layer_item_transform(i) for i in x.paths]


@router.post(Route.UPDATE_ARTIFACTS)
async def route_update_artifacts(
    x: UpdateArtifactsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[ArtifactSaveResult]:
    if ctx.share_mode:
        session_id = ctx.session_id
        await ctx.enforce_policy(
            policy_flag="allowParamChanges",
            denied_message="Share policy disallows parameter changes.",
        )
        artifacts = ctx.state.share_runtime_state.get_session_artifacts(session_id)
        results: list[ArtifactSaveResult] = []
        payloads: list[BaseArtifactUnion] = []
        for artifact in x.artifacts:
            normalized_id = artifacts.normalize_artifact_id(artifact.id)
            if normalized_id != artifact.id:
                artifact = artifact.model_copy(update={"id": normalized_id})
            artifacts.cache_artifact_in_memory(
                artifact,
                compute_last_read_hash=False,
                reset_conflict=True,
            )
            payloads.append(artifact)
            results.append(
                ArtifactSaveResult(
                    id=normalized_id,
                    type=artifact.type,
                    status="saved",
                )
            )
        if payloads:
            await ctx.state.wmh_frontend_sender.broadcast_artifacts_update(
                artifacts=payloads,
                updateType="update",
                share_session_id=session_id,
            )
        return results
    artifacts = _get_artifacts(ctx)
    conflict_strategy = x.conflictStrategy or SaveConflictStrategy.backup
    results = await artifacts.apply_updates(x.artifacts, conflict_strategy)
    return results
