from __future__ import annotations

import json
import unittest

from setta.project_state.artifacts import Artifacts
from setta.project_state.listener_artifact_updates import (
    ListenerArtifactUpdateError,
    apply_listener_artifact_updates,
)
from setta.types.artifact import ArtifactType, BrushStroke, DrawAreaBrushShape
from setta.types.listener import ListenerFrontendEmitArtifactUpdate
from setta.utils.utils import normalize_path


class _StubFrontendSender:
    async def broadcast_artifacts_update(self, *args, **kwargs):
        raise AssertionError("broadcast_artifacts_update should not be called")


class _StubSpecificFileWatcher:
    def start(self):
        pass

    def update_callbacks(self, *args, **kwargs):
        pass


class _StubDBE:
    def read(self, *args, **kwargs):
        raise AssertionError("DBE.read should not be called during listener tests")

    def write(self, *args, **kwargs):
        raise AssertionError("DBE.write should not be called during listener tests")

    def copy(self, *args, **kwargs):
        raise AssertionError("DBE.copy should not be called during listener tests")


def _build_artifacts() -> Artifacts:
    return Artifacts(_StubFrontendSender(), _StubSpecificFileWatcher(), _StubDBE())


class ApplyListenerArtifactUpdatesTest(unittest.TestCase):
    def test_image_payload_is_cached_and_marked_dirty(self):
        artifacts = _build_artifacts()
        payload = "data:image/png;base64,AAA"
        updates = [
            ListenerFrontendEmitArtifactUpdate(
                path="/tmp/image.png",
                artifactType=ArtifactType.Image,
                data=payload,
            )
        ]

        applied = apply_listener_artifact_updates(
            artifacts=artifacts,
            updates=updates,
        )

        self.assertEqual(1, len(applied))
        artifact = applied[0]
        normalized_path = normalize_path("/tmp/image.png")
        self.assertEqual(str(normalized_path), artifact.id)
        self.assertEqual(payload, artifact.value)
        self.assertIs(artifact, artifacts.images[normalized_path])
        metadata = artifacts.image_metadata[normalized_path]
        self.assertTrue(metadata.is_dirty)
        self.assertIsNone(metadata.last_read_hash)

    def test_chart_data_payload_accepts_json_columns(self):
        artifacts = _build_artifacts()
        chart_data = {"colA": ["a", "b"], "colB": [1, 2]}
        updates = [
            ListenerFrontendEmitArtifactUpdate(
                path="charts/data.csv",
                artifactType=ArtifactType.ChartData,
                data=json.dumps(chart_data),
            )
        ]

        applied = apply_listener_artifact_updates(
            artifacts=artifacts,
            updates=updates,
        )

        self.assertEqual(1, len(applied))
        artifact = applied[0]
        normalized_path = normalize_path("charts/data.csv")
        self.assertEqual(chart_data, artifact.value)
        self.assertIs(artifact, artifacts.chart_data[normalized_path])

    def test_chart_data_payload_requires_lists(self):
        artifacts = _build_artifacts()
        updates = [
            ListenerFrontendEmitArtifactUpdate(
                path="charts/data.csv",
                artifactType=ArtifactType.ChartData,
                data=json.dumps({"colA": "not-a-list"}),
            )
        ]

        with self.assertRaises(ListenerArtifactUpdateError):
            apply_listener_artifact_updates(artifacts=artifacts, updates=updates)

    def test_brush_stroke_payload_requires_valid_json(self):
        artifacts = _build_artifacts()
        invalid_payload = "{not json}"
        updates = [
            ListenerFrontendEmitArtifactUpdate(
                path="layers/brush.json",
                artifactType=ArtifactType.BrushStroke,
                data=invalid_payload,
            )
        ]

        with self.assertRaises(ListenerArtifactUpdateError):
            apply_listener_artifact_updates(artifacts=artifacts, updates=updates)

    def test_brush_stroke_payload_caches_valid_model(self):
        artifacts = _build_artifacts()
        brush = BrushStroke(
            strokeStyle="#000",
            lineWidth=1,
            lineCap=DrawAreaBrushShape.round,
        )
        updates = [
            ListenerFrontendEmitArtifactUpdate(
                path="layers/brush.json",
                artifactType=ArtifactType.BrushStroke,
                data=brush.model_dump_json(),
            )
        ]

        applied = apply_listener_artifact_updates(artifacts=artifacts, updates=updates)

        artifact = applied[0]
        normalized_path = normalize_path("layers/brush.json")
        self.assertEqual(brush, artifact.value)
        self.assertIs(artifact, artifacts.brush_strokes[normalized_path])
