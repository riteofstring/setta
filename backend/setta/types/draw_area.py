from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.utils.generate_memorable_string import generate_memorable_string

CanvasPoint = tuple[float, float]


class DrawAreaLayerItemType(str, Enum):
    Image = "Image"
    BrushStroke = "BrushStroke"


class DrawAreaBrushShape(str, Enum):
    butt = "butt"
    round = "round"
    square = "square"


class BrushStroke(BaseModel):
    strokeStyle: str
    lineWidth: float
    lineCap: DrawAreaBrushShape
    points: list[CanvasPoint]
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
    ]


class DrawAreaLayerItem(BaseModel):
    type: DrawAreaLayerItemType = DrawAreaLayerItemType.BrushStroke
    dataPath: str = ""
    transform: tuple[float, float, float, float, float, float] = (1, 0, 0, 1, 0, 0)
    eraserStrokes: Any


class DrawAreaLayer(BaseModel):
    name: str = Field(default_factory=generate_memorable_string)
    elements: list[DrawAreaLayerItem] = Field(default_factory=list)
    visible: bool = True
    layerOpacity: float = 0.5


class DrawAreaMode(str, Enum):
    draw = "draw"
    erase = "erase"
    edit = "edit"
