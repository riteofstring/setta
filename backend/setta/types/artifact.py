from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, TypeAdapter
from setta.types.binary_content import BinaryContentRef
from setta.types.generated.go_shared_types import (
    ArtifactType,
    ChartType,
    DrawAreaBrushShape,
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


class BaseChartSettings(BaseModel):
    type: Any


class LineChartSettings(BaseChartSettings):
    type: Literal[ChartType.line] = ChartType.line
    xAxisColumn: str | None = None
    secondYAxisColumns: list[str] = Field(default_factory=list)
    xAxisLog: bool = False
    y1AxisLog: bool = False
    y2AxisLog: bool = False


class ScatterChartSettings(BaseChartSettings):
    type: Literal[ChartType.scatter] = ChartType.scatter
    xAxisColumn: str | None = None
    categoryColumn: str | None = None
    xAxisLog: bool = False
    yAxisLog: bool = False


class BrushStroke(BaseModel):
    strokeStyle: str
    lineWidth: float
    lineCap: DrawAreaBrushShape
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


class BrushStrokeWithTransform(BrushStroke):
    transform: DrawAreaTransform


class DrawAreaLayerItemTransform(BaseModel):
    transform: DrawAreaTransform = (1, 0, 0, 1, 0, 0)
    eraserStrokes: list[BrushStrokeWithTransform] = Field(default_factory=list)


class DrawAreaLayerItem(BaseModel):
    type: Literal[ArtifactType.Image, ArtifactType.BrushStroke] = (
        ArtifactType.BrushStroke
    )
    dataPath: str
    transformId: str


class DrawAreaLayer(BaseModel):
    name: str = Field(default_factory=generate_memorable_string)
    elements: list[DrawAreaLayerItem] = Field(default_factory=list)
    visible: bool = True
    layerOpacity: float = 1


class BaseArtifact(BaseModel):
    type: Any
    id: str = Field(default_factory=create_json_artifact_id)
    value: Any


class ImageArtifact(BaseArtifact):
    type: Literal[ArtifactType.Image] = ArtifactType.Image
    id: str = Field(default_factory=create_png_artifact_id)
    value: BinaryContentRef


class BrushStrokeArtifact(BaseArtifact):
    type: Literal[ArtifactType.BrushStroke] = ArtifactType.BrushStroke
    id: str = Field(default_factory=create_json_artifact_id)
    value: BrushStroke


class DrawAreaLayerItemTransformArtifact(BaseArtifact):
    type: Literal[ArtifactType.DrawAreaLayerItemTransform] = (
        ArtifactType.DrawAreaLayerItemTransform
    )
    id: str = Field(default_factory=create_json_artifact_id)
    value: DrawAreaLayerItemTransform


class ChartDataArtifact(BaseArtifact):
    type: Literal[ArtifactType.ChartData] = ArtifactType.ChartData
    id: str = Field(default_factory=create_csv_artifact_id)
    value: ChartData


class FileArtifact(BaseArtifact):
    type: Literal[ArtifactType.File] = ArtifactType.File
    id: str = Field(default_factory=create_file_artifact_id)
    value: BinaryContentRef


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
