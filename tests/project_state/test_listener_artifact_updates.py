from pathlib import Path
from typing import TYPE_CHECKING, cast

import pytest
from setta.project_state.artifacts import Artifacts
from setta.project_state.listener_artifact_updates import (
    ListenerArtifactUpdateError,
    apply_listener_artifact_updates,
)
from setta.types.artifact import (
    BrushStroke,
    BrushStrokeArtifact,
    ChartDataArtifact,
    DrawAreaBrushShape,
    DrawAreaLayerItemTransform,
    DrawAreaLayerItemTransformArtifact,
    ImageArtifact,
)
from setta.types.binary_content import BinaryContentRef
from setta.utils.paths import normalize_state_path

if TYPE_CHECKING:
    from setta.database.db_objs import DBE
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class _StubFrontendSender:
    async def broadcast_artifacts_update(self, *args, **kwargs):
        raise AssertionError("broadcast_artifacts_update should not be called")


class _StubSpecificFileWatcher:
    def start(self):
        pass

    def update_callbacks(self, *args, **kwargs):
        pass


class _StubDBE:
    def __init__(self) -> None:
        self.runtime_root = Path(".")

    def read(self, *args, **kwargs):
        raise AssertionError("DBE.read should not be called during listener tests")

    def write(self, *args, **kwargs):
        raise AssertionError("DBE.write should not be called during listener tests")

    def copy(self, *args, **kwargs):
        raise AssertionError("DBE.copy should not be called during listener tests")


def _build_artifacts() -> Artifacts:
    websocket_handler = cast("WMHFrontendSender", _StubFrontendSender())
    file_watcher = cast("SpecificFileWatcher", _StubSpecificFileWatcher())
    dbe = cast("DBE", _StubDBE())
    return Artifacts(websocket_handler, file_watcher, dbe)


class TestApplyListenerArtifactUpdates:
    def test_image_artifact_is_cached_and_marked_dirty(self):
        artifacts = _build_artifacts()
        artifact = ImageArtifact(
            id="artifacts/new-image.png",
            value=BinaryContentRef(
                contentId="test-image",
                byteLength=3,
                mimeType="image/png",
            ),
        )

        applied = apply_listener_artifact_updates(
            artifacts=artifacts,
            updates=[artifact],
        )

        assert 1 == len(applied)
        cached = applied[0]
        normalized_path = normalize_state_path("artifacts/new-image.png")
        assert str(normalized_path) == cached.id
        assert cached is artifacts.images[normalized_path]
        metadata = artifacts.image_metadata[normalized_path]
        assert metadata.is_dirty
        assert metadata.last_read_hash is None

    def test_chart_data_artifact_is_cached(self):
        artifacts = _build_artifacts()
        chart_data = {"colA": ["a", "b"], "colB": [1, 2]}
        artifact = ChartDataArtifact(id="charts/data.csv", value=chart_data)

        applied = apply_listener_artifact_updates(
            artifacts=artifacts,
            updates=[artifact],
        )

        normalized_path = normalize_state_path("charts/data.csv")
        assert 1 == len(applied)
        cached = applied[0]
        assert chart_data == cached.value
        assert cached is artifacts.chart_data[normalized_path]

    def test_brush_stroke_artifact_is_cached(self):
        artifacts = _build_artifacts()
        brush = BrushStroke(
            strokeStyle="#000",
            lineWidth=1,
            lineCap=DrawAreaBrushShape.round,
        )
        artifact = BrushStrokeArtifact(
            id="layers/brush.json",
            value=brush,
        )

        applied = apply_listener_artifact_updates(
            artifacts=artifacts,
            updates=[artifact],
        )

        normalized_path = normalize_state_path("layers/brush.json")
        assert brush == applied[0].value
        assert applied[0] is artifacts.brush_strokes[normalized_path]

    def test_transform_artifact_is_cached(self):
        artifacts = _build_artifacts()
        transform = DrawAreaLayerItemTransform()
        artifact = DrawAreaLayerItemTransformArtifact(
            id="layers/transform.json",
            value=transform,
        )

        applied = apply_listener_artifact_updates(
            artifacts=artifacts,
            updates=[artifact],
        )

        normalized_path = normalize_state_path("layers/transform.json")
        assert transform == applied[0].value
        assert (
            applied[0]
            is artifacts.draw_area_layer_item_transforms[normalized_path]
        )

    def test_invalid_path_raises_listener_error(self):
        artifacts = _build_artifacts()
        artifact = ImageArtifact(
            id="\x00bad",
            value=BinaryContentRef(
                contentId="bad-image",
                byteLength=1,
                mimeType="image/png",
            ),
        )

        with pytest.raises(ListenerArtifactUpdateError):
            apply_listener_artifact_updates(artifacts=artifacts, updates=[artifact])
