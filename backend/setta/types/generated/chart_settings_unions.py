from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.chart import LineChartSettings, ScatterChartSettings

BaseChartSettingsUnion = Union[LineChartSettings, ScatterChartSettings]

BaseChartSettingsUnionWithDiscriminator = Annotated[
    BaseChartSettingsUnion, Field(discriminator="type")
]

BaseChartSettingsTypeAdapter = TypeAdapter(BaseChartSettingsUnionWithDiscriminator)

BaseChartSettingsTypeSet = set(["line", "scatter"])
