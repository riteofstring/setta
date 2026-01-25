from typing import Annotated

from pydantic import Field, TypeAdapter
from setta.types.artifact import (
    LineChartSettings,
    ScatterChartSettings,
)

BaseChartSettingsUnion = LineChartSettings | ScatterChartSettings

BaseChartSettingsUnionWithDiscriminator = Annotated[
    BaseChartSettingsUnion, Field(discriminator="type")
]

BaseChartSettingsTypeAdapter = TypeAdapter(BaseChartSettingsUnionWithDiscriminator)

BaseChartSettingsTypeSet = set(["line", "scatter"])
