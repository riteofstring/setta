from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from setta.project_state.artifacts import Artifacts
from setta.types.artifact import (
    ArtifactType,
    BrushStroke,
    BrushStrokeArtifact,
    ChartData,
    ChartDataArtifact,
    DrawAreaLayerItemTransform,
    DrawAreaLayerItemTransformArtifact,
    ImageArtifact,
)
from setta.types.generated.unions import BaseArtifactUnion
from setta.types.listener import ListenerFrontendEmitArtifactUpdate
from setta.utils.utils import normalize_path


class ListenerArtifactUpdateError(ValueError):
    """Raised when listener artifact updates cannot be applied."""


def apply_listener_artifact_updates(
    *,
    artifacts: Artifacts,
    updates: list[ListenerFrontendEmitArtifactUpdate],
) -> list[BaseArtifactUnion]:
    applied: list[BaseArtifactUnion] = []
    for update in updates:
        normalized_path = normalize_path(update.path)
        artifact = _build_artifact_from_listener_payload(
            normalized_path=normalized_path,
            update=update,
        )
        artifacts.cache_artifact_in_memory(
            artifact,
            compute_last_read_hash=False,
            reset_conflict=True,
        )
        applied.append(artifact)
    return applied


def _build_artifact_from_listener_payload(
    *,
    normalized_path: Path,
    update: ListenerFrontendEmitArtifactUpdate,
) -> BaseArtifactUnion:
    match update.artifactType:
        case ArtifactType.Image:
            return _build_image_artifact(normalized_path, update.data)
        case ArtifactType.ChartData:
            return _build_chart_data_artifact(normalized_path, update.data)
        case ArtifactType.BrushStroke:
            return _build_brush_stroke_artifact(normalized_path, update.data)
        case ArtifactType.DrawAreaLayerItemTransform:
            return _build_transform_artifact(normalized_path, update.data)
    raise ListenerArtifactUpdateError(
        f"listener emit targeted unsupported artifact type {update.artifactType}"
    )


def _build_image_artifact(path: Path, payload: str) -> ImageArtifact:
    if not payload:
        raise ListenerArtifactUpdateError(
            f"listener emit provided empty image payload for {path}"
        )
    return ImageArtifact(id=str(path), value=payload)


def _build_chart_data_artifact(path: Path, payload: str) -> ChartDataArtifact:
    raw = _parse_json_payload(path, payload)
    if not isinstance(raw, dict):
        raise ListenerArtifactUpdateError(
            f"listener emit for {path} must provide a JSON object for chart data"
        )
    chart_data: ChartData = {}
    for key, value in raw.items():
        if not isinstance(key, str):
            raise ListenerArtifactUpdateError(
                f"chart data payload for {path} must use string column names"
            )
        if not isinstance(value, list):
            raise ListenerArtifactUpdateError(
                f"chart data payload for {path} must use list column values"
            )
        chart_data[key] = value  # type: ignore[assignment]
    return ChartDataArtifact(id=str(path), value=chart_data)


def _build_brush_stroke_artifact(
    path: Path,
    payload: str,
) -> BrushStrokeArtifact:
    try:
        stroke = BrushStroke.model_validate_json(payload)
    except (ValidationError, json.JSONDecodeError) as exc:
        raise ListenerArtifactUpdateError(
            f"brush stroke payload for {path} must be valid JSON"
        ) from exc
    return BrushStrokeArtifact(id=str(path), value=stroke)


def _build_transform_artifact(
    path: Path,
    payload: str,
) -> DrawAreaLayerItemTransformArtifact:
    try:
        transform = DrawAreaLayerItemTransform.model_validate_json(payload)
    except (ValidationError, json.JSONDecodeError) as exc:
        raise ListenerArtifactUpdateError(
            f"draw transform payload for {path} must be valid JSON"
        ) from exc
    return DrawAreaLayerItemTransformArtifact(id=str(path), value=transform)


def _parse_json_payload(path: Path, payload: str) -> Any:
    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ListenerArtifactUpdateError(
            f"artifact payload for {path} must be valid JSON"
        ) from exc
