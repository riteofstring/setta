import os
from pathlib import Path
from typing import TYPE_CHECKING, TypedDict

from pydantic import BaseModel

from setta.project_state.artifacts import ArtifactSaveResult, SaveConflictStrategy
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.share.path_guard import ensure_share_deployment_path
from setta.share.policy import (
    ensure_share_artifact_paths_scoped,
    resolve_section_ids_for_artifacts,
)
from setta.types.artifact import (
    BrushStrokeArtifact,
    ChartDataArtifact,
    DrawAreaLayerItemTransformArtifact,
    ImageArtifact,
)
from setta.types.generated.unions import BaseArtifactUnion
from setta.types.routes import Route
from setta.utils.utils import normalize_path

if TYPE_CHECKING:
    from setta.types.id import ID

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
    ctx: RuntimeContextFromRequest,
):
    share_session_id = ctx.share_session_id
    if share_session_id is None:
        raise KeyError("Missing share session id")
    return ctx.state.share_runtime_state.get_session_artifacts(share_session_id)


def _get_artifacts(ctx: RuntimeContextFromRequest):
    if ctx.share_mode:
        return _get_share_session_artifacts(ctx)
    return ctx.state.artifacts


def _load_share_cached_image(
    artifacts, path: str, deployment_root: Path | None
) -> ImageArtifact | None:
    cached = artifacts.get_cached_image(path)
    if cached is not None:
        return cached
    resolved = ensure_share_deployment_path(path, deployment_root)
    if not resolved.exists():
        return None
    return artifacts.read_image_from_disk(resolved)


def _load_share_cached_chart_data(
    artifacts, path: str, deployment_root: Path | None
) -> ChartDataArtifact | None:
    cached = artifacts.get_cached_chart_data(path)
    if cached is not None:
        return cached
    resolved = ensure_share_deployment_path(path, deployment_root)
    if not resolved.exists():
        return None
    return artifacts.read_chart_data_from_disk(resolved)


def _load_share_cached_brush_stroke(
    artifacts, path: str, deployment_root: Path | None
) -> BrushStrokeArtifact | None:
    cached = artifacts.get_cached_brush_stroke(path)
    if cached is not None:
        return cached
    resolved = ensure_share_deployment_path(path, deployment_root)
    if not resolved.exists():
        return None
    return artifacts.read_brush_stroke_from_disk(resolved)


def _load_share_cached_transform(
    artifacts, path: str, deployment_root: Path | None
) -> DrawAreaLayerItemTransformArtifact | None:
    cached = artifacts.get_cached_draw_area_layer_item_transform(path)
    if cached is not None:
        return cached
    resolved = ensure_share_deployment_path(path, deployment_root)
    if not resolved.exists():
        return None
    return artifacts.read_transform_from_disk(resolved)


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
        session_id = ctx.share_session_id
        if session_id is None:
            raise KeyError("Missing share session id")
        session_backend = ctx.state.share_runtime_state.get_session_backend(session_id)
        section_ids: set["ID"] = set()
        unknown_paths: set[str] | None = None
        for project_config_id in session_backend.projectConfigs.keys():
            project_state = ctx.state.share_runtime_state.get_session_state(
                session_id,
                project_config_id,
            )
            config_section_ids, config_unknown_paths = (
                resolve_section_ids_for_artifacts(
                    project_state,
                    x.artifacts,
                )
            )
            section_ids.update(config_section_ids)
            config_unknown_set = set(config_unknown_paths)
            if unknown_paths is None:
                unknown_paths = config_unknown_set
            else:
                unknown_paths &= config_unknown_set
        resolved_unknown_paths = sorted(unknown_paths) if unknown_paths else []
        await ensure_share_artifact_paths_scoped(
            share_mode=ctx.share_mode,
            policy=ctx.state.share_runtime_state.share_policy,
            frontend_sender=ctx.state.wmh_frontend_sender,
            project_config_id=None,
            share_session_id=session_id,
            unknown_paths=resolved_unknown_paths,
        )
        await ctx.enforce_param_changes_allowed(
            project_config_id=None,
            section_ids=list(section_ids) if section_ids else None,
        )
        artifacts = ctx.state.share_runtime_state.get_session_artifacts(session_id)
        results: list[ArtifactSaveResult] = []
        payloads: list[BaseArtifactUnion] = []
        for artifact in x.artifacts:
            normalized_id = str(normalize_path(artifact.id))
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
