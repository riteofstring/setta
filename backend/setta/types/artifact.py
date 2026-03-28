from typing import Annotated, Literal

from pydantic import Field, TypeAdapter
from setta.types.generated.go_shared_types import (
    ArtifactType,
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
    DrawAreaLayer as GoDrawAreaLayer,
)
from setta.types.generated.go_shared_types import (
    DrawAreaLayerItem as GoDrawAreaLayerItem,
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
from setta.types.generated.go_shared_types import (
    LineChartSettings,
    ScatterChartSettings,
)
from setta.types.id import create_new_id
from setta.utils.constants import C
from setta.utils.generate_memorable_string import generate_memorable_string


def create_artifact_id(extension: str = ".json"):
    new_id = create_new_id()
    return (C.ARTIFACTS_FOLDER / f"{new_id}{extension}").as_posix()


def create_json_artifact_id():
    return create_artifact_id(".json")


def create_csv_artifact_id():
    return create_artifact_id(".csv")


def create_png_artifact_id():
    return create_artifact_id(".png")


def create_file_artifact_id(extension: str = ".bin"):
    return create_artifact_id(extension)


ChartData = dict[str, list[str | float]]
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


class DrawAreaLayerItem(GoDrawAreaLayerItem):
    type: Literal[ArtifactType.Image, ArtifactType.BrushStroke] = (
        ArtifactType.BrushStroke
    )


class DrawAreaLayer(GoDrawAreaLayer):
    name: str = Field(default_factory=generate_memorable_string)
    elements: list[DrawAreaLayerItem] = Field(default_factory=list)
    visible: bool = True
    layerOpacity: float = 1


class ImageArtifact(GoImageArtifact):
    type: Literal[ArtifactType.Image] = ArtifactType.Image
    id: str = Field(default_factory=create_png_artifact_id)


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


class ChartDataArtifact(GoChartDataArtifact):
    type: Literal[ArtifactType.ChartData] = ArtifactType.ChartData
    id: str = Field(default_factory=create_csv_artifact_id)
    value: ChartData


class FileArtifact(GoFileArtifact):
    type: Literal[ArtifactType.File] = ArtifactType.File
    id: str = Field(default_factory=create_file_artifact_id)


BaseChartSettingsUnion = LineChartSettings | ScatterChartSettings

BaseChartSettingsUnionWithDiscriminator = Annotated[
    BaseChartSettingsUnion, Field(discriminator="type")
]

BaseArtifactUnion = (
    ImageArtifact
    | BrushStrokeArtifact
    | DrawAreaLayerItemTransformArtifact
    | ChartDataArtifact
    | FileArtifact
)

BaseArtifactUnionWithDiscriminator = Annotated[
    BaseArtifactUnion, Field(discriminator="type")
]

BaseArtifactTypeAdapter = TypeAdapter(BaseArtifactUnionWithDiscriminator)
