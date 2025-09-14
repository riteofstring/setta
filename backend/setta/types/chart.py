from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

ChartDataType = dict[str, list[str | float]]


class ChartType(str, Enum):
    line = "line"
    scatter = "scatter"


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
