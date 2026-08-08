from setta.types.artifact import BaseArtifactTypeAdapter
from setta.types.generated.go_shared_types import (
    BrushStrokeArtifact,
    DrawAreaLayerItemTransformArtifact,
)


def test_artifact_union_parses_generated_brush_stroke_artifact() -> None:
    parsed = BaseArtifactTypeAdapter.validate_python(
        {
            "type": "BrushStroke",
            "id": "artifact-1",
            "value": {
                "strokeStyle": "#000000",
                "lineWidth": 1,
                "lineCap": "butt",
                "points": [(1, 2), "BREAK"],
                "globalCompositeOperation": "source-over",
            },
        }
    )

    assert isinstance(parsed, BrushStrokeArtifact)
    assert parsed.value.points[0] == (1, 2)
    assert parsed.value.points[1] == "BREAK"


def test_artifact_union_parses_generated_transform_artifact() -> None:
    parsed = BaseArtifactTypeAdapter.validate_python(
        {
            "type": "DrawAreaLayerItemTransform",
            "id": "artifact-2",
            "value": {
                "transform": [1, 0, 0, 1, 0, 0],
                "eraserStrokes": [
                    {
                        "strokeStyle": "#000000",
                        "lineWidth": 1,
                        "lineCap": "butt",
                        "points": [(1, 2)],
                        "globalCompositeOperation": "source-over",
                        "transform": [1, 0, 0, 1, 0, 0],
                    }
                ],
            },
        }
    )

    assert isinstance(parsed, DrawAreaLayerItemTransformArtifact)
    assert parsed.value.transform == [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
    assert parsed.value.eraserStrokes[0].transform == [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
