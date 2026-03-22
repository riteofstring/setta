from typing import Annotated

from pydantic import Field
from setta.types.artifact import LineChartSettings, ScatterChartSettings

BaseChartSettingsUnion = LineChartSettings | ScatterChartSettings

BaseChartSettingsUnionWithDiscriminator = Annotated[
    BaseChartSettingsUnion, Field(discriminator="type")
]
