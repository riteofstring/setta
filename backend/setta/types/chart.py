from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel


class ChartType(str, Enum):
    line = "line"
    scatter = "scatter"


class BaseChartSettings(BaseModel):
    type: Any


class LineChartSettings(BaseChartSettings):
    type: Literal[ChartType.line] = ChartType.line
    xAxisColumn: str = ""


# class ChartSettings(BaseModel, extra="forbid"):
#     type: str = "line"
#     xAxisColumn: str = ""
#     secondYAxisColumns: list[str] = Field(default_factory=list)
#     xAxisLog: bool = False
#     y1AxisLog: bool = False
#     y2AxisLog: bool = False
