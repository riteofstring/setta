from typing import Annotated

from pydantic import Field, TypeAdapter
from setta.types.artifact import (
    BrushStrokeArtifact,
    ChartDataArtifact,
    DrawAreaLayerItemTransformArtifact,
    FileArtifact,
    ImageArtifact,
)

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
