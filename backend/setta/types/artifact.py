from typing import Annotated, Any, Literal

from pydantic import Discriminator, Field, Tag, TypeAdapter
from setta.types.generated.go_shared_types import (
    ArtifactType,
    LineChartSettings,
    ScatterChartSettings,
)
from setta.types.generated.go_shared_types import (
    BrushStroke as GoBrushStroke,
)
from setta.types.generated.go_shared_types import (
    BrushStrokeArtifact as GoBrushStrokeArtifact,
)
from setta.types.generated.go_shared_types import (
    BrushStrokeWithTransform as GoBrushStrokeWithTransform,
)
from setta.types.generated.go_shared_types import (
    ChartDataArtifact as GoChartDataArtifact,
)
from setta.types.generated.go_shared_types import (
    DrawAreaLayerItemTransform as GoDrawAreaLayerItemTransform,
)
from setta.types.generated.go_shared_types import (
    DrawAreaLayerItemTransformArtifact as GoDrawAreaLayerItemTransformArtifact,
)
from setta.types.generated.go_shared_types import (
    FileArtifact as GoFileArtifact,
)
from setta.types.generated.go_shared_types import (
    ImageArtifact as GoImageArtifact,
)
from setta.types.id import create_new_id
from setta.utils.constants import C


def create_artifact_id(extension: str = ".json"):
    new_id = create_new_id()
    return (C.ARTIFACTS_FOLDER / f"{new_id}{extension}").as_posix()


def create_json_artifact_id():
    return create_artifact_id(".json")


CanvasPoint = tuple[float, float]
DrawAreaTransform = tuple[float, float, float, float, float, float]


class BrushStroke(GoBrushStroke):
    points: list[CanvasPoint | Literal["BREAK"]] = Field(default_factory=list)
    globalCompositeOperation: Literal[
        "color",
        "color-burn",
        "color-dodge",
        "copy",
        "darken",
        "destination-atop",
        "destination-in",
        "destination-out",
        "destination-over",
        "difference",
        "exclusion",
        "hard-light",
        "hue",
        "lighten",
        "lighter",
        "luminosity",
        "multiply",
        "overlay",
        "saturation",
        "screen",
        "soft-light",
        "source-atop",
        "source-in",
        "source-out",
        "source-over",
        "xor",
    ] = "source-over"


class BrushStrokeWithTransform(GoBrushStrokeWithTransform):
    points: list[CanvasPoint | Literal["BREAK"]] = Field(default_factory=list)
    globalCompositeOperation: str = "source-over"
    transform: DrawAreaTransform


class DrawAreaLayerItemTransform(GoDrawAreaLayerItemTransform):
    transform: DrawAreaTransform = (1, 0, 0, 1, 0, 0)
    eraserStrokes: list[BrushStrokeWithTransform] = Field(default_factory=list)


class BrushStrokeArtifact(GoBrushStrokeArtifact):
    type: Literal[ArtifactType.BrushStroke] = ArtifactType.BrushStroke
    id: str = Field(default_factory=create_json_artifact_id)
    value: BrushStroke


class DrawAreaLayerItemTransformArtifact(GoDrawAreaLayerItemTransformArtifact):
    type: Literal[ArtifactType.DrawAreaLayerItemTransform] = (
        ArtifactType.DrawAreaLayerItemTransform
    )
    id: str = Field(default_factory=create_json_artifact_id)
    value: DrawAreaLayerItemTransform


BaseChartSettingsUnion = LineChartSettings | ScatterChartSettings

BaseChartSettingsUnionWithDiscriminator = Annotated[
    BaseChartSettingsUnion, Field(discriminator="type")
]

def _artifact_type(value: Any) -> str | None:
    raw_type = value.get("type") if isinstance(value, dict) else getattr(value, "type", None)
    if isinstance(raw_type, ArtifactType):
        return raw_type.value
    if isinstance(raw_type, str):
        return raw_type
    return None


BaseArtifactUnion = Annotated[
    Annotated[GoImageArtifact, Tag(ArtifactType.Image.value)]
    | Annotated[BrushStrokeArtifact, Tag(ArtifactType.BrushStroke.value)]
    | Annotated[
        DrawAreaLayerItemTransformArtifact,
        Tag(ArtifactType.DrawAreaLayerItemTransform.value),
    ]
    | Annotated[GoChartDataArtifact, Tag(ArtifactType.ChartData.value)]
    | Annotated[GoFileArtifact, Tag(ArtifactType.File.value)],
    Discriminator(_artifact_type),
]

BaseArtifactUnionWithDiscriminator = BaseArtifactUnion

BaseArtifactTypeAdapter = TypeAdapter(BaseArtifactUnionWithDiscriminator)
